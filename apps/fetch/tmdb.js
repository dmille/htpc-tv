const TMDB_TOKEN = process.env.TMDB_TOKEN || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

// In-memory cache to avoid repeated lookups for the same title
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function headers() {
  return { Authorization: `Bearer ${TMDB_TOKEN}` };
}

async function searchMovie(title, year) {
  const params = new URLSearchParams({ query: title });
  if (year) params.set('year', year);

  const res = await fetch(`${TMDB_BASE}/search/movie?${params}`, { headers: headers() });
  if (!res.ok) return null;

  const data = await res.json();
  return data.results?.[0] || null;
}

async function searchTV(title) {
  const params = new URLSearchParams({ query: title });

  const res = await fetch(`${TMDB_BASE}/search/tv?${params}`, { headers: headers() });
  if (!res.ok) return null;

  const data = await res.json();
  return data.results?.[0] || null;
}

function posterUrl(path, size = 'w300') {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

async function getPoster(title, type, year) {
  if (!TMDB_TOKEN) return null;

  const cacheKey = `${type}:${title.toLowerCase()}:${year || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;

  try {
    let result;
    if (type === 'movie') {
      result = await searchMovie(title, year);
    } else {
      result = await searchTV(title);
    }

    const url = posterUrl(result?.poster_path);
    cache.set(cacheKey, { url, ts: Date.now() });
    return url;
  } catch (err) {
    console.error('[tmdb] Lookup failed:', err.message);
    return null;
  }
}

// Extract a clean search title from the torrent name (before year/tags)
function extractTitle(rawName) {
  const name = rawName
    .replace(/\./g, ' ')
    .replace(/[-_]/g, ' ');

  // Try to grab everything before a year, episode/season tag, or resolution
  // S\d{2}E\d{2} must come before S\d{2} to avoid partial match
  const match = name.match(/^(.+?)\s*(?:\(?\d{4}\)?|\bS\d{2}E\d{2}\b|\bS\d{2}\b|\bSeason\b|\b(?:1080|2160|720)p\b)/i);
  return match ? match[1].replace(/[\(\)\[\]]/g, '').trim() : name.substring(0, 40).trim();
}

async function addPosters(results) {
  if (!TMDB_TOKEN || results.length === 0) return results;

  // Group by unique title to minimize API calls
  const titleMap = new Map();
  for (const r of results) {
    const searchTitle = extractTitle(r.rawName);
    const isTV = r.type === 'episode' || r.type === 'season';
    const key = `${isTV ? 'tv' : 'movie'}:${searchTitle.toLowerCase()}`;
    if (!titleMap.has(key)) {
      titleMap.set(key, { searchTitle, type: isTV ? 'tv' : 'movie', year: null });
      if (!isTV) {
        // Try to extract year for movies
        const yearMatch = r.rawName.match(/[\.\s\(\[]((?:19|20)\d{2})[\.\s\)\]]/);
        if (yearMatch) titleMap.get(key).year = yearMatch[1];
      }
    }
  }

  // Fetch posters in parallel (max 5 concurrent)
  const entries = [...titleMap.entries()];
  const posterMap = new Map();

  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const promises = batch.map(async ([key, { searchTitle, type, year }]) => {
      const url = await getPoster(searchTitle, type, year);
      posterMap.set(key, url);
    });
    await Promise.all(promises);
  }

  // Attach poster URLs to results
  return results.map(r => {
    const searchTitle = extractTitle(r.rawName);
    const isTV = r.type === 'episode' || r.type === 'season';
    const key = `${isTV ? 'tv' : 'movie'}:${searchTitle.toLowerCase()}`;
    return { ...r, poster: posterMap.get(key) || null };
  });
}

module.exports = { addPosters };
