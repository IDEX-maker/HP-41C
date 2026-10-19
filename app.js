'use strict';
(function () {
const { Nut41 } = window.Nut;
const CG = window.CHARGEN;

const REAL_CPS = 375200 / 56;          // Nut cycles per second on real hardware
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- storage
const mem = {};
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }

const DB_NAME = 'hp41-emulator';
let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('roms', { keyPath: 'name' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  return dbp;
}
async function dbAll() {
  const db = await openDb(); if (!db) return [];
  return new Promise((res) => { const r = db.transaction('roms').objectStore('roms').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
}
async function dbPut(rec) {
  const db = await openDb(); if (!db) return;
  return new Promise((res) => { const t = db.transaction('roms', 'readwrite'); t.objectStore('roms').put(rec); t.oncomplete = res; t.onerror = res; });
}
async function dbDel(name) {
  const db = await openDb(); if (!db) return;
  return new Promise((res) => { const t = db.transaction('roms', 'readwrite'); t.objectStore('roms').delete(name); t.oncomplete = res; t.onerror = res; });
}
async function dbClear() {
  const db = await openDb(); if (!db) return;
  return new Promise((res) => { const t = db.transaction('roms', 'readwrite'); t.objectStore('roms').clear(); t.oncomplete = res; t.onerror = res; });
}

// ---------------------------------------------------------------- machine
const cpu = new Nut41();
let roms = [];                 // {name, bytes:Uint8Array, page, bank(1..4)}
let ramCfg = lsGet('hp41.ram') || 'cx';
let speed = parseInt(lsGet('hp41.speed') || '20', 10);
let ramDirty = false;

function guessPage(name) {
  const n = name.toUpperCase().replace(/\.[A-Z0-9]+$/, '');
  if (/^NUT0/.test(n)) return 0;
  if (/^NUT1/.test(n)) return 1;
  if (/^NUT2/.test(n)) return 2;
  if (/^XFNS3/.test(n)) return 3;
  return null;
}

function nextFreePage(excludeName) {
  for (let p = 5; p < 16; p++)
    if (!roms.some((r) => r.name !== excludeName && r.page === p && r.bank === 1)) return p;
  return 5;
}

function hasOs() { return [0, 1, 2].every((p) => roms.some((r) => r.page === p && r.bank === 1)); }

function applyRoms() {
  cpu.clearPages();
  for (const r of roms) cpu.loadPage(r.page, r.bank - 1, Nut41.parseRom(r.bytes));
  $('lcdmsg').classList.toggle('show', !hasOs());
}

function saveRam() {
  if (!ramDirty) return;
  lsSet('hp41.mem.' + ramCfg, cpu.saveRam());
  lsSet('hp41.on', cpu.snap.enable ? '1' : '0');
  ramDirty = false;
}

function powerUp(clearRam) {
  cpu.setRamConfig(ramCfg);
  if (clearRam) { cpu.clearMemory(); lsSet('hp41.mem.' + ramCfg, ''); }
  else { const t = lsGet('hp41.mem.' + ramCfg); if (t) cpu.loadRam(t); }
  cpu.reset();
  keyQueue.length = 0; activeKey = null;
  updateStatus();
}

cpu.onSleep = () => { ramDirty = true; saveRam(); };
setInterval(() => { if (cpu.awake) ramDirty = true; saveRam(); }, 4000);
window.addEventListener('pagehide', saveRam);
document.addEventListener('visibilitychange', () => { if (document.hidden) { ramDirty = true; saveRam(); } });

// ---------------------------------------------------------------- display
const SEG_LINES = [
  [10, 10, 56, 10], [62, 14, 62, 52], [62, 62, 62, 100], [10, 104, 56, 104],
  [4, 62, 4, 100], [4, 14, 4, 52], [9, 57, 30, 57], [36, 57, 57, 57],
  [33, 15, 33, 52], [33, 62, 33, 99], [57, 15, 39, 50], [9, 15, 27, 50],
  [57, 99, 39, 64], [9, 99, 27, 64],
];
const NS = 'http://www.w3.org/2000/svg';
const cells = [];
(function buildDisplay() {
  const svg = $('lcdsvg');
  for (let d = 0; d < 12; d++) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${d * 78 + 4},4)`);
    const segs = SEG_LINES.map(([x1, y1, x2, y2]) => {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('class', 'seg');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      g.appendChild(l); return l;
    });
    const mk = (cx, cy) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'dot'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 5); g.appendChild(c); return c; };
    const dotLow = mk(71, 104), dotHigh = mk(71, 60);
    const tail = document.createElementNS(NS, 'line');
    tail.setAttribute('class', 'seg'); tail.setAttribute('style', 'stroke-width:4');
    tail.setAttribute('x1', 71); tail.setAttribute('y1', 108); tail.setAttribute('x2', 66); tail.setAttribute('y2', 116);
    g.appendChild(tail);
    svg.appendChild(g);
    cells.push({ segs, dotLow, dotHigh, tail, sig: -1 });
  }
})();

const ANN = [['BAT', 0], ['USER', 1], ['G', 2, 'RAD', 3], ['SHIFT', 4], ['0', 5], ['1', 6], ['2', 7], ['3', 8], ['4', 9], ['PRGM', 10], ['ALPHA', 11]];
const annEls = {};
(function buildAnn() {
  const box = $('ann');
  for (const a of ANN) {
    const wrap = document.createElement('span'); wrap.className = 'grp';
    for (let i = 0; i < a.length; i += 2) {
      const s = document.createElement('span'); s.textContent = a[i]; wrap.appendChild(s); annEls[11 - a[i + 1]] = s;   // bit n of the word = n-th digit from the right
    }
    box.appendChild(wrap);
  }
})();

let lastAnn = -1;
function renderDisplay() {
  const disp = cpu.getDisplay();
  for (let i = 0; i < 12; i++) {
    const cell = cells[i], d = disp[i];
    const sig = d ? (d.ch << 2 | d.punct) + 1 : 0;
    if (sig === cell.sig) continue;
    cell.sig = sig;
    const mask = d ? CG.seg[d.ch] : 0;
    for (let k = 0; k < 14; k++) cell.segs[k].classList.toggle('on', (mask >> k & 1) === 1);
    const p = d ? d.punct : 0;
    cell.dotLow.classList.toggle('on', p === 1 || p === 3 || p === 2);
    cell.dotHigh.classList.toggle('on', p === 2);
    cell.tail.classList.toggle('on', p === 3);
    cell.tail.style.opacity = p === 3 ? 1 : 0;
  }
  const ann = cpu.getAnnunciators();
  if (ann !== lastAnn) {
    lastAnn = ann;
    for (const k in annEls) annEls[k].classList.toggle('on', (ann >> k & 1) === 1);
  }
}

// ---------------------------------------------------------------- keys
const ROWS = [
  { cls: 'row5', keys: [
    { c: 0x18, f: 'ON', sw: 1 }, { c: 0xc6, f: 'USER', sw: 1 }, null, { c: 0xc5, f: 'PRGM', sw: 1 }, { c: 0xc4, f: 'ALPHA', sw: 1 }] },
  { cls: 'row5', keys: [
    { c: 0x10, f: 'Σ+', g: 'Σ−', a: 'A' }, { c: 0x30, f: '1/x', g: 'yˣ', a: 'B' }, { c: 0x70, f: '√x', g: 'x²', a: 'C' },
    { c: 0x80, f: 'LOG', g: '10ˣ', a: 'D' }, { c: 0xc0, f: 'LN', g: 'eˣ', a: 'E' }] },
  { cls: 'row5', keys: [
    { c: 0x11, f: 'x≷y', g: 'CLE', a: 'F' }, { c: 0x31, f: 'R↓', g: '%', a: 'G' }, { c: 0x71, f: 'SIN', g: 'SIN⁻¹', a: 'H' },
    { c: 0x81, f: 'COS', g: 'COS⁻¹', a: 'I' }, { c: 0xc1, f: 'TAN', g: 'TAN⁻¹', a: 'J' }] },
  { cls: 'row5', keys: [
    { c: 0x12, f: '', shift: 1 }, { c: 0x32, f: 'XEQ', g: 'ASN', a: 'K' }, { c: 0x72, f: 'STO', g: 'LBL', a: 'L' },
    { c: 0x82, f: 'RCL', g: 'GTO', a: 'M' }, { c: 0xc2, f: 'SST', g: 'BST', a: 'N' }] },
  { cls: 'row5', keys: [
    { c: 0x13, f: 'ENTER↑', g: 'CATALOG', span: 2, wide: 1 }, { c: 0x73, f: 'CHS', g: 'ISG', a: 'O' },
    { c: 0x83, f: 'EEX', g: 'RTN', a: 'P' }, { c: 0xc3, f: '←', g: 'CLX/A' }] },
  { cls: 'row4', keys: [
    { c: 0x14, f: '−', g: 'x=y?', a: 'Q', num: 1 }, { c: 0x34, f: '7', g: 'SF', a: 'R', num: 1 }, { c: 0x74, f: '8', g: 'CF', a: 'S', num: 1 }, { c: 0x84, f: '9', g: 'FS?', a: 'T', num: 1 }] },
  { cls: 'row4', keys: [
    { c: 0x15, f: '+', g: 'x≤y?', a: 'U', num: 1 }, { c: 0x35, f: '4', g: 'BEEP', a: 'V', num: 1 }, { c: 0x75, f: '5', g: 'P→R', a: 'W', num: 1 }, { c: 0x85, f: '6', g: 'R→P', a: 'X', num: 1 }] },
  { cls: 'row4', keys: [
    { c: 0x16, f: '×', g: 'x>y?', a: 'Y', num: 1 }, { c: 0x36, f: '1', g: 'FIX', a: 'Z', num: 1 }, { c: 0x76, f: '2', g: 'SCI', a: '=', num: 1 }, { c: 0x86, f: '3', g: 'ENG', a: '?', num: 1 }] },
  { cls: 'row4', keys: [
    { c: 0x17, f: '÷', g: 'x=0?', a: ':', num: 1 }, { c: 0x37, f: '0', g: 'π', a: '␣', num: 1 }, { c: 0x77, f: '.', g: 'LASTx', a: ',', num: 1 }, { c: 0x87, f: 'R/S', g: 'VIEW' }] },
];

const keyEls = {};
(function buildPad() {
  const pad = $('pad');
  for (const row of ROWS) {
    const grid = document.createElement('div');
    grid.className = 'pad ' + row.cls;
    for (const k of row.keys) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (k && k.span === 2 ? ' span2' : '');
      if (!k) { cell.classList.add('spacer'); grid.appendChild(cell); continue; }
      const gold = document.createElement('div'); gold.className = 'gold'; gold.textContent = k.g || '';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key' + (k.shift ? ' shift' : '') + (k.sw ? ' sw' : '') + (k.num ? ' num' : '') + (k.wide ? ' wide' : '');
      b.textContent = k.f;
      b.setAttribute('aria-label', k.f || 'shift');
      if (k.a) { const s = document.createElement('span'); s.className = 'alpha'; s.textContent = k.a; b.appendChild(s); }
      if (!k.sw) cell.appendChild(gold);
      cell.appendChild(b);
      grid.appendChild(cell);
      keyEls[k.c] = b;
      bindKey(b, k.c);
    }
    pad.appendChild(grid);
  }
})();

// Key presses are replayed in emulated time so that a quick tap at 100x speed
// still looks like a quick tap to the calculator (long holds cancel with NULL).
const keyQueue = [];
let activeKey = null;
const MIN_HOLD = 500, GAP_CYCLES = 1500;

function bindKey(el, code) {
  let item = null;
  const down = (e) => {
    e.preventDefault();
    if (item) return;
    if (el.setPointerCapture && e.pointerId !== undefined) try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    item = { code, downMs: performance.now(), upMs: null, started: false };
    keyQueue.push(item);
    el.classList.add('down');
    ensureAudio();
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) { /* ignore */ }
    kick();
  };
  const up = (e) => {
    if (!item) return;
    item.upMs = performance.now(); item = null;
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function tapKey(code, holdMs) {
  const t = performance.now();
  keyQueue.push({ code, downMs: t, upMs: t + (holdMs || 90), started: false });
  kick();
}

// Physical keyboard
const ALPHA_KEYS = {};
for (const row of ROWS) for (const k of row.keys) if (k && k.a) ALPHA_KEYS[k.a] = k.c;
ALPHA_KEYS[' '] = 0x37;
const NORMAL_KEYS = {
  '0': 0x37, '1': 0x36, '2': 0x76, '3': 0x86, '4': 0x35, '5': 0x75, '6': 0x85, '7': 0x34, '8': 0x74, '9': 0x84,
  '.': 0x77, ',': 0x77, '+': 0x15, '-': 0x14, '*': 0x16, '/': 0x17, 'Enter': 0x13, 'Backspace': 0xc3, 'Delete': 0xc3,
  ' ': 0x87, 'f': 0x12, 'F': 0x12, 'Shift': 0x12, 'x': 0x32, 's': 0x72, 'r': 0x82, 'e': 0x83, 'c': 0x73, 'Escape': 0x18,
  'u': 0xc6, 'p': 0xc5, 'a': 0xc4, 'n': 0x71, 'q': 0x70, 'i': 0x30, 'l': 0x80, 'g': 0xc2, 'd': 0x31, 'y': 0x11,
};
const physDown = new Map();
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'SELECT' || tag === 'INPUT') return;
  const alphaOn = (cpu.getAnnunciators() & 1) === 1;   // ALPHA annunciator
  let code;
  if (alphaOn && e.key.length === 1 && /[A-Za-z:=?,]/.test(e.key)) code = ALPHA_KEYS[e.key.toUpperCase()];
  if (code === undefined) code = alphaOn && ALPHA_KEYS[e.key] !== undefined && e.key === ' ' ? 0x37 : NORMAL_KEYS[e.key];
  if (code === undefined || e.repeat) { if (code !== undefined) e.preventDefault(); return; }
  e.preventDefault();
  ensureAudio();
  const item = { code, downMs: performance.now(), upMs: null, started: false };
  physDown.set(e.code, item);
  keyQueue.push(item);
  const el = keyEls[code]; if (el) el.classList.add('down');
  kick();
});
window.addEventListener('keyup', (e) => {
  const item = physDown.get(e.code);
  if (!item) return;
  item.upMs = performance.now(); physDown.delete(e.code);
  const el = keyEls[item.code]; if (el) el.classList.remove('down');
});

// ---------------------------------------------------------------- sound
let audio = null, tone = null;
function ensureAudio() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
}
let lastFoCycle = 0;
cpu.onFo = (cycle, v) => {
  if (!audio) { lastFoCycle = cycle; return; }
  const pw = cycle - lastFoCycle;
  lastFoCycle = cycle;
  if (pw < 2 || pw > 24) { if (tone) endTone(); return; }
  const f = 375200 / (112 * pw);
  if (!tone) {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'square'; gain.gain.value = 0.06;
    osc.connect(gain).connect(audio.destination);
    const t0 = Math.max(audio.currentTime, toneBusyUntil);
    osc.frequency.setValueAtTime(f, t0);
    osc.start(t0);
    tone = { osc, t0, c0: cycle, last: cycle };
  } else {
    tone.osc.frequency.setValueAtTime(f, tone.t0 + (cycle - tone.c0) / REAL_CPS);
  }
  tone.last = cycle;
};
let toneBusyUntil = 0;
function endTone() {
  if (!tone) return;
  const end = tone.t0 + (tone.last - tone.c0) / REAL_CPS + 0.02;
  try { tone.osc.stop(end); } catch (e) { /* ignore */ }
  toneBusyUntil = end;
  tone = null;
}

// ---------------------------------------------------------------- run loop
let lastT = 0, running = false;
function kick() { if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(frame); } }

function advance(budget) {
  while (budget > 0) {
    if (!activeKey) {
      if (keyQueue.length && keyQueue[0].started === false) {
        activeKey = keyQueue.shift();
        activeKey.started = true;
        activeKey.startCycle = cpu.cycles;
        activeKey.phase = 'down';
        cpu.pressKey(activeKey.code);
        if (!cpu.awake) { cpu.releaseKey(); activeKey = null; }   // ignored (deep sleep)
        continue;
      }
      budget -= cpu.run(budget);
      break;
    }
    const k = activeKey;
    if (k.phase === 'down') {
      const now = performance.now();
      let limit;
      if (k.upMs !== null) limit = k.startCycle + Math.max(MIN_HOLD, (k.upMs - k.downMs) * REAL_CPS / 1000);
      else limit = k.startCycle + Math.max(MIN_HOLD, (now - k.downMs) * REAL_CPS / 1000);
      const room = limit - cpu.cycles;
      if (room > 0) {
        const n = cpu.run(Math.min(budget, Math.ceil(room)));
        budget -= n;
        if (n === 0) { if (k.upMs !== null || !cpu.awake) { cpu.releaseKey(); k.phase = 'gap'; k.gapEnd = cpu.cycles + GAP_CYCLES; } else break; }
        continue;
      }
      if (k.upMs !== null || !cpu.awake) { cpu.releaseKey(); k.phase = 'gap'; k.gapEnd = cpu.cycles + GAP_CYCLES; continue; }
      // key still physically down and hold time exhausted: let emulated time wait for real time
      budget -= cpu.run(Math.min(budget, 200));
      break;
    } else {
      const room = k.gapEnd - cpu.cycles;
      if (room <= 0 || !cpu.awake) { activeKey = null; continue; }
      budget -= cpu.run(Math.min(budget, room));
    }
  }
}

function frame(t) {
  const dt = Math.min(100, t - lastT); lastT = t;
  if (hasOs()) advance(Math.round(speed * REAL_CPS * dt / 1000));
  if (tone && cpu.cycles - tone.last > 30) endTone();
  renderDisplay();
  if (cpu.awake || activeKey || keyQueue.length || tone) requestAnimationFrame(frame);
  else { running = false; }
}

// ---------------------------------------------------------------- ROM management UI
function renderRomTable() {
  const tb = document.querySelector('#romtable tbody');
  tb.textContent = '';
  roms.sort((a, b) => a.page - b.page || a.bank - b.bank);
  for (const r of roms) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td'); tdName.textContent = r.name; tr.appendChild(tdName);
    const mkSel = (opts, val, onchange) => {
      const td = document.createElement('td'); const s = document.createElement('select');
      for (const [v, label] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = label; s.appendChild(o); }
      s.value = val; s.addEventListener('change', () => onchange(parseInt(s.value, 10))); td.appendChild(s); tr.appendChild(td);
    };
    mkSel(Array.from({ length: 16 }, (_, i) => [i, i.toString(16).toUpperCase()]), r.page, async (v) => { r.page = v; await persistRom(r); restart(); });
    mkSel([[1, '1'], [2, '2'], [3, '3'], [4, '4']], r.bank, async (v) => { r.bank = v; await persistRom(r); restart(); });
    const tdDel = document.createElement('td'); const del = document.createElement('button'); del.className = 'btn'; del.textContent = '✕'; del.title = 'Remove';
    del.addEventListener('click', async () => { roms = roms.filter((x) => x !== r); await dbDel(r.name); restart(); });
    tdDel.appendChild(del); tr.appendChild(tdDel);
    tb.appendChild(tr);
  }
}

function persistRom(r) { return dbPut({ name: r.name, bytes: r.bytes, page: r.page, bank: r.bank }); }

function restart() {
  applyRoms(); renderRomTable();
  if (hasOs()) { powerUp(false); kick(); } else { cpu.reset(); renderDisplay(); }
  updateStatus();
}

async function addFiles(files) {
  const msgs = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes.length !== 8192) { msgs.push(`${f.name}: skipped (${bytes.length} bytes, expected 8192)`); continue; }
    const name = f.name;
    const existing = roms.find((r) => r.name === name);
    let page = existing ? existing.page : guessPage(name);
    if (page === null) page = nextFreePage(name);
    // a newer OS page replaces the previous one on the same page/bank
    roms = roms.filter((r) => r.name !== name && !(guessPage(name) !== null && r.page === page && r.bank === 1));
    const rec = { name, bytes, page, bank: 1 };
    roms.push(rec);
    await persistRom(rec);
  }
  restart();
  if (msgs.length) $('status').textContent = msgs.join('\n');
}

function updateStatus() {
  const lines = [];
  if (!hasOs()) lines.push('Waiting for OS ROMs (pages 0, 1 and 2).');
  else lines.push(`Running · ${roms.length} ROM page${roms.length === 1 ? '' : 's'} loaded`);
  $('status').textContent = lines.join('\n');
  $('model').textContent = { c: '41C', cv: '41CV', cx: '41CX' }[ramCfg];
}

const BUNDLED = ['NUT0-N.ROM', 'NUT1-F.ROM', 'NUT2-L.ROM', 'XFNS3-3B.ROM'];
$('bundled').addEventListener('click', async () => {
  try {
    const files = [];
    for (const n of BUNDLED) {
      const r = await fetch('roms/' + n);
      if (!r.ok) throw new Error(n + ': HTTP ' + r.status);
      files.push(new File([await r.arrayBuffer()], n));
    }
    await addFiles(files);
    $('romPanel').open = false;
  } catch (e) { $('status').textContent = 'Could not load built-in ROMs: ' + e.message; }
});
$('romfile').addEventListener('change', (e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; });
$('forget').addEventListener('click', async () => { if (!confirm('Remove all stored ROMs from this browser?')) return; roms = []; await dbClear(); restart(); });
$('reset').addEventListener('click', () => { restart(); });
$('wipe').addEventListener('click', () => { if (!confirm('Clear all calculator memory (programs, registers)?')) return; if (hasOs()) { powerUp(true); kick(); } });
$('ramcfg').addEventListener('change', (e) => { ramCfg = e.target.value; lsSet('hp41.ram', ramCfg); if (hasOs()) { powerUp(false); kick(); } updateStatus(); });
$('speed').addEventListener('change', (e) => { speed = parseInt(e.target.value, 10); lsSet('hp41.speed', String(speed)); });

// drag & drop
const main = $('main');
['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); main.classList.add('drop'); }));
['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); main.classList.remove('drop'); }));
window.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files)); });

// ---------------------------------------------------------------- start
(async function init() {
  $('ramcfg').value = ramCfg; $('speed').value = String(speed);
  if (!Array.from($('speed').options).some((o) => o.value === String(speed))) { speed = 20; $('speed').value = '20'; }
  const stored = await dbAll();
  roms = stored.map((r) => ({ name: r.name, bytes: r.bytes, page: r.page, bank: r.bank }));
  applyRoms(); renderRomTable();
  if (hasOs()) {
    const wasOn = lsGet('hp41.on') === '1' && !!lsGet('hp41.mem.' + ramCfg);
    powerUp(false); $('romPanel').open = false; kick();
    if (wasOn) { cpu.run(60000); tapKey(0x18, 90); }   // come back as it was left
  } else { cpu.setRamConfig(ramCfg); cpu.reset(); }
  updateStatus(); renderDisplay();
  window.hp41 = { cpu, tapKey };       // handy for debugging in the console
})();
})();
