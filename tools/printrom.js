// The printer ROM loads into page 6 only when asked for.
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const lib = require('./lib'); const { Nut41 } = require('../nut.js');
const words = Nut41.parseRom(fs.readFileSync(path.join(__dirname, '..', 'roms', 'PRINTER.ROM')));
assert.strictEqual(lib.boot({ printer: true }).fetch(0x6000), words[0]);
assert.strictEqual(lib.boot().fetch(0x6000), 0);
console.log('printrom ok');
