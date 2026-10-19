// Minimal Nut disassembler for debugging. Mnemonics follow the Nonpareil disassembler tables.
const TMAP = [3, 4, 5, 10, 8, 6, 11, -1, 2, 9, 7, 13, 1, 12, 0, -1];
const OP00 = ['nop', 'wrrom', null, null, 'enbank1', 'enbank3', 'enbank2', 'enbank4', 'wrpil0', 'wrpil1', 'wrpil2', 'wrpil3', 'wrpil4', 'wrpil5', 'wrpil6', 'wrpil7'];
const OP18 = [null, 'g=c', 'c=g', 'c<>g', null, 'm=c', 'c=m', 'c<>m', null, 'f=sb', 'sb=f', 'f<>sb', null, 'st=c', 'c=st', 'c<>st'];
const OP20 = ['pop', 'powoff', 'sel p', 'sel q', '?p=q', 'lld', 'clr abc', 'goto c', 'c=keys', 'set hex', 'set dec', 'disp off', 'disp tog', '?c rtn', '?nc rtn', 'rtn'];
const OP30 = ['disp blink', 'n=c', 'c=n', 'c<>n', 'ldi', 'stk=c', 'c=stk', 'wptog', 'goto keys', 'sel ram', 'clr regs', 'data=c', 'cxisa', 'c=c|a', 'c=c&a', 'sel pfad'];
const ARITH = ['a=0', 'b=0', 'c=0', 'ab ex', 'b=a', 'ac ex', 'c=b', 'bc ex', 'a=c', 'a=a+b', 'a=a+c', 'a=a+1', 'a=a-b', 'a=a-1', 'a=a-c', 'c=c+c', 'c=a+c', 'c=c+1', 'c=a-c', 'c=c-1', 'c=-c', 'c=-c-1', '?b<>0', '?c<>0', '?a<c', '?a<b', '?a<>0', '?a<>c', 'a sr', 'b sr', 'c sr', 'a sl'];
const FIELD = ['p', 'x', 'wp', 'w', 'pq', 'xs', 'm', 's'];
function dis(op, addr) {
  switch (op & 3) {
    case 1: return 'long-branch(1st word)';
    case 2: return `${ARITH[op >> 5]} ${FIELD[(op >> 2) & 7]}`;
    case 3: { let off = (op >> 3) & 0x3f; if (op & 0x200) off -= 64; return `?${(op >> 2) & 1 ? 'c ' : 'nc'} goto ${((addr + off) & 0xffff).toString(16)}`; }
  }
  const arg = op >> 6;
  switch (op & 0x3c) {
    case 0x00: return OP00[arg] || `con ${op.toString(16)}`;
    case 0x04: return op === 0x3c4 ? 'clr s' : `s=0 ${TMAP[arg]}`;
    case 0x08: return op === 0x3c8 ? 'clr kb' : `s=1 ${TMAP[arg]}`;
    case 0x0c: return op === 0x3cc ? '?kb' : `?s=1 ${TMAP[arg]}`;
    case 0x10: return `lc ${arg.toString(16)}`;
    case 0x14: return op === 0x3d4 ? 'dec pt' : `?p=${TMAP[arg]}`;
    case 0x18: return OP18[arg] || '?';
    case 0x1c: return op === 0x3dc ? 'inc pt' : `p=${TMAP[arg]}`;
    case 0x20: return OP20[arg];
    case 0x24: return `pertct ${arg}`;
    case 0x28: return `wr n${arg}`;
    case 0x2c: return `?ext ${TMAP[arg]}`;
    case 0x30: return OP30[arg];
    case 0x38: return `rd n${arg}`;
    case 0x3c: return op === 0x3fc ? 'lcd comp' : `rcr ${TMAP[arg]}`;
  }
  return '?';
}
module.exports = { dis };
if (require.main === module) {
  const lib = require('./lib'); const cpu = lib.boot();
  const from = parseInt(process.argv[2], 16), to = parseInt(process.argv[3], 16);
  for (let a = from; a <= to; a++) { const op = cpu.fetch(a); console.log(a.toString(16).padStart(4, '0'), op.toString(16).padStart(3, '0'), dis(op, a)); }
}
