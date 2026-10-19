// HP 82143A printer, as seen from the HP-41 bus. Protocol notes: docs/printer-protocol.md.
(function () {
  'use strict';
  const LINE_WIDTH = 24;
  const TRAP_PCS = [0x6d5c, 0x6d27];                       // printer-ready wait and its result check
  const NUMERIC_TAIL = [0x0a4, 0x02a, 0x02a, 0x02a];        // sent before 0x1E8 at the end of a PRX line

  class Hp82143a {
    constructor() { this.onLine = null; this.reset(); }

    reset() { this.words = []; }

    /** Peripheral flags: 0 busy, 1 on, 2 ready. */
    flag(idx) { return idx === 1 || idx === 2; }

    /** One 12-bit word sent with PERTCT 9 / 0x007. */
    write(word) {
      const lo = word & 0xff;
      if (word === 0x1e8) {
        const w = this.words, n = NUMERIC_TAIL.length;
        if (w.length >= n && NUMERIC_TAIL.every((x, i) => w[w.length - n + i] === x)) w.length -= n;
        this._print();
      } else if (lo === 0xe0) this._print();
      else if (lo === 0xe8) { this._print(); this._emit(''); }
      else this.words.push(word);                         // characters, and controls such as SKPCHR (0xA0)
    }

    _print() {
      if (!this.words.some((w) => (w & 0xff) < 0xa0)) { this.words = []; return; }
      const text = this.words.filter((w) => (w & 0xff) < 0xa0).map((w) => glyph(w & 0xff)).join('').slice(0, LINE_WIDTH);
      this.words = [];
      this._emit(text);
    }

    _emit(text) { if (this.onLine) this.onLine({ text }); }

    /** Connect to a CPU if the ROM in page 6 is the known printer ROM; returns whether it did. */
    attach(cpu) {
      if (cpu.fetch(0x6000) !== 0x01d || cpu.fetch(0x6d5c) !== 0x398 || cpu.fetch(0x6d27) !== 0x24c) return false;
      cpu.printer = this; cpu.setTraps(TRAP_PCS);
      return true;
    }

    detach(cpu) { cpu.printer = null; cpu.setTraps([]); }
  }

  function glyph(code) { return code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : '·'; }

  const api = { Hp82143a, LINE_WIDTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Printer = api;
})();
