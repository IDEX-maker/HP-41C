// HP 82143A printer on the real firmware: what the tape receives for the print functions.
const assert = require('assert');
const lib = require('./lib'); const { Hp82143a } = require('../printer.js');

function printing(pre, fn) {
  const cpu = lib.boot({ printer: true }); const p = new Hp82143a(); const lines = [];
  assert.ok(p.attach(cpu), 'printer attaches to the printer ROM');
  p.onLine = (l) => lines.push(l.text);
  if (pre) lib.keys(cpu, pre);
  lines.length = 0;
  lib.keys(cpu, 'XEQ ALPHA ' + fn + ' ALPHA'); lib.runT(cpu, 300000);
  return { cpu, p, lines };
}
const t = (name, f) => { f(); console.log('PASS', name); };

t('PRX prints the X register', () => assert.deepStrictEqual(printing('1 . 5 ENTER', 'P R X').lines.map((s) => s.trim()), ['1.5000']));
t('PRX of a negative number', () => assert.deepStrictEqual(printing('1 . 5 CHS ENTER', 'P R X').lines.map((s) => s.trim()), ['-1.5000']));
t('PRA prints the alpha register', () => assert.deepStrictEqual(printing('ALPHA H E L L O ALPHA', 'P R A').lines, ['HELLO']));
t('ADV advances one blank line', () => assert.deepStrictEqual(printing('', 'A D V').lines, ['']));
t('PRSTK prints four lines', () => assert.deepStrictEqual(printing('1 ENTER 2 ENTER 3 ENTER 4 ENTER', 'P R S T K').lines.map((s) => s.replace(/\s+/g, ' ')), ['T= 2.0000', 'Z= 3.0000', 'Y= 4.0000', 'X= 4.0000']));
t('PRFLAGS ends without an error', () => { const r = printing('', 'P R F L A G S'); assert.ok(r.lines.length >= 4); assert.ok(!/PRINT/.test(lib.text(r.cpu))); });
t('no error message after printing', () => assert.ok(!/PRINT/.test(lib.text(printing('5 ENTER', 'P R X').cpu))));

t('50 PRX in a row all print', () => {
  const cpu = lib.boot({ printer: true }); const p = new Hp82143a(); let n = 0;
  p.attach(cpu); p.onLine = () => n++;
  lib.keys(cpu, '7 ENTER');
  for (let i = 0; i < 50; i++) { lib.keys(cpu, 'XEQ ALPHA P R X ALPHA'); lib.runT(cpu, 20000); }
  assert.strictEqual(n, 50);
});
t('reset mid-line drops the pending characters', () => {
  const p = new Hp82143a(); const got = []; p.onLine = (l) => got.push(l.text);
  p.write(0x041); p.reset(); p.write(0x042); p.write(0x0e0);
  assert.deepStrictEqual(got, ['B']);
});
t('without the printer attached the calculator is unchanged', () => {
  const cpu = lib.boot({ printer: true }); assert.strictEqual(cpu.printer, null);
  lib.keys(cpu, '1 ENTER 2 +'); assert.ok(/3\.0000/.test(lib.text(cpu)));
});
t('attach refuses when page 6 holds another ROM', () => {
  const cpu = lib.boot(); assert.strictEqual(new Hp82143a().attach(cpu), false); assert.strictEqual(cpu.printer, null);
});
t('over-long lines are cut at 24 columns', () => {
  const p = new Hp82143a(); const got = []; p.onLine = (l) => got.push(l.text);
  for (let i = 0; i < 30; i++) p.write(0x041); p.write(0x0e0);
  assert.strictEqual(got[0].length, 24);
});
