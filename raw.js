'use strict';
/*
 * HP-41 program memory <-> .RAW files.
 *
 * A .RAW file is an extract of program memory: no header, just the program bytes up to and including
 * the last END. This module reads the emulated calculator's program memory, exports it, and imports
 * programs by inserting them in front of .END. and rebuilding the link bytes.
 *
 * Memory layout (verified against the real firmware):
 *  - Program memory is a stream of bytes held in 7-byte registers, b6 first, b0 last. The stream starts
 *    at register (D[5:3] - 1), where D = status register 0x00D, and runs downward in address.
 *  - D[2:0] holds the address of the register that contains .END., which occupies the last three bytes
 *    (b2..b0) of that register.
 *  - ENDs and global labels form one chain. Each chain item stores the distance back to the previous
 *    chain item: byte0 = 0xC0 | 2*(bytes) | (regs >> 8), byte1 = regs & 0xFF, where the distance is
 *    regs*7 + bytes. END = Cx yy 0F, .END. = Cx yy 2F, global label = Cx yy Fn <key> <name>.
 */
(function (root) {

const MAIN_BOTTOM = 0xc0;          // lowest register of main memory
const NIB = 14;

class RawError extends Error {}

// ---------- instruction decoding (lengths verified against the real ROM) ----------
/** Returns {len, type} for the instruction starting at b[i]; type is 'end' | 'glbl' | 'null' | 'op'. */
function instrAt(b, i) {
  const x = b[i];
  if (x === undefined) throw new RawError('unexpected end of data');
  if (x === 0x00) return { len: 1, type: 'null' };
  if (x <= 0x1c) return { len: 1, type: 'op' };            // LBL 00-14, digits, ., EEX, CHS
  if (x === 0x1d || x === 0x1e) {                          // GTO/XEQ "name": followed by an Fn string
    const f = b[i + 1];
    if (f === undefined || f < 0xf0) throw new RawError(`bad alpha GTO/XEQ at byte ${i}`);
    return { len: 2 + (f & 0xf), type: 'op' };
  }
  if (x === 0x1f) throw new RawError(`unsupported byte 0x1F at byte ${i}`);
  if (x <= 0x8f) return { len: 1, type: 'op' };            // RCL/STO 00-15 and one-byte functions
  if (x <= 0xbf) return { len: 2, type: 'op' };            // RCL/STO nn, FIX, TONE, XROM, SF/CF, GTO 00-14, ...
  if (x <= 0xcd) {                                         // END or global label
    const t = b[i + 2];
    if (t === undefined) throw new RawError(`truncated END/LBL at byte ${i}`);
    if (t >= 0xf1) return { len: 3 + (t & 0xf), type: 'glbl' };
    return { len: 3, type: 'end' };
  }
  if (x === 0xce || x === 0xcf) return { len: 2, type: 'op' };   // X<> nn, LBL nn / local alpha label
  if (x <= 0xef) return { len: 3, type: 'op' };            // GTO/XEQ with long local label
  return { len: 1 + (x & 0xf), type: 'op' };               // text string
}

/** Split a byte array into instructions: [{off, len, type}]. */
function parse(b) {
  const items = [];
  for (let i = 0; i < b.length;) {
    const it = instrAt(b, i);
    if (i + it.len > b.length) throw new RawError(`instruction at byte ${i} runs past the end of the data`);
    items.push({ off: i, len: it.len, type: it.type });
    i += it.len;
  }
  return items;
}

function linkBytes(dist) {
  const regs = Math.floor(dist / 7), bytes = dist % 7;
  if (regs > 511) throw new RawError('program too large');
  return [0xc0 | (bytes << 1) | (regs >> 8), regs & 0xff];
}

// ---------- calculator memory access ----------
function ramByte(cpu, a, k) { const o = a * NIB + 2 * (6 - k); return (cpu.ram[o + 1] << 4) | cpu.ram[o]; }
function setRamByte(cpu, a, k, v) { const o = a * NIB + 2 * (6 - k); cpu.ram[o] = v & 0xf; cpu.ram[o + 1] = v >> 4; }
const dNib = (cpu, n) => cpu.ram[0xd * NIB + n];

function layout(cpu) {
  if (!cpu.ramExists[0xd]) throw new RawError('calculator memory is not available');
  const dataLow = (dNib(cpu, 5) << 8) | (dNib(cpu, 4) << 4) | dNib(cpu, 3);
  const endReg = (dNib(cpu, 2) << 8) | (dNib(cpu, 1) << 4) | dNib(cpu, 0);
  if (dataLow <= endReg || dataLow > 0x200 || endReg < MAIN_BOTTOM)
    throw new RawError('program memory is not initialised (power the calculator on first)');
  return { startReg: dataLow - 1, endReg, dataLow };
}

function readStream(cpu) {
  const L = layout(cpu);
  const bytes = [];
  for (let a = L.startReg; a >= L.endReg; a--) for (let k = 0; k < 7; k++) bytes.push(ramByte(cpu, a, k));
  return { bytes, ...L };
}

/** Number of free registers in main memory. */
function freeRegisters(cpu) { const L = layout(cpu); return L.endReg - MAIN_BOTTOM; }

/** The final END of the stream (.END.) is its last three bytes; returns body bytes before it. */
function splitEnd(stream) {
  const n = stream.length;
  return { body: stream.slice(0, n - 3), dotEnd: stream.slice(n - 3) };
}

// ---------- export ----------
/** Export all programs as a .RAW byte array. */
function exportRaw(cpu) {
  const { bytes } = readStream(cpu);
  const { body } = splitEnd(bytes);
  const items = parse(body);
  while (items.length && items[items.length - 1].type === 'null') items.pop();
  if (!items.length) return new Uint8Array(0);
  const last = items[items.length - 1];
  const out = body.slice(0, last.off + last.len);
  if (last.type !== 'end') out.push(0xc0, 0x00, 0x0d);        // close the last program with a generic END
  return Uint8Array.from(out);
}

// ---------- import ----------
/**
 * Insert the programs in `raw` before .END. (after the current programs).
 * Returns {programs, registersUsed, free}. Throws RawError if it does not fit or cannot be parsed.
 * The caller should restart the calculator afterwards so the firmware re-reads its state.
 */
function importRaw(cpu, raw) {
  const rawItems = parse(Array.from(raw));
  if (!rawItems.some((it) => it.type !== 'null')) throw new RawError('the file contains no program');

  const st = readStream(cpu);
  const { body, dotEnd } = splitEnd(st.bytes);
  const old = parse(body);
  while (old.length && old[old.length - 1].type === 'null') old.pop();
  const out = [];
  let prev = null, lastEnd = null;
  for (const it of old) {
    for (let k = 0; k < it.len; k++) out.push(body[it.off + k]);
    if (it.type === 'end') { prev = it.off; lastEnd = it.off; } else if (it.type === 'glbl') prev = it.off;
  }
  const chain = (hdr3) => {                                    // append a chain item header
    const off = out.length;
    out.push(...linkBytes(prev === null ? 0 : off - prev), hdr3);
    prev = off;
    return off;
  };
  const tailHasContent = old.length > 0 && (lastEnd === null || old[old.length - 1].off + old[old.length - 1].len > lastEnd + 3);
  if (tailHasContent) { lastEnd = chain(0x0f); }               // close the program being edited

  let programs = 0;
  for (const it of rawItems) {
    const seg = raw.slice ? Array.from(raw.slice(it.off, it.off + it.len)) : [];
    if (it.type === 'end') { lastEnd = chain(0x0f); programs++; }
    else if (it.type === 'glbl') {
      const name = seg.slice(3);
      chain(seg[2]);
      out.push(0x00, ...name.slice(1));                         // key-assignment byte cleared
    } else out.push(...seg);
  }
  if (rawItems[rawItems.length - 1].type !== 'end') programs++;  // trailing program stays open

  const pad = (7 - ((out.length + 3) % 7)) % 7;
  for (let k = 0; k < pad; k++) out.push(0);
  const endOff = out.length;
  const third = prev === null && dotEnd[2] === 0x20 ? 0x20 : 0x2f;
  out.push(...linkBytes(prev === null ? 0 : endOff - prev), third);
  const regs = out.length / 7;
  const newEndReg = st.startReg - (regs - 1);
  if (newEndReg < MAIN_BOTTOM) throw new RawError(`not enough memory: needs ${regs} registers, ${st.endReg - MAIN_BOTTOM + (st.startReg - st.endReg + 1)} available`);

  // write the stream back
  for (let r = 0; r < regs; r++) for (let k = 0; k < 7; k++) setRamByte(cpu, st.startReg - r, k, out[r * 7 + k]);
  const set3 = (reg, base, v) => { cpu.ram[reg * NIB + base] = v & 0xf; cpu.ram[reg * NIB + base + 1] = (v >> 4) & 0xf; cpu.ram[reg * NIB + base + 2] = (v >> 8) & 0xf; };
  set3(0xd, 0, newEndReg);                                      // D[2:0] = register holding .END.
  cpu.ram[0xc * NIB + 3] = 0;                                   // C[3]   = byte pointer: top of memory
  set3(0xc, 0, st.dataLow);                                     // C[2:0] = register pointer: top of memory
  cpu.ram.fill(0, 0xf * NIB, 0xf * NIB + NIB);                  // line-number cache
  return { programs, registersUsed: regs - (st.startReg - st.endReg + 1), free: newEndReg - MAIN_BOTTOM };
}

const api = { importRaw, exportRaw, readStream, freeRegisters, parse, RawError };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Raw = api;
})(typeof window !== 'undefined' ? window : globalThis);
