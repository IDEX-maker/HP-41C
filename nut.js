'use strict';
/*
 * Nut CPU + HP-41 (Coconut) hardware model.
 *
 * Original JavaScript implementation. Instruction behaviour follows the
 * documented Nut architecture as implemented by Nonpareil (Eric Smith,
 * GPL); no ROM images are bundled, they are supplied by the user.
 *
 * One call to step() is one Nut instruction-word cycle (~6700/s on real
 * hardware: 375.2 kHz / 56 bit times).
 */
(function (root) {

const WSIZE = 14, EXPSIZE = 3, SSIZE = 14, STACK_DEPTH = 4;
const PAGE_SIZE = 4096, MAX_PAGE = 16, MAX_BANK = 4, MAX_RAM = 1024;
const DISP_DIGITS = 12;
const LEFT = DISP_DIGITS - 1, RIGHT = 0;
const PF_LCD = 0xfd, PF_HALFNUT = 0x10, PF_PHINEAS = 0xfb;
const EF_TIMER = 12, EF_SERVICE_REQUEST = 13;
const KBD_DEBOUNCE_CYCLES = 32;

const ST_NORMAL = 0, ST_LONG = 1, ST_CXISA = 2, ST_LDI = 3, ST_SELPF = 4;
const KB_IDLE = 0, KB_PRESSED = 1, KB_RELEASED = 2, KB_WAIT_CHK = 3, KB_WAIT_CYC = 4;

// map from high opcode bits to register/flag index
const TMAP = [3, 4, 5, 10, 8, 6, 11, -1, 2, 9, 7, 13, 1, 12, 0, -1];

const A = 1, B = 2, C = 4, AB = 3, ABC = 7;

function digitAddSub(sub, x, y, st, base) {
  // st.carry is carry for add, borrow for subtract
  let carry = st.carry;
  if (sub) { carry ^= 1; y ^= 0xf; }
  let s = x + y + carry;
  carry = s > 0xf ? 1 : 0;
  if (base === 10) {
    if (sub) {
      if (!carry) s += 10;
    } else {
      if (s > 9) carry = 1;
      if (carry) s += 6;
    }
  }
  if (sub) carry ^= 1;
  st.carry = carry;
  return s & 0xf;
}

class Nut41 {
  constructor() {
    this.a = new Uint8Array(WSIZE);
    this.b = new Uint8Array(WSIZE);
    this.c = new Uint8Array(WSIZE);
    this.m = new Uint8Array(WSIZE);
    this.n = new Uint8Array(WSIZE);
    this.g = new Uint8Array(2);
    this.s = new Uint8Array(SSIZE);
    this.stack = new Uint16Array(STACK_DEPTH);
    this.p = 0; this.q = 0; this.qSel = false;
    this.fo = 0;
    this.pc = 0; this.carry = 0; this.prevCarry = 0;
    this.decimal = false;
    this.awake = false;
    this.instState = ST_NORMAL;
    this.firstWord = 0; this.cxisaAddr = 0; this.selpf = 0;
    this.prevPc = 0;
    this.pfAddr = 0; this.ramAddr = 0;
    this.cycles = 0;

    // ROM: pages[bank][page] -> Uint16Array(4096)
    this.pages = [];
    for (let b = 0; b < MAX_BANK; b++) this.pages.push(new Array(MAX_PAGE).fill(null));
    this.activeBank = new Uint8Array(MAX_PAGE);

    this.ramExists = new Uint8Array(MAX_RAM);
    this.ram = new Uint8Array(MAX_RAM * WSIZE);

    // keyboard
    this.keyBuf = 0; this.keyDown = false; this.kbState = KB_IDLE; this.kbDebounce = 0;

    // display (Coconut LCD)
    this.dA = new Uint8Array(DISP_DIGITS);
    this.dB = new Uint8Array(DISP_DIGITS);
    this.dC = new Uint8Array(DISP_DIGITS);
    this.ann = 0;
    this.dispEnable = false;
    this.dispCount = 0;
    this.snap = { a: new Uint8Array(DISP_DIGITS), b: new Uint8Array(DISP_DIGITS),
                  c: new Uint8Array(DISP_DIGITS), ann: 0, enable: false };

    // tone output hook: onTone(pulseWidthCycles) ; set by UI
    // Phineas clock chip (Time module / HP-41CX). Ticks every 1/100 s, driven by tickTimer().
    this.extFlag = new Uint8Array(14);
    this.ph = {
      timerSel: 0, hold: false, status: 1 << 5,            // PUS (power-up status) set
      clock: [new Uint8Array(WSIZE), new Uint8Array(WSIZE)],
      alarm: [new Uint8Array(WSIZE), new Uint8Array(WSIZE)],
      scratch: [new Uint8Array(WSIZE), new Uint8Array(WSIZE)],
      it: new Uint8Array(5), itTc: new Uint8Array(5), af: new Uint8Array(4), selected: false,
    };

    this.onSleep = null;
    this.lastFoChange = 0;
    this.onFo = null;

    this._buildOps();
    this.reset();
  }

  // ---------- configuration ----------

  setRamConfig(name) {
    this.ramExists.fill(0);
    const add = (base, size) => { for (let i = 0; i < size; i++) this.ramExists[base + i] = 1; };
    add(0x000, 0x10);                        // status registers
    if (name === 'c') add(0x0c0, 0x40);      // 41C: 64 registers
    else if (name === 'cv') add(0x0c0, 0x140); // 41CV: 319 + ...
    else { add(0x040, 0x1c0); }              // 41CX: all (incl. extended memory)
  }

  loadPage(page, bank, words) {
    const w = new Uint16Array(PAGE_SIZE);
    for (let i = 0; i < PAGE_SIZE; i++) w[i] = (words[i] || 0) & 0x3ff;
    this.pages[bank][page] = w;
  }

  clearPages() {
    for (let b = 0; b < MAX_BANK; b++) this.pages[b].fill(null);
  }

  /** Convert a 8192-byte ROM dump (big-endian 16-bit words, 10 bits used). */
  static parseRom(bytes) {
    if (bytes.length !== 8192) return null;
    const w = new Uint16Array(PAGE_SIZE);
    for (let i = 0; i < PAGE_SIZE; i++) w[i] = ((bytes[2 * i] << 8) | bytes[2 * i + 1]) & 0x3ff;
    return w;
  }

  // ---------- reset / memory ----------

  reset() {
    for (const r of [this.a, this.b, this.c, this.m, this.n]) r.fill(0);
    this.g.fill(0);
    this.s.fill(0);
    this.stack.fill(0);
    this.p = 0; this.q = 0; this.qSel = false;
    this.activeBank.fill(0);
    this.awake = true;
    this.pc = 0;
    this.instState = ST_NORMAL;
    this.carry = 1; this.prevCarry = 0;
    this.kbState = KB_IDLE; this.keyDown = false;
    this.decimal = false;
    this.cycles = 0;
    this.dA.fill(0); this.dB.fill(0); this.dC.fill(0);
    this.ann = 0; this.dispEnable = false; this.dispCount = 0;
    this._snapshot();
  }

  clearMemory() {
    for (let addr = 0; addr < MAX_RAM; addr++)
      if (this.ramExists[addr]) this.ram.fill(0, addr * WSIZE, (addr + 1) * WSIZE);
  }

  /** Serialize RAM (the part that survives power-off on a real 41). */
  saveRam() {
    let out = '';
    for (let addr = 0; addr < MAX_RAM; addr++) {
      if (!this.ramExists[addr]) continue;
      let h = '';
      for (let i = WSIZE - 1; i >= 0; i--) h += this.ram[addr * WSIZE + i].toString(16);
      out += addr.toString(16).padStart(3, '0') + h + '\n';
    }
    return out;
  }

  loadRam(text) {
    for (const line of text.split('\n')) {
      if (line.length !== 3 + WSIZE) continue;
      const addr = parseInt(line.slice(0, 3), 16);
      if (!(addr < MAX_RAM) || !this.ramExists[addr]) continue;
      for (let i = 0; i < WSIZE; i++)
        this.ram[addr * WSIZE + i] = parseInt(line[3 + WSIZE - 1 - i], 16) & 0xf;
    }
  }

  // ---------- program memory ----------

  fetch(addr) {
    const page = addr >> 12;
    const pg = this.pages[this.activeBank[page]][page];
    return pg ? pg[addr & 0xfff] : 0;
  }

  // ---------- keyboard ----------

  pressKey(code) {
    if (!this.awake && !this.dispEnable && code !== 0x18) return;
    this.keyBuf = code;
    this.keyDown = true;
    if (this.kbState === KB_IDLE) this.kbState = KB_PRESSED;
    if (!this.awake) { this.awake = true; this._snapshot(); }
  }

  releaseKey() {
    this.keyDown = false;
    if (this.kbState === KB_PRESSED) this.kbState = KB_RELEASED;
  }

  // ---------- display ----------

  _snapshot() {
    const s = this.snap;
    s.a.set(this.dA); s.b.set(this.dB); s.c.set(this.dC);
    s.ann = this.ann; s.enable = this.dispEnable;
    this.dispCount = 15;
  }

  /** Returns 12 entries, leftmost first: {ch:0..127, punct:0..3} or null when blank. */
  getDisplay() {
    const s = this.snap;
    const out = [];
    for (let i = LEFT; i >= RIGHT; i--) {
      if (!s.enable) { out.push(null); continue; }
      const ch = ((s.c[i] & 1) << 6) + ((s.b[i] & 3) << 4) + s.a[i];
      out.push({ ch, punct: s.b[i] >> 2 });
    }
    return out;
  }

  getAnnunciators() { return this.snap.enable ? this.snap.ann : 0; }

  _rot(reg, dir) {
    if (dir === LEFT) {
      const t = reg[LEFT];
      for (let i = LEFT; i > RIGHT; i--) reg[i] = reg[i - 1];
      reg[RIGHT] = t;
    } else {
      const t = reg[0];
      for (let i = RIGHT; i < LEFT; i++) reg[i] = reg[i + 1];
      reg[LEFT] = t;
    }
  }

  _lcdRead(reg, chars, dir) {
    let j = 0;
    for (let i = 0; i < chars; i++) {
      if (reg & A) { this.c[j++] = this.dA[dir]; this._rot(this.dA, dir); }
      if (reg & B) { this.c[j++] = this.dB[dir]; this._rot(this.dB, dir); }
      if (reg & C) { this.c[j++] = this.dC[dir]; this._rot(this.dC, dir); }
    }
  }

  _lcdWrite(reg, chars, dir) {
    let j = 0;
    for (let i = 0; i < chars; i++) {
      if (reg & A) { this._rot(this.dA, LEFT - dir); this.dA[dir] = this.c[j++]; }
      if (reg & B) { this._rot(this.dB, LEFT - dir); this.dB[dir] = this.c[j++]; }
      if (reg & C) { this._rot(this.dC, LEFT - dir); this.dC[dir] = this.c[j++] & 1; }
    }
  }

  _lcdRdN(n) {
    switch (n) {
      case 0x0: this._lcdRead(A, 12, LEFT); break;
      case 0x1: this._lcdRead(B, 12, LEFT); break;
      case 0x2: this._lcdRead(C, 12, LEFT); break;
      case 0x3: this._lcdRead(AB, 6, LEFT); break;
      case 0x4: this._lcdRead(ABC, 4, LEFT); break;
      case 0x5: this.c[2] = this.ann >> 8; this.c[1] = (this.ann >> 4) & 0xf; this.c[0] = this.ann & 0xf; break;
      case 0x6: this._lcdRead(C, 1, LEFT); break;
      case 0x7: this._lcdRead(A, 1, RIGHT); break;
      case 0x8: this._lcdRead(B, 1, RIGHT); break;
      case 0x9: this._lcdRead(C, 1, RIGHT); break;
      case 0xa: this._lcdRead(A, 1, LEFT); break;
      case 0xb: this._lcdRead(B, 1, LEFT); break;
      case 0xc: this._lcdRead(AB, 1, RIGHT); break;
      case 0xd: this._lcdRead(AB, 1, LEFT); break;
      case 0xe: this._lcdRead(ABC, 1, RIGHT); break;
      case 0xf: this._lcdRead(ABC, 1, LEFT); break;
    }
  }

  _lcdWrN(n) {
    switch (n) {
      case 0x0: this._lcdWrite(A, 12, LEFT); break;
      case 0x1: this._lcdWrite(B, 12, LEFT); break;
      case 0x2: this._lcdWrite(C, 12, LEFT); break;
      case 0x3: this._lcdWrite(AB, 6, LEFT); break;
      case 0x4: this._lcdWrite(ABC, 4, LEFT); break;
      case 0x5: this._lcdWrite(AB, 6, RIGHT); break;
      case 0x6: this._lcdWrite(ABC, 4, RIGHT); break;
      case 0x7: this._lcdWrite(A, 1, LEFT); break;
      case 0x8: this._lcdWrite(B, 1, LEFT); break;
      case 0x9: this._lcdWrite(C, 1, LEFT); break;
      case 0xa: this._lcdWrite(A, 1, RIGHT); break;
      case 0xb: this._lcdWrite(B, 1, RIGHT); break;
      case 0xc: this._lcdWrite(C, 1, RIGHT); break;
      case 0xd: this._lcdWrite(AB, 1, RIGHT); break;
      case 0xe: this._lcdWrite(ABC, 1, LEFT); break;
      case 0xf: this._lcdWrite(ABC, 1, RIGHT); break;
    }
  }

  // ---------- register helpers ----------

  _fieldRange(field) {
    const pt = this.qSel ? this.q : this.p;
    switch (field) {
      case 0: return [pt, pt];                       // p
      case 1: return [0, EXPSIZE - 1];               // x
      case 2: return [0, pt];                        // wp
      case 3: return [0, WSIZE - 1];                 // w
      case 4: {                                      // pq
        const f = this.p; let l = this.q;
        if (f > l) l = WSIZE - 1;
        return [f, l];
      }
      case 5: return [EXPSIZE - 1, EXPSIZE - 1];     // xs
      case 6: return [EXPSIZE, WSIZE - 2];           // m
      default: return [WSIZE - 1, WSIZE - 1];        // s
    }
  }

  _base() { return this.decimal ? 10 : 16; }

  _add(dest, s1, s2, first, last) {
    const st = this, base = this._base();
    for (let i = first; i <= last; i++) {
      const y = s2 ? s2[i] : 0;
      dest[i] = digitAddSub(false, s1[i], y, st, base);
    }
  }

  _sub(dest, s1, s2, first, last) {
    const st = this, base = this._base();
    for (let i = first; i <= last; i++) {
      const x = s1 ? s1[i] : 0;
      const y = s2 ? s2[i] : 0;
      const d = digitAddSub(true, x, y, st, base);
      if (dest) dest[i] = d;
    }
  }

  _nonEqual(s1, s2, first, last) {
    let r = 0;
    for (let i = first; i <= last; i++) if (s1[i] !== (s2 ? s2[i] : 0)) r = 1;
    this.carry = r;
  }

  _arith(op) {
    const code = op >> 5;
    const [f, l] = this._fieldRange((op >> 2) & 7);
    const a = this.a, b = this.b, c = this.c;
    let i, t;
    switch (code) {
      case 0x00: for (i = f; i <= l; i++) a[i] = 0; break;
      case 0x01: for (i = f; i <= l; i++) b[i] = 0; break;
      case 0x02: for (i = f; i <= l; i++) c[i] = 0; break;
      case 0x03: for (i = f; i <= l; i++) { t = a[i]; a[i] = b[i]; b[i] = t; } break;
      case 0x04: for (i = f; i <= l; i++) b[i] = a[i]; break;
      case 0x05: for (i = f; i <= l; i++) { t = a[i]; a[i] = c[i]; c[i] = t; } break;
      case 0x06: for (i = f; i <= l; i++) c[i] = b[i]; break;
      case 0x07: for (i = f; i <= l; i++) { t = b[i]; b[i] = c[i]; c[i] = t; } break;
      case 0x08: for (i = f; i <= l; i++) a[i] = c[i]; break;
      case 0x09: this._add(a, a, b, f, l); break;
      case 0x0a: this._add(a, a, c, f, l); break;
      case 0x0b: this.carry = 1; this._add(a, a, null, f, l); break;
      case 0x0c: this._sub(a, a, b, f, l); break;
      case 0x0d: this.carry = 1; this._sub(a, a, null, f, l); break;
      case 0x0e: this._sub(a, a, c, f, l); break;
      case 0x0f: this._add(c, c, c, f, l); break;
      case 0x10: this._add(c, a, c, f, l); break;
      case 0x11: this.carry = 1; this._add(c, c, null, f, l); break;
      case 0x12: this._sub(c, a, c, f, l); break;
      case 0x13: this.carry = 1; this._sub(c, c, null, f, l); break;
      case 0x14: this._sub(c, null, c, f, l); break;
      case 0x15: this.carry = 1; this._sub(c, null, c, f, l); break;
      case 0x16: this._nonEqual(b, null, f, l); break;
      case 0x17: this._nonEqual(c, null, f, l); break;
      case 0x18: this._sub(null, a, c, f, l); break;
      case 0x19: this._sub(null, a, b, f, l); break;
      case 0x1a: this._nonEqual(a, null, f, l); break;
      case 0x1b: this._nonEqual(a, c, f, l); break;
      case 0x1c: for (i = f; i <= l; i++) a[i] = (i === l) ? 0 : a[i + 1]; break;
      case 0x1d: for (i = f; i <= l; i++) b[i] = (i === l) ? 0 : b[i + 1]; break;
      case 0x1e: for (i = f; i <= l; i++) c[i] = (i === l) ? 0 : c[i + 1]; break;
      case 0x1f: for (i = l; i >= f; i--) a[i] = (i === f) ? 0 : a[i - 1]; break;
    }
  }

  _push(addr) {
    const s = this.stack;
    for (let i = STACK_DEPTH - 1; i > 0; i--) s[i] = s[i - 1];
    s[0] = addr;
  }

  _pop() {
    const s = this.stack;
    const r = s[0];
    for (let i = 0; i < STACK_DEPTH - 1; i++) s[i] = s[i + 1];
    s[STACK_DEPTH - 1] = 0;
    return r;
  }

  _cAddr() {
    const c = this.c;
    return (c[6] << 12) | (c[5] << 8) | (c[4] << 4) | c[3];
  }

  _sBits(first, count) {
    let r = 0, mask = 1;
    for (let i = first; i < first + count; i++) { if (this.s[i]) r += mask; mask <<= 1; }
    return r;
  }

  _setSBits(first, count, v) {
    let mask = 1;
    for (let i = first; i < first + count; i++) { this.s[i] = (v & mask) ? 1 : 0; mask <<= 1; }
  }

  _setFo(v) {
    if (this.fo === v) return;
    if (this.onFo) this.onFo(this.cycles, v);
    this.fo = v;
  }

  _pt() { return this.qSel ? this.q : this.p; }
  _setPt(v) { if (this.qSel) this.q = v; else this.p = v; }

  _selectBank(addr, bank) {
    const page = addr >> 12;
    if (this.pages[bank][page]) this.activeBank[page] = bank;
  }

  _sleep() {
    // light sleep keeps display on; deep sleep (display off) sets carry
    if (this.kbState === KB_PRESSED) this.awake = true;
    if (this.kbState === KB_WAIT_CYC) {
      if (this.keyDown) { this.kbState = KB_PRESSED; this.awake = true; }
      else this.kbState = KB_IDLE;
    }
    this._snapshot();
    if (!this.dispEnable) this.carry = 1;
    if (this.onSleep) this.onSleep(this.dispEnable);
  }

  // ---------- opcode table ----------

  _buildOps() {
    const cpu = this;
    const ops = new Array(1024);
    const bad = () => {};
    for (let i = 0; i < 1024; i += 4) {
      ops[i] = bad;
      ops[i + 1] = (op) => { cpu.instState = ST_LONG; cpu.firstWord = op; cpu.carry = cpu.prevCarry; };
      ops[i + 2] = (op) => cpu._arith(op);
      ops[i + 3] = (op) => {
        let off = (op >> 3) & 0x3f;
        if (op & 0x200) off -= 64;
        if (((op >> 2) & 1) === cpu.prevCarry) cpu.pc = (cpu.pc + off - 1) & 0xffff;
      };
    }
    ops[0x000] = () => {};

    for (let hi = 0; hi < 16; hi++) {
      const o = hi << 6;
      ops[0x010 + o] = () => {                       // LC n
        const pt = cpu._pt();
        cpu.c[pt] = hi;
        cpu._setPt(pt === 0 ? WSIZE - 1 : pt - 1);
      };
      ops[0x024 + o] = () => { cpu.selpf = hi; cpu.instState = ST_SELPF; };   // PERTCT
      ops[0x028 + o] = () => cpu._writeRegN(hi);                               // WRITE n
      ops[0x038 + o] = () => cpu._readRegN(hi);                                // READ n
      const t = TMAP[hi];
      if (t < 0) continue;
      ops[0x004 + o] = () => { cpu.s[t] = 0; };                                // CLRF
      ops[0x008 + o] = () => { cpu.s[t] = 1; };                                // SETF
      ops[0x00c + o] = () => { cpu.carry = cpu.s[t]; };                        // ?FSET
      ops[0x014 + o] = () => { cpu.carry = cpu._pt() === t ? 1 : 0; };         // ?P=
      ops[0x01c + o] = () => { cpu._setPt(t); };                               // P=
      ops[0x02c + o] = () => { cpu.carry = cpu.extFlag[t]; };                  // ?ext flag (timer / service request)
      ops[0x03c + o] = () => {                                                 // RCR
        const tmp = new Uint8Array(WSIZE);
        let j = t;
        for (let i = 0; i < WSIZE; i++) { tmp[i] = cpu.c[j++]; if (j >= WSIZE) j = 0; }
        cpu.c.set(tmp);
      };
    }

    ops[0x3c4] = () => { cpu.s.fill(0, 0, 8); };                                // CLRST
    ops[0x3c8] = () => { if (cpu.kbState === KB_RELEASED) cpu.kbState = KB_WAIT_CHK; };  // RSTKB
    ops[0x3cc] = () => {                                                        // CHKKB
      cpu.carry = (cpu.kbState === KB_PRESSED || cpu.kbState === KB_RELEASED) ? 1 : 0;
      if (cpu.kbState === KB_WAIT_CHK) { cpu.kbState = KB_WAIT_CYC; cpu.kbDebounce = KBD_DEBOUNCE_CYCLES; }
    };
    ops[0x3d4] = () => { const v = cpu._pt(); cpu._setPt(v === 0 ? WSIZE - 1 : v - 1); };  // DECPT
    ops[0x3dc] = () => { const v = cpu._pt() + 1; cpu._setPt(v >= WSIZE ? 0 : v); };      // INCPT
    ops[0x3fc] = () => {};                                                      // LCD compensation

    const gIdx = () => cpu._pt();
    ops[0x058] = () => {                                                        // C=>G
      const i = gIdx();
      if (i < WSIZE - 1) { cpu.g[0] = cpu.c[i]; cpu.g[1] = cpu.c[i + 1]; }
      else { cpu.g[0] = cpu.c[0]; cpu.g[1] = cpu.c[WSIZE - 1]; }
    };
    ops[0x098] = () => {                                                        // G=>C
      const i = gIdx();
      if (i < WSIZE - 1) { cpu.c[i] = cpu.g[0]; cpu.c[i + 1] = cpu.g[1]; }
      else { cpu.c[0] = cpu.g[0]; cpu.c[WSIZE - 1] = cpu.g[1]; }
    };
    ops[0x0d8] = () => {                                                        // C<>G
      const i = gIdx();
      let t;
      if (i < WSIZE - 1) {
        t = cpu.g[0]; cpu.g[0] = cpu.c[i]; cpu.c[i] = t;
        t = cpu.g[1]; cpu.g[1] = cpu.c[i + 1]; cpu.c[i + 1] = t;
      } else {
        t = cpu.g[0]; cpu.g[0] = cpu.c[0]; cpu.c[0] = t;
        t = cpu.g[1]; cpu.g[1] = cpu.c[WSIZE - 1]; cpu.c[WSIZE - 1] = t;
      }
    };

    ops[0x158] = () => { cpu.m.set(cpu.c); };                                   // C=>M
    ops[0x198] = () => { cpu.c.set(cpu.m); };                                   // M=>C
    ops[0x1d8] = () => { const t = cpu.c.slice(); cpu.c.set(cpu.m); cpu.m.set(t); };  // C<>M

    ops[0x258] = () => { cpu._setFo(cpu._sBits(0, 8)); };                       // ST=>F (SB to F)
    ops[0x298] = () => { cpu._setSBits(0, 8, cpu.fo); };                        // F=>ST
    ops[0x2d8] = () => { const t = cpu._sBits(0, 8); cpu._setSBits(0, 8, cpu.fo); cpu._setFo(t); };

    ops[0x358] = () => { cpu._setSBits(0, 4, cpu.c[0]); cpu._setSBits(4, 4, cpu.c[1]); };  // C=>ST
    ops[0x398] = () => { cpu.c[0] = cpu._sBits(0, 4); cpu.c[1] = cpu._sBits(4, 4); };      // ST=>C
    ops[0x3d8] = () => {                                                                   // C<>ST
      let t = cpu._sBits(0, 4); cpu._setSBits(0, 4, cpu.c[0]); cpu.c[0] = t;
      t = cpu._sBits(4, 4); cpu._setSBits(4, 4, cpu.c[1]); cpu.c[1] = t;
    };

    ops[0x020] = () => { cpu._pop(); };                                         // POP
    ops[0x060] = () => {                                                        // POWOFF
      cpu.activeBank.fill(0);
      cpu.awake = false;
      cpu.pc = 0;
      cpu._sleep();
    };
    ops[0x0a0] = () => { cpu.qSel = false; };                                   // SELP
    ops[0x0e0] = () => { cpu.qSel = true; };                                    // SELQ
    ops[0x120] = () => { if (cpu.p === cpu.q) cpu.carry = 1; };                 // ?P=Q
    ops[0x160] = () => { cpu.carry = 0; };                                      // ?LOWBAT
    ops[0x1a0] = () => { cpu.a.fill(0); cpu.b.fill(0); cpu.c.fill(0); };        // CLRABC
    ops[0x1e0] = () => { cpu.pc = cpu._cAddr(); };                              // GOTO C
    ops[0x220] = () => { cpu.c[4] = cpu.keyBuf >> 4; cpu.c[3] = cpu.keyBuf & 0xf; };  // C=KEYS
    ops[0x260] = () => { cpu.decimal = false; };                                // SETHEX
    ops[0x2a0] = () => { cpu.decimal = true; };                                 // SETDEC
    ops[0x2e0] = () => { cpu.dispEnable = false; cpu.dispCount = 2; };          // DISOFF
    ops[0x320] = () => { cpu.dispEnable = !cpu.dispEnable; cpu.dispCount = 0; };// DISTOG
    ops[0x360] = () => { if (cpu.prevCarry) cpu.pc = cpu._pop(); };             // RTNC
    ops[0x3a0] = () => { if (!cpu.prevCarry) cpu.pc = cpu._pop(); };            // RTNNC
    ops[0x3e0] = () => { cpu.pc = cpu._pop(); };                                // RTN

    ops[0x040] = () => {};                                                      // WRITE MLDL (not supported)
    for (let i = 0; i < 4; i++)
      ops[0x100 + i * 0x40] = (op) => {                                         // ENBANKn
        cpu._selectBank(cpu.prevPc, ((op >> 5) & 2) + ((op >> 7) & 1));
      };

    ops[0x070] = () => { cpu.n.set(cpu.c); };                                   // C=>N
    ops[0x0b0] = () => { cpu.c.set(cpu.n); };                                   // N=>C
    ops[0x0f0] = () => { const t = cpu.c.slice(); cpu.c.set(cpu.n); cpu.n.set(t); };  // C<>N
    ops[0x130] = () => { cpu.instState = ST_LDI; };                             // LDI
    ops[0x170] = () => { cpu._push(cpu._cAddr()); };                            // PUSH C
    ops[0x1b0] = () => {                                                        // POP C
      const a = cpu._pop();
      cpu.c[6] = a >> 12; cpu.c[5] = (a >> 8) & 0xf; cpu.c[4] = (a >> 4) & 0xf; cpu.c[3] = a & 0xf;
    };
    ops[0x230] = () => { cpu.pc = (cpu.pc & 0xff00) | cpu.keyBuf; };            // KEYS=>PC
    ops[0x270] = () => {                                                        // C=>DATA ADDR
      cpu.ramAddr = ((cpu.c[2] << 8) | (cpu.c[1] << 4) | cpu.c[0]) & 0x3ff;
      cpu.ph.selected = false; cpu._phFlags();
    };
    ops[0x2f0] = () => cpu._cToData();                                          // C=>DATA
    ops[0x330] = () => { cpu.cxisaAddr = cpu._cAddr(); cpu.instState = ST_CXISA; };   // C=ROM (CXISA)
    ops[0x370] = () => { for (let i = 0; i < WSIZE; i++) cpu.c[i] |= cpu.a[i]; };      // C=C OR A
    ops[0x3b0] = () => { for (let i = 0; i < WSIZE; i++) cpu.c[i] &= cpu.a[i]; };      // C=C AND A
    ops[0x3f0] = () => {                                                        // C=>PERIPH ADDR
      cpu.pfAddr = (cpu.c[1] << 4) | cpu.c[0];
      cpu.ph.selected = cpu.pfAddr === PF_PHINEAS; cpu._phFlags();
    };

    this.ops = ops;
  }

  _pfRead(n) {
    if (this.pfAddr === PF_LCD) { this._lcdRdN(n); return true; }
    if (this.pfAddr === PF_HALFNUT) return true;
    if (this.pfAddr === PF_PHINEAS) return this._phRead(n);
    return false;
  }

  _pfWriteN(n) {
    if (this.pfAddr === PF_LCD) { this._lcdWrN(n); return true; }
    if (this.pfAddr === PF_HALFNUT) return true;
    if (this.pfAddr === PF_PHINEAS) return this._phWrite(n);
    return false;
  }

  // ---------- Phineas clock chip ----------

  _phBit(bit) { return (this.ph.status >> bit & 1) === 1; }
  _phSet(bit, v) { if (v) this.ph.status |= 1 << bit; else this.ph.status &= ~(1 << bit); }

  _phFlags() {
    const ph = this.ph;
    // bits: 0 ALMA, 1 DTZA, 2 ALMB, 3 DTZB, 4 DTZIT, 5 PUS
    const pending = !this._phBit(5) && (ph.status & 0x1f) !== 0;
    this.extFlag[EF_SERVICE_REQUEST] = pending ? 1 : 0;
    this.extFlag[EF_TIMER] = pending && ph.selected ? 1 : 0;
    return pending;
  }

  _phRead(n) {
    const ph = this.ph, c = this.c, sel = ph.timerSel;
    if (!ph.selected) return false;
    c.fill(0);
    switch (n) {
      case 0x0: c.set(ph.clock[sel]); break;
      case 0x1: c.set(ph.clock[sel]); ph.hold = true; break;
      case 0x2: c.set(ph.alarm[sel]); break;
      case 0x3:
        if (sel) { for (let i = 0; i < 4; i++) c[i + 1] = ph.af[i]; }
        else for (let i = 0; i < 4; i++) c[i] = (ph.status >> (4 * i)) & 0xf;
        break;
      case 0x4: c.set(ph.scratch[sel]); break;
      case 0x5: for (let i = 0; i < 5; i++) c[i] = ph.it[i]; break;
      default: break;
    }
    return true;
  }

  _phWrite(n) {
    const ph = this.ph, c = this.c, sel = ph.timerSel;
    if (!ph.selected) return false;
    switch (n) {
      case 0x0: ph.clock[sel].set(c); break;
      case 0x1: ph.clock[sel].set(c); ph.hold = false; break;
      case 0x2: ph.alarm[sel].set(c); break;
      case 0x3:
        if (sel) { for (let i = 0; i < 4; i++) ph.af[i] = c[i + 1]; ph.af[3] &= 1; }
        else {
          // only bits 0-5 can be cleared by writing zero
          if (!(c[0] & 1)) this._phSet(0, false);
          if (!(c[0] & 2)) this._phSet(1, false);
          if (!(c[0] & 4)) this._phSet(2, false);
          if (!(c[0] & 8)) this._phSet(3, false);
          if (!(c[1] & 1)) this._phSet(4, false);
          if (!(c[1] & 2)) this._phSet(5, false);
          this._phFlags();
        }
        break;
      case 0x4: ph.scratch[sel].set(c); break;
      case 0x5: for (let i = 0; i < 5; i++) { ph.itTc[i] = c[i]; ph.it[i] = 0; } this._phSet(10, true); break;
      case 0x7: this._phSet(10, false); break;
      case 0x8: this._phSet(11 + sel, false); break;
      case 0x9: this._phSet(11 + sel, true); break;
      case 0xa: this._phSet(8 + sel, false); break;
      case 0xb: this._phSet(8 + sel, true); break;
      case 0xc: this._phSet(6 + sel, false); break;
      case 0xd: this._phSet(6 + sel, true); break;
      case 0xe: ph.timerSel = 1; break;
      case 0xf: ph.timerSel = 0; break;
      default: break;
    }
    return true;
  }

  static _bcdToNum(r, n) { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 10 + r[i]; return v; }
  static _numToBcd(v, r, n) { for (let i = 0; i < n; i++) { r[i] = v % 10; v = Math.floor(v / 10); } }

  /** Advance the clock chip by `ticks` hundredths of a second. Wakes the CPU on an alarm.
   *  Returns true if the CPU was woken. */
  tickTimer(ticks) {
    if (!(ticks > 0)) return false;
    const ph = this.ph;
    for (let sel = 0; sel < 2; sel++) {
      if (!this._phBit(6 + sel)) continue;                  // clock not running
      const old = Nut41._bcdToNum(ph.clock[sel], WSIZE);
      let nv = old + ticks;
      const overflow = nv > 99999999999999;
      if (overflow) { nv = nv % 100000000000000; this._phSet(1 + 2 * sel, true); }
      Nut41._numToBcd(nv, ph.clock[sel], WSIZE);
      if (this._phBit(8 + sel)) {                           // alarm enabled
        const al = Nut41._bcdToNum(ph.alarm[sel], WSIZE);
        const hit = overflow ? (al > old || al <= nv) : (al > old && al <= nv);
        if (hit) this._phSet(0 + 2 * sel, true);
      }
    }
    if (this._phBit(10)) {                                   // interval timer
      let v = Nut41._bcdToNum(ph.it, 5) + ticks;
      const tc = Nut41._bcdToNum(ph.itTc, 5);
      if (v >= tc) { v = 0; this._phSet(4, true); }
      Nut41._numToBcd(v, ph.it, 5);
    }
    const pending = this._phFlags();
    if (pending && !this.awake) { this.awake = true; this._snapshot(); return true; }
    return false;
  }

  /** Persistable clock-chip state (hex strings), see loadTimerState(). */
  timerState() {
    const hex = (r) => Array.from(r).reverse().map((d) => d.toString(16)).join('');
    const ph = this.ph;
    return { status: ph.status, sel: ph.timerSel, a: hex(ph.clock[0]), b: hex(ph.clock[1]),
      aa: hex(ph.alarm[0]), ab: hex(ph.alarm[1]), sa: hex(ph.scratch[0]), sb: hex(ph.scratch[1]),
      it: hex(ph.it), itTc: hex(ph.itTc), af: hex(ph.af) };
  }

  loadTimerState(o) {
    const unhex = (str, r) => { for (let i = 0; i < r.length; i++) r[i] = parseInt(str[str.length - 1 - i] || '0', 16) & 0xf; };
    const ph = this.ph;
    ph.status = o.status | 0; ph.timerSel = o.sel ? 1 : 0;
    unhex(o.a, ph.clock[0]); unhex(o.b, ph.clock[1]); unhex(o.aa, ph.alarm[0]); unhex(o.ab, ph.alarm[1]);
    unhex(o.sa, ph.scratch[0]); unhex(o.sb, ph.scratch[1]); unhex(o.it, ph.it); unhex(o.itTc, ph.itTc); unhex(o.af, ph.af);
    this._phFlags();
  }

  _readRegN(n) {
    this.c.fill(0);
    if (n !== 0) this.ramAddr = (this.ramAddr & ~0x0f) | n;
    const addr = this.ramAddr;
    this._pfRead(n);
    if (this.ramExists[addr]) {
      const base = addr * WSIZE;
      for (let i = 0; i < WSIZE; i++) this.c[i] = this.ram[base + i];
    }
  }

  _writeRegN(n) {
    this.ramAddr = (this.ramAddr & ~0x0f) | n;
    const addr = this.ramAddr;
    this._pfWriteN(n);
    if (this.ramExists[addr]) {
      const base = addr * WSIZE;
      for (let i = 0; i < WSIZE; i++) this.ram[base + i] = this.c[i];
    }
  }

  _cToData() {
    const addr = this.ramAddr;
    if (this.pfAddr === PF_LCD) this.ann = (this.c[2] << 8) | (this.c[1] << 4) | this.c[0];
    if (this.ramExists[addr]) {
      const base = addr * WSIZE;
      for (let i = 0; i < WSIZE; i++) this.ram[base + i] = this.c[i];
    }
  }

  // ---------- execution ----------

  step() {
    // per-cycle hardware events
    if (this.kbState === KB_WAIT_CYC && --this.kbDebounce === 0) {
      if (this.keyDown) { this.kbState = KB_PRESSED; this.awake = true; }
      else this.kbState = KB_IDLE;
    }
    if (this.dispCount === 0) this._snapshot(); else this.dispCount--;

    if (!this.awake) return false;

    this.prevPc = this.instState === ST_CXISA ? this.cxisaAddr : this.pc;
    const op = this.fetch(this.prevPc);
    this.prevCarry = this.carry;
    this.carry = 0;

    switch (this.instState) {
      case ST_NORMAL:
        this.pc = (this.pc + 1) & 0xffff;
        this.ops[op](op);
        break;
      case ST_LONG: {
        this.pc = (this.pc + 1) & 0xffff;
        this.instState = ST_NORMAL;
        const target = (this.firstWord >> 2) | ((op & 0x3fc) << 6);
        if ((op & 1) === this.prevCarry) {
          if (op & 2) this.pc = target;
          else {
            this._push(this.pc);
            this.pc = target;
            if (this.fetch(this.pc) === 0) this.pc = this._pop();
          }
        }
        break;
      }
      case ST_CXISA:
        this.c[2] = op >> 8; this.c[1] = (op >> 4) & 0xf; this.c[0] = op & 0xf;
        this.instState = ST_NORMAL;
        break;
      case ST_LDI:
        this.pc = (this.pc + 1) & 0xffff;
        this.c[2] = op >> 8; this.c[1] = (op >> 4) & 0xf; this.c[0] = op & 0xf;
        this.instState = ST_NORMAL;
        break;
      case ST_SELPF:
        this.pc = (this.pc + 1) & 0xffff;
        // no smart peripherals are installed: flag is always false
        if ((op & 0x3f) === 0x03) this.carry = 0;
        if (op & 1) this.instState = ST_NORMAL;
        break;
    }
    this.cycles++;
    return true;
  }

  /** Run up to n cycles; returns number executed (stops early on sleep). */
  run(n) {
    let i = 0;
    while (i < n && this.awake) { this.step(); i++; }
    return i;
  }

  /** Disassembly-free state dump for debugging. */
  dump() {
    const hex = (r) => Array.from(r).reverse().map((d) => d.toString(16)).join('');
    return `pc=${this.pc.toString(16).padStart(4, '0')} A=${hex(this.a)} B=${hex(this.b)} C=${hex(this.c)} ` +
           `M=${hex(this.m)} N=${hex(this.n)} P=${this.p} Q=${this.q} carry=${this.carry} dec=${this.decimal ? 1 : 0}`;
  }
}

Nut41.KEYS = {
  ON: 0x18,
};

const api = { Nut41, KB: { KB_IDLE, KB_PRESSED, KB_RELEASED, KB_WAIT_CHK, KB_WAIT_CYC } };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Nut = api;

})(typeof window !== 'undefined' ? window : globalThis);
