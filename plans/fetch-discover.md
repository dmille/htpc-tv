# Fetch Discover Page

## Goal

Add a "Discover" view to Fetch that helps you find something to watch without needing to already know what you're looking for — including hidden gems, not just whatever's trending.

## User Requirements

### What it should feel like

- Open Fetch, browse rows of posters, pick something interesting, download it. No typing required.
- Visual — poster-driven, scannable from the couch with a remote.
- Surfaces things you don't already have in Jellyfin.
- Goes beyond trending/popular — finds highly rated stuff that flew under the radar.

### What you should see

Horizontal poster rows, each representing a discovery category:

1. **Trending Now** — what's hot this week (movies + TV mixed)
2. **Because You Watched [X]** — personalized recs seeded from your recent Jellyfin watches (movies only until TV watch history exists)
3. **Recently Available** — movies that hit streaming/BluRay in the last 3-4 months (not theatrical — stuff you can actually download in good quality)
4. **Hidden Gems** — high critic + audience ratings, low popularity (the good stuff most people missed)
5. **Hidden Gems in [Genre]** — same filter but scoped to a genre, rotates on each refresh (Sci-Fi, Thriller, Drama, etc.)
6. **Top Rated** — highest rated across all time

Items already in Jellyfin are hidden from all discover rows. The point is to find new things.

### How it should work

- D-pad navigation: Left/Right to scroll within a row, Up/Down to move between rows
- Each poster shows: image, title, year. On focus: rating scores (RT%, IMDb), short overview
- Enter on a poster → auto-searches for the best torrent (reuses existing search + dedup + quality logic) → one-click download
- Rows are cached and refresh periodically, not on every page load

## Data Sources

### TMDB API (already integrated)

Provides the core discovery data:

| Endpoint | Purpose | Row |
|----------|---------|-----|
| `GET /trending/movie/week` | This week's trending movies | Trending Now |
| `GET /trending/tv/week` | This week's trending TV | Trending Now |
| `GET /movie/{id}/recommendations` | "If you liked X" | Because You Watched |
| `GET /discover/movie?primary_release_date.gte=YYYY-MM-DD&vote_count.gte=50&sort_by=popularity.desc` | Movies recently on streaming/BluRay | Recently Available |
| `GET /discover/movie?sort_by=vote_average.desc&vote_count.gte=200&popularity.gte=5&popularity.lte=40` | High rating + low popularity | Hidden Gems |
| `GET /discover/tv?sort_by=vote_average.desc&vote_count.gte=200&popularity.gte=5&popularity.lte=40` | High rating + low popularity (TV) | Hidden Gems |
| `GET /discover/movie?sort_by=vote_average.desc&vote_count.gte=200&popularity.gte=5&popularity.lte=40&with_genres={id}` | Genre-scoped hidden gems | Hidden Gems in [Genre] |
| `GET /movie/top_rated` | All-time highest rated | Top Rated |

**Verified**: All endpoints return 20 results with posters. Hidden gems filter tuned to `popularity 5–40, vote_count >= 200` to exclude concert films, K-pop docs, and ultra-niche content while keeping genuinely underwatched quality films.

Genre IDs for rotation: 878 (Sci-Fi), 53 (Thriller), 18 (Drama), 35 (Comedy), 27 (Horror), 80 (Crime), 99 (Documentary), 10749 (Romance)

Key fields: `id`, `title`/`name`, `poster_path`, `overview`, `release_date`/`first_air_date`, `vote_average`, `popularity`

### OMDb API (new)

Provides critic ratings that TMDB doesn't have natively:

- **Endpoint**: `http://www.omdbapi.com/?t={title}&y={year}&apikey={key}` (title search — no IMDB ID resolution needed)
- **Returns**: Rotten Tomatoes %, Metacritic score, IMDb rating — all in one call
- **Rate limit**: 1,000 requests/day (free tier)
- **Use case**: Enrich discover items with RT/Metacritic scores for better ranking and display
- **Verified**: Returns clean data. Example: Banshees of Inisherin → RT 96%, MC 87, IMDb 7.6

### Jellyfin API (already integrated)

Provides personalization seed:

- `GET /Users/{id}/Items?SortBy=DatePlayed&SortOrder=Descending&Limit=20&IsPlayed=true&IncludeItemTypes=Movie,Series&Recursive=true` — recently watched
- `GET /Users/{id}/Items?IsFavorite=true&IncludeItemTypes=Movie,Series&Recursive=true` — favorites
- **Verified**: 17 watched movies, 0 favorites, 0 TV series currently. Recommendations will be movies-only until TV watch history exists.
- **TMDB ID resolution**: Jellyfin returns movie names, not TMDB IDs. Each seed requires a TMDB search call (`/search/movie?query=...&year=...`) to resolve the ID before fetching recommendations. ~5 extra calls per refresh — negligible.

### How ratings combine

For the **Hidden Gems** rows and for general ranking:

```
score = (tmdb_rating * 0.3) + (rt_percent / 10 * 0.4) + (imdb_rating * 0.3)
```

All values normalized to 0–10 scale:
- `tmdb_rating`: already 0–10
- `rt_percent / 10`: converts 85% → 8.5
- `imdb_rating`: already 0–10

RT weighted highest — best signal for quality that's not just popularity.

Minimum thresholds for Hidden Gems: RT >= 75%, TMDB >= 7.0, IMDb >= 7.0. Items missing OMDb data fall back to TMDB rating only.

For **Because You Watched**, TMDB's recommendation engine handles the ranking — we just filter out items already in Jellyfin and enrich with ratings.

## Technical Approach

### New backend endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/discover` | Returns all discover rows (cached) |
| GET | `/api/discover/item/:tmdbId?type=movie` | Look up TMDB item, search TPB for best torrent, return match |

### `/api/discover/item/:tmdbId` flow

1. Fetch item details from TMDB (`/movie/{id}` or `/tv/{id}`) to get title + year
2. Search Apibay with title + year (reuses existing `search()` function)
3. Return best match (already sorted by trusted + seeders + source quality)
4. Frontend shows the match and lets user confirm download

### Caching strategy

- **Discover rows**: cached in SQLite `discover_cache` table. Refresh on server startup + every 6 hours. `/api/discover` serves from cache — instant response.
- **OMDb ratings**: cached in SQLite `ratings_cache` table with 7-day TTL. Ratings barely change, so repeat refreshes only call OMDb for items not yet cached.
- **OMDb budget**: ~100-150 new items per refresh cycle. At 4 refreshes/day = ~400-600 new OMDb calls. Well within 1,000/day. After a few days, most items are cached and daily calls drop to near zero.

### New DB tables

```sql
CREATE TABLE IF NOT EXISTS discover_cache (
  row_name TEXT PRIMARY KEY,
  data TEXT NOT NULL,        -- JSON array of items
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings_cache (
  title_key TEXT PRIMARY KEY,  -- "title:year" normalized
  rt_score INTEGER,            -- Rotten Tomatoes % (0-100)
  metacritic INTEGER,          -- Metacritic (0-100)
  imdb_rating REAL,            -- IMDb (0-10)
  cached_at TEXT DEFAULT (datetime('now'))
);
```

### New files

```
apps/fetch/
  omdb.js             # OMDb API client (title search, SQLite caching)
  discover.js         # Discover logic: fetch TMDB rows, resolve Jellyfin seeds,
                      #   enrich with OMDb ratings, combine scores, filter Jellyfin library
```

### Makefile / service updates

- Add `OMDB_KEY` to .env, Makefile, and systemd service (same pattern as TMDB_TOKEN)

### Frontend

New "Discover" tab in the top nav bar (alongside Search and Downloads).

#### Layout

- Full-screen poster browsing experience — no search box, no text lists
- Vertical stack of horizontal poster rows, each with a row title
- Row title: left-aligned above each row, subtle `--text-muted` color, `1.3rem` — doesn't compete with posters
- Page padding: `2rem` left/right to respect TV overscan
- Rows fill the width of the screen

#### Poster grid

- Poster size: `~8rem wide × 12rem tall` (2:3 aspect ratio matching TMDB posters)
- Gap between posters: `0.8rem`
- ~6-8 posters visible per row at TV resolution
- **Peek**: the rightmost poster is partially cut off at the screen edge, signaling there's more to scroll
- Rows scroll horizontally via D-pad Left/Right
- **Snap scrolling**: posters snap to left alignment when scrolling so they don't land mid-poster
- Scroll implementation: CSS `transform: translateX()` driven by JS, not `overflow-x: auto` — gives full control over D-pad behavior and snap points

#### Focus states

- **Default poster**: no text, just the image. Clean grid.
- **Focused poster**:
  - Scales up to `1.15x` with `transition: transform 0.2s ease`
  - Lifts with `box-shadow: 0 0.5rem 2rem rgba(0,0,0,0.6)`
  - Subtle border glow: `box-shadow: 0 0 0 0.15rem var(--focus-ring), 0 0 2rem var(--glow)`
  - Title and year appear below the poster (fade in, `0.15s`)
  - Other posters in the row dim to `opacity: 0.5` — focused item stands out
- **Backdrop effect**: when a poster is focused, the item's TMDB `backdrop_path` image fades in behind the entire page — blurred (`blur(2rem)`), darkened (`opacity: 0.15`), covers the full viewport. Crossfades smoothly when focus moves to a different item (`transition: opacity 0.4s`). This is the single biggest thing that makes it feel cinematic.

#### Rating display

- **RT score pill**: rounded pill shape. Color-coded:
  - RT >= 75%: red/tomato color (`#E74C3C`) — "Certified Fresh" feel
  - RT >= 60%: same red but dimmer
  - RT < 60%: grey (or don't show — we filter these out anyway)
  - Text: `92%` in white inside the pill
- **IMDb score pill**: yellow/gold pill (`#F5C518` — IMDb brand color), text: `7.8`
- Pills appear in the detail panel, not on the poster grid (too small to read from 10ft)

#### Detail panel

Triggered by pressing Enter on a focused poster. Slides up from the bottom or fades in as a modal overlay.

**Contents:**
- **Backdrop image**: large, blurred behind the panel (same as focus backdrop but brighter, `opacity: 0.25`)
- **Poster**: displayed larger on the left side of the panel (~12rem × 18rem)
- **Title**: large text, `2rem`, white
- **Year + runtime**: `1.2rem`, `--text-muted`
- **Rating pills**: RT% (red), IMDb (yellow), TMDB (blue) — in a row
- **Overview**: 2-3 line synopsis from TMDB, `1.1rem`, `--text-muted`. Truncated with ellipsis if too long.
- **Torrent info** (loaded async after panel opens): quality badge (1080p), source badge (BluRay), size, seeders. Shows a loading spinner until the TPB search completes.
- **Actions**:
  - `[Download]` button — focused by default. Enter to confirm.
  - If no good torrent found: button replaced with "Not available in good quality" text
  - Escape: close panel, return to poster grid

**Panel transitions:**
- Opens: slides up from bottom, `0.25s ease-out`
- Closes: slides down, `0.2s ease-in`
- While open: background dims further, poster grid is visible but dark behind the panel

#### Download confirmation

After pressing Enter on Download:
- Button text changes to "Downloading..." with a subtle pulse animation
- After success: button changes to a green checkmark + "Added" for 2 seconds
- Panel auto-dismisses after 2s, returns to poster grid
- The poster in the grid gets a subtle green border/badge so you can see what you've queued

#### Loading states

- **First load** (no cache): 3 rows of 8 shimmer rectangles. Each shimmer is poster-sized with a dark base (`rgba(255,255,255,0.04)`) and a sweeping highlight animation (`linear-gradient` moving left to right, `1.5s` loop). Row titles show as shimmer bars too.
- **Subsequent loads**: instant from cache, no loading state
- **Detail panel torrent search**: small spinner next to the torrent info section, `1-3s` typical

#### Navigation model

| Context | Key | Action |
|---------|-----|--------|
| Poster grid | Left/Right | Move focus within row, scroll row |
| Poster grid | Up/Down | Move to previous/next row (focus lands on nearest poster) |
| Poster grid | Enter | Open detail panel |
| Poster grid | Escape | Switch back to Search view |
| Detail panel | Enter | Confirm download |
| Detail panel | Escape | Close panel, return to grid |
| Nav bar | Left/Right | Switch tabs (Search / Discover / Downloads) |
| Nav bar | Down | Enter first row of current view |

#### Empty states

- "Because You Watched" row: hidden entirely if no Jellyfin watch history exists. No empty row, no "watch something first" message — just doesn't appear.
- Any row that produces 0 items after Jellyfin library filtering: hidden.
- If all rows are empty (shouldn't happen — trending/top-rated always have data): show a single centered message "Discover is loading..." with shimmer.

## Implementation Order

1. **DB schema** — add `discover_cache` and `ratings_cache` tables to `db.js`
2. **OMDb client** (`omdb.js`) — title-based search, parse RT/MC/IMDb, SQLite caching with 7-day TTL
3. **Discover module** (`discover.js`) — fetch TMDB rows, resolve Jellyfin watch history → TMDB IDs, enrich with OMDb, combine scores, filter Jellyfin library items, cache results
4. **Backend endpoints** — `/api/discover` (serve cache) and `/api/discover/item/:tmdbId` (on-demand torrent lookup)
5. **Background refresh** — timer in server.js, same pattern as Jellyfin sync
6. **Makefile/service** — add OMDB_KEY to env chain
7. **Frontend: poster grid** — horizontal rows, snap scrolling, poster sizing, shimmer loading
8. **Frontend: focus system** — poster scale/glow, row dimming, backdrop crossfade
9. **Frontend: detail panel** — slide-up panel with poster, metadata, ratings, overview, torrent search
10. **Frontend: download flow** — confirm button, progress feedback, green badge on grid
11. **Frontend: navigation** — D-pad handler for grid, panel, nav bar integration

## Open Questions

- ~~**OMDb API key**~~: Registered, activated, stored in .env. Key: `2359e52b`.
- **Hidden gems popularity threshold**: Tuned to `popularity 5–40, vote_count >= 200` based on testing. May need further adjustment after real usage.
- **Number of items per row**: 20 (TMDB default page size). ~8 visible at once, rest accessible by scrolling.
- **"Because You Watched" seed count**: Top 5 recently watched. Fetch recs for each, deduplicate across all. Should yield 50+ unique recommendations after filtering.
- **Genre rotation**: Pick one genre per refresh cycle from the list, or show a fixed genre? Rotation adds variety but less predictability.
