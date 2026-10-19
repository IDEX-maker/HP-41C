// Shared helpers for headless experiments: build a booted 41CX and drive it with key names.
const fs = require('fs'), path = require('path');
const { Nut41 } = require('../nut.js'); const CG = require('../chargen.js');
const ROM_DIR = process.env.ROM_DIR || path.join(__dirname, '..', 'roms');
const L = { A: 0x10, B: 0x30, C: 0x70, D: 0x80, E: 0xc0, F: 0x11, G: 0x31, H: 0x71, I: 0x81, J: 0xc1, K: 0x32, L: 0x72, M: 0x82, N: 0x13, O: 0x73, P: 0x83, Q: 0x14, R: 0x34, S: 0x74, T: 0x84, U: 0x15, V: 0x35, W: 0x75, X: 0x85, Y: 0x16, Z: 0x36 };
const KEYS = { SIGMA: 0x10, INV: 0x30, SQRT: 0x70, LOG: 0x80, LN: 0xc0, XY: 0x11, RDN: 0x31, SIN: 0x71, COS: 0x81, TAN: 0xc1,
  SHIFT: 0x12, XEQ: 0x32, STO: 0x72, RCL: 0x82, SST: 0xc2, ENTER: 0x13, CHS: 0x73, EEX: 0x83, BS: 0xc3,
  '-': 0x14, '7': 0x34, '8': 0x74, '9': 0x84, '+': 0x15, '4': 0x35, '5': 0x75, '6': 0x85, '*': 0x16, '1': 0x36, '2': 0x76, '3': 0x86,
  '/': 0x17, '0': 0x37, '.': 0x77, RS: 0x87, ON: 0x18, USER: 0xc6, PRGM: 0xc5, ALPHA: 0xc4 };

function boot(opts = {}) {
  const cpu = new Nut41(); cpu.setRamConfig(opts.ram || 'cx');
  const load = (page, bank, f) => cpu.loadPage(page, bank, Nut41.parseRom(fs.readFileSync(path.join(ROM_DIR, f))));
  load(0, 0, 'NUT0-N.ROM'); load(1, 0, 'NUT1-F.ROM'); load(2, 0, 'NUT2-L.ROM'); load(3, 0, 'XFNS3-3B.ROM');
  load(5, 0, 'TIME-3B.ROM'); load(5, 1, 'XFNS5-2D.ROM');
  cpu.reset(); runT(cpu, 300000);
  return cpu;
}
function runT(cpu, n) { let left = n; while (left > 0 && cpu.awake) { const c = Math.min(left, 67); cpu.run(c); left -= c; cpu.tickTimer(1); } }
function text(cpu) { return cpu.getDisplay().map((x) => (x ? CG.text[x.ch] + ['', '.', ':', ','][x.punct] : ' ')).join(''); }
function tap(cpu, code) { cpu.pressKey(code); runT(cpu, 1500); cpu.releaseKey(); runT(cpu, 30000); }
// tokens: key names, or letters (sent as alpha keys)
function keys(cpu, seq) { for (const t of seq.trim().split(/\s+/)) tap(cpu, KEYS[t] !== undefined ? KEYS[t] : L[t]); }
function regs(cpu) { const o = {}; for (let a = 0; a < 1024; a++) { if (!cpu.ramExists[a]) continue; let h = ''; for (let i = 13; i >= 0; i--) h += cpu.ram[a * 14 + i].toString(16); o[a] = h; } return o; }
function diff(a, b) { const out = []; for (const k of Object.keys(b)) if (a[k] !== b[k]) out.push(`${(+k).toString(16).padStart(3, '0')}: ${a[k]} -> ${b[k]}`); return out; }
module.exports = { boot, runT, text, tap, keys, regs, diff, KEYS, L };

// ---- program memory access (41C/CV/CX main memory) ----
// d[5:3] = lowest data register address, d[2:0] = register holding .END.; program bytes run from
// register (d[5:3]-1) downward, b6 first ... b0 last in each 7-byte register.
function regBytes(cpu, a) { const o = []; for (let i = 6; i >= 0; i--) o.push(cpu.ram[a * 14 + 2 * i + 1] << 4 | cpu.ram[a * 14 + 2 * i]); return o; }
function progStream(cpu) {
  const d = (n) => cpu.ram[0xd * 14 + n];
  const dataLow = d(5) << 8 | d(4) << 4 | d(3), endReg = d(2) << 8 | d(1) << 4 | d(0);
  const out = [];
  for (let a = dataLow - 1; a >= endReg; a--) out.push(...regBytes(cpu, a));
  return { bytes: out, startReg: dataLow - 1, endReg };
}
const hex2 = (b) => b.map((x) => x.toString(16).padStart(2, '0')).join(' ');
module.exports.regBytes = regBytes; module.exports.progStream = progStream; module.exports.hex2 = hex2;

// Titles scrolled past by CATALOG 2 (sampled while it runs), e.g. ['-TIME 3B', '-MATH 1D', ...]
function catalog2(cpu) {
  keys(cpu, 'SHIFT ENTER');
  const seen = []; cpu.pressKey(0x76);
  runT(cpu, 1500); cpu.releaseKey();
  for (let g = 0; g < 4000 && cpu.awake; g++) { runT(cpu, 300); const t = text(cpu).trim(); if (t && seen[seen.length - 1] !== t) seen.push(t); }
  return seen;
}
module.exports.catalog2 = catalog2;

// Run a function by name and return the distinct display strings seen while it executes (for scrolling output).
function xeqSample(cpu, name, maxCycles = 60000) {
  keys(cpu, 'XEQ ALPHA ' + name.split('').join(' '));
  const seen = []; cpu.pressKey(0xc4); runT(cpu, 1500); cpu.releaseKey();
  for (let n = 0; n < maxCycles && cpu.awake; n += 300) { runT(cpu, 300); const t = text(cpu).trim(); if (t && seen[seen.length - 1] !== t) seen.push(t); }
  return seen;
}
module.exports.xeqSample = xeqSample;
