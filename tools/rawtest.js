// node tools/rawtest.js : round-trip test of .RAW export/import through the real firmware
const lib = require('./lib'); const Raw = require('../raw.js');
const { boot, keys, text, hex2, progStream, runT } = lib;
let fails = 0;
const check = (name, got, want) => { const ok = got.trim() === want; if (!ok) fails++; console.log((ok ? 'PASS' : 'FAIL'), name.padEnd(40), JSON.stringify(got.trim()), ok ? '' : `(want ${want})`); };
const run = (cpu, seq) => { keys(cpu, seq); return text(cpu); };
const wake = (cpu) => { cpu.reset(); runT(cpu, 300000); if (!cpu.getDisplay().some(Boolean)) lib.tap(cpu, 0x18); };
const XEQ = (n) => 'XEQ ALPHA ' + n.split('').join(' ') + ' ALPHA';

// 1. author two programs by keystroke on a real (emulated) 41
const a = boot();
keys(a, 'PRGM SHIFT STO ALPHA S Q ALPHA SHIFT SQRT 1 + SHIFT EEX');                 // LBL "SQ" X^2 1 + RTN
keys(a, XEQ('END')); keys(a, 'SHIFT STO ALPHA T W ALPHA 2 * SHIFT EEX');            // END  LBL "TW" 2 * RTN
keys(a, 'PRGM');
check('A: 5 SQ -> 26', run(a, '5 ' + XEQ('SQ')), '26.0000');
check('A: 7 TW -> 14', run(a, '7 ' + XEQ('TW')), '14.0000');
const raw = Raw.exportRaw(a);
console.log('exported', raw.length, 'bytes:', hex2(Array.from(raw)));

// 2. import into a fresh calculator
const b = boot();
const info = Raw.importRaw(b, raw);
console.log('import:', JSON.stringify(info));
wake(b);
check('B: memory valid after import', text(b).includes('MEMORY LOST') ? 'MEMORY LOST' : 'ok', 'ok');
check('B: 5 SQ -> 26', run(b, '5 ' + XEQ('SQ')), '26.0000');
check('B: 7 TW -> 14', run(b, '7 ' + XEQ('TW')), '14.0000');
keys(b, 'PRGM SHIFT RCL . .');                                                      // GTO .. = go to .END.
check('B: firmware agrees where .END. is', text(b), '00 REG ' + Raw.freeRegisters(b));
keys(b, 'PRGM');

// 3. import on top of an existing, unfinished program (an END must be inserted)
const c = boot();
keys(c, 'PRGM SHIFT STO ALPHA Z Z ALPHA 9 SHIFT EEX PRGM');                         // LBL "ZZ" 9 RTN (open tail)
Raw.importRaw(c, raw); wake(c);
check('C: ZZ still works', run(c, XEQ('ZZ')), '9.0000');
check('C: 5 SQ -> 26', run(c, '5 ' + XEQ('SQ')), '26.0000');
check('C: 7 TW -> 14', run(c, '7 ' + XEQ('TW')), '14.0000');

// 4. import twice (second copy is a duplicate; first label wins, memory must stay consistent)
const d = boot(); Raw.importRaw(d, raw); Raw.importRaw(d, raw); wake(d);
check('D: 4 SQ after double import', run(d, '4 ' + XEQ('SQ')), '17.0000');

// 5. export -> import -> export is stable
const e = boot(); Raw.importRaw(e, raw); const raw2 = Raw.exportRaw(e);
const f = boot(); Raw.importRaw(f, raw2); const raw3 = Raw.exportRaw(f);
check('E: export/import/export is stable', hex2(Array.from(raw3)), hex2(Array.from(raw2)));
const norm = (r) => { const b = Array.from(r); return Raw.parse(b).map((it) => it.type === 'end' ? 'END' : hex2(b.slice(it.off, it.off + it.len))).join(' | '); };
check('E: same programs and ENDs as original', norm(raw2), norm(raw));
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
