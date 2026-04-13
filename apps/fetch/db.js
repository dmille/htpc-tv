const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fetch.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    magnet TEXT NOT NULL,
    info_hash TEXT NOT NULL,
    transmission_id INTEGER,
    resolution TEXT,
    source TEXT,
    type TEXT,
    episode TEXT,
    size_bytes INTEGER,
    status TEXT DEFAULT 'downloading',
    added_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS discover_cache (
    row_name TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ratings_cache (
    title_key TEXT PRIMARY KEY,
    rt_score INTEGER,
    metacritic INTEGER,
    imdb_rating REAL,
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS catalog (
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    overview TEXT,
    poster TEXT,
    backdrop TEXT,
    tmdb_rating REAL,
    popularity REAL,
    vote_count INTEGER,
    genres TEXT,
    rt_score INTEGER,
    imdb_rating REAL,
    metacritic INTEGER,
    source TEXT,
    seed_title TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    times_shown INTEGER DEFAULT 0,
    last_shown_at TEXT,
    dismissed INTEGER DEFAULT 0,
    PRIMARY KEY (tmdb_id, media_type)
  );

  CREATE INDEX IF NOT EXISTS idx_catalog_source ON catalog(source);
  CREATE INDEX IF NOT EXISTS idx_catalog_shown ON catalog(times_shown, last_shown_at);
  CREATE INDEX IF NOT EXISTS idx_catalog_rating ON catalog(tmdb_rating);

  CREATE TABLE IF NOT EXISTS ingestion_log (
    source TEXT PRIMARY KEY,
    last_page INTEGER DEFAULT 0,
    last_run TEXT,
    total_items INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (tmdb_id, media_type)
  );

  CREATE TABLE IF NOT EXISTS library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jellyfin_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    year INTEGER,
    tmdb_id INTEGER,
    synced_at TEXT DEFAULT (datetime('now'))
  );
`);

const insertDownload = db.prepare(`
  INSERT INTO downloads (name, magnet, info_hash, transmission_id, resolution, source, type, episode, size_bytes)
  VALUES (@name, @magnet, @infoHash, @transmissionId, @resolution, @source, @type, @episode, @sizeBytes)
`);

const getDownloads = db.prepare(`SELECT * FROM downloads ORDER BY added_at DESC`);

const getActiveDownloads = db.prepare(`SELECT * FROM downloads WHERE status = 'downloading'`);

const markComplete = db.prepare(`
  UPDATE downloads SET status = 'complete', completed_at = datetime('now') WHERE id = @id
`);

const updateTransmissionId = db.prepare(`
  UPDATE downloads SET transmission_id = @transmissionId WHERE id = @id
`);

const deleteDownload = db.prepare(`DELETE FROM downloads WHERE id = @id`);

const getDownloadById = db.prepare(`SELECT * FROM downloads WHERE id = @id`);

const upsertLibraryItem = db.prepare(`
  INSERT INTO library (jellyfin_id, name, type, year, synced_at)
  VALUES (@jellyfinId, @name, @type, @year, datetime('now'))
  ON CONFLICT(jellyfin_id) DO UPDATE SET
    name = @name, type = @type, year = @year, synced_at = datetime('now')
`);

const clearLibrary = db.prepare(`DELETE FROM library`);

const getLibraryItems = db.prepare(`SELECT * FROM library`);

const getLibraryMovies = db.prepare(`SELECT name, year FROM library WHERE type = 'movie'`);

const getLibrarySeries = db.prepare(`SELECT name FROM library WHERE type = 'series'`);

// Discover cache
const setDiscoverRow = db.prepare(`
  INSERT OR REPLACE INTO discover_cache (row_name, data, updated_at)
  VALUES (@rowName, @data, datetime('now'))
`);

const getDiscoverRow = db.prepare(`SELECT * FROM discover_cache WHERE row_name = @rowName`);

const getAllDiscoverRows = db.prepare(`SELECT * FROM discover_cache ORDER BY rowid`);

// Ratings cache
const setRating = db.prepare(`
  INSERT OR REPLACE INTO ratings_cache (title_key, rt_score, metacritic, imdb_rating, cached_at)
  VALUES (@titleKey, @rtScore, @metacritic, @imdbRating, datetime('now'))
`);

const getRating = db.prepare(`SELECT * FROM ratings_cache WHERE title_key = @titleKey`);

// Catalog
const upsertCatalogItem = db.prepare(`
  INSERT INTO catalog (tmdb_id, media_type, title, year, overview, poster, backdrop, tmdb_rating, popularity, vote_count, genres, source, seed_title, added_at, updated_at)
  VALUES (@tmdbId, @mediaType, @title, @year, @overview, @poster, @backdrop, @tmdbRating, @popularity, @voteCount, @genres, @source, @seedTitle, datetime('now'), datetime('now'))
  ON CONFLICT(tmdb_id, media_type) DO UPDATE SET
    title = @title,
    overview = COALESCE(@overview, catalog.overview),
    poster = COALESCE(@poster, catalog.poster),
    backdrop = COALESCE(@backdrop, catalog.backdrop),
    tmdb_rating = COALESCE(@tmdbRating, catalog.tmdb_rating),
    popularity = COALESCE(@popularity, catalog.popularity),
    vote_count = COALESCE(@voteCount, catalog.vote_count),
    genres = COALESCE(@genres, catalog.genres),
    source = CASE
      WHEN catalog.source NOT LIKE '%' || @source || '%' THEN catalog.source || ',' || @source
      ELSE catalog.source
    END,
    seed_title = CASE
      WHEN @seedTitle IS NOT NULL AND (catalog.seed_title IS NULL OR catalog.seed_title NOT LIKE '%' || @seedTitle || '%')
      THEN COALESCE(catalog.seed_title || ',' || @seedTitle, @seedTitle)
      ELSE catalog.seed_title
    END,
    updated_at = datetime('now')
`);

const updateCatalogRatings = db.prepare(`
  UPDATE catalog SET rt_score = @rtScore, imdb_rating = @imdbRating, metacritic = @metacritic, updated_at = datetime('now')
  WHERE tmdb_id = @tmdbId AND media_type = @mediaType
`);

const getCatalogItem = db.prepare(`SELECT * FROM catalog WHERE tmdb_id = @tmdbId AND media_type = @mediaType`);

const getCatalogSize = db.prepare(`SELECT COUNT(*) as count FROM catalog`);

const markShown = db.prepare(`
  UPDATE catalog SET times_shown = times_shown + 1, last_shown_at = datetime('now')
  WHERE tmdb_id = @tmdbId AND media_type = @mediaType
`);

const dismissItem = db.prepare(`UPDATE catalog SET dismissed = 1 WHERE tmdb_id = @tmdbId AND media_type = @mediaType`);

const getItemsNeedingRatings = db.prepare(`
  SELECT tmdb_id, media_type, title, year FROM catalog
  WHERE rt_score IS NULL AND imdb_rating IS NULL
  ORDER BY added_at DESC LIMIT @limit
`);

const getDistinctSeeds = db.prepare(`
  SELECT DISTINCT seed_title FROM catalog
  WHERE seed_title IS NOT NULL AND seed_title != ''
  ORDER BY added_at DESC
`);

// Ingestion log
const getIngestionLog = db.prepare(`SELECT * FROM ingestion_log WHERE source = @source`);

const upsertIngestionLog = db.prepare(`
  INSERT INTO ingestion_log (source, last_page, last_run, total_items)
  VALUES (@source, @lastPage, datetime('now'), @totalItems)
  ON CONFLICT(source) DO UPDATE SET
    last_page = @lastPage, last_run = datetime('now'), total_items = ingestion_log.total_items + @totalItems
`);

// Watchlist
const addToWatchlist = db.prepare(`INSERT OR IGNORE INTO watchlist (tmdb_id, media_type) VALUES (@tmdbId, @mediaType)`);
const removeFromWatchlist = db.prepare(`DELETE FROM watchlist WHERE tmdb_id = @tmdbId AND media_type = @mediaType`);
const getWatchlist = db.prepare(`SELECT * FROM watchlist ORDER BY added_at DESC`);
const isInWatchlist = db.prepare(`SELECT 1 FROM watchlist WHERE tmdb_id = @tmdbId AND media_type = @mediaType`);

// Library with TMDB ID
const updateLibraryTmdbId = db.prepare(`UPDATE library SET tmdb_id = @tmdbId WHERE jellyfin_id = @jellyfinId`);
const getLibraryTmdbIds = db.prepare(`SELECT tmdb_id, type FROM library WHERE tmdb_id IS NOT NULL`);

module.exports = {
  db,
  insertDownload,
  getDownloads,
  getActiveDownloads,
  markComplete,
  updateTransmissionId,
  deleteDownload,
  getDownloadById,
  upsertLibraryItem,
  clearLibrary,
  getLibraryItems,
  getLibraryMovies,
  getLibrarySeries,
  setDiscoverRow,
  getDiscoverRow,
  getAllDiscoverRows,
  setRating,
  getRating,
  upsertCatalogItem,
  updateCatalogRatings,
  getCatalogItem,
  getCatalogSize,
  markShown,
  dismissItem,
  getItemsNeedingRatings,
  getDistinctSeeds,
  getIngestionLog,
  upsertIngestionLog,
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  isInWatchlist,
  updateLibraryTmdbId,
  getLibraryTmdbIds,
};
