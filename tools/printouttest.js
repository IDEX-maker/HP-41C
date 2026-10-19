// When does the tape go to the browser print dialog?
const assert = require('assert');
const { shouldPrintNow } = require('../printout.js');
const cases = [
  ['screen', 'immediate', 'adv', false], ['screen', 'collect', 'manual', false],
  ['print', 'collect', 'adv', false], ['print', 'collect', 'line', false], ['print', 'immediate', 'line', false],
  ['print', 'immediate', 'adv', true], ['print', 'collect', 'manual', true], ['pdf', 'collect', 'manual', true], ['pdf', 'immediate', 'adv', true],
];
for (const [d, m, e, want] of cases) { assert.strictEqual(shouldPrintNow(d, m, e), want, `${d}/${m}/${e}`); console.log('PASS', d, m, e, want); }

// "Print each calculation": which displays become a paper line
const { calcLine } = require('../printout.js');
const lines = [
  ['3.0000      ', 0, '                  3.0000'], ['-1.5000', 0, '                 -1.5000'], ['1.2345  -12', 0, '              1.2345 -12'],
  ['12_', 0, null], ['XEQ __', 0, null], ['NONEXISTENT', 0, null], ['DATA ERROR', 0, null], ['', 0, null],
  ['3.0000', 1, null], ['3.0000', 2, null], ['3.0000', 128, null], ['3.0000', 16, '                  3.0000'],
];
for (const [text, ann, want] of lines) { assert.strictEqual(calcLine(text, ann), want, `${text}/${ann}`); console.log('PASS calcLine', JSON.stringify(text), ann); }
