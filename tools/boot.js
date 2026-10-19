// Headless boot test: node tools/boot.js <romDir>
const fs = require('fs'), path = require('path');
const { Nut41 } = require('../nut.js');
const CG = require('../chargen.js');
const dir = process.argv[2];
const load = (cpu, page, bank, f) => cpu.loadPage(page, bank, Nut41.parseRom(fs.readFileSync(path.join(dir, f))));
const cpu = new Nut41();
cpu.setRamConfig('cx');
load(cpu, 0, 0, 'NUT0-N.ROM'); load(cpu, 1, 0, 'NUT1-F.ROM'); load(cpu, 2, 0, 'NUT2-L.ROM'); load(cpu, 3, 0, 'XFNS3-3B.ROM');
const show = () => {
  const d = cpu.getDisplay();
  const s = d.map((x) => (x ? CG.text[x.ch] + ['', '.', ':', ','][x.punct] : ' ')).join('|');
  return `[${s}] ann=${cpu.getAnnunciators().toString(2)} awake=${cpu.awake}`;
};
cpu.reset();
let n = cpu.run(300000);
console.log('after boot', n, show());
console.log(cpu.dump());
// press ON (0x18) if asleep
const tap = (code, cyc = 4000) => { cpu.pressKey(code); cpu.run(cyc); cpu.releaseKey(); return cpu.run(cyc); };
if (!cpu.awake && !cpu.getAnnunciators() && cpu.getDisplay().every((x)=>!x)) { tap(0x18, 20000); console.log('after ON', show()); }
// type 1 2 ENTER 3 + : keys: 1=0x36 2=0x76 ENTER=0x13 3=0x86 +=0x15
for (const [name, code] of [['1',0x36],['2',0x76],['ENTER',0x13],['3',0x86],['+',0x15]]) {
  tap(code, 30000); console.log(name.padEnd(5), show());
}
