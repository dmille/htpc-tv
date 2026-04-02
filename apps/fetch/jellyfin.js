const db = require('./db');

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://titan.local:8096';
const JELLYFIN_USER = process.env.JELLYFIN_USER || 'jellyfin';
const JELLYFIN_PASS = process.env.JELLYFIN_PASS || 'jellyfin';

let accessToken = null;
let userId = null;

async function authenticate() {
  const res = await fetch(`${JELLYFIN_URL}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Emby-Authorization': 'MediaBrowser Client="Fetch", Device="HTPC", DeviceId="fetch-htpc", Version="1.0"',
    },
    body: JSON.stringify({ Username: JELLYFIN_USER, Pw: JELLYFIN_PASS }),
  });

  if (!res.ok) {
    throw new Error(`Jellyfin auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  accessToken = data.AccessToken;
  userId = data.User.Id;
}

async function fetchItems(type, startIndex = 0, limit = 200) {
  if (!accessToken) await authenticate();

  const params = new URLSearchParams({
    IncludeItemTypes: type,
    Recursive: 'true',
    Fields: 'Name,ProductionYear',
    StartIndex: startIndex.toString(),
    Limit: limit.toString(),
  });

  const res = await fetch(`${JELLYFIN_URL}/Users/${userId}/Items?${params}`, {
    headers: { 'X-Emby-Token': accessToken },
  });

  if (res.status === 401) {
    // Token expired, re-auth and retry
    await authenticate();
    const retry = await fetch(`${JELLYFIN_URL}/Users/${userId}/Items?${params}`, {
      headers: { 'X-Emby-Token': accessToken },
    });
    if (!retry.ok) throw new Error(`Jellyfin fetch failed: ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`Jellyfin fetch failed: ${res.status}`);
  return res.json();
}

async function syncLibrary() {
  const syncType = async (jellyfinType, dbType) => {
    let startIndex = 0;
    const limit = 200;
    let total = Infinity;

    while (startIndex < total) {
      const data = await fetchItems(jellyfinType, startIndex, limit);
      total = data.TotalRecordCount;

      for (const item of data.Items) {
        db.upsertLibraryItem.run({
          jellyfinId: item.Id,
          name: item.Name,
          type: dbType,
          year: item.ProductionYear || null,
        });
      }

      startIndex += limit;
    }
  };

  await syncType('Movie', 'movie');
  await syncType('Series', 'series');

  const items = db.getLibraryItems.all();
  console.log(`[jellyfin] Synced library: ${items.filter(i => i.type === 'movie').length} movies, ${items.filter(i => i.type === 'series').length} series`);
}

let syncInterval = null;

function startSync(intervalMs = 30 * 60 * 1000) {
  // Initial sync
  syncLibrary().catch(err => console.error('[jellyfin] Initial sync failed:', err.message));

  // Periodic sync
  syncInterval = setInterval(() => {
    syncLibrary().catch(err => console.error('[jellyfin] Sync failed:', err.message));
  }, intervalMs);
}

function stopSync() {
  if (syncInterval) clearInterval(syncInterval);
}

module.exports = { syncLibrary, startSync, stopSync };
