const TRANSMISSION_URL = process.env.TRANSMISSION_URL || 'http://titan.local:9091/transmission/rpc';
const TRANSMISSION_USER = process.env.TRANSMISSION_USER || 'transmission';
const TRANSMISSION_PASS = process.env.TRANSMISSION_PASS || 'transmission';

let sessionId = '';

const auth = 'Basic ' + Buffer.from(`${TRANSMISSION_USER}:${TRANSMISSION_PASS}`).toString('base64');

async function rpc(method, args = {}) {
  const body = JSON.stringify({ method, arguments: args });

  let res = await fetch(TRANSMISSION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'X-Transmission-Session-Id': sessionId,
    },
    body,
  });

  // 409 means we need a new session token
  if (res.status === 409) {
    sessionId = res.headers.get('x-transmission-session-id') || '';
    res = await fetch(TRANSMISSION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'X-Transmission-Session-Id': sessionId,
      },
      body,
    });
  }

  if (!res.ok) {
    throw new Error(`Transmission RPC error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data.result !== 'success') {
    throw new Error(`Transmission RPC failed: ${data.result}`);
  }

  return data.arguments;
}

async function addTorrent(magnetLink) {
  const result = await rpc('torrent-add', { filename: magnetLink });
  // Transmission returns either torrent-added or torrent-duplicate
  const torrent = result['torrent-added'] || result['torrent-duplicate'];
  if (!torrent) {
    throw new Error('Transmission did not return torrent info');
  }
  return { id: torrent.id, hashString: torrent.hashString, name: torrent.name };
}

async function getTorrents(ids, fields) {
  const defaultFields = ['id', 'name', 'hashString', 'percentDone', 'rateDownload', 'eta', 'status', 'totalSize'];
  const args = { fields: fields || defaultFields };
  if (ids && ids.length > 0) {
    args.ids = ids;
  }
  const result = await rpc('torrent-get', args);
  return result.torrents || [];
}

async function getTorrentsByHash(hashes) {
  // Transmission doesn't filter by hash directly, so fetch all and filter
  const all = await getTorrents(null, ['id', 'name', 'hashString', 'percentDone', 'rateDownload', 'eta', 'status', 'totalSize']);
  const hashSet = new Set(hashes.map(h => h.toLowerCase()));
  return all.filter(t => hashSet.has(t.hashString.toLowerCase()));
}

async function removeTorrent(id, deleteData = false) {
  await rpc('torrent-remove', { ids: [id], 'delete-local-data': deleteData });
}

module.exports = { addTorrent, getTorrents, getTorrentsByHash, removeTorrent };
