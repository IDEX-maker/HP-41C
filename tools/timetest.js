// node tools/timetest.js <romDir> [TIME-rom] : exercise the Time module through the real ROM
const fs = require('fs'), path = require('path');
const { Nut41 } = require('../nut.js'); const CG = require('../chargen.js');
const dir = process.argv[2], timeRom = process.argv[3] || 'TIME-3B.ROM';
const L = { A: 0x10, B: 0x30, C: 0x70, D: 0x80, E: 0xc0, F: 0x11, G: 0x31, H: 0x71, I: 0x81, J: 0xc1, K: 0x32, L: 0x72, M: 0x82, N: 0x13, O: 0x73, P: 0x83, Q: 0x14, R: 0x34, S: 0x74, T: 0x84, U: 0x15, V: 0x35, W: 0x75, X: 0x85, Y: 0x16, Z: 0x36 };
const K = Object.assign({ XEQ: 0x32, ALPHA: 0xc4, ENTER: 0x13, ON: 0x18, '0': 0x37, '1': 0x36, '2': 0x76, '3': 0x86, '4': 0x35, '5': 0x75, '6': 0x85, '7': 0x34, '8': 0x74, '9': 0x84, '.': 0x77, SHIFT: 0x12, RS: 0x87, BS: 0xc3 }, {});
const alpha = { ...L };   // letters only meaningful in ALPHA mode
const load = (cpu, page, bank, f) => cpu.loadPage(page, bank, Nut41.parseRom(fs.readFileSync(path.join(dir, f))));
const cpu = new Nut41(); cpu.setRamConfig('cx');
load(cpu, 0, 0, 'NUT0-N.ROM'); load(cpu, 1, 0, 'NUT1-F.ROM'); load(cpu, 2, 0, 'NUT2-L.ROM'); load(cpu, 3, 0, 'XFNS3-3B.ROM');
load(cpu, 5, 0, timeRom); load(cpu, 5, 1, 'XFNS5-2D.ROM');
const runT = (n) => { let left = n; while (left > 0 && cpu.awake) { const c = Math.min(left, 67); cpu.run(c); left -= c; cpu.tickTimer(1); } };
const text = () => cpu.getDisplay().map((x) => (x ? CG.text[x.ch] + ['', '.', ':', ','][x.punct] : ' ')).join('');
const tap = (code) => { cpu.pressKey(code); runT(1500); cpu.releaseKey(); runT(30000); };
cpu.reset(); runT(300000);
console.log('boot:', text());
const seq = (str) => { for (const t of str.split(/\s+/)) tap(K[t] !== undefined && !(t.length === 1 && alpha[t]) ? K[t] : alpha[t]); };
const xeq = (name) => seq('XEQ ALPHA ' + name.split('').join(' ') + ' ALPHA');
xeq('TIME'); console.log('TIME  :', text());
runT(6700 * 3); // 3 seconds of emulated real time
xeq('TIME'); console.log('TIME+3s:', text());
xeq('DATE'); console.log('DATE  :', text());
console.log('status', cpu.ph.status.toString(2), 'clockA', cpu.timerState().a);
