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

async function sendAction(action) {
  const spammed = trackButtonPress();
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!spammed) {
      if (data.ok) {
        setMote(data.mote || 'zap');
      } else {
        setMote(data.mote || 'confused', data.error);
      }
    }
  } catch {
    setMote('sad', 'Can\'t reach HTPC...');
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
        // Dance when adjusting volume (not mute)
        setMote(action === 'mute' ? 'zap' : 'dance');
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
}

function deactivateKeyboard() {
  keyboardMode = false;
  btnKeyboard.classList.remove('active');
  keyboardInput.blur();
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

// --- Love (Easter egg: tap Mote 5 times) ---

let moteTaps = 0;
let moteTapTimer = null;

moteEl.addEventListener('click', () => {
  moteTaps++;
  clearTimeout(moteTapTimer);
  moteTapTimer = setTimeout(() => { moteTaps = 0; }, 2000);
  if (moteTaps >= 5) {
    moteTaps = 0;
    setMote('love');
  }
});

// --- Initial mood: wave hello ---
setMote('wave');

// --- Excited on reconnect after disconnect ---

let wasDisconnected = false;

const origCheckHealth = checkHealth;
checkHealth = async function () {
  const prevStatus = statusDot.className;
  await origCheckHealth();
  const nowOk = statusDot.className.includes('ok');
  if (wasDisconnected && nowOk) {
    setMote('excited');
    wasDisconnected = false;
  }
  if (!nowOk) wasDisconnected = true;
};
