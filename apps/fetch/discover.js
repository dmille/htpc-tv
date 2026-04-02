const db = require('./db');
const { fetchRatings, computeScore } = require('./omdb');

const TMDB_TOKEN = process.env.TMDB_TOKEN || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://titan.local:8096';
const JELLYFIN_USER = process.env.JELLYFIN_USER || 'jellyfin';
const JELLYFIN_PASS = process.env.JELLYFIN_PASS || 'jellyfin';

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

async function fetchHiddenGems() {
  const [movies, tv] = await Promise.all([
    tmdbGet('/discover/movie', {
      'sort_by': 'vote_average.desc',
      'vote_count.gte': '200',
      'popularity.gte': '5',
      'popularity.lte': '40',
      'language': 'en-US',
    }),
    tmdbGet('/discover/tv', {
      'sort_by': 'vote_average.desc',
      'vote_count.gte': '200',
      'popularity.gte': '5',
      'popularity.lte': '40',
      'language': 'en-US',
    }),
  ]);

  const items = [
    ...movies.results.map(r => mapMovie(r)),
    ...tv.results.map(r => mapTV(r)),
  ];

  items.sort((a, b) => b.tmdbRating - a.tmdbRating);
  return items.slice(0, 20);
}

async function fetchGenreGems() {
  // Pick a genre based on current day (rotates daily)
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const genre = GENRE_ROTATION[dayIndex % GENRE_ROTATION.length];

  const data = await tmdbGet('/discover/movie', {
    'sort_by': 'vote_average.desc',
    'vote_count.gte': '200',
    'popularity.gte': '5',
    'popularity.lte': '40',
    'with_genres': genre.id.toString(),
    'language': 'en-US',
  });

  return {
    genre: genre.name,
    items: data.results.map(r => mapMovie(r)),
  };
}

async function fetchTopRated() {
  const data = await tmdbGet('/movie/top_rated', { language: 'en-US' });
  return data.results.map(r => mapMovie(r));
}

async function fetchRecommendations() {
  // Get recently watched from Jellyfin
  const seeds = await getJellyfinWatchHistory();
  if (seeds.length === 0) return null;

  // Resolve TMDB IDs for top 5 seeds
  const tmdbSeeds = [];
  for (const seed of seeds.slice(0, 5)) {
    try {
      const data = await tmdbGet('/search/movie', {
        query: seed.name,
        year: seed.year || '',
      });
      if (data.results && data.results.length > 0) {
        tmdbSeeds.push({
          tmdbId: data.results[0].id,
          title: seed.name,
          type: seed.type === 'Series' ? 'tv' : 'movie',
        });
      }
    } catch (err) {
      console.error(`[discover] Failed to resolve TMDB ID for "${seed.name}":`, err.message);
    }
  }

  if (tmdbSeeds.length === 0) return null;

  // Fetch recommendations for each seed, deduplicate
  const allRecs = [];
  const seenIds = new Set();

  for (const seed of tmdbSeeds) {
    try {
      const endpoint = seed.type === 'tv'
        ? `/tv/${seed.tmdbId}/recommendations`
        : `/movie/${seed.tmdbId}/recommendations`;
      const data = await tmdbGet(endpoint);

      for (const r of data.results || []) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          allRecs.push({
            ...(seed.type === 'tv' ? mapTV(r) : mapMovie(r)),
            seedTitle: seed.title,
          });
        }
      }
    } catch (err) {
      console.error(`[discover] Recs for "${seed.title}" failed:`, err.message);
    }
  }

  if (allRecs.length === 0) return null;

  // Pick the seed with the most recs for the row title
  const seedCounts = {};
  for (const r of allRecs) {
    seedCounts[r.seedTitle] = (seedCounts[r.seedTitle] || 0) + 1;
  }
  const bestSeed = Object.entries(seedCounts).sort((a, b) => b[1] - a[1])[0][0];

  return {
    seedTitle: bestSeed,
    items: allRecs.slice(0, 20),
  };
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
    const [trending, recent, hiddenGems, genreResult, topRated, recsResult] = await Promise.all([
      fetchTrending().catch(err => { console.error('[discover] Trending failed:', err.message); return []; }),
      fetchRecentlyAvailable().catch(err => { console.error('[discover] Recent failed:', err.message); return []; }),
      fetchHiddenGems().catch(err => { console.error('[discover] Hidden gems failed:', err.message); return []; }),
      fetchGenreGems().catch(err => { console.error('[discover] Genre gems failed:', err.message); return { genre: '?', items: [] }; }),
      fetchTopRated().catch(err => { console.error('[discover] Top rated failed:', err.message); return []; }),
      fetchRecommendations().catch(err => { console.error('[discover] Recommendations failed:', err.message); return null; }),
    ]);

    // Filter out Jellyfin library items
    const rows = [
      { name: 'trending', title: 'Trending Now', items: filterLibrary(trending) },
      { name: 'recent', title: 'Recently Available', items: filterLibrary(recent) },
      { name: 'hidden_gems', title: 'Hidden Gems', items: filterLibrary(hiddenGems) },
      { name: 'genre_gems', title: `Hidden Gems in ${genreResult.genre}`, items: filterLibrary(genreResult.items) },
      { name: 'top_rated', title: 'Top Rated', items: filterLibrary(topRated) },
    ];

    if (recsResult && recsResult.items.length > 0) {
      rows.splice(1, 0, {
        name: 'recommendations',
        title: `Because You Watched ${recsResult.seedTitle}`,
        items: filterLibrary(recsResult.items),
      });
    }

    // Enrich with OMDb ratings (only items that will be shown)
    for (const row of rows) {
      if (row.items.length > 0) {
        await enrichWithRatings(row.items);
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

let refreshInterval = null;

function startRefresh(intervalMs = 6 * 60 * 60 * 1000) {
  // Initial refresh after short delay (let Jellyfin sync finish first)
  setTimeout(() => {
    refreshDiscover().catch(err => console.error('[discover] Initial refresh failed:', err.message));
  }, 5000);

  refreshInterval = setInterval(() => {
    refreshDiscover().catch(err => console.error('[discover] Refresh failed:', err.message));
  }, intervalMs);
}

function stopRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
}

module.exports = { refreshDiscover, getDiscoverData, startRefresh, stopRefresh };
