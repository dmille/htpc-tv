// --- Mote Remote Client ---

const moteEl = document.getElementById('mote');
const speechEl = document.getElementById('mote-speech');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const keyboardInput = document.getElementById('keyboard-input');

const PHRASES = {
  happy:       ['Mote is ready!', 'At your service!', 'Let\'s go!'],
  zap:         ['Zap!', 'Pow!', 'Sent!', 'Boop!', 'Click!'],
  typing:      ['Typing away...', 'Clackity clack!', 'Sent the words!'],
  sad:         ['Oops...', 'Something went wrong...', 'Mote is confused...'],
  confused:    ['Huh?', 'That\'s not right...', 'Try again?'],
  overwhelmed: ['Too much text!', 'Whoa there!'],
  dizzy:       ['Woaaah...', 'So many buttons...', 'Room is spinning...', 'I need a break...'],
  sleepy:      ['Zzz...', '*yawn*', 'So sleepy...', 'Wake me up...', 'Five more minutes...'],
  excited:     ['WOOO!', 'Let\'s GOOOO!', 'SO EXCITED!', 'YEAH!'],
  love:        ['<3', 'Love you!', 'Aww!', 'You\'re the best!'],
  wave:        ['Hi there!', 'Hello!', 'Hey!', '*waves*'],
  peek:        ['...', 'Hmm?', 'What\'s over there?', '*looks around*'],
  sneeze:      ['ACHOO!', 'Bless me!', '*sniff*', 'Excuse me!'],
  dance:       ['*groove*', 'Feel the beat!', 'Boogie!', 'Dance time!'],
  hiccup:      ['*hic*', '*hic* oops', 'Excuse— *hic*'],
  blush:       ['Oh stop it...', 'Aww shucks!', '*blushes*', 'Tee hee!'],
  sparkle:     ['Oooh shiny!', 'Sparkle sparkle!', 'So pretty!', '✨'],
  fullspin:    ['Wheee!', 'Again again!', 'So fun!', 'Round and round!'],
  melt:        ['I\'m melting...', 'So warm...', 'Puddle mode...', 'Goopy...'],
  gulp:        ['*gulp*', 'Uh oh...', 'That\'s scary...', 'Eep!'],
  giggle:      ['Hehehe!', 'Tee hee!', 'Haha!', '*giggles*'],
  wink:        [';)', '*wink*', 'You know it!', 'Gotcha!'],
  suspicious:  ['Hmm...', 'Something\'s up...', 'I\'m watching...', '...sus'],
  shocked:     ['WHAT?!', 'No way!', 'Oh no!', 'GASP!'],
  proud:       ['Nailed it!', 'I\'m so good!', 'Champion!', 'Look at me!'],
  whistle:     ['*whistle*', 'La dee da...', '♪ ♫', 'Doo doo doo...'],
  nod:         ['Yeah!', 'Mm-hmm!', 'Got it!', 'Yep!'],
  headshake:   ['Nope!', 'Nuh-uh', 'No way!', 'Not today!'],
  stretch:     ['*streeetch*', 'Ahh!', 'That\'s better!', 'Big stretch!'],
  sing:        ['La la laaa~', '��� do re mi ♫', 'Sing along!', '♫♪♫'],
  shiver:      ['Brrr!', 'So cold!', '*shivers*', 'Chilly!'],
  zoom:        ['ZOOM!', 'Fast!', 'Nyoooom!', 'Speed!'],
  bonk:        ['Ow!', 'Bonk!', '*thud*', 'Ouch!'],
  startle:     ['EEK!', 'What was that?!', 'Yikes!', 'AH!'],
  shh:         ['Shhh...', 'Quiet now...', '*whispers*', 'Hush...'],
  'look-up':   ['What\'s up there?', 'Looking up!', 'Sky check!'],
  duck:        ['Duck!', 'Going low!', '*ducks*', 'Eep!'],
  'lean-left': ['This way!', 'Left!', 'Over here!'],
  'lean-right':['That way!', 'Right!', 'Over there!'],
  slam:        ['SLAM!', 'POW!', 'Take that!', 'SMASH!'],
  fistbump:    ['Yeah!', 'Boom!', 'Nailed it!', '👊'],
  dodge:       ['Whoa!', 'Close one!', '*dodges*', 'Phew!'],
  cozy:        ['Home sweet home!', 'Cozy!', 'Ahh, home...', 'Safe and sound!'],
  hush:        ['🤫', '*muffled*', '...', 'Shhh!'],
  crackknuckles: ['Let\'s type!', '*crack*', 'Ready!', 'Bring it on!'],
  relief:      ['Phew!', 'Done typing!', 'Ahh...', '*stretches*'],
  rocket:      ['LIFTOFF!', '🚀', 'To the moon!', 'UP UP UP!'],
  floormelt:   ['I\'m a puddle...', 'So flat...', '*melts*', 'Floor time...'],
  idle:        ['Hi! I\'m Mote!', 'Waiting for you!', 'Press something!'],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let moteTimeout = null;

const MOOD_DURATIONS = {
  sleepy: 4000,
  peek: 2500,
  sneeze: 1500,
  dance: 2000,
  love: 2500,
  excited: 2000,
  hiccup: 1200,
  blush: 2500,
  sparkle: 1500,
  fullspin: 1200,
  melt: 2000,
  gulp: 1200,
  giggle: 2000,
  wink: 2000,
  suspicious: 2500,
  shocked: 1800,
  proud: 2500,
  whistle: 2500,
  nod: 1200,
  headshake: 1200,
  stretch: 1500,
  sing: 3000,
  shiver: 1500,
  shh: 1500,
  'look-up': 1000,
  duck: 1000,
  'lean-left': 1000,
  'lean-right': 1000,
  slam: 1200,
  fistbump: 1200,
  dodge: 1200,
  cozy: 2500,
  hush: 2000,
  crackknuckles: 1500,
  relief: 1500,
  rocket: 1500,
  floormelt: 1500,
  zoom: 1000,
  bonk: 1500,
  startle: 1200,
};

function setMote(mood, phrase) {
  // Clear previous mood
  moteEl.className = 'mote';
  // Force reflow for re-triggering animation
  void moteEl.offsetWidth;
  moteEl.classList.add(mood);

  speechEl.textContent = phrase || pick(PHRASES[mood] || PHRASES.idle);

  const duration = MOOD_DURATIONS[mood] || 2000;
  clearTimeout(moteTimeout);
  moteTimeout = setTimeout(() => {
    moteEl.className = 'mote';
    speechEl.textContent = pick(PHRASES.idle);
  }, duration);
}

// --- Button spam detection (triggers dizzy) ---

let actionCount = 0;
let actionResetTimer = null;

function trackButtonPress() {
  actionCount++;
  clearTimeout(actionResetTimer);
  actionResetTimer = setTimeout(() => { actionCount = 0; }, 1500);
  if (actionCount >= 8) {
    actionCount = 0;
    setMote('dizzy');
    return true; // skip normal mood
  }
  return false;
}

// --- API calls ---

// --- Success streak tracking (triggers proud) ---
let successStreak = 0;

// --- Direction combo detection ---
let recentDirs = [];
let dirResetTimer = null;

function trackDirection(dir) {
  recentDirs.push(dir);
  clearTimeout(dirResetTimer);
  dirResetTimer = setTimeout(() => { recentDirs = []; }, 2000);

  // Keep last 5
  if (recentDirs.length > 5) recentDirs.shift();

  const last3 = recentDirs.slice(-3);
  const last4 = recentDirs.slice(-4);

  // Left-right-left or right-left-right = confused
  if (last3.length === 3 &&
      ((last3[0] === 'left' && last3[1] === 'right' && last3[2] === 'left') ||
       (last3[0] === 'right' && last3[1] === 'left' && last3[2] === 'right'))) {
    recentDirs = [];
    setMote('dizzy');
    return true;
  }

  // Up-up-up-up = rocket
  if (last4.length === 4 && last4.every(d => d === 'up')) {
    recentDirs = [];
    setMote('rocket');
    return true;
  }

  // Down-down-down-down = floor melt
  if (last4.length === 4 && last4.every(d => d === 'down')) {
    recentDirs = [];
    setMote('floormelt');
    return true;
  }

  return false;
}

// Pick a mood for a d-pad direction press
function pickDpadMood(action) {
  const r = Math.random();
  switch (action) {
    case 'up':    return r < 0.25 ? 'look-up' : 'zap';
    case 'down':  return r < 0.25 ? 'duck' : 'zap';
    case 'left':  return r < 0.25 ? 'lean-left' : 'zap';
    case 'right': return r < 0.25 ? 'lean-right' : 'zap';
    default: return 'zap';
  }
}

// Pick a mood for OK
function pickOkMood() {
  const r = Math.random();
  if (r < 0.1) return 'slam';
  if (r < 0.2) return 'fistbump';
  if (r < 0.35) return 'nod';
  return 'zap';
}

// Pick a mood for Back
function pickBackMood() {
  const r = Math.random();
  if (r < 0.15) return 'dodge';
  if (r < 0.3) return 'headshake';
  return 'zap';
}

// Pick a mood for Home
function pickHomeMood() {
  const r = Math.random();
  if (r < 0.25) return 'cozy';
  if (r < 0.4) return 'sparkle';
  return 'zap';
}

// Pick a mood for Reload
function pickReloadMood() {
  return Math.random() < 0.35 ? 'zoom' : 'zap';
}

async function sendAction(action) {
  const spammed = trackButtonPress();

  // Check direction combos
  if (['up', 'down', 'left', 'right'].includes(action)) {
    if (trackDirection(action)) return; // combo fired, skip normal send
  }

  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!spammed) {
      if (data.ok) {
        successStreak++;
        if (successStreak === 15) {
          successStreak = 0;
          setMote('proud');
        } else if (['up','down','left','right'].includes(action)) {
          setMote(pickDpadMood(action));
        } else if (action === 'ok') {
          setMote(pickOkMood());
        } else if (action === 'back') {
          setMote(pickBackMood());
        } else if (action === 'home') {
          setMote(pickHomeMood());
        } else if (action === 'reload') {
          setMote(pickReloadMood());
        } else {
          setMote(data.mote || 'zap');
        }
      } else {
        successStreak = 0;
        setMote(Math.random() < 0.3 ? 'gulp' : (data.mote || 'confused'), data.error);
      }
    }
  } catch {
    successStreak = 0;
    setMote(Math.random() < 0.4 ? 'shocked' : 'sad', 'Can\'t reach HTPC...');
  }
}

async function sendVolume(action) {
  const spammed = trackButtonPress();
  try {
    const res = await fetch('/api/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!spammed) {
      if (data.ok) {
        if (action === 'mute') setMote('hush');
        else if (action === 'up') setMote('dance');
        else setMote('shh');
      } else {
        setMote(data.mote || 'confused', data.error);
      }
    }
  } catch {
    setMote('sad', 'Can\'t reach HTPC...');
  }
}

// --- Health check ---

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.status === 'ok') {
      statusDot.className = 'status-dot ok';
      statusText.textContent = 'connected';
    } else {
      statusDot.className = 'status-dot bad';
      statusText.textContent = 'degraded';
    }
  } catch {
    statusDot.className = 'status-dot bad';
    statusText.textContent = 'unavailable';
  }
}

checkHealth();
setInterval(checkHealth, 15000);

// --- Button handlers ---

document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => sendAction(btn.dataset.action));

  // Prevent double-tap zoom on mobile
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    btn.click();
  });
});

document.querySelectorAll('[data-volume]').forEach((btn) => {
  btn.addEventListener('click', () => sendVolume(btn.dataset.volume));
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    btn.click();
  });
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  // Don't hijack keys in keyboard mode
  if (keyboardMode) return;

  switch (e.key) {
    case 'ArrowUp':    e.preventDefault(); sendAction('up'); break;
    case 'ArrowDown':  e.preventDefault(); sendAction('down'); break;
    case 'ArrowLeft':  e.preventDefault(); sendAction('left'); break;
    case 'ArrowRight': e.preventDefault(); sendAction('right'); break;
    case 'Enter':      e.preventDefault(); sendAction('ok'); break;
    case 'Escape':     e.preventDefault(); sendAction('back'); break;
    case 'h':          e.preventDefault(); sendAction('home'); break;
    case 'r':          e.preventDefault(); sendAction('reload'); break;
    case '+':          e.preventDefault(); sendVolume('up'); break;
    case '=':          e.preventDefault(); sendVolume('up'); break;
    case '-':          e.preventDefault(); sendVolume('down'); break;
    case 'm':          e.preventDefault(); sendVolume('mute'); break;
  }
});

// --- WebSocket for keyboard mode ---

let ws = null;
let keyboardMode = false;

function connectWS() {
  if (ws && ws.readyState <= WebSocket.OPEN) return ws;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onclose = () => { ws = null; };
  ws.onerror = () => { ws = null; };
  return ws;
}

function sendWS(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const pending = connectWS();
    pending.addEventListener('open', () => {
      pending.send(JSON.stringify(msg));
    }, { once: true });
    return;
  }
  ws.send(JSON.stringify(msg));
}

// --- Keyboard toggle ---

const btnKeyboard = document.getElementById('btn-keyboard');

function activateKeyboard() {
  keyboardMode = true;
  btnKeyboard.classList.add('active');
  keyboardInput.value = ' ';
  keyboardInput.focus();
  keyboardInput.setSelectionRange(1, 1);
  connectWS();
  setMote('crackknuckles');
}

function deactivateKeyboard() {
  keyboardMode = false;
  btnKeyboard.classList.remove('active');
  keyboardInput.blur();
  setMote('relief');
}

btnKeyboard.addEventListener('click', () => {
  if (keyboardMode) deactivateKeyboard();
  else activateKeyboard();
});

// Special key mapping: web key names -> xdotool key names
const SPECIAL_KEYS = {
  'Backspace': 'BackSpace',
  'Enter': 'Return',
  'Escape': 'Escape',
  'Tab': 'Tab',
  'Delete': 'Delete',
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Home': 'Home',
  'End': 'End',
  'PageUp': 'Page_Up',
  'PageDown': 'Page_Down',
};

// keydown fires BEFORE beforeinput, so it's primary for special keys.
// beforeinput is primary for characters (mobile keydown reports "Unidentified").
let handledByKeydown = false;

// Primary for special keys: keydown
keyboardInput.addEventListener('keydown', (e) => {
  if (!keyboardMode) return;

  const mapped = SPECIAL_KEYS[e.key];
  if (mapped) {
    e.preventDefault();
    sendWS({ type: 'key', key: mapped });
    handledByKeydown = true;
    queueMicrotask(() => { handledByKeydown = false; });
    return;
  }

  // Prevent form behavior for unmapped special keys
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
  }
});

// Primary for characters: beforeinput (best mobile support)
keyboardInput.addEventListener('beforeinput', (e) => {
  if (!keyboardMode) return;

  const { inputType, data } = e;
  e.preventDefault();

  if (inputType === 'insertText' && data) {
    for (const ch of data) {
      sendWS({ type: 'char', char: ch });
    }
  } else if (!handledByKeydown) {
    // Fallback for mobile where keydown reports "Unidentified"
    if (inputType === 'deleteContentBackward') {
      sendWS({ type: 'key', key: 'BackSpace' });
    } else if (inputType === 'deleteContentForward') {
      sendWS({ type: 'key', key: 'Delete' });
    } else if (inputType === 'insertLineBreak') {
      sendWS({ type: 'key', key: 'Return' });
    }
  }

  // Reset sentinel
  setTimeout(() => {
    keyboardInput.value = ' ';
    keyboardInput.setSelectionRange(1, 1);
  }, 0);
});

// When input loses focus (keyboard dismissed), deactivate keyboard mode
keyboardInput.addEventListener('blur', () => {
  if (keyboardMode) {
    setTimeout(() => {
      if (keyboardMode) deactivateKeyboard();
    }, 100);
  }
});

// Android: dismissing keyboard doesn't blur the input, but the viewport resizes back
if (window.visualViewport) {
  let lastHeight = window.visualViewport.height;
  window.visualViewport.addEventListener('resize', () => {
    const newHeight = window.visualViewport.height;
    // Viewport grew significantly = keyboard was dismissed
    if (keyboardMode && newHeight > lastHeight + 50) {
      deactivateKeyboard();
    }
    lastHeight = newHeight;
  });
}

// --- Idle blink ---

function isIdle() {
  return moteEl.classList.length === 1;
}

function scheduleBlink() {
  const delay = 2000 + Math.random() * 4000;
  setTimeout(() => {
    if (isIdle()) {
      moteEl.classList.add('blink');
      const double = Math.random() < 0.3;
      const reopenDelay = double ? 250 : 120;
      setTimeout(() => {
        moteEl.classList.remove('blink');
        if (double) {
          setTimeout(() => {
            moteEl.classList.add('blink');
            setTimeout(() => moteEl.classList.remove('blink'), 120);
          }, 100);
        }
      }, reopenDelay);
    }
    scheduleBlink();
  }, delay);
}

scheduleBlink();

// --- Idle mouth expressions ---

const IDLE_MOUTHS = ['idle-smile', 'idle-oo', 'idle-smirk', 'idle-tongue'];

function scheduleMouth() {
  const delay = 8000 + Math.random() * 12000;
  setTimeout(() => {
    if (isIdle()) {
      const expr = IDLE_MOUTHS[Math.floor(Math.random() * IDLE_MOUTHS.length)];
      moteEl.classList.add(expr);
      const duration = 1000 + Math.random() * 800;
      setTimeout(() => moteEl.classList.remove(expr), duration);
    }
    scheduleMouth();
  }, delay);
}

scheduleMouth();

// --- Idle peek (looks left/right) ---

function schedulePeek() {
  const delay = 15000 + Math.random() * 25000; // 15-40s
  setTimeout(() => {
    if (isIdle()) {
      const goLeft = Math.random() < 0.5;
      moteEl.classList.add('peek');
      if (goLeft) moteEl.classList.add('peek-left');
      speechEl.textContent = pick(PHRASES.peek);
      setTimeout(() => {
        moteEl.classList.remove('peek', 'peek-left');
        speechEl.textContent = pick(PHRASES.idle);
      }, 2000);
    }
    schedulePeek();
  }, delay);
}

schedulePeek();

// --- Idle sneeze (rare) ---

function scheduleSneeze() {
  const delay = 45000 + Math.random() * 60000; // 45-105s
  setTimeout(() => {
    if (isIdle()) {
      setMote('sneeze');
    }
    scheduleSneeze();
  }, delay);
}

scheduleSneeze();

// --- Sleepy (after long idle) ---

let lastInteraction = Date.now();

function trackInteraction() {
  lastInteraction = Date.now();
}

// Track all button presses
document.addEventListener('click', trackInteraction);
document.addEventListener('touchstart', trackInteraction);

function scheduleSleepy() {
  setInterval(() => {
    const idleTime = Date.now() - lastInteraction;
    // Fall asleep after 60s of no interaction
    if (idleTime > 60000 && isIdle()) {
      setMote('sleepy');
    }
  }, 15000);
}

scheduleSleepy();

// --- Love (Easter egg: tap Mote 5 times) / Blush (3 taps) ---

let moteTaps = 0;
let moteTapTimer = null;

moteEl.addEventListener('click', () => {
  moteTaps++;
  clearTimeout(moteTapTimer);
  moteTapTimer = setTimeout(() => { moteTaps = 0; }, 2000);
  if (moteTaps >= 5) {
    moteTaps = 0;
    setMote('love');
  } else if (moteTaps === 3) {
    setMote('blush');
  }
});

// --- Fullspin (Easter egg: long-press Mote) ---

let motePressTimer = null;
moteEl.addEventListener('pointerdown', () => {
  motePressTimer = setTimeout(() => setMote('fullspin'), 800);
});
moteEl.addEventListener('pointerup', () => clearTimeout(motePressTimer));
moteEl.addEventListener('pointerleave', () => clearTimeout(motePressTimer));

// --- Initial mood: wave hello ---
setMote('wave');

// --- Excited on reconnect / shocked+shiver on disconnect ---

let wasDisconnected = false;

const origCheckHealth = checkHealth;
checkHealth = async function () {
  await origCheckHealth();
  const nowOk = statusDot.className.includes('ok');
  if (wasDisconnected && nowOk) {
    setMote('excited');
    wasDisconnected = false;
  }
  if (!nowOk && !wasDisconnected) {
    setMote('shocked');
    wasDisconnected = true;
  }
};

// --- Random idle animations ---

const IDLE_ANIMATIONS = [
  { mood: 'giggle',     weight: 3 },
  { mood: 'wink',       weight: 3 },
  { mood: 'suspicious', weight: 2 },
  { mood: 'whistle',    weight: 2 },
  { mood: 'sing',       weight: 2 },
  { mood: 'hiccup',     weight: 1 },
  { mood: 'startle',    weight: 1 },
  { mood: 'melt',       weight: 1 },
];

const IDLE_TOTAL_WEIGHT = IDLE_ANIMATIONS.reduce((s, a) => s + a.weight, 0);

function pickWeightedIdle() {
  let r = Math.random() * IDLE_TOTAL_WEIGHT;
  for (const a of IDLE_ANIMATIONS) {
    r -= a.weight;
    if (r <= 0) return a.mood;
  }
  return IDLE_ANIMATIONS[0].mood;
}

function scheduleIdleAnimation() {
  const delay = 20000 + Math.random() * 30000; // 20-50s
  setTimeout(() => {
    if (isIdle()) {
      setMote(pickWeightedIdle());
    }
    scheduleIdleAnimation();
  }, delay);
}

scheduleIdleAnimation();

// --- Shiver on degraded connection ---

const origCheckHealth2 = checkHealth;
checkHealth = async function () {
  await origCheckHealth2();
  if (statusText.textContent === 'degraded' && isIdle()) {
    setMote('shiver');
  }
};

// --- Stretch after waking from sleep ---

const origSetMote = setMote;
let wasSleepy = false;

// Can't easily wrap setMote, so track sleepy state via a mutation observer approach
setInterval(() => {
  const isSleepy = moteEl.classList.contains('sleepy');
  if (wasSleepy && !isSleepy && isIdle()) {
    // Just woke up — stretch!
    setTimeout(() => {
      if (isIdle()) setMote('stretch');
    }, 500);
  }
  wasSleepy = isSleepy;
}, 500);

// --- Bonk on repeated errors ---

let errorCount = 0;
let errorResetTimer = null;

const origFetch = window.fetch;
window.fetch = async function (...args) {
  const res = await origFetch.apply(this, args);
  if (typeof args[0] === 'string' && args[0].startsWith('/api/')) {
    const clone = res.clone();
    clone.json().then(data => {
      if (data && data.ok === false) {
        errorCount++;
        clearTimeout(errorResetTimer);
        errorResetTimer = setTimeout(() => { errorCount = 0; }, 5000);
        if (errorCount >= 3) {
          errorCount = 0;
          setMote('bonk');
        }
      }
    }).catch(() => {});
  }
  return res;
};
