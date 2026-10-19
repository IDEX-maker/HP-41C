// Tape (line store) and the printer dot font.
const assert = require('assert');
const { Tape, renderTape } = require('../tape.js'); const { glyph } = require('../printfont.js');
const t = (name, f) => { f(); console.log('PASS', name); };

t('tape keeps at most 5000 lines, oldest dropped', () => {
  const tape = new Tape(); for (let i = 0; i < 5001; i++) tape.add({ text: String(i) });
  assert.strictEqual(tape.length, 5000); assert.strictEqual(tape.lines[0].text, '1'); assert.strictEqual(tape.lines[4999].text, '5000');
});
t('clear empties the tape', () => { const tape = new Tape(); tape.add({ text: 'A' }); tape.clear(); assert.strictEqual(tape.length, 0); });
t('glyph of A has 5 columns and is not blank', () => { const g = glyph('A'); assert.strictEqual(g.length, 5); assert.ok(g.some((x) => x !== 0)); });
t('space is blank', () => assert.deepStrictEqual(glyph(' '), [0, 0, 0, 0, 0]));
t('special and unknown characters never throw', () => { for (const ch of ['Σ', '\u2260', '\u{1F600}', '', '\u0000', '↑']) { const g = glyph(ch); assert.strictEqual(g.length, 5); assert.ok(g.every((x) => x >= 0 && x < 128)); } });
t('every printable ASCII character has a distinct non-empty glyph except space', () => {
  const seen = new Set();
  for (let c = 0x21; c < 0x7f; c++) { const g = glyph(String.fromCharCode(c)); assert.ok(g.some((x) => x !== 0), String.fromCharCode(c)); seen.add(g.join()); }
  assert.strictEqual(seen.size, 0x7f - 0x21);
});
t('renderTape draws one 24-column row per line', () => {
  const calls = []; const ctx = { fillStyle: '', fillRect: (...a) => calls.push(a), beginPath() {}, arc: (...a) => calls.push(a), fill() {}, clearRect() {} };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const tape = new Tape(); tape.add({ text: 'HI' }); tape.add({ text: '' });
  renderTape(tape, canvas, 2);
  assert.strictEqual(canvas.width, 24 * 6 * 2); assert.strictEqual(canvas.height, 2 * 9 * 2);
});
