// node tools/modinfo.js <file.mod> [romDir]  - list pages of a MOD file and match them to .ROM dumps
const fs = require('fs'), path = require('path');
const { parseMod } = require('../mod.js'); const { Nut41 } = require('../nut.js');
const mod = parseMod(fs.readFileSync(process.argv[2]));
if (!mod) { console.error('not a MOD1 file'); process.exit(1); }
console.log(`${mod.title} | ${mod.copyright} | ${mod.license} | hardware=${mod.hardware} pages=${mod.pages.length}`);
const romDir = process.argv[3]; const roms = [];
if (romDir) (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.rom$/i.test(e.name)) roms.push(p); } })(romDir);
for (const pg of mod.pages) {
  let match = '';
  for (const f of roms) { const w = Nut41.parseRom(fs.readFileSync(f)); if (!w) continue; let same = 0; for (let i = 0; i < 4096; i++) if (w[i] === pg.words[i]) same++; if (same === 4096) match += ' EXACT:' + path.basename(f); else if (same > 3500) match += ` ~${path.basename(f)}(${same})`; }
  console.log(`page ${pg.page.toString(16)} bank ${pg.bank} name=${pg.name} id=${pg.id} ram=${pg.ram}${match}`);
}
