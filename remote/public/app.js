// --- Mote Remote Client ---

const moteEl = document.getElementById('mote');
const speechEl = document.getElementById('mote-speech');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const textInput = document.getElementById('text-input');
const btnSend = document.getElementById('btn-send');
const btnSendEnter = document.getElementById('btn-send-enter');

const PHRASES = {
  happy:       ['Mote is ready!', 'At your service!', 'Let\'s go!'],
  zap:         ['Zap!', 'Pow!', 'Sent!', 'Boop!', 'Click!'],
  typing:      ['Typing away...', 'Clackity clack!', 'Sent the words!'],
  sad:         ['Oops...', 'Something went wrong...', 'Mote is confused...'],
  confused:    ['Huh?', 'That\'s not right...', 'Try again?'],
  overwhelmed: ['Too much text!', 'Whoa there!'],
  idle:        ['Hi! I\'m Mote!', 'Waiting for you!', 'Press something!'],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let moteTimeout = null;

function setMote(mood, phrase) {
  // Clear previous mood
  moteEl.className = 'mote';
  // Force reflow for re-triggering animation
  void moteEl.offsetWidth;
  moteEl.classList.add(mood);

  speechEl.textContent = phrase || pick(PHRASES[mood] || PHRASES.idle);

  clearTimeout(moteTimeout);
  moteTimeout = setTimeout(() => {
    moteEl.className = 'mote';
    speechEl.textContent = pick(PHRASES.idle);
  }, 2000);
}

// --- API calls ---

async function sendAction(action) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.ok) {
      setMote(data.mote || 'zap');
    } else {
      setMote(data.mote || 'confused', data.error);
    }
  } catch {
    setMote('sad', 'Can\'t reach HTPC...');
  }
}

async function sendVolume(action) {
  try {
    const res = await fetch('/api/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.ok) {
      setMote(data.mote || 'zap');
    } else {
      setMote(data.mote || 'confused', data.error);
    }
  } catch {
    setMote('sad', 'Can\'t reach HTPC...');
  }
}

async function sendText(andEnter) {
  const text = textInput.value;
  if (!text) {
    setMote('confused', 'Type something first!');
    return;
  }

  const endpoint = andEnter ? '/api/text-enter' : '/api/text';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.ok) {
      setMote('typing');
      textInput.value = '';
    } else {
      setMote(data.mote || 'sad', data.error);
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

btnSend.addEventListener('click', () => sendText(false));
btnSendEnter.addEventListener('click', () => sendText(true));

// --- Keyboard shortcuts (when not typing in text field) ---

document.addEventListener('keydown', (e) => {
  // Don't hijack typing in the text input
  if (document.activeElement === textInput) {
    // Let Enter in the text field do "Send + Enter"
    if (e.key === 'Enter') {
      e.preventDefault();
      sendText(true);
    }
    return;
  }

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

// --- Initial mood ---
setMote('happy', 'Hi! I\'m Mote!');
