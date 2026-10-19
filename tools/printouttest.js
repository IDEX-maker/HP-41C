// When does the tape go to the browser print dialog?
const assert = require('assert');
const { shouldPrintNow } = require('../printout.js');
const cases = [
  ['screen', 'immediate', 'adv', false], ['screen', 'collect', 'manual', false],
  ['print', 'collect', 'adv', false], ['print', 'collect', 'line', false], ['print', 'immediate', 'line', false],
  ['print', 'immediate', 'adv', true], ['print', 'collect', 'manual', true], ['pdf', 'collect', 'manual', true], ['pdf', 'immediate', 'adv', true],
];
for (const [d, m, e, want] of cases) { assert.strictEqual(shouldPrintNow(d, m, e), want, `${d}/${m}/${e}`); console.log('PASS', d, m, e, want); }
