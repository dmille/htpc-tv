const db = require('./db');

const APIBAY_URL = process.env.APIBAY_URL || 'https://apibay.org';
const MIN_SEEDERS = parseInt(process.env.MIN_SEEDERS || '2', 10);

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
];

const TRACKER_PARAMS = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');

const SOURCE_RANK = {
  'bluray': 6,
  'blu-ray': 6,
  'web-dl': 5,
  'webdl': 5,
  'webrip': 4,
  'web-rip': 4,
  'brrip': 3,
  'bdrip': 3,
  'hdrip': 2,
  'hdtv': 1,
};

function parseResolution(name) {
  if (/2160p/i.test(name) || /\b4K\b/i.test(name)) return '2160p';
  if (/1080p/i.test(name)) return '1080p';
  if (/720p/i.test(name)) return '720p';
  return null;
}

function parseSource(name) {
  const lower = name.toLowerCase();
  for (const [key] of Object.entries(SOURCE_RANK).sort((a, b) => b[1] - a[1])) {
    if (lower.includes(key)) {
      // Return display-friendly version
      if (key === 'bluray' || key === 'blu-ray') return 'BluRay';
      if (key === 'web-dl' || key === 'webdl') return 'WEB-DL';
      if (key === 'webrip' || key === 'web-rip') return 'WEBRip';
      if (key === 'brrip') return 'BRRip';
      if (key === 'bdrip') return 'BDRip';
      if (key === 'hdrip') return 'HDRip';
      if (key === 'hdtv') return 'HDTV';
    }
  }
  return null;
}

function parseCodec(name) {
  if (/x265|hevc|h\.?265/i.test(name)) return 'x265';
  if (/x264|h\.?264/i.test(name)) return 'x264';
  return null;
}

function parseEpisode(name) {
  // Individual episode: S01E03 (allow optional space/dot between S and E parts)
  const epMatch = name.match(/S(\d{2})\s*[._ ]?\s*E(\d{2})/i);
  if (epMatch) return { type: 'episode', episode: `S${epMatch[1]}E${epMatch[2]}` };

  // Season pack: S01 or Season 1 (without episode number)
  const seasonMatch = name.match(/\bS(\d{2})\b(?!\s*[._ ]?\s*E\d)/i) || name.match(/\bSeason\s+(\d+)\b/i);
  if (seasonMatch) return { type: 'season', episode: `Season ${parseInt(seasonMatch[1])}` };

  return { type: 'movie', episode: null };
}

function parseYear(name) {
  // Look for a 4-digit year in the title — in parens, brackets, or between dots/spaces
  const match = name.match(/[\.\s\(\[]((?:19|20)\d{2})[\.\s\)\]]/);
  return match ? parseInt(match[1]) : null;
}

function cleanTitle(name) {
  let title = name
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title;
}

function normalizeName(raw) {
  return raw
    .replace(/\./g, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\(\)\[\]]/g, '')
    .toLowerCase()
    .trim();
}

function cleanSeriesName(name) {
  return name
    // Strip years like "2008"
    .replace(/\b(19|20)\d{2}\b/g, '')
    // Strip filler words
    .replace(/\b(complete|full|the complete|series)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupKey(result) {
  const name = normalizeName(result.rawName);

  if (result.type === 'episode' && result.episode) {
    const match = name.match(/^(.+?)\s*s\d{2}\s*e\d{2}/i);
    const series = match ? cleanSeriesName(match[1]) : name.substring(0, 30);
    return `episode:${series}:${result.episode.toLowerCase()}`;
  }

  if (result.type === 'season' && result.episode) {
    const match = name.match(/^(.+?)\s*(?:s\d{2}\b|season\s*\d+)/i);
    const series = match ? cleanSeriesName(match[1]) : name.substring(0, 30);
    return `season:${series}:${result.episode.toLowerCase()}`;
  }

  // Movie: title + year
  const year = parseYear(result.rawName);
  const titleMatch = name.match(/^(.+?)\s*(?:\d{4}|1080p|2160p|4k|720p)/i);
  const title = titleMatch ? titleMatch[1].trim() : name.substring(0, 40);
  return `movie:${title}:${year || ''}`;
}

function formatSize(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function sourceRank(source) {
  if (!source) return 0;
  return SOURCE_RANK[source.toLowerCase()] || 0;
}

function checkLibrary(name, type, year) {
  if (type === 'movie') {
    const movies = db.getLibraryMovies.all();
    const torrentYear = year || parseYear(name);
    const normalizedName = name
      .replace(/\./g, ' ')
      .replace(/[\(\)]/g, '')
      .toLowerCase()
      .trim();

    return movies.some(m => {
      const libName = m.name.toLowerCase();
      // Check if the torrent name starts with the library name
      if (normalizedName.startsWith(libName) || normalizedName.includes(libName)) {
        // If we have years for both, they must match
        if (torrentYear && m.year && torrentYear !== m.year) return false;
        return true;
      }
      return false;
    });
  }

  // For TV, match on series name only
  const series = db.getLibrarySeries.all();
  const normalizedName = name.replace(/\./g, ' ').toLowerCase();
  return series.some(s => normalizedName.includes(s.name.toLowerCase()));
}

async function search(query, category = 0) {
  const url = `${APIBAY_URL}/q.php?q=${encodeURIComponent(query)}&cat=${category}`;
  const res = await fetch(url);
  const results = await res.json();

  // Apibay returns [{id: "0", name: "No results returned"}] when empty
  if (results.length === 1 && results[0].id === '0') return [];

  const parsed = results.map(r => {
    const seeders = parseInt(r.seeders);
    const leechers = parseInt(r.leechers);
    const sizeBytes = parseInt(r.size);
    const resolution = parseResolution(r.name);
    const source = parseSource(r.name);
    const codec = parseCodec(r.name);
    const { type, episode } = parseEpisode(r.name);
    const trusted = r.status === 'vip' || r.status === 'trusted';
    const infoHash = r.info_hash;
    const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(r.name)}${TRACKER_PARAMS}`;
    const inLibrary = checkLibrary(r.name, type, parseYear(r.name));

    return {
      name: cleanTitle(r.name),
      rawName: r.name,
      infoHash,
      seeders,
      leechers,
      size: formatSize(sizeBytes),
      sizeBytes,
      resolution,
      source,
      codec,
      trusted,
      type,
      episode,
      inLibrary,
      magnet,
      imdb: r.imdb || null,
    };
  });

  const filtered = parsed
    .filter(r => {
      // Must have 1080p or better
      if (!r.resolution || r.resolution === '720p') return false;
      // Minimum seeders
      if (r.seeders < MIN_SEEDERS) return false;
      // Size sanity for movies only
      if (r.type === 'movie' && r.sizeBytes < 700 * 1024 * 1024) return false;
      return true;
    })
    .sort((a, b) => {
      // Trusted/VIP first
      if (a.trusted !== b.trusted) return b.trusted - a.trusted;
      // Then by seeders
      if (a.seeders !== b.seeders) return b.seeders - a.seeders;
      // Then by source quality
      return sourceRank(b.source) - sourceRank(a.source);
    });

  // Deduplicate: keep the best (first) result per unique movie/episode/season
  const seen = new Set();
  return filtered.filter(r => {
    const key = dedupKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { search };
