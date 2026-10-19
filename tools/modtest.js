// node tools/modtest.js : plug extra application ROMs into a port page and exercise them on the real firmware
const fs = require('fs'), path = require('path');
const { Nut41 } = require('../nut.js'); const lib = require('./lib');
const dir = process.env.EXTRA_ROM_DIR || 'H:/My Drive/20_Electronics/Calculators/HP/HP-41/HP41_ROM/rom_files_260929';
const XEQ = (n) => 'XEQ ALPHA ' + n.split('').join(' ') + ' ALPHA';
let fails = 0;
const check = (name, got, want) => { const ok = typeof want === 'function' ? want(got) : got.trim() === want; if (!ok) fails++; console.log((ok ? 'PASS' : 'FAIL'), name.padEnd(46), JSON.stringify(got.trim())); };
function withModule(files, page = 8) {
  const cpu = new Nut41(); cpu.setRamConfig('cx');
  const load = (p, b, f, d) => cpu.loadPage(p, b, Nut41.parseRom(fs.readFileSync(path.join(d, f))));
  const roms = path.join(__dirname, '..', 'roms');
  for (const [p, b, f] of [[0, 0, 'NUT0-N.ROM'], [1, 0, 'NUT1-F.ROM'], [2, 0, 'NUT2-L.ROM'], [3, 0, 'XFNS3-3B.ROM'], [5, 0, 'TIME-3B.ROM'], [5, 1, 'XFNS5-2D.ROM']]) load(p, b, f, roms);
  files.forEach((f, i) => load(page + i, 0, f, dir));
  cpu.reset(); lib.runT(cpu, 300000); return cpu;
}
// 1. Math Pac: 1 SINH = 1.1752, 4 ... also list the catalog
let cpu = withModule(['MATH-1D.ROM']);
check('Math Pac recognised', lib.catalog2(cpu).join(' | '), (t) => /MATH 1D/.test(t));
cpu = withModule(['MATH-1D.ROM']);
lib.keys(cpu, '1 ' + XEQ('SINH')); check('Math Pac: 1 SINH', lib.text(cpu), '1.1752');
lib.keys(cpu, '2 ' + XEQ('COSH')); check('Math Pac: 2 COSH', lib.text(cpu), '3.7622');
// 2. Titles in CATALOG 2 show that the firmware recognised each plug-in module
const titles = (files) => lib.catalog2(withModule(files)).join(' | ');
check('Finance ROM recognised', titles(['FINANCE.ROM']), (t) => /FINANCE 1D/.test(t));
check('Stat Pac recognised', titles(['STAT-1B.ROM']), (t) => /STAT 1B/.test(t));
check('PPC ROM (lower+upper page) recognised', titles(['PPCL.ROM', 'PPCU.ROM']), (t) => /PPC/.test(t));
check('Math+Stat+Finance together', titles(['MATH-1D.ROM', 'STAT-1B.ROM', 'FINANCE.ROM']), (t) => /MATH 1D/.test(t) && /STAT 1B/.test(t) && /FINANCE 1D/.test(t));
// 3. Two modules at once still run
cpu = withModule(['MATH-1D.ROM', 'STAT-1B.ROM']);
lib.keys(cpu, '1 ' + XEQ('SINH')); check('Math + Stat together: 1 SINH', lib.text(cpu), '1.1752');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
