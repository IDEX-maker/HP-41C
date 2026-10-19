// Match the user's ROM dumps against Nonpareil's reference CX image (read-only analysis).
// usage: node tools/mapcheck.js <romDir> <reference .rom obj file>
const fs = require('fs');
const path = require('path');
const { Nut41 } = require('../nut.js');

const [romDir, refFile] = process.argv.slice(2);
const ref = fs.readFileSync(refFile, 'utf8').split(/\r?\n/);
const seen = new Map();            // "bank:page" -> Uint16Array
const count = new Map();           // addr -> times seen
for (const line of ref) {
  const m = /^([0-9a-f]{4}):([0-9a-f]{3})$/i.exec(line.trim());
  if (!m) continue;
  const addr = parseInt(m[1], 16), op = parseInt(m[2], 16);
  const n = count.get(addr) || 0; count.set(addr, n + 1);
  const key = `${n}:${addr >> 12}`;
  if (!seen.has(key)) seen.set(key, new Uint16Array(4096));
  seen.get(key)[addr & 0xfff] = op;
}
const refPages = [...seen.entries()].map(([k, v]) => ({ key: k, words: v }));
console.log('reference pages (bank:page):', refPages.map((p) => p.key).join(' '));

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.rom$/i.test(e.name)) files.push(p);
  }
})(romDir);

for (const f of files) {
  const w = Nut41.parseRom(fs.readFileSync(f));
  if (!w) continue;
  for (const rp of refPages) {
    let same = 0;
    for (let i = 0; i < 4096; i++) if (w[i] === rp.words[i]) same++;
    if (same === 4096) console.log(`EXACT  ${rp.key}  ${path.basename(f)}`);
    else if (same > 2500) console.log(`close  ${rp.key}  ${path.basename(f)}  (${same}/4096)`);
  }
}
