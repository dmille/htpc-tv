const db = require('./db');

const GENRE_ROTATION = ['Sci-Fi', 'Thriller', 'Drama', 'Comedy', 'Horror', 'Crime', 'Documentary', 'Action'];

// --- Library exclusion ---

function getLibraryExclusions() {
  // Get TMDB IDs from library for exact matching
  const withTmdbId = db.getLibraryTmdbIds.all();
  const tmdbExclusions = new Set(withTmdbId.map(r => `${r.tmdb_id}:${r.type === 'series' ? 'tv' : 'movie'}`));

  // Fallback: title+year matching for library items without TMDB IDs
  const movies = db.getLibraryMovies.all();
  const series = db.getLibrarySeries.all();

  return { tmdbExclusions, movies, series };
}

function isInLibrary(item, lib) {
  const key = `${item.tmdb_id}:${item.media_type}`;
  if (lib.tmdbExclusions.has(key)) return true;

  // Fallback fuzzy match
  const titleLower = item.title.toLowerCase();
  if (item.media_type === 'movie') {
    return lib.movies.some(m => {
      if (m.name.toLowerCase() !== titleLower) return false;
      if (item.year && m.year && item.year !== m.year) return false;
      return true;
    });
  }
  return lib.series.some(s => s.name.toLowerCase() === titleLower);
}

// --- Row builder ---

function buildRow(name, title, query, params, options = {}) {
  const { limit = 20, offset = 0, excludeIds = new Set(), library = null } = options;

  const stmt = db.db.prepare(query);
  const items = stmt.all(params);

  // Filter out excluded IDs, library items, and dismissed
  const filtered = items.filter(item => {
    if (excludeIds.has(`${item.tmdb_id}:${item.media_type}`)) return false;
    if (library && isInLibrary(item, library)) return false;
    return true;
  });

  return {
    name,
    title,
    items: filtered.slice(offset, offset + limit),
    totalAvailable: filtered.length,
  };
}

// --- Row definitions ---

const ROW_QUERIES = {
  trending: {
    title: 'Trending Now',
    query: `SELECT * FROM catalog WHERE source LIKE '%trending%' AND dismissed = 0
            ORDER BY popularity DESC LIMIT 60`,
  },
  recently_available: {
    title: 'Recently Available',
    query: `SELECT * FROM catalog WHERE year >= cast(strftime('%Y', 'now') as integer) - 1
            AND vote_count >= 50 AND dismissed = 0
            ORDER BY added_at DESC, popularity DESC LIMIT 60`,
  },
  hidden_gems: {
    title: 'Hidden Gems',
    query: `SELECT * FROM catalog WHERE vote_count BETWEEN 200 AND 10000
            AND popularity BETWEEN 5 AND 40 AND tmdb_rating >= 7.5 AND dismissed = 0
            ORDER BY times_shown ASC, RANDOM() LIMIT 60`,
  },
  critics_picks: {
    title: "Critics' Picks",
    query: `SELECT * FROM catalog WHERE source LIKE '%critics%' AND dismissed = 0
            ORDER BY times_shown ASC, RANDOM() LIMIT 60`,
  },
  top_rated: {
    title: 'Top Rated',
    query: `SELECT * FROM catalog WHERE tmdb_rating >= 8.0 AND vote_count >= 500 AND dismissed = 0
            ORDER BY times_shown ASC, tmdb_rating DESC LIMIT 60`,
  },
};

function getGenreQuery(genre) {
  return {
    title: `Hidden Gems in ${genre}`,
    query: `SELECT * FROM catalog WHERE genres LIKE '%${genre}%'
            AND vote_count BETWEEN 200 AND 10000 AND tmdb_rating >= 7.5 AND dismissed = 0
            ORDER BY times_shown ASC, RANDOM() LIMIT 60`,
  };
}

function getRecommendationQuery(seedTitle) {
  return {
    title: `Because You Watched ${seedTitle}`,
    query: `SELECT * FROM catalog WHERE seed_title LIKE '%' || @seed || '%' AND dismissed = 0
            ORDER BY times_shown ASC, tmdb_rating DESC LIMIT 40`,
  };
}

// --- Main discover builder ---

function getDiscoverRows(options = {}) {
  const { limit = 20, rowName = null, offset = 0 } = options;
  const library = getLibraryExclusions();
  const excludeIds = new Set();

  // If requesting a specific row (infinite scroll), just build that one
  if (rowName) {
    if (rowName.startsWith('recommendations:')) {
      const seed = rowName.replace('recommendations:', '');
      const def = getRecommendationQuery(seed);
      return [buildRow(rowName, def.title, def.query, { seed }, { limit, offset, library })];
    }
    if (rowName.startsWith('genre:')) {
      const genre = rowName.replace('genre:', '');
      const def = getGenreQuery(genre);
      return [buildRow(rowName, def.title, def.query, {}, { limit, offset, library })];
    }
    const def = ROW_QUERIES[rowName];
    if (def) {
      return [buildRow(rowName, def.title, def.query, {}, { limit, offset, library })];
    }
    return [];
  }

  // Build all rows for initial page load
  const rows = [];

  // Trending
  const trending = buildRow('trending', ROW_QUERIES.trending.title, ROW_QUERIES.trending.query, {}, { limit, excludeIds, library });
  if (trending.items.length > 0) {
    rows.push(trending);
    trending.items.forEach(i => excludeIds.add(`${i.tmdb_id}:${i.media_type}`));
  }

  // Because You Watched (up to 3 rows)
  const seeds = db.getDistinctSeeds.all();
  const seedTitles = [];
  for (const row of seeds) {
    if (row.seed_title) {
      for (const s of row.seed_title.split(',')) {
        const trimmed = s.trim();
        if (trimmed && !seedTitles.includes(trimmed)) seedTitles.push(trimmed);
      }
    }
  }
  // Shuffle and pick 3
  const shuffledSeeds = seedTitles.sort(() => Math.random() - 0.5).slice(0, 3);
  for (const seed of shuffledSeeds) {
    const def = getRecommendationQuery(seed);
    const row = buildRow(`recommendations:${seed}`, def.title, def.query, { seed }, { limit, excludeIds, library });
    if (row.items.length >= 5) { // only show if enough items
      rows.push(row);
      row.items.forEach(i => excludeIds.add(`${i.tmdb_id}:${i.media_type}`));
    }
  }

  // Recently Available
  const recent = buildRow('recently_available', ROW_QUERIES.recently_available.title, ROW_QUERIES.recently_available.query, {}, { limit, excludeIds, library });
  if (recent.items.length > 0) {
    rows.push(recent);
    recent.items.forEach(i => excludeIds.add(`${i.tmdb_id}:${i.media_type}`));
  }

  // Hidden Gems
  const gems = buildRow('hidden_gems', ROW_QUERIES.hidden_gems.title, ROW_QUERIES.hidden_gems.query, {}, { limit, excludeIds, library });
  if (gems.items.length > 0) {
    rows.push(gems);
    gems.items.forEach(i => excludeIds.add(`${i.tmdb_id}:${i.media_type}`));
  }

  // Genre Gems (rotates daily)
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const todayGenre = GENRE_ROTATION[dayIndex % GENRE_ROTATION.length];
  const genreDef = getGenreQuery(todayGenre);
  const genreRow = buildRow(`genre:${todayGenre}`, genreDef.title, genreDef.query, {}, { limit, excludeIds, library });
  if (genreRow.items.length >= 5) {
    rows.push(genreRow);
    genreRow.items.forEach(i => excludeIds.add(`${i.tmdb_id}:${i.media_type}`));
  }

  // Critics' Picks
  const critics = buildRow('critics_picks', ROW_QUERIES.critics_picks.title, ROW_QUERIES.critics_picks.query, {}, { limit, excludeIds, library });
  if (critics.items.length > 0) {
    rows.push(critics);
    critics.items.forEach(i => excludeIds.add(`${i.tmdb_id}:${i.media_type}`));
  }

  // Top Rated
  const topRated = buildRow('top_rated', ROW_QUERIES.top_rated.title, ROW_QUERIES.top_rated.query, {}, { limit, excludeIds, library });
  if (topRated.items.length > 0) {
    rows.push(topRated);
  }

  // Mark all served items as shown
  for (const row of rows) {
    for (const item of row.items) {
      db.markShown.run({ tmdbId: item.tmdb_id, mediaType: item.media_type });
    }
  }

  return rows;
}

// Format items for the API response
function formatItem(item) {
  return {
    tmdbId: item.tmdb_id,
    mediaType: item.media_type,
    title: item.title,
    year: item.year,
    overview: item.overview,
    poster: item.poster,
    backdrop: item.backdrop,
    tmdbRating: item.tmdb_rating,
    ratings: {
      rt: item.rt_score || null,
      imdb: item.imdb_rating || null,
      metacritic: item.metacritic || null,
    },
    popularity: item.popularity,
  };
}

function getDiscoverData(options = {}) {
  const rows = getDiscoverRows(options);
  return rows.map(row => ({
    name: row.name,
    title: row.title,
    items: row.items.map(formatItem),
    totalAvailable: row.totalAvailable,
  }));
}

module.exports = { getDiscoverData };
