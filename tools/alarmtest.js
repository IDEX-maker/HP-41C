// node tools/alarmtest.js : stopwatch and alarms through the real firmware (time passes via tickTimer)
const lib = require('./lib');
const XEQ = (n) => 'XEQ ALPHA ' + n.split('').join(' ') + ' ALPHA';
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name.padEnd(52), info); };
const num = (r) => { let v = 0; for (let i = 13; i >= 0; i--) v = v * 10 + r[i]; return v; };
function fresh() {
  const c = lib.boot(); c.beeps = 0; c.onFo = () => { c.beeps++; };
  lib.keys(c, '1 0 . 3 0 0 0 ' + XEQ('SETIME') + ' 1 0 . 1 9 2 0 2 6 ' + XEQ('SETDATE'));
  return c;
}
// real time passing: 100 ticks/s; the CPU runs only while awake (as in the app). Returns distinct display texts.
function tick(c, sec, log) {
  for (let i = 0; i < sec * 10; i++) {
    c.tickTimer(10); if (c.awake) lib.runT(c, 670);
    if (log) { const t = lib.text(c).trim(); if (t && log[log.length - 1] !== t) log.push(t); }
  }
}
const parseSw = (s) => { const m = /^(\d+):(\d+):(\d+)\.(\d+)/.exec(s); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(2, '0')) / 100 : NaN; };

// ---- stopwatch ----
let c = fresh();
const a0 = num(c.ph.clock[0]);                          // time chip clock A, in 1/100 s
lib.keys(c, XEQ('RUNSW'));
const aRun = num(c.ph.clock[0]);
tick(c, 5);
lib.keys(c, XEQ('STOPSW'));
const aStop = num(c.ph.clock[0]);
lib.keys(c, XEQ('SW'));
const shown = parseSw(lib.text(c)), expect = (aStop - aRun) / 100;
check('stopwatch shows the elapsed time', Math.abs(shown - expect) < 0.5, `shown ${shown}s, clock says ${expect}s`);
const frozen = lib.text(c); tick(c, 4);
check('stopwatch stays frozen while stopped', lib.text(c) === frozen, frozen.trim());
lib.keys(c, 'RS'); tick(c, 3); lib.keys(c, 'RS');
check('R/S inside SW runs and stops it', parseSw(lib.text(c)) > shown + 2.5, lib.text(c).trim());

// ---- alarms ----
c = fresh();
check('alarm list starts empty', lib.xeqSample(c, 'ALMCAT').join('|').includes('CAT EMPTY'));
lib.keys(c, 'RS');
lib.keys(c, '1 0 . 1 9 2 0 2 6 ENTER 1 0 . 3 0 3 0 ' + XEQ('XYZALM'));
const cat = lib.xeqSample(c, 'ALMCAT').join(' | ');
check('XYZALM registers the alarm', /10:30AM 10\/19/.test(cat), cat);
lib.keys(c, 'RS');

// (a) calculator switched OFF when the alarm is due
lib.tap(c, 0x18);
check('calculator is off', !c.awake);
let log = []; const fo0 = c.beeps; tick(c, 40, log);
check('alarm wakes a switched-off calculator', c.awake || log.length > 0, `awake=${c.awake}`);
check('alarm message shown', log.some((x) => /10:30AM 10\/19/.test(x)), log.join(' | '));
check('beeper is driven', c.beeps - fo0 > 1000, `${c.beeps - fo0} output transitions`);
lib.tap(c, 0xc3);                                       // any key silences
const fo1 = c.beeps; tick(c, 3);
check("a key press silences the alarm", c.beeps === fo1);

// (b) calculator ON when the alarm is due
c = fresh();
lib.keys(c, '1 0 . 1 9 2 0 2 6 ENTER 1 0 . 3 0 3 0 ' + XEQ('XYZALM') + ' RS');
log = []; const fo2 = c.beeps; tick(c, 40, log);
check('alarm fires with the calculator on', log.some((x) => /10:30AM 10\/19/.test(x)) && c.beeps - fo2 > 1000, log.join(' | '));

// (c) CLALMA clears alarms
c = fresh();
lib.keys(c, '1 0 . 1 9 2 0 2 6 ENTER 1 0 . 4 0 0 0 ' + XEQ('XYZALM') + ' RS');
lib.keys(c, XEQ('CLALMA'));
check('CLALMA clears the alarms', lib.xeqSample(c, 'ALMCAT').join('|').includes('CAT EMPTY'));
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
