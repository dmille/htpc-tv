const express = require('express');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.MOTE_PORT || 8880;

// --- Display detection (mirrors project's launch-chrome.sh logic) ---

function resolveDisplay() {
  if (process.env.DISPLAY) return process.env.DISPLAY;

  const fs = require('fs');
  const dir = '/tmp/.X11-unix';
  try {
    const sockets = fs.readdirSync(dir).filter(f => f.startsWith('X'));
    if (sockets.length > 0) {
      const display = ':' + sockets[0].slice(1);
      process.env.DISPLAY = display;
      return display;
    }
  } catch {
    // directory may not exist
  }
  return null;
}

const display = resolveDisplay();

// --- Key mappings ---

const ACTION_KEYS = {
  up:     ['key', 'Up'],
  down:   ['key', 'Down'],
  left:   ['key', 'Left'],
  right:  ['key', 'Right'],
  ok:     ['key', 'Return'],
  back:   ['key', 'Escape'],
  home:   ['key', 'alt+Home'],
  reload: ['key', 'F5'],
};

const VALID_ACTIONS = new Set(Object.keys(ACTION_KEYS));
const MAX_TEXT_LENGTH = 500;

// --- Middleware ---

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---

function xdotool(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (display) env.DISPLAY = display;

    execFile('xdotool', args, { env, timeout: 5000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function pactl(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    execFile('pactl', args, { env, timeout: 5000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function checkXdotool() {
  return new Promise((resolve) => {
    execFile('which', ['xdotool'], (err) => resolve(!err));
  });
}

// --- Routes ---

// Health check
app.get('/api/health', async (_req, res) => {
  const xdotoolOk = await checkXdotool();
  const displayOk = !!display;
  const ok = xdotoolOk && displayOk;

  res.json({
    status: ok ? 'ok' : 'degraded',
    display: display || null,
    xdotool: xdotoolOk,
    mote: 'happy',
  });
});

// Send an action (D-pad, OK, Back, Home, Reload)
app.post('/api/action', async (req, res) => {
  const { action } = req.body;

  if (!action || !VALID_ACTIONS.has(action)) {
    return res.status(400).json({
      error: 'Invalid action',
      valid: [...VALID_ACTIONS],
      mote: 'confused',
    });
  }

  const [cmd, ...args] = ACTION_KEYS[action];
  try {
    await xdotool([cmd, '--clearmodifiers', ...args]);
    res.json({ ok: true, action, mote: 'zap' });
  } catch (err) {
    res.status(500).json({ error: err.message, mote: 'sad' });
  }
});

// Send text
app.post('/api/text', async (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string' || text.length === 0) {
    return res.status(400).json({ error: 'Text is required', mote: 'confused' });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({
      error: `Text too long (max ${MAX_TEXT_LENGTH} chars)`,
      mote: 'overwhelmed',
    });
  }

  try {
    await xdotool(['type', '--clearmodifiers', '--delay', '12', text]);
    res.json({ ok: true, length: text.length, mote: 'typing' });
  } catch (err) {
    res.status(500).json({ error: err.message, mote: 'sad' });
  }
});

// Send text + Enter
app.post('/api/text-enter', async (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string' || text.length === 0) {
    return res.status(400).json({ error: 'Text is required', mote: 'confused' });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({
      error: `Text too long (max ${MAX_TEXT_LENGTH} chars)`,
      mote: 'overwhelmed',
    });
  }

  try {
    await xdotool(['type', '--clearmodifiers', '--delay', '12', text]);
    await xdotool(['key', '--clearmodifiers', 'Return']);
    res.json({ ok: true, length: text.length, entered: true, mote: 'typing' });
  } catch (err) {
    res.status(500).json({ error: err.message, mote: 'sad' });
  }
});

// Volume control
const VOLUME_STEP = '5%';
const VALID_VOLUME_ACTIONS = new Set(['up', 'down', 'mute']);

app.post('/api/volume', async (req, res) => {
  const { action } = req.body;

  if (!action || !VALID_VOLUME_ACTIONS.has(action)) {
    return res.status(400).json({
      error: 'Invalid volume action',
      valid: [...VALID_VOLUME_ACTIONS],
      mote: 'confused',
    });
  }

  try {
    if (action === 'mute') {
      await pactl(['set-sink-mute', '@DEFAULT_SINK@', 'toggle']);
    } else if (action === 'up') {
      await pactl(['set-sink-mute', '@DEFAULT_SINK@', '0']);
      await pactl(['set-sink-volume', '@DEFAULT_SINK@', `+${VOLUME_STEP}`]);
    } else if (action === 'down') {
      await pactl(['set-sink-mute', '@DEFAULT_SINK@', '0']);
      await pactl(['set-sink-volume', '@DEFAULT_SINK@', `-${VOLUME_STEP}`]);
    }
    res.json({ ok: true, action, mote: 'zap' });
  } catch (err) {
    res.status(500).json({ error: err.message, mote: 'sad' });
  }
});

// --- Start ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(``);
  console.log(`  .-~~~-.`);
  console.log(`  |     |    Mote is awake!`);
  console.log(`  | o o |    http://0.0.0.0:${PORT}`);
  console.log(`  |  ~  |    Display: ${display || 'NOT FOUND'}`);
  console.log(`  '-----'`);
  console.log(`   || ||`);
  console.log(``);
});
