// node tools/chiptest.js : unit test of the clock chip (alarm, wake-up, interval timer, persistence)
const { Nut41 } = require('../nut.js');
let fails = 0; const check = (n, ok) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n); };
const cpu = new Nut41(); cpu.setRamConfig('cx');
const setBcd = (r, v) => { for (let i = 0; i < 14; i++) { r[i] = v % 10; v = Math.floor(v / 10); } };
const num = (r) => { let v = 0; for (let i = 13; i >= 0; i--) v = v * 10 + r[i]; return v; };
const ph = cpu.ph;
ph.status = (1 << 6) | (1 << 8);                       // clock A running, alarm A enabled; PUS cleared
setBcd(ph.clock[0], 100); setBcd(ph.alarm[0], 150);
cpu.awake = false;
check('no alarm before it is due', cpu.tickTimer(40) === false && num(ph.clock[0]) === 140 && !cpu.extFlag[13]);
check('alarm wakes a sleeping calculator', cpu.tickTimer(20) === true && cpu.awake === true);
check('service-request flag raised', cpu.extFlag[13] === 1 && (ph.status & 1) === 1);
check('timer flag only when the clock chip is selected', cpu.extFlag[12] === 0);
ph.selected = true; cpu._phFlags(); check('timer flag when selected', cpu.extFlag[12] === 1);
// clearing ALMA via a status write (bits not written as 1 are cleared)
cpu.pfAddr = 0xfb; cpu.c.fill(0); cpu._phWrite(0x3);
check('writing zero clears the alarm and the flag', (ph.status & 1) === 0 && cpu.extFlag[13] === 0);
// clock rolls over at 10^14 hundredths
setBcd(ph.clock[0], 99999999999999); cpu.tickTimer(2); check('clock wraps and sets DTZA', num(ph.clock[0]) === 1 && (ph.status >> 1 & 1) === 1);
// interval timer
cpu.c.fill(0); cpu.c[0] = 5; cpu._phWrite(0x5); cpu.tickTimer(3); check('interval timer counts', ph.it[0] === 3);
cpu.tickTimer(3); check('interval timer reaches terminal count', (ph.status >> 4 & 1) === 1 && ph.it[0] === 0);
// persistence
const saved = JSON.parse(JSON.stringify(cpu.timerState())); const cpu2 = new Nut41(); cpu2.loadTimerState(saved);
check('state round-trips', num(cpu2.ph.clock[0]) === num(cpu.ph.clock[0]) && cpu2.ph.status === cpu.ph.status);
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
