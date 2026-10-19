// node tools/keys.js <romDir> "5 ENTER 3 +" ...   (each arg = fresh sequence on a booted calculator)
const fs = require('fs'), path = require('path');
const { Nut41 } = require('../nut.js'); const CG = require('../chargen.js');
const K = { SIGMA: 0x10, INV: 0x30, SQRT: 0x70, LOG: 0x80, LN: 0xc0, XY: 0x11, RDN: 0x31, SIN: 0x71, COS: 0x81, TAN: 0xc1,
  SHIFT: 0x12, XEQ: 0x32, STO: 0x72, RCL: 0x82, SST: 0xc2, ENTER: 0x13, CHS: 0x73, EEX: 0x83, BS: 0xc3,
  '-': 0x14, 7: 0x34, 8: 0x74, 9: 0x84, '+': 0x15, 4: 0x35, 5: 0x75, 6: 0x85, '*': 0x16, 1: 0x36, 2: 0x76, 3: 0x86,
  '/': 0x17, 0: 0x37, '.': 0x77, RS: 0x87, ON: 0x18, USER: 0xc6, PRGM: 0xc5, ALPHA: 0xc4 };
const dir = process.argv[2];
function boot() {
  const load = (cpu, page, bank, f) => cpu.loadPage(page, bank, Nut41.parseRom(fs.readFileSync(path.join(dir, f))));
  const cpu = new Nut41(); cpu.setRamConfig('cx');
  load(cpu, 0, 0, 'NUT0-N.ROM'); load(cpu, 1, 0, 'NUT1-F.ROM'); load(cpu, 2, 0, 'NUT2-L.ROM'); load(cpu, 3, 0, 'XFNS3-3B.ROM');
  cpu.reset(); cpu.run(300000); return cpu;
}
const show = (cpu) => cpu.getDisplay().map((x) => (x ? CG.text[x.ch] + ['', '.', ':', ','][x.punct] : ' ')).join('') + '  ann=' + cpu.getAnnunciators().toString(2);
for (const seq of process.argv.slice(3)) {
  const cpu = boot();
  for (const k of seq.split(/\s+/)) {
    cpu.pressKey(K[k]); cpu.run(1500); cpu.releaseKey(); cpu.run(30000);
  }
  console.log(seq.padEnd(22), '=>', show(cpu));
}
