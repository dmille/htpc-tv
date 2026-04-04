# Fetch Local Catalog

## Goal

Replace the current "fetch from TMDB on every refresh" approach with a local catalog that grows over time. Discovery rows query the local database instead of hitting external APIs. This enables infinite scroll, content rotation tracking, richer category management, and dramatically fewer API calls.

## Current Problem

- Every 6-hour refresh makes ~15 TMDB API calls and ~100 OMDb calls
- Same content keeps appearing because we fetch the same sorted pages
- No memory of what's been shown — can't rotate or deprioritize stale items
- Random page selection is a hack that doesn't guarantee variety
- Rows are capped at 20 items — no way to load more
- Categories are hardcoded — can't dynamically add genre rows based on catalog depth

## New Architecture

### Local catalog table

```sql
CREATE TABLE catalog (
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,         -- 'movie' or 'tv'
  title TEXT NOT NULL,
  year INTEGER,
  overview TEXT,
  poster TEXT,                      -- TMDB poster URL
  backdrop TEXT,                    -- TMDB backdrop URL
  tmdb_rating REAL,
  popularity REAL,
  vote_count INTEGER,
  genres TEXT,                      -- JSON array of genre names
  rt_score INTEGER,                 -- from OMDb
  imdb_rating REAL,                 -- from OMDb
  metacritic INTEGER,               -- from OMDb
  source TEXT,                      -- how we found it (comma-separated if multiple)
  seed_title TEXT,                  -- for recommendations: which watched movie seeded this
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  times_shown INTEGER DEFAULT 0,
  last_shown_at TEXT,
  dismissed INTEGER DEFAULT 0,      -- user marked "not interested"
  PRIMARY KEY (tmdb_id, media_type)
);

CREATE INDEX idx_catalog_genres ON catalog(genres);
CREATE INDEX idx_catalog_source ON catalog(source);
CREATE INDEX idx_catalog_shown ON catalog(times_shown, last_shown_at);
CREATE INDEX idx_catalog_rating ON catalog(tmdb_rating);
```

### Ingestion tracking

```sql
CREATE TABLE ingestion_log (
  source TEXT NOT NULL,             -- 'trending', 'top_rated', 'discover', 'genre:28', 'critics:634', etc.
  last_page INTEGER DEFAULT 0,     -- sequential page counter
  last_run TEXT,
  total_items INTEGER DEFAULT 0,
  PRIMARY KEY (source)
);
```

### User interactions

```sql
CREATE TABLE watchlist (
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (tmdb_id, media_type)
);
```

## Daily Ingestion

A background job runs on a schedule and adds new items to the catalog. Each source has its own ingestion cadence and page strategy.

### Source configs

| Source | TMDB Endpoint | Cadence | Page strategy | Growth |
|--------|--------------|---------|---------------|--------|
| Trending Movies | `/trending/movie/week` | Every 12h | Always page 1 (changes weekly) | ~20/week |
| Trending TV | `/trending/tv/week` | Every 12h | Always page 1 | ~20/week |
| Discover Movies | `/discover/movie` (hidden gem filters) | Daily | Sequential: page 1, 2, 3... | ~20/day |
| Discover TV | `/discover/tv` (hidden gem filters) | Daily | Sequential | ~20/day |
| Top Rated | `/movie/top_rated` | Daily | Sequential | ~20/day |
| Genre: Action | `/discover/movie?with_genres=28` | Daily (rotating) | Sequential | ~20/day |
| Genre: Comedy | `/discover/movie?with_genres=35` | Daily (rotating) | Sequential | ~20/day |
| Genre: Drama | `/discover/movie?with_genres=18` | Daily (rotating) | Sequential | ~20/day |
| Genre: Sci-Fi | `/discover/movie?with_genres=878` | Daily (rotating) | Sequential | ~20/day |
| Genre: Thriller | `/discover/movie?with_genres=53` | Daily (rotating) | Sequential | ~20/day |
| Genre: Horror | `/discover/movie?with_genres=27` | Daily (rotating) | Sequential | ~20/day |
| Genre: Crime | `/discover/movie?with_genres=80` | Daily (rotating) | Sequential | ~20/day |
| Genre: Documentary | `/discover/movie?with_genres=99` | Daily (rotating) | Sequential | ~20/day |
| Critics: Oscar Winners | TMDB list 28 | Weekly | Full list | ~99 items |
| Critics: IMDb Top 250 | TMDB list 634 | Weekly | Full list | ~250 items |
| Critics: Palme d'Or | TMDB list 8205 | Weekly | Full list | ~88 items |
| Critics: AFI Thrills | TMDB list 43 | Weekly | Full list | ~100 items |
| Critics: Fangoria Horror | TMDB list 47 | Weekly | Full list | ~101 items |
| Recommendations | TMDB `/movie/{id}/recommendations` | Hourly | Per seed | ~60/check |

**Genre rotation**: ingest 2 genres per day, cycling through the list. After 4 days all genres get a new page. Each genre's sequential counter is independent — over time we build deep per-genre pools.

**Sequential paging**: for sources like "Discover Movies", the ingestion log tracks `last_page`. Each run fetches the next page. When we reach the end (TMDB returns empty), we reset to page 1 and start over — ratings/popularity will have shifted by then.

### Deduplication across sources

The same movie can appear from multiple sources (e.g. Parasite: trending, top rated, hidden gems, Oscar winners, Palme d'Or). The catalog stores each movie **once** via `PRIMARY KEY (tmdb_id, media_type)`.

The `source` column is comma-separated and gets appended to, not overwritten:

```sql
-- On ingestion, if item already exists, merge the source tag
INSERT INTO catalog (..., source) VALUES (..., 'trending')
ON CONFLICT(tmdb_id, media_type) DO UPDATE SET
  source = CASE
    WHEN source NOT LIKE '%trending%' THEN source || ',trending'
    ELSE source
  END,
  updated_at = datetime('now')
```

This means a single catalog row can have `source = 'discover,critics:28,top_rated'` — and it will appear in queries for any of those sources.

For `seed_title` (recommendations), same approach — comma-separated list of seed titles that found this item.

### Ingestion flow per source

1. Check `ingestion_log` for `last_page` and `last_run`
2. If cadence not met, skip
3. Fetch next page from TMDB
4. For each item:
   - `INSERT ... ON CONFLICT DO UPDATE` to merge source tags (see above)
   - If new: fetch OMDb ratings, store alongside
   - If existing but `updated_at` is >30 days old: refresh TMDB metadata + OMDb
5. Update `ingestion_log` with new `last_page` and `last_run`

### Growth projections

| Time | Catalog size | Unique coverage |
|------|-------------|-----------------|
| Day 1 (initial seed) | ~800 items | Pages 1-5 of main sources + all critic lists |
| Week 1 | ~1,500 items | Good variety across all categories |
| Month 1 | ~4,000 items | Deep per-genre pools, rich recommendations |
| Month 3 | ~10,000 items | Comprehensive catalog, rarely see repeats |

## Discovery Rows

### How rows work now

Each row is a **query profile** — a SQL WHERE clause + ORDER BY that runs against the catalog. No API calls. Instant.

### Base query (applied to all rows)

```sql
WHERE dismissed = 0                              -- exclude "not interested"
  AND (tmdb_id, media_type) NOT IN (             -- exclude Jellyfin library
    SELECT tmdb_id, media_type FROM ...          -- joined against library table by title/year
  )
```

### Row definitions

| Row | Query | Order | Notes |
|-----|-------|-------|-------|
| **Trending Now** | `source LIKE '%trending%' AND added_at > datetime('now', '-7 days')` | `popularity DESC` | Always fresh, page 1 only |
| **Because You Watched [X]** | `seed_title = ?` | `times_shown ASC, tmdb_rating DESC` | 3 rows, each seeded from a different watch. Rotates least-shown first. |
| **Recently Available** | `year >= strftime('%Y', 'now') - 1 AND vote_count >= 50` | `added_at DESC, popularity DESC` | Recent films with enough votes to indicate availability |
| **Hidden Gems** | `vote_count BETWEEN 200 AND 10000 AND popularity BETWEEN 5 AND 40 AND tmdb_rating >= 7.5` | `times_shown ASC, RANDOM()` | The core discovery row. Least-shown items bubble up. |
| **Hidden Gems in [Genre]** | Same as Hidden Gems + `genres LIKE '%{genre}%'` | `times_shown ASC, RANDOM()` | Genre rotates daily |
| **Critics' Picks** | `source LIKE '%critics%'` | `times_shown ASC, RANDOM()` | Mixes all critics lists together |
| **Top Rated** | `tmdb_rating >= 8.0 AND vote_count >= 500` | `times_shown ASC, tmdb_rating DESC` | All-time greats, rotated |
| **By Decade** (future) | `year BETWEEN 1970 AND 1979` | `tmdb_rating DESC` | Once catalog is deep enough |
| **Watchlist** (future) | Items in `watchlist` table | `added_at DESC` | User-curated |

### Cross-row dedup on display

When building all discover rows for a single page load, the server tracks a `shown` set of tmdb_ids. Each row query excludes IDs already claimed by earlier rows:

```js
const shownIds = new Set();

for (const rowDef of rowDefinitions) {
  const items = queryRow(rowDef, { excludeIds: shownIds });
  for (const item of items) shownIds.add(item.tmdb_id);
  rows.push({ ...rowDef, items });
}
```

This means:
- If Parasite appears in "Trending Now" (row 1), it won't also appear in "Hidden Gems" (row 4)
- Earlier rows get priority — Trending claims items first, then recs, then gems, etc.
- Each row backfills from the catalog to maintain 20 items even after exclusions

### After serving a row

```sql
UPDATE catalog SET times_shown = times_shown + 1, last_shown_at = datetime('now')
WHERE tmdb_id IN (?) AND media_type = ?
```

This ensures items rotate. An item shown 5 times sinks below items shown 0 times.

## Infinite Scroll

With thousands of items in the catalog, rows are no longer capped at 20. The frontend can request more.

### API design

```
GET /api/discover                           → returns all rows with first 20 items each
GET /api/discover/row/:name?offset=20       → returns next 20 items for a specific row
```

### Frontend behavior

- Initial load: fetch `/api/discover` — all rows, 20 items each
- User scrolls to the end of a row → fetch `/api/discover/row/hidden_gems?offset=20`
- Append new posters to the row track
- Show a subtle loading indicator at the end of the row while fetching
- Stop when the API returns fewer than 20 items (no more results)

### Row depth (how many items are available per query)

| Row | Expected depth | Infinite scroll? |
|-----|---------------|-----------------|
| Trending | 20-40 | No — limited by nature |
| Because You Watched | 20-60 per seed | Shallow scroll |
| Recently Available | 50-200 | Yes |
| Hidden Gems | 500-5000+ | Yes — this is the deep pool |
| Genre Gems | 100-1000+ per genre | Yes |
| Critics' Picks | ~600 across all lists | Yes |
| Top Rated | 200-1000+ | Yes |

## Category Management

### Dynamic row generation

Instead of hardcoded rows, the server can dynamically decide which rows to show based on catalog depth:

```js
const rows = [];

// Always show trending
rows.push(buildRow('trending', ...));

// Show "Because You Watched" if we have recommendation data
const recSeeds = getDistinctSeeds();
for (const seed of recSeeds.slice(0, 3)) {
  rows.push(buildRow('recommendations', { seed }));
}

// Show genre rows for genres with 50+ items
const genres = getGenresWithDepth(50);
for (const genre of genres.slice(0, 2)) {
  rows.push(buildRow('genre', { genre }));
}

// Always show hidden gems, critics, top rated
rows.push(buildRow('hidden_gems'));
rows.push(buildRow('critics_picks'));
rows.push(buildRow('top_rated'));

// Show decade rows when catalog is deep enough
if (getCatalogSize() > 3000) {
  const decade = pickRandomDecade();
  rows.push(buildRow('decade', { decade }));
}
```

This means the discover page **evolves** as the catalog grows:
- Day 1: 6-7 rows (trending, recs, gems, critics, top rated)
- Month 1: 8-9 rows (+ genre rows as they hit 50 items)
- Month 3: 10-12 rows (+ decade rows, deeper genre coverage)

### User-driven categories

**"Not Interested"** — dismiss an item from all future rows:
```
DELETE /api/discover/dismiss/:tmdbId
→ UPDATE catalog SET dismissed = 1 WHERE tmdb_id = ?
```

**Watchlist** — save for later without downloading:
```
POST /api/watchlist/:tmdbId
→ INSERT INTO watchlist (tmdb_id, media_type) VALUES (?, ?)
```

**Watchlist row** — appears on discover page when items exist:
```sql
SELECT c.* FROM catalog c
JOIN watchlist w ON c.tmdb_id = w.tmdb_id AND c.media_type = w.media_type
ORDER BY w.added_at DESC
```

## Jellyfin Library Filtering

Currently we filter by matching title + year against the `library` table. With the catalog, we can be smarter:

- On Jellyfin sync, try to resolve TMDB IDs for library items (search by title + year)
- Store TMDB IDs in the `library` table
- Filter by exact TMDB ID match instead of fuzzy title matching — no more false positives/negatives

```sql
-- Add to library table
ALTER TABLE library ADD COLUMN tmdb_id INTEGER;

-- Exclusion becomes exact
WHERE (c.tmdb_id, c.media_type) NOT IN (
  SELECT tmdb_id, 'movie' FROM library WHERE tmdb_id IS NOT NULL
  UNION
  SELECT tmdb_id, 'series' FROM library WHERE tmdb_id IS NOT NULL
)
```

## Implementation Order

1. **DB schema** — add `catalog`, `ingestion_log`, `watchlist` tables. Add `tmdb_id` to `library`.
2. **Ingestion module** (`ingest.js`) — source configs, page tracking, TMDB fetch, OMDb enrichment, INSERT OR IGNORE logic.
3. **Initial seed** — on first run (empty catalog), ingest pages 1-5 of main sources + all critic lists. ~800 items.
4. **Discovery queries** — rewrite `discover.js` to query catalog with SQL. `buildRow()` function that takes a query profile and returns items.
5. **Shown tracking** — increment `times_shown` when `/api/discover` is called.
6. **Infinite scroll API** — `GET /api/discover/row/:name?offset=N` for loading more items.
7. **Frontend infinite scroll** — detect end of row, fetch more, append posters.
8. **Dismiss + Watchlist** — API endpoints + UI actions on detail panel.
9. **Jellyfin TMDB ID resolution** — enhance library sync to store TMDB IDs.
10. **Dynamic row generation** — rows appear/disappear based on catalog depth.
11. **Cleanup** — remove old `discover_cache` table, old live-fetch discover logic.

## Open Questions

- **Initial seed size**: Pages 1-5 (~800 items) or pages 1-10 (~1,600)? Bigger seed = better day-1 experience but slower first startup.
- **Catalog staleness**: Re-fetch metadata for items older than 30 days that haven't been shown? Or only when served?
- **Dismiss UX**: Long-press on poster? Swipe? A button in the detail panel? On TV, probably a dedicated key (e.g. Delete on a focused poster).
- **OMDb budget with initial seed**: 800 new items × 1 OMDb call each = 800 calls on day 1. That's close to the 1,000/day limit. Could spread the initial OMDb enrichment over 2-3 days, showing items without ratings in the meantime.
