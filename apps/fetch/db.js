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

  CREATE TABLE IF NOT EXISTS library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jellyfin_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    year INTEGER,
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
};
