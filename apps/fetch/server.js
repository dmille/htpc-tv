const express = require('express');
const path = require('path');
const db = require('./db');
const transmission = require('./transmission');
const { search } = require('./search');
const jellyfin = require('./jellyfin');

const app = express();
const PORT = process.env.FETCH_PORT || 8881;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Search TPB
app.get('/api/search', async (req, res) => {
  const { q, cat } = req.query;
  if (!q || !q.trim()) return res.json([]);

  try {
    const results = await search(q.trim(), cat || 0);
    res.json(results);
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

app.listen(PORT, () => {
  console.log(`[fetch] Server running on http://localhost:${PORT}`);
  jellyfin.startSync();
});
