const db = require('./db');
const { fetchRatings } = require('./omdb');

const TMDB_TOKEN = process.env.TMDB_TOKEN || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://titan.local:8096';
const JELLYFIN_USER = process.env.JELLYFIN_USER || 'jellyfin';
const JELLYFIN_PASS = process.env.JELLYFIN_PASS || 'jellyfin';

function tmdbHeaders() {
  return { Authorization: `Bearer ${TMDB_TOKEN}` };
}

async function tmdbGet(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: tmdbHeaders() });
  if (!res.ok) throw new Error(`TMDB ${endpoint}: ${res.status}`);
  return res.json();
}

function posterUrl(path) { return path ? `${IMG_BASE}/w342${path}` : null; }
function backdropUrl(path) { return path ? `${IMG_BASE}/w1280${path}` : null; }

// --- Source definitions ---

const SOURCES = [
  {
    id: 'trending_movies',
    endpoint: '/trending/movie/week',
    params: {},
    mediaType: 'movie',
    cadenceHours: 12,
    pageStrategy: 'always_1',
  },
  {
    id: 'trending_tv',
    endpoint: '/trending/tv/week',
    params: {},
    mediaType: 'tv',
    cadenceHours: 12,
    pageStrategy: 'always_1',
  },
  {
    id: 'discover_movies',
    endpoint: '/discover/movie',
    params: {
      'sort_by': 'vote_average.desc',
      'vote_count.gte': '200',
      'vote_count.lte': '10000',
      'popularity.gte': '5',
      'popularity.lte': '40',
      'language': 'en-US',
    },
    mediaType: 'movie',
    cadenceHours: 24,
    pageStrategy: 'sequential',
  },
  {
    id: 'discover_tv',
    endpoint: '/discover/tv',
    params: {
      'sort_by': 'vote_average.desc',
      'vote_count.gte': '200',
      'vote_count.lte': '10000',
      'popularity.gte': '5',
      'popularity.lte': '40',
      'language': 'en-US',
    },
    mediaType: 'tv',
    cadenceHours: 24,
    pageStrategy: 'sequential',
  },
  {
    id: 'top_rated',
    endpoint: '/movie/top_rated',
    params: { language: 'en-US' },
    mediaType: 'movie',
    cadenceHours: 24,
    pageStrategy: 'sequential',
  },
];

const GENRE_SOURCES = [
  { id: 28, name: 'Action' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
  { id: 27, name: 'Horror' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
];

const CRITICS_LISTS = [
  { id: 28, name: 'Academy Award Best Picture Winners' },
  { id: 634, name: 'IMDb Top 250' },
  { id: 8205, name: "Palme d'Or Winners" },
  { id: 43, name: "AFI's 100 Most Thrilling Films" },
  { id: 47, name: "Fangoria's 101 Best Horror" },
];

// --- Mappers ---

function mapMovie(r, source, seedTitle) {
  return {
    tmdbId: r.id,
    mediaType: 'movie',
    title: r.title || r.name,
    year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : null,
    overview: r.overview || null,
    poster: posterUrl(r.poster_path),
    backdrop: backdropUrl(r.backdrop_path),
    tmdbRating: r.vote_average || null,
    popularity: r.popularity || null,
    voteCount: r.vote_count || null,
    genres: JSON.stringify((r.genre_ids || r.genres || []).map(g => typeof g === 'object' ? g.name : g)),
    source,
    seedTitle: seedTitle || null,
  };
}

function mapTV(r, source, seedTitle) {
  return {
    tmdbId: r.id,
    mediaType: 'tv',
    title: r.name || r.title,
    year: r.first_air_date ? parseInt(r.first_air_date.substring(0, 4)) : null,
    overview: r.overview || null,
    poster: posterUrl(r.poster_path),
    backdrop: backdropUrl(r.backdrop_path),
    tmdbRating: r.vote_average || null,
    popularity: r.popularity || null,
    voteCount: r.vote_count || null,
    genres: JSON.stringify((r.genre_ids || r.genres || []).map(g => typeof g === 'object' ? g.name : g)),
    source,
    seedTitle: seedTitle || null,
  };
}

function mapItem(r, mediaType, source, seedTitle) {
  return mediaType === 'tv' ? mapTV(r, source, seedTitle) : mapMovie(r, source, seedTitle);
}

// --- Ingestion logic ---

function shouldRun(sourceId, cadenceHours) {
  const log = db.getIngestionLog.get({ source: sourceId });
  if (!log || !log.last_run) return true;
  const elapsed = Date.now() - new Date(log.last_run + 'Z').getTime();
  return elapsed >= cadenceHours * 60 * 60 * 1000;
}

function getNextPage(sourceId, strategy) {
  if (strategy === 'always_1') return 1;
  const log = db.getIngestionLog.get({ source: sourceId });
  return (log ? log.last_page : 0) + 1;
}

async function ingestSource(source) {
  if (!shouldRun(source.id, source.cadenceHours)) return 0;

  const page = getNextPage(source.id, source.pageStrategy);
  const params = { ...source.params, page: page.toString() };

  try {
    const data = await tmdbGet(source.endpoint, params);
    const results = data.results || [];

    if (results.length === 0 && source.pageStrategy === 'sequential') {
      // Reached the end, reset to page 1
      db.upsertIngestionLog.run({ source: source.id, lastPage: 0, totalItems: 0 });
      return 0;
    }

    let added = 0;
    for (const r of results) {
      if (!r.poster_path) continue; // skip items without posters
      const item = mapItem(r, source.mediaType, source.id, null);
      db.upsertCatalogItem.run(item);
      added++;
    }

    db.upsertIngestionLog.run({ source: source.id, lastPage: page, totalItems: added });
    return added;
  } catch (err) {
    console.error(`[ingest] ${source.id} failed:`, err.message);
    return 0;
  }
}

async function ingestGenres() {
  // Ingest 2 genres per run, rotating through the list
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const startIdx = (dayIndex * 2) % GENRE_SOURCES.length;
  const todaysGenres = [
    GENRE_SOURCES[startIdx],
    GENRE_SOURCES[(startIdx + 1) % GENRE_SOURCES.length],
  ];

  let total = 0;
  for (const genre of todaysGenres) {
    const sourceId = `genre:${genre.id}`;
    if (!shouldRun(sourceId, 24)) continue;

    const page = getNextPage(sourceId, 'sequential');

    try {
      const data = await tmdbGet('/discover/movie', {
        'sort_by': 'vote_average.desc',
        'vote_count.gte': '200',
        'vote_count.lte': '10000',
        'popularity.gte': '5',
        'popularity.lte': '40',
        'with_genres': genre.id.toString(),
        'language': 'en-US',
        'page': page.toString(),
      });

      const results = data.results || [];
      if (results.length === 0) {
        db.upsertIngestionLog.run({ source: sourceId, lastPage: 0, totalItems: 0 });
        continue;
      }

      let added = 0;
      for (const r of results) {
        if (!r.poster_path) continue;
        const item = mapMovie(r, sourceId, null);
        // Also tag with the genre name for display queries
        item.source = `genre:${genre.name.toLowerCase()}`;
        db.upsertCatalogItem.run(item);
        added++;
      }

      db.upsertIngestionLog.run({ source: sourceId, lastPage: page, totalItems: added });
      total += added;
    } catch (err) {
      console.error(`[ingest] genre:${genre.name} failed:`, err.message);
    }
  }
  return total;
}

async function ingestCriticsLists() {
  let total = 0;
  for (const list of CRITICS_LISTS) {
    const sourceId = `critics:${list.id}`;
    if (!shouldRun(sourceId, 7 * 24)) continue; // weekly

    try {
      const data = await tmdbGet(`/list/${list.id}`, { language: 'en-US' });
      const items = data.items || [];

      let added = 0;
      for (const r of items) {
        if (!r.poster_path) continue;
        const item = mapMovie(r, sourceId, null);
        db.upsertCatalogItem.run(item);
        added++;
      }

      db.upsertIngestionLog.run({ source: sourceId, lastPage: 1, totalItems: added });
      total += added;
      console.log(`[ingest] Critics list "${list.name}": ${added} items`);
    } catch (err) {
      console.error(`[ingest] Critics list "${list.name}" failed:`, err.message);
    }
  }
  return total;
}

// --- Recommendations ingestion ---

let jellyfinToken = null;
let jellyfinUserId = null;

async function jellyfinAuth() {
  const res = await fetch(`${JELLYFIN_URL}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Emby-Authorization': 'MediaBrowser Client="Fetch", Device="HTPC", DeviceId="fetch-htpc-ingest", Version="1.0"',
    },
    body: JSON.stringify({ Username: JELLYFIN_USER, Pw: JELLYFIN_PASS }),
  });
  if (!res.ok) throw new Error(`Jellyfin auth failed: ${res.status}`);
  const data = await res.json();
  jellyfinToken = data.AccessToken;
  jellyfinUserId = data.User.Id;
}

async function ingestRecommendations() {
  try {
    if (!jellyfinToken) await jellyfinAuth();

    const params = new URLSearchParams({
      SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: '20',
      IsPlayed: 'true', IncludeItemTypes: 'Movie,Series', Recursive: 'true',
      Fields: 'Name,ProductionYear',
    });

    let res = await fetch(`${JELLYFIN_URL}/Users/${jellyfinUserId}/Items?${params}`, {
      headers: { 'X-Emby-Token': jellyfinToken },
    });

    if (res.status === 401) {
      await jellyfinAuth();
      res = await fetch(`${JELLYFIN_URL}/Users/${jellyfinUserId}/Items?${params}`, {
        headers: { 'X-Emby-Token': jellyfinToken },
      });
    }

    if (!res.ok) return 0;
    const watchData = await res.json();
    const watches = watchData.Items || [];

    // Pick 3 random seeds
    const shuffled = [...watches].sort(() => Math.random() - 0.5);
    const seeds = shuffled.slice(0, 3);

    let total = 0;
    for (const seed of seeds) {
      try {
        const searchType = seed.Type === 'Series' ? 'tv' : 'movie';
        const tmdbSearch = await tmdbGet(`/search/${searchType}`, {
          query: seed.Name, year: seed.ProductionYear || '',
        });
        if (!tmdbSearch.results || tmdbSearch.results.length === 0) continue;

        const tmdbId = tmdbSearch.results[0].id;
        const endpoint = searchType === 'tv'
          ? `/tv/${tmdbId}/recommendations`
          : `/movie/${tmdbId}/recommendations`;
        const recsData = await tmdbGet(endpoint);

        for (const r of recsData.results || []) {
          if (!r.poster_path) continue;
          const item = mapItem(r, searchType === 'tv' ? 'tv' : 'movie', 'recommendations', seed.Name);
          // Fix mediaType for recs — TMDB returns mixed types
          item.mediaType = r.media_type || searchType;
          db.upsertCatalogItem.run(item);
          total++;
        }
      } catch (err) {
        console.error(`[ingest] Recs for "${seed.Name}" failed:`, err.message);
      }
    }

    console.log(`[ingest] Recommendations: ${total} items from ${seeds.length} seeds`);
    return total;
  } catch (err) {
    console.error('[ingest] Recommendations failed:', err.message);
    return 0;
  }
}

// --- OMDb enrichment ---

async function enrichBatch(limit = 50) {
  const items = db.getItemsNeedingRatings.all({ limit });
  if (items.length === 0) return 0;

  let enriched = 0;
  for (const item of items) {
    const ratings = await fetchRatings(item.title, item.year);
    if (ratings) {
      db.updateCatalogRatings.run({
        tmdbId: item.tmdb_id,
        mediaType: item.media_type,
        rtScore: ratings.rt || null,
        imdbRating: ratings.imdb || null,
        metacritic: ratings.metacritic || null,
      });
      enriched++;
    }
    // Small delay to be gentle on OMDb
    await new Promise(r => setTimeout(r, 100));
  }

  if (enriched > 0) console.log(`[ingest] Enriched ${enriched}/${items.length} items with OMDb ratings`);
  return enriched;
}

// --- Initial seed ---

async function initialSeed() {
  const size = db.getCatalogSize.get();
  if (size.count > 0) return; // already seeded

  console.log('[ingest] Initial seed starting...');
  const start = Date.now();

  // Ingest pages 1-5 of main sources
  for (const source of SOURCES) {
    for (let page = 1; page <= 5; page++) {
      const params = { ...source.params, page: page.toString() };
      try {
        const data = await tmdbGet(source.endpoint, params);
        for (const r of (data.results || [])) {
          if (!r.poster_path) continue;
          db.upsertCatalogItem.run(mapItem(r, source.mediaType, source.id, null));
        }
      } catch (err) {
        console.error(`[ingest] Seed ${source.id} page ${page} failed:`, err.message);
      }
    }
    db.upsertIngestionLog.run({ source: source.id, lastPage: 5, totalItems: 0 });
  }

  // Ingest all critics lists
  await ingestCriticsLists();

  // Ingest first page of each genre
  for (const genre of GENRE_SOURCES) {
    try {
      const data = await tmdbGet('/discover/movie', {
        'sort_by': 'vote_average.desc',
        'vote_count.gte': '200',
        'vote_count.lte': '10000',
        'popularity.gte': '5',
        'popularity.lte': '40',
        'with_genres': genre.id.toString(),
        'language': 'en-US',
        'page': '1',
      });
      for (const r of (data.results || [])) {
        if (!r.poster_path) continue;
        db.upsertCatalogItem.run(mapMovie(r, `genre:${genre.name.toLowerCase()}`, null));
      }
      db.upsertIngestionLog.run({ source: `genre:${genre.id}`, lastPage: 1, totalItems: 0 });
    } catch (err) {
      console.error(`[ingest] Seed genre:${genre.name} failed:`, err.message);
    }
  }

  // Ingest recommendations
  await ingestRecommendations();

  const finalSize = db.getCatalogSize.get();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[ingest] Initial seed complete: ${finalSize.count} items in ${elapsed}s`);
}

// --- Main run ---

async function runIngestion() {
  console.log('[ingest] Running...');
  let total = 0;

  for (const source of SOURCES) {
    total += await ingestSource(source);
  }

  total += await ingestGenres();
  total += await ingestCriticsLists();
  total += await ingestRecommendations();

  // Enrich a batch of items missing ratings
  await enrichBatch(50);

  const size = db.getCatalogSize.get();
  console.log(`[ingest] Done: +${total} new, ${size.count} total in catalog`);
}

let ingestionInterval = null;
let enrichInterval = null;

function startIngestion() {
  // Initial seed if needed, then first run
  initialSeed()
    .then(() => runIngestion())
    .catch(err => console.error('[ingest] Startup failed:', err.message));

  // Daily ingestion
  ingestionInterval = setInterval(() => {
    runIngestion().catch(err => console.error('[ingest] Run failed:', err.message));
  }, 12 * 60 * 60 * 1000); // every 12h

  // Hourly recommendations + enrichment
  enrichInterval = setInterval(() => {
    ingestRecommendations().catch(err => console.error('[ingest] Recs failed:', err.message));
    enrichBatch(50).catch(err => console.error('[ingest] Enrich failed:', err.message));
  }, 60 * 60 * 1000);
}

function stopIngestion() {
  if (ingestionInterval) clearInterval(ingestionInterval);
  if (enrichInterval) clearInterval(enrichInterval);
}

module.exports = { startIngestion, stopIngestion, runIngestion, initialSeed };
