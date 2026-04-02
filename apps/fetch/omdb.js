const db = require('./db');

const OMDB_KEY = process.env.OMDB_KEY || '';
const OMDB_BASE = 'http://www.omdbapi.com';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function titleKey(title, year) {
  return `${title.toLowerCase().trim()}:${year || ''}`;
}

async function fetchRatings(title, year) {
  if (!OMDB_KEY) return null;

  const key = titleKey(title, year);

  // Check cache
  const cached = db.getRating.get({ titleKey: key });
  if (cached) {
    const age = Date.now() - new Date(cached.cached_at + 'Z').getTime();
    if (age < CACHE_TTL) {
      return {
        rt: cached.rt_score,
        metacritic: cached.metacritic,
        imdb: cached.imdb_rating,
      };
    }
  }

  try {
    const params = new URLSearchParams({ t: title, apikey: OMDB_KEY });
    if (year) params.set('y', year);

    const res = await fetch(`${OMDB_BASE}/?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.Response !== 'True') return null;

    const ratings = {};
    for (const r of data.Ratings || []) {
      if (r.Source === 'Rotten Tomatoes') {
        ratings.rt = parseInt(r.Value); // "85%" -> 85
      } else if (r.Source === 'Metacritic') {
        ratings.metacritic = parseInt(r.Value); // "67/100" -> 67
      }
    }
    ratings.imdb = parseFloat(data.imdbRating) || null;

    // Cache it
    db.setRating.run({
      titleKey: key,
      rtScore: ratings.rt || null,
      metacritic: ratings.metacritic || null,
      imdbRating: ratings.imdb || null,
    });

    return {
      rt: ratings.rt || null,
      metacritic: ratings.metacritic || null,
      imdb: ratings.imdb || null,
    };
  } catch (err) {
    console.error('[omdb] Fetch failed:', err.message);
    return null;
  }
}

function computeScore(tmdbRating, omdbRatings) {
  if (!omdbRatings || (!omdbRatings.rt && !omdbRatings.imdb)) {
    return tmdbRating || 0;
  }

  let score = 0;
  let weight = 0;

  if (tmdbRating) {
    score += tmdbRating * 0.3;
    weight += 0.3;
  }
  if (omdbRatings.rt) {
    score += (omdbRatings.rt / 10) * 0.4;
    weight += 0.4;
  }
  if (omdbRatings.imdb) {
    score += omdbRatings.imdb * 0.3;
    weight += 0.3;
  }

  return weight > 0 ? score / weight * (weight / 1.0) : 0;
}

module.exports = { fetchRatings, computeScore, titleKey };
