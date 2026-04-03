const express = require('express');
const path = require('path');
const db = require('./db');
const transmission = require('./transmission');
const { search } = require('./search');
const jellyfin = require('./jellyfin');
const { addPosters } = require('./tmdb');
const discover = require('./discover');

const app = express();
const PORT = process.env.FETCH_PORT || 8881;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback: serve index.html for view paths
app.get('/discover', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/downloads', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Search TPB
app.get('/api/search', async (req, res) => {
  const { q, cat } = req.query;
  if (!q || !q.trim()) return res.json([]);

  try {
    const results = await search(q.trim(), cat || 0);
    const withPosters = await addPosters(results);
    res.json(withPosters);
  } catch (err) {
    console.error('[search] Error:', err.message);
    res.status(502).json({ error: 'Search failed' });
  }
});

// Submit download
app.post('/api/download', async (req, res) => {
  const { name, magnet, infoHash, resolution, source, type, episode, sizeBytes } = req.body;
  if (!magnet || !infoHash) {
    return res.status(400).json({ error: 'magnet and infoHash are required' });
  }

  try {
    const torrent = await transmission.addTorrent(magnet);

    const result = db.insertDownload.run({
      name: name || torrent.name,
      magnet,
      infoHash: infoHash.toLowerCase(),
      transmissionId: torrent.id,
      resolution: resolution || null,
      source: source || null,
      type: type || null,
      episode: episode || null,
      sizeBytes: sizeBytes || null,
    });

    res.json({ id: result.lastInsertRowid, transmissionId: torrent.id });
  } catch (err) {
    console.error('[download] Error:', err.message);
    res.status(502).json({ error: 'Failed to submit download: ' + err.message });
  }
});

// List downloads with live progress
app.get('/api/downloads', async (req, res) => {
  try {
    const downloads = db.getDownloads.all();
    const active = downloads.filter(d => d.status === 'downloading');

    let progressMap = {};
    if (active.length > 0) {
      // Try by transmission IDs first
      const ids = active.map(d => d.transmission_id).filter(Boolean);
      let torrents = [];

      if (ids.length > 0) {
        try {
          torrents = await transmission.getTorrents(ids);
        } catch (err) {
          console.error('[downloads] Transmission query failed:', err.message);
        }
      }

      // Build map by hash for stable matching
      const byHash = {};
      for (const t of torrents) {
        byHash[t.hashString.toLowerCase()] = t;
      }

      // Check for any active downloads missing from results (ID changed after restart)
      const missingHashes = active
        .filter(d => !byHash[d.info_hash.toLowerCase()])
        .map(d => d.info_hash);

      if (missingHashes.length > 0) {
        try {
          const resolved = await transmission.getTorrentsByHash(missingHashes);
          for (const t of resolved) {
            byHash[t.hashString.toLowerCase()] = t;
          }
        } catch (err) {
          console.error('[downloads] Hash re-resolve failed:', err.message);
        }
      }

      // Update progress and detect completions
      for (const d of active) {
        const t = byHash[d.info_hash.toLowerCase()];
        if (t) {
          // Update transmission_id if it changed
          if (t.id !== d.transmission_id) {
            db.updateTransmissionId.run({ transmissionId: t.id, id: d.id });
          }

          progressMap[d.id] = {
            percentDone: t.percentDone,
            rateDownload: t.rateDownload,
            eta: t.eta,
            totalSize: t.totalSize,
          };

          if (t.percentDone >= 1) {
            db.markComplete.run({ id: d.id });
          }
        }
      }
    }

    const result = downloads.map(d => ({
      id: d.id,
      name: d.name,
      resolution: d.resolution,
      source: d.source,
      type: d.type,
      episode: d.episode,
      status: d.status === 'downloading' && progressMap[d.id]?.percentDone >= 1 ? 'complete' : d.status,
      addedAt: d.added_at,
      completedAt: d.completed_at,
      progress: progressMap[d.id] || null,
    }));

    res.json(result);
  } catch (err) {
    console.error('[downloads] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch downloads' });
  }
});

// Delete download
app.delete('/api/downloads/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const download = db.getDownloadById.get({ id });
  if (!download) return res.status(404).json({ error: 'Not found' });

  // Remove from Transmission if still active
  if (download.status === 'downloading' && download.transmission_id) {
    try {
      await transmission.removeTorrent(download.transmission_id, false);
    } catch (err) {
      console.error('[delete] Transmission remove failed:', err.message);
    }
  }

  db.deleteDownload.run({ id });
  res.json({ ok: true });
});

// Discover rows (cached)
app.get('/api/discover', (req, res) => {
  try {
    const rows = discover.getDiscoverData();
    res.json(rows);
  } catch (err) {
    console.error('[discover] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch discover data' });
  }
});

// Discover item: search for best torrent for a TMDB item
app.get('/api/discover/item/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  const { type } = req.query; // 'movie' or 'tv'
  console.log(`[discover/item] Looking up tmdbId=${tmdbId} type=${type}`);

  try {
    // Look up item on TMDB to get title + year
    const endpoint = type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const tmdbRes = await fetch(`https://api.themoviedb.org/3${endpoint}?append_to_response=credits`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}` },
    });
    if (!tmdbRes.ok) return res.status(404).json({ error: 'TMDB item not found' });

    const item = await tmdbRes.json();
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').substring(0, 4);
    const runtime = item.runtime || (item.episode_run_time && item.episode_run_time[0]) || null;
    const genres = (item.genres || []).map(g => g.name);
    const tagline = item.tagline || '';
    const directors = (item.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name);
    const cast = (item.credits?.cast || []).slice(0, 5).map(c => ({ name: c.name, character: c.character }));
    // For TV, use "created_by" instead of director
    const creators = (item.created_by || []).map(c => c.name);
    // Strip special characters that break Apibay search (apostrophes, colons, etc.)
    const cleanTitle = title.replace(/[''":!,]/g, '').replace(/\s+/g, ' ').trim();
    const query = year ? `${cleanTitle} ${year}` : cleanTitle;

    // Search for torrents — try specific category first, fall back to all
    const cat = type === 'tv' ? 208 : 207;
    let results = await search(query, cat);
    if (results.length === 0) {
      results = await search(query, 0); // fallback: search all categories
    }
    if (results.length === 0) {
      // Try without year in case it's causing mismatch
      results = await search(cleanTitle, 0);
    }

    const detail = {
      runtime,
      genres,
      tagline,
      directors: type === 'tv' ? creators : directors,
      cast,
    };

    if (results.length === 0) {
      return res.json({ available: false, title, year, detail });
    }

    const best = results[0];
    res.json({
      available: true,
      title,
      year,
      detail,
      torrent: {
        name: best.name,
        magnet: best.magnet,
        infoHash: best.infoHash,
        resolution: best.resolution,
        source: best.source,
        size: best.size,
        sizeBytes: best.sizeBytes,
        seeders: best.seeders,
        type: best.type,
        episode: best.episode,
      },
    });
  } catch (err) {
    console.error('[discover/item] Error:', err.message);
    res.status(502).json({ error: 'Failed to search for torrent' });
  }
});

app.listen(PORT, () => {
  console.log(`[fetch] Server running on http://localhost:${PORT}`);
  jellyfin.startSync();
  discover.startRefresh();
});
