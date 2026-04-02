const fs = require('fs');
let ioctl;

// --- uinput ioctl constants (x86_64 Linux) ---

const UI_SET_EVBIT  = 0x40045564;
const UI_SET_KEYBIT = 0x40045565;
const UI_DEV_SETUP  = 0x405c5503;
const UI_DEV_CREATE = 0x5501;
const UI_DEV_DESTROY = 0x5502;

const EV_SYN = 0x00;
const EV_KEY = 0x01;
const SYN_REPORT = 0x00;

const KEY_LEFTSHIFT = 42;
const KEY_LEFTALT   = 56;
const KEY_LEFTCTRL  = 29;
const BUS_USB = 0x03;

// --- Key code maps ---

// Key names -> Linux key codes
const KEY_CODES = {
  BackSpace:  14,
  Return:     28,
  Escape:      1,
  Tab:        15,
  Delete:    111,
  Up:        103,
  Down:      108,
  Left:      105,
  Right:     106,
  Home:      102,
  End:       107,
  Page_Up:   104,
  Page_Down: 109,
  space:      57,
  // Media / browser keys (matches MX3 air mouse codes)
  VolumeUp:   115,
  VolumeDown: 114,
  Mute:       113,
  HomePage:   172,
  F5:          63,
};

// Character -> [keyCode, needsShift] (US QWERTY)
const CHAR_MAP = {
  'a': [30,false], 'b': [48,false], 'c': [46,false], 'd': [32,false],
  'e': [18,false], 'f': [33,false], 'g': [34,false], 'h': [35,false],
  'i': [23,false], 'j': [36,false], 'k': [37,false], 'l': [38,false],
  'm': [50,false], 'n': [49,false], 'o': [24,false], 'p': [25,false],
  'q': [16,false], 'r': [19,false], 's': [31,false], 't': [20,false],
  'u': [22,false], 'v': [47,false], 'w': [17,false], 'x': [45,false],
  'y': [21,false], 'z': [44,false],
  'A': [30,true], 'B': [48,true], 'C': [46,true], 'D': [32,true],
  'E': [18,true], 'F': [33,true], 'G': [34,true], 'H': [35,true],
  'I': [23,true], 'J': [36,true], 'K': [37,true], 'L': [38,true],
  'M': [50,true], 'N': [49,true], 'O': [24,true], 'P': [25,true],
  'Q': [16,true], 'R': [19,true], 'S': [31,true], 'T': [20,true],
  'U': [22,true], 'V': [47,true], 'W': [17,true], 'X': [45,true],
  'Y': [21,true], 'Z': [44,true],
  '1': [2,false], '2': [3,false], '3': [4,false], '4': [5,false],
  '5': [6,false], '6': [7,false], '7': [8,false], '8': [9,false],
  '9': [10,false], '0': [11,false],
  ' ': [57,false],
  '-': [12,false], '=': [13,false], '[': [26,false], ']': [27,false],
  ';': [39,false], "'": [40,false], '`': [41,false], '\\': [43,false],
  ',': [51,false], '.': [52,false], '/': [53,false],
  '!': [2,true], '@': [3,true], '#': [4,true], '$': [5,true],
  '%': [6,true], '^': [7,true], '&': [8,true], '*': [9,true],
  '(': [10,true], ')': [11,true],
  '_': [12,true], '+': [13,true], '{': [26,true], '}': [27,true],
  ':': [39,true], '"': [40,true], '~': [41,true], '|': [43,true],
  '<': [51,true], '>': [52,true], '?': [53,true],
};

// Collect all key codes we need to register
const MODIFIER_CODES = {
  shift: KEY_LEFTSHIFT,
  alt:   KEY_LEFTALT,
  ctrl:  KEY_LEFTCTRL,
};

const ALL_KEY_CODES = new Set([KEY_LEFTSHIFT, KEY_LEFTALT, KEY_LEFTCTRL]);
for (const code of Object.values(KEY_CODES)) ALL_KEY_CODES.add(code);
for (const [code] of Object.values(CHAR_MAP)) ALL_KEY_CODES.add(code);

// --- State ---

let fd = null;

// --- Event writing ---

const eventBuf = Buffer.alloc(24);

function writeEvent(type, code, value) {
  // input_event: tv_sec(8) + tv_usec(8) + type(2) + code(2) + value(4)
  eventBuf.fill(0);
  eventBuf.writeUInt16LE(type, 16);
  eventBuf.writeUInt16LE(code, 18);
  eventBuf.writeInt32LE(value, 20);
  fs.writeSync(fd, eventBuf);
}

function syn() {
  writeEvent(EV_SYN, SYN_REPORT, 0);
}

// --- Public API ---

function init() {
  try {
    ioctl = require('ioctl');
  } catch {
    return false;
  }

  try {
    fd = fs.openSync('/dev/uinput', 'w');
  } catch {
    return false;
  }

  try {
    // Enable key events
    ioctl(fd, UI_SET_EVBIT, EV_KEY);

    // Register all key codes
    for (const code of ALL_KEY_CODES) {
      ioctl(fd, UI_SET_KEYBIT, code);
    }

    // Setup device: uinput_setup struct (92 bytes)
    // struct input_id { bustype(2), vendor(2), product(2), version(2) } = 8 bytes
    // char name[80]
    // uint32 ff_effects_max = 4 bytes
    const setup = Buffer.alloc(92);
    setup.writeUInt16LE(BUS_USB, 0);    // bustype
    setup.writeUInt16LE(0x1234, 2);     // vendor
    setup.writeUInt16LE(0x5678, 4);     // product
    setup.writeUInt16LE(1, 6);          // version
    setup.write('Mote Virtual Keyboard', 8, 'utf8'); // name

    ioctl(fd, UI_DEV_SETUP, setup);
    ioctl(fd, UI_DEV_CREATE);
  } catch (err) {
    try { fs.closeSync(fd); } catch {}
    fd = null;
    throw err;
  }

  return true;
}

function pressKey(keyName) {
  const code = KEY_CODES[keyName];
  if (code === undefined) return false;
  writeEvent(EV_KEY, code, 1);
  syn();
  writeEvent(EV_KEY, code, 0);
  syn();
  return true;
}

// Press a key combo like ['alt', 'Home'] — hold modifiers, tap key, release all
function pressCombo(parts) {
  const mods = [];
  let mainCode = null;

  for (const part of parts) {
    const modCode = MODIFIER_CODES[part.toLowerCase()];
    if (modCode !== undefined) {
      mods.push(modCode);
    } else {
      const code = KEY_CODES[part];
      if (code === undefined) return false;
      mainCode = code;
    }
  }
  if (mainCode === null) return false;

  // Press modifiers
  for (const m of mods) {
    writeEvent(EV_KEY, m, 1);
    syn();
  }
  // Tap main key
  writeEvent(EV_KEY, mainCode, 1);
  syn();
  writeEvent(EV_KEY, mainCode, 0);
  syn();
  // Release modifiers (reverse order)
  for (let i = mods.length - 1; i >= 0; i--) {
    writeEvent(EV_KEY, mods[i], 0);
    syn();
  }
  return true;
}

function typeChar(char) {
  const entry = CHAR_MAP[char];
  if (!entry) return false;
  const [code, shift] = entry;
  if (shift) {
    writeEvent(EV_KEY, KEY_LEFTSHIFT, 1);
    syn();
  }
  writeEvent(EV_KEY, code, 1);
  syn();
  writeEvent(EV_KEY, code, 0);
  syn();
  if (shift) {
    writeEvent(EV_KEY, KEY_LEFTSHIFT, 0);
    syn();
  }
  return true;
}

function destroy() {
  if (fd === null) return;
  try { ioctl(fd, UI_DEV_DESTROY); } catch {}
  try { fs.closeSync(fd); } catch {}
  fd = null;
}

function isReady() {
  return fd !== null;
}

// Cleanup on exit
process.on('exit', destroy);
process.on('SIGINT', () => { destroy(); process.exit(0); });
process.on('SIGTERM', () => { destroy(); process.exit(0); });

module.exports = { init, pressKey, pressCombo, typeChar, destroy, isReady };
