# Torrent Search & Download App ("Fetch")

## Goal

Add a new app to the HTPC launcher that lets you search for movies and TV shows, find torrents (via TPB), filter by quality and seeders, submit downloads to Transmission on `titan.local`, and track download progress — all from the TV with remote/keyboard navigation.

## V1 Scope

- Search box: type a movie or TV show name
- Category toggle: Movies / TV / All
- Results list: torrents sorted by seeders, filtered to 1080p+ quality
- "In Jellyfin" badge on results already in library (avoids duplicates)
- One-click submit to Transmission on `titan.local`
- Download progress view: shows your selected downloads with live % complete, speed, ETA
- TV-friendly UI with D-pad/keyboard navigation (matches launcher theme)

## Architecture

### Overview

```
┌─────────────────────────┐       ┌──────────────────────┐
│  HTPC (this machine)    │       │  titan.local          │
│                         │       │                       │
│  Browser ←→ Fetch UI    │       │  Transmission RPC     │
│             (HTML/CSS/JS)│      │  :9091                │
│               ↕          │       │                       │
│         Fetch Server     │──────→│  Jellyfin (auto-adds) │
│         (Node/Express)   │       │  :8096                │
│         :8881            │       └──────────────────────┘
└─────────────────────────┘
```

### Why a backend is needed

- TPB has no CORS headers — browser can't fetch directly
- Transmission RPC requires session token auth — easier from server
- Keeps credentials off the client

### Stack

- **Backend**: Node.js + Express (same pattern as Mote remote)
- **Database**: SQLite via `better-sqlite3` (single file, no server)
- **Frontend**: Plain HTML/CSS/JS (same as launcher — no bundler)
- **Port**: 8881 (next to Mote's 8880)
- **Directory**: `apps/fetch/` (first app under `apps/`)
- **Dependencies**: `express`, `better-sqlite3`

## Database

SQLite database stored at `apps/fetch/fetch.db` (gitignored).

```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,             -- cleaned torrent name
  magnet TEXT NOT NULL,           -- magnet link (for resubmit if needed)
  info_hash TEXT NOT NULL,        -- torrent info hash (stable ID, survives Transmission restarts)
  transmission_id INTEGER,       -- torrent ID from Transmission RPC (can change across restarts)
  resolution TEXT,                -- '1080p', '2160p'
  source TEXT,                    -- 'BluRay', 'WEB-DL', etc.
  type TEXT,                      -- 'movie', 'episode', 'season'
  episode TEXT,                   -- 'S01E03', 'Season 1', or null
  size_bytes INTEGER,
  status TEXT DEFAULT 'downloading', -- downloading → complete
  added_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

**Lifecycle**: selected → POST `/api/download` → Transmission accepts magnet (instant) → INSERT with status `downloading`, `transmission_id`, and `info_hash` → frontend polls `/api/downloads` which queries Transmission live for progress → when 100%, status flips to `complete` and `completed_at` is set.

No `queued` state — Transmission accepts magnets instantly. If Transmission is unreachable, the POST returns an error; nothing is inserted.

No `percent_done` column — live progress comes from Transmission at request time, merged into the API response. The DB only tracks *what you picked* and *whether it's done*.

**ID stability**: Transmission `id` values can change across restarts. The `info_hash` column is the stable identifier. When polling, if a `transmission_id` returns nothing or a mismatched name, re-resolve via `torrent-get` filtered by `info_hash` and update the stored `transmission_id`.

### Jellyfin library cache

```sql
CREATE TABLE library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jellyfin_id TEXT UNIQUE NOT NULL,  -- Jellyfin item ID
  name TEXT NOT NULL,                -- title (e.g. "Alien", "Breaking Bad")
  type TEXT NOT NULL,                -- 'movie' or 'series'
  year INTEGER,                      -- production year
  synced_at TEXT DEFAULT (datetime('now'))
);
```

**Sync logic**:
- On server startup + every 30 minutes, query Jellyfin `/Users/{id}/Items` for `Movie` and `Series` types
- Upsert into `library` table (INSERT OR REPLACE on `jellyfin_id`)
- Lightweight: only fetches `Name`, `ProductionYear`, `Type`, `Id` fields — no media data
- Auth: Jellyfin user/pass via env vars, authenticates once and reuses access token

**Search integration**:
- **Movies**: match by normalized name + year (parse year from torrent title). "Alien" (1979) in Jellyfin matches `Alien.1979.1080p.BluRay...`
- **TV**: match by series name only, ignore season/episode. If "Breaking Bad" exists in Jellyfin at all, flag every torrent with "Breaking Bad" in the title. This avoids needing to track which specific seasons/episodes are in Jellyfin (complex and not worth it for V1).

**Verified**: Jellyfin API on `titan.local:8096` works — 165 movies and 84 series currently in library.

## Backend Design

### `apps/fetch/server.js` — Express server

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/search?q=...&cat=...` | Search TPB, return filtered results with `inLibrary` flag |
| POST | `/api/download` | Submit magnet to Transmission, insert into DB |
| GET | `/api/downloads` | List tracked downloads with live progress from Transmission |
| DELETE | `/api/downloads/:id` | Remove from DB + optionally remove torrent from Transmission |
| GET | `/` | Serve the frontend UI |

### TPB Search (`/api/search`)

- Use Apibay (`https://apibay.org/q.php?q=...&cat=...`) — TPB's own JSON API, no scraping, no API key, no npm package needed
- Category codes: `0` (all), `208` (HD TV), `207` (HD Movies), `211` (4K Movies)
  - Note: cat `205` is SD TV — 1080p TV shows are under `208`
- Build magnet links from `info_hash` field + append public tracker URLs for faster peer discovery
- No-results sentinel: `[{id: "0", name: "No results returned"}]` — check and return empty array
- Server-side parsing and filtering:

  **Resolution** (extracted from title via regex):
  - `2160p` / `4K` — gold badge
  - `1080p` — blue badge
  - `720p` or unknown — filtered out by default

  **Source** (ranked for sorting within same seeder count):
  - `BluRay` > `WEB-DL` > `WEBRip` > `BRRip` > `HDRip` > `HDTV`

  **Codec** (informational, shown in results):
  - `x265` / `HEVC` — smaller files
  - `x264` / `H.264` — more compatible

  **Torrent health signals:**
  - Minimum seeders threshold (default: 2)
  - Apibay `status` field: `vip` / `trusted` uploaders flagged with badge
  - Size sanity for movies only: reject "1080p" under 700MB (likely fake/cam). Does NOT apply to episodes (a 45-min 1080p episode can be 400-600MB).

  **TV show detection** (from title):
  - Regex for `S\d{2}E\d{2}` → individual episode, tagged with season/episode badge
  - Regex for `S\d{2}` or `Season \d+` (without episode) → season pack, tagged as "Full Season"
  - No pattern → treated as movie or complete series
  - Note: a season pack is one torrent with many files. Transmission tracks it as a single transfer — shows as one entry in downloads, not per-episode.

  **Sort order:** seeders descending, with trusted/VIP uploaders boosted

- Response shape:
  ```json
  [
    {
      "name": "Movie Name 2024 1080p WEB-DL x264",
      "size": "2.4 GB",
      "seeders": 150,
      "leechers": 30,
      "resolution": "1080p",
      "source": "WEB-DL",
      "codec": "x264",
      "trusted": true,
      "type": "movie",
      "episode": null,
      "inLibrary": false,
      "magnet": "magnet:?xt=urn:btih:HASH&dn=NAME&tr=...",
      "imdb": "tt1234567"
    },
    {
      "name": "Show Name S01E03 1080p WEB-DL x265",
      "size": "850 MB",
      "seeders": 95,
      "leechers": 12,
      "resolution": "1080p",
      "source": "WEB-DL",
      "codec": "x265",
      "trusted": false,
      "type": "episode",
      "episode": "S01E03",
      "inLibrary": true,
      "magnet": "magnet:?xt=urn:btih:...",
      "imdb": ""
    }
  ]
  ```

### Transmission Integration (`/api/download`, `/api/downloads`)

- Uses Transmission RPC (default: `http://titan.local:9091/transmission/rpc`)
- Auth: Basic auth via env vars `TRANSMISSION_USER` / `TRANSMISSION_PASS`
- Session token: Transmission requires `X-Transmission-Session-Id` — on 409 response, read header and retry
- Key RPC methods:
  - `torrent-add` — submit magnet URI (instant, returns torrent ID)
  - `torrent-get` — query specific torrent IDs for: percentDone, rateDownload, eta, status, totalSize
  - `torrent-remove` — remove torrent (deleteLocalData: false, since Jellyfin manages files)
- `GET /api/downloads` flow: read all downloads from DB → for any with status `downloading`, batch-query Transmission for live progress → merge progress into response → if any hit 100%, update DB status to `complete`

### Config

All via environment variables (set in Makefile, same pattern as Mote):

| Variable | Default | Purpose |
|----------|---------|---------|
| `FETCH_PORT` | `8881` | Server listen port |
| `TRANSMISSION_URL` | `http://titan.local:9091/transmission/rpc` | Transmission RPC endpoint |
| `TRANSMISSION_USER` | `transmission` | RPC username |
| `TRANSMISSION_PASS` | `transmission` | RPC password |
| `JELLYFIN_URL` | `http://titan.local:8096` | Jellyfin server URL |
| `JELLYFIN_USER` | `jellyfin` | Jellyfin username |
| `JELLYFIN_PASS` | `jellyfin` | Jellyfin password |
| `MIN_SEEDERS` | `2` | Minimum seeders filter |

## Frontend Design

### `apps/fetch/public/index.html`

Single-page app with two views, toggled via JS (no router):

1. **Search view** (default)
   - **Top nav bar**: `[Search]  [Downloads]` — navigable with Left/Right arrows
   - **Category toggle** below nav: `Movies / TV / All` — navigable with Left/Right when focused
   - Search input below (auto-focused)
   - Results list: each row shows:
     - Title (cleaned up — dots replaced with spaces)
     - Resolution badge: gold for 2160p/4K, blue for 1080p
     - Source tag: BluRay, WEB-DL, etc.
     - VIP/trusted uploader badge (if applicable)
     - For TV: episode badge (e.g. "S01E03") or "Full Season" tag
     - "In Jellyfin" badge (greyed out, not downloadable) if already in library
     - Size, seeders count
   - Arrow Up/Down to highlight rows, Enter to submit download
   - Visual confirmation on submit (row flashes green / shows checkmark)

2. **Downloads view**
   - Same top nav bar, `[Downloads]` highlighted
   - List of your downloads: name, progress bar, %, download speed, ETA
   - Frontend polls `GET /api/downloads` every 3 seconds for live progress
   - Completed items shown with checkmark, persist in DB permanently
   - Arrow Up/Down to navigate, Delete key to remove an entry

### Navigation (TV/remote friendly)

- **Left/Right arrows** on top nav bar to switch between Search and Downloads views
- **Up/Down arrows** to move through results or downloads list
- **Enter** to download a selected result
- **Home** (KEY_HOMEPAGE via Mote) returns to launcher — this is how Chrome navigation works in kiosk mode, not Escape
- **Escape** goes from Downloads back to Search, or clears search input
- Text input: physical keyboard or Mote keyboard mode

### Styling (`apps/fetch/public/styles.css`)

- Match launcher's dark theme (`--bg: #0a0a0f`, frosted glass, etc.)
- Large text and hit targets for TV viewing distance
- Quality badges color-coded: gold for 2160p/4K, blue for 1080p
- Progress bars use accent color from launcher
- Focus ring style matches launcher tiles

## File Structure

```
apps/
  fetch/
    server.js           # Express server: search, download, downloads endpoints
    transmission.js     # Transmission RPC client (session handling, API calls)
    search.js           # TPB search + filtering logic
    jellyfin.js         # Jellyfin API client (auth, library sync)
    db.js               # SQLite setup, table creation, query helpers
    package.json        # Dependencies: express, better-sqlite3
    fetch.db            # SQLite database (gitignored, created on first run)
    public/
      index.html        # Single-page UI with search + downloads views
      styles.css        # Dark TV theme matching launcher
      app.js            # Client logic: search, submit, poll downloads, keyboard nav
```

## Launcher Integration

Add a new tile to `web/index.html`:

```html
<a class="tile" href="http://localhost:8881" data-app="fetch">
  <div class="tile-icon">
    <svg><!-- download/search icon --></svg>
  </div>
  <span class="tile-label">Fetch</span>
</a>
```

## Makefile Targets

```makefile
FETCH_PORT ?= 8881
TRANSMISSION_URL ?= http://titan.local:9091/transmission/rpc

fetch-install:    ## Install Fetch npm dependencies
    cd apps/fetch && npm install

fetch:            ## Start Fetch server
    cd apps/fetch && FETCH_PORT=$(FETCH_PORT) \
      TRANSMISSION_URL=$(TRANSMISSION_URL) TRANSMISSION_USER=$(TRANSMISSION_USER) TRANSMISSION_PASS=$(TRANSMISSION_PASS) \
      JELLYFIN_URL=$(JELLYFIN_URL) JELLYFIN_USER=$(JELLYFIN_USER) JELLYFIN_PASS=$(JELLYFIN_PASS) \
      MIN_SEEDERS=$(MIN_SEEDERS) node server.js

fetch-service:    ## Install Fetch as systemd user service (future)
```

## Implementation Order

1. **Database** (`apps/fetch/db.js`) — SQLite setup, create `downloads` and `library` tables, query helpers.
2. **Transmission client** (`apps/fetch/transmission.js`) — RPC session handling, torrent-add, torrent-get, torrent-remove.
3. **Search module** (`apps/fetch/search.js`) — Apibay query, parse results, filter by quality/seeders, build magnet links.
4. **Jellyfin client** (`apps/fetch/jellyfin.js`) — Auth, fetch library items, sync to DB. Cross-reference search results.
5. **Server** (`apps/fetch/server.js`) — Wire up Express endpoints, serve static files, start Jellyfin sync timer.
6. **Frontend** (`apps/fetch/public/`) — Search view first, then downloads view. Keyboard navigation throughout.
7. **Launcher tile** — Add tile to `web/index.html`.
8. **Makefile targets** — `fetch-install`, `fetch`, update `doctor.sh`.

## Open Questions

- ~~**Transmission auth**~~: Confirmed — Basic auth with `transmission:transmission`. Session token flow works.
- **Apibay reliability**: Apibay is TPB's official API and verified working. May want a configurable base URL in case the domain changes.
- **Download location**: Does Transmission on titan.local auto-sort into Jellyfin library paths, or does everything go to one download dir? (User says auto-adds, so likely handled.)
- ~~**Category filtering**~~: Resolved — Movies/TV/All toggle using Apibay `cat` param.
