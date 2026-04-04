const db = require('./db');
const { fetchRatings, computeScore } = require('./omdb');

const TMDB_TOKEN = process.env.TMDB_TOKEN || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://titan.local:8096';
const JELLYFIN_USER = process.env.JELLYFIN_USER || 'jellyfin';
const JELLYFIN_PASS = process.env.JELLYFIN_PASS || 'jellyfin';

const CRITICS_LISTS = [
  { id: 28, name: 'Academy Award Best Picture Winners' },
  { id: 634, name: 'IMDb Top 250' },
  { id: 8205, name: "Palme d'Or Winners" },
  { id: 43, name: "AFI's 100 Most Thrilling Films" },
  { id: 47, name: "Fangoria's 101 Best Horror" },
];

const GENRE_ROTATION = [
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
  { id: 18, name: 'Drama' },
  { id: 35, name: 'Comedy' },
  { id: 27, name: 'Horror' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
];

function tmdbHeaders() {
  return { Authorization: `Bearer ${TMDB_TOKEN}` };
}

function posterUrl(path, size = 'w342') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

function backdropUrl(path, size = 'w1280') {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

// --- TMDB fetchers ---

async function tmdbGet(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: tmdbHeaders() });
  if (!res.ok) throw new Error(`TMDB ${endpoint}: ${res.status}`);
  return res.json();
}

async function fetchTrending() {
  const [movies, tv] = await Promise.all([
    tmdbGet('/trending/movie/week'),
    tmdbGet('/trending/tv/week'),
  ]);

  const items = [
    ...movies.results.map(r => mapMovie(r)),
    ...tv.results.map(r => mapTV(r)),
  ];

  // Interleave movies and TV, sorted by popularity
  items.sort((a, b) => b.popularity - a.popularity);
  return items.slice(0, 20);
}

async function fetchRecentlyAvailable() {
  const now = new Date();
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
  const dateStr = fourMonthsAgo.toISOString().split('T')[0];

  const data = await tmdbGet('/discover/movie', {
    'sort_by': 'popularity.desc',
    'primary_release_date.gte': dateStr,
    'vote_count.gte': '50',
    'language': 'en-US',
  });

  return data.results.map(r => mapMovie(r));
}

function randomPage(max) {
  return Math.floor(Math.random() * max) + 1;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fetch a blended set: mostly from top pages, some deep cuts
async function fetchBlended(endpoint, params, { topPages = 3, deepMin = 3, deepMax = 10, topCount = 12, deepCount = 8 } = {}) {
  const topPage = randomPage(topPages);
  const deepPage = deepMin + randomPage(deepMax - deepMin + 1) - 1;

  const [topRes, deepRes] = await Promise.all([
    tmdbGet(endpoint, { ...params, page: topPage.toString() }),
    tmdbGet(endpoint, { ...params, page: deepPage.toString() }),
  ]);

  const topItems = shuffle([...(topRes.results || [])]).slice(0, topCount);
  const deepItems = shuffle([...(deepRes.results || [])]).slice(0, deepCount);

  // Merge, deduplicate by ID, shuffle
  const seen = new Set();
  const merged = [];
  for (const item of [...topItems, ...deepItems]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return shuffle(merged);
}

async function fetchHiddenGems() {
  const movieParams = {
    'sort_by': 'vote_average.desc',
    'vote_count.gte': '200',
    'vote_count.lte': '10000',
    'popularity.gte': '5',
    'popularity.lte': '40',
    'language': 'en-US',
  };
  const tvParams = { ...movieParams };

  const [movies, tv] = await Promise.all([
    fetchBlended('/discover/movie', movieParams, { topPages: 3, deepMin: 4, deepMax: 15, topCount: 8, deepCount: 6 }),
    fetchBlended('/discover/tv', tvParams, { topPages: 3, deepMin: 4, deepMax: 10, topCount: 6, deepCount: 4 }),
  ]);

  const items = shuffle([
    ...movies.map(r => mapMovie(r)),
    ...tv.map(r => mapTV(r)),
  ]);

  return items.slice(0, 20);
}

async function fetchGenreGems() {
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const genre = GENRE_ROTATION[dayIndex % GENRE_ROTATION.length];

  const results = await fetchBlended('/discover/movie', {
    'sort_by': 'vote_average.desc',
    'vote_count.gte': '200',
    'vote_count.lte': '10000',
    'popularity.gte': '5',
    'popularity.lte': '40',
    'with_genres': genre.id.toString(),
    'language': 'en-US',
  }, { topPages: 3, deepMin: 3, deepMax: 10, topCount: 12, deepCount: 8 });

  return {
    genre: genre.name,
    items: results.slice(0, 20).map(r => mapMovie(r)),
  };
}

async function fetchCriticsPicks() {
  // Pick a random list each refresh
  const list = CRITICS_LISTS[Math.floor(Math.random() * CRITICS_LISTS.length)];

  const data = await tmdbGet(`/list/${list.id}`, { language: 'en-US' });
  const items = (data.items || [])
    .filter(item => item.poster_path) // must have a poster
    .map(r => mapMovie(r));

  // Shuffle and take 20
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return {
    listName: list.name,
    items: items.slice(0, 20),
  };
}

async function fetchTopRated() {
  const results = await fetchBlended('/movie/top_rated', {
    'language': 'en-US',
  }, { topPages: 2, deepMin: 3, deepMax: 10, topCount: 14, deepCount: 6 });

  return results.map(r => mapMovie(r)).slice(0, 20);
}

async function fetchRecommendations() {
  // Get recently watched from Jellyfin
  const seeds = await getJellyfinWatchHistory();
  if (seeds.length === 0) return [];

  // Resolve TMDB IDs for seeds
  const tmdbSeeds = [];
  for (const seed of seeds.slice(0, 20)) {
    try {
      const searchType = seed.type === 'Series' ? 'tv' : 'movie';
      const data = await tmdbGet(`/search/${searchType}`, {
        query: seed.name,
        year: seed.year || '',
      });
      if (data.results && data.results.length > 0) {
        tmdbSeeds.push({
          tmdbId: data.results[0].id,
          title: seed.name,
          type: searchType,
        });
      }
    } catch (err) {
      console.error(`[discover] Failed to resolve TMDB ID for "${seed.name}":`, err.message);
    }
  }

  if (tmdbSeeds.length === 0) return [];

  // Shuffle and pick 3 diverse seeds
  const shuffled = [...tmdbSeeds].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  console.log(`[discover] Rec seeds: ${picked.map(s => s.title).join(', ')}`);

  // Fetch recommendations for each seed separately
  const rows = [];
  const globalSeenIds = new Set();

  for (const seed of picked) {
    try {
      const endpoint = seed.type === 'tv'
        ? `/tv/${seed.tmdbId}/recommendations`
        : `/movie/${seed.tmdbId}/recommendations`;
      const data = await tmdbGet(endpoint);

      const items = [];
      for (const r of data.results || []) {
        if (!globalSeenIds.has(r.id)) {
          globalSeenIds.add(r.id);
          items.push(seed.type === 'tv' ? mapTV(r) : mapMovie(r));
        }
      }

      if (items.length > 0) {
        rows.push({
          seedTitle: seed.title,
          items: items.slice(0, 20),
        });
      }
    } catch (err) {
      console.error(`[discover] Recs for "${seed.title}" failed:`, err.message);
    }
  }

  return rows;
}

// --- Jellyfin ---

let jellyfinToken = null;
let jellyfinUserId = null;

async function jellyfinAuth() {
  const res = await fetch(`${JELLYFIN_URL}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Emby-Authorization': 'MediaBrowser Client="Fetch", Device="HTPC", DeviceId="fetch-htpc-discover", Version="1.0"',
    },
    body: JSON.stringify({ Username: JELLYFIN_USER, Pw: JELLYFIN_PASS }),
  });
  if (!res.ok) throw new Error(`Jellyfin auth failed: ${res.status}`);
  const data = await res.json();
  jellyfinToken = data.AccessToken;
  jellyfinUserId = data.User.Id;
}

async function getJellyfinWatchHistory() {
  try {
    if (!jellyfinToken) await jellyfinAuth();

    const params = new URLSearchParams({
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Limit: '20',
      IsPlayed: 'true',
      IncludeItemTypes: 'Movie,Series',
      Recursive: 'true',
      Fields: 'Name,ProductionYear',
    });

    const res = await fetch(`${JELLYFIN_URL}/Users/${jellyfinUserId}/Items?${params}`, {
      headers: { 'X-Emby-Token': jellyfinToken },
    });

    if (res.status === 401) {
      await jellyfinAuth();
      const retry = await fetch(`${JELLYFIN_URL}/Users/${jellyfinUserId}/Items?${params}`, {
        headers: { 'X-Emby-Token': jellyfinToken },
      });
      if (!retry.ok) return [];
      const data = await retry.json();
      return data.Items.map(i => ({ name: i.Name, year: i.ProductionYear, type: i.Type }));
    }

    if (!res.ok) return [];
    const data = await res.json();
    return data.Items.map(i => ({ name: i.Name, year: i.ProductionYear, type: i.Type }));
  } catch (err) {
    console.error('[discover] Jellyfin watch history failed:', err.message);
    return [];
  }
}

// --- Mappers ---

function mapMovie(r) {
  return {
    tmdbId: r.id,
    title: r.title,
    year: r.release_date ? r.release_date.substring(0, 4) : null,
    overview: r.overview || '',
    tmdbRating: r.vote_average,
    popularity: r.popularity,
    poster: posterUrl(r.poster_path),
    backdrop: backdropUrl(r.backdrop_path),
    mediaType: 'movie',
  };
}

function mapTV(r) {
  return {
    tmdbId: r.id,
    title: r.name,
    year: r.first_air_date ? r.first_air_date.substring(0, 4) : null,
    overview: r.overview || '',
    tmdbRating: r.vote_average,
    popularity: r.popularity,
    poster: posterUrl(r.poster_path),
    backdrop: backdropUrl(r.backdrop_path),
    mediaType: 'tv',
  };
}

// --- Library filter ---

function filterLibrary(items) {
  const movies = db.getLibraryMovies.all();
  const series = db.getLibrarySeries.all();

  return items.filter(item => {
    const titleLower = item.title.toLowerCase();

    if (item.mediaType === 'movie') {
      return !movies.some(m => {
        if (m.name.toLowerCase() !== titleLower) return false;
        if (item.year && m.year && parseInt(item.year) !== m.year) return false;
        return true;
      });
    }

    return !series.some(s => s.name.toLowerCase() === titleLower);
  });
}

// --- OMDb enrichment ---

async function enrichWithRatings(items) {
  // Batch in groups of 5 to be gentle on OMDb
  for (let i = 0; i < items.length; i += 5) {
    const batch = items.slice(i, i + 5);
    await Promise.all(batch.map(async (item) => {
      const ratings = await fetchRatings(item.title, item.year);
      item.ratings = ratings || {};
      item.score = computeScore(item.tmdbRating, ratings);
    }));
  }
  return items;
}

// --- Main refresh ---

async function refreshDiscover() {
  console.log('[discover] Refreshing...');
  const start = Date.now();

  try {
    // Fetch all rows in parallel
    const [trending, recent, hiddenGems, genreResult, topRated, criticsResult, recsRows] = await Promise.all([
      fetchTrending().catch(err => { console.error('[discover] Trending failed:', err.message); return []; }),
      fetchRecentlyAvailable().catch(err => { console.error('[discover] Recent failed:', err.message); return []; }),
      fetchHiddenGems().catch(err => { console.error('[discover] Hidden gems failed:', err.message); return []; }),
      fetchGenreGems().catch(err => { console.error('[discover] Genre gems failed:', err.message); return { genre: '?', items: [] }; }),
      fetchTopRated().catch(err => { console.error('[discover] Top rated failed:', err.message); return []; }),
      fetchCriticsPicks().catch(err => { console.error('[discover] Critics picks failed:', err.message); return { listName: '?', items: [] }; }),
      fetchRecommendations().catch(err => { console.error('[discover] Recommendations failed:', err.message); return []; }),
    ]);

    // Filter out Jellyfin library items
    const rows = [
      { name: 'trending', title: 'Trending Now', items: filterLibrary(trending) },
      { name: 'recent', title: 'Recently Available', items: filterLibrary(recent) },
      { name: 'hidden_gems', title: 'Hidden Gems', items: filterLibrary(hiddenGems) },
      { name: 'genre_gems', title: `Hidden Gems in ${genreResult.genre}`, items: filterLibrary(genreResult.items) },
      { name: 'critics_picks', title: `Critics' Picks: ${criticsResult.listName}`, items: filterLibrary(criticsResult.items) },
      { name: 'top_rated', title: 'Top Rated', items: filterLibrary(topRated) },
    ];

    // Insert up to 3 "Because You Watched" rows after trending
    if (recsRows && recsRows.length > 0) {
      const recRowsFiltered = recsRows
        .map((r, i) => ({
          name: `recommendations_${i}`,
          title: `Because You Watched ${r.seedTitle}`,
          items: filterLibrary(r.items),
        }))
        .filter(r => r.items.length > 0);
      rows.splice(1, 0, ...recRowsFiltered);
    }

    // Enrich with OMDb ratings (only items that will be shown)
    for (const row of rows) {
      if (row.items.length > 0) {
        await enrichWithRatings(row.items);
      }
    }

    // Clear old recommendation rows before writing new ones
    const existing = db.getAllDiscoverRows.all();
    for (const row of existing) {
      if (row.row_name.startsWith('recommendations')) {
        db.db.prepare('DELETE FROM discover_cache WHERE row_name = ?').run(row.row_name);
      }
    }

    // Remove empty rows and cache
    const nonEmpty = rows.filter(r => r.items.length > 0);
    for (const row of nonEmpty) {
      db.setDiscoverRow.run({
        rowName: row.name,
        data: JSON.stringify({ title: row.title, items: row.items }),
      });
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const itemCount = nonEmpty.reduce((sum, r) => sum + r.items.length, 0);
    console.log(`[discover] Refreshed: ${nonEmpty.length} rows, ${itemCount} items in ${elapsed}s`);
  } catch (err) {
    console.error('[discover] Refresh failed:', err.message);
  }
}

function getDiscoverData() {
  const rows = db.getAllDiscoverRows.all();
  return rows.map(r => {
    const parsed = JSON.parse(r.data);
    return {
      name: r.row_name,
      title: parsed.title,
      items: parsed.items,
      updatedAt: r.updated_at,
    };
  });
}

async function refreshRecommendations() {
  try {
    const recsRows = await fetchRecommendations();
    if (recsRows.length === 0) return;

    // Clear old recommendation rows
    const existing = db.getAllDiscoverRows.all();
    for (const row of existing) {
      if (row.row_name.startsWith('recommendations')) {
        db.db.prepare('DELETE FROM discover_cache WHERE row_name = ?').run(row.row_name);
      }
    }

    let totalItems = 0;
    for (let i = 0; i < recsRows.length; i++) {
      const filtered = filterLibrary(recsRows[i].items);
      if (filtered.length > 0) {
        await enrichWithRatings(filtered);
        db.setDiscoverRow.run({
          rowName: `recommendations_${i}`,
          data: JSON.stringify({
            title: `Because You Watched ${recsRows[i].seedTitle}`,
            items: filtered,
          }),
        });
        totalItems += filtered.length;
      }
    }
    console.log(`[discover] Recommendations refreshed: ${recsRows.length} rows, ${totalItems} items`);
  } catch (err) {
    console.error('[discover] Recommendations refresh failed:', err.message);
  }
}

let refreshInterval = null;
let recsInterval = null;

function startRefresh(intervalMs = 6 * 60 * 60 * 1000) {
  // Initial full refresh after short delay (let Jellyfin sync finish first)
  setTimeout(() => {
    refreshDiscover().catch(err => console.error('[discover] Initial refresh failed:', err.message));
  }, 5000);

  // Full refresh every 6 hours
  refreshInterval = setInterval(() => {
    refreshDiscover().catch(err => console.error('[discover] Refresh failed:', err.message));
  }, intervalMs);

  // Recommendations refresh every hour
  recsInterval = setInterval(() => {
    refreshRecommendations().catch(err => console.error('[discover] Recs refresh failed:', err.message));
  }, 60 * 60 * 1000);
}

function stopRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  if (recsInterval) clearInterval(recsInterval);
}

module.exports = { refreshDiscover, getDiscoverData, startRefresh, stopRefresh };
