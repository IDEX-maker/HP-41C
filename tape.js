// The printer paper: a capped list of text lines, drawn in the 5x7 dot font.
(function () {
  'use strict';
  const MAX_LINES = 5000, COLUMNS = 24, CELL_W = 6, CELL_H = 9;     // 5x7 dots plus one dot of spacing

  class Tape {
    constructor(max = MAX_LINES) { this.max = max; this.lines = []; }
    add(line) { this.lines.push(line); if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max); }
    clear() { this.lines = []; }
    get length() { return this.lines.length; }
  }

  /** Draw the whole tape on a canvas: 24 columns wide, one 9-dot row per line. */
  function renderTape(tape, canvas, scale = 2, ink = '#2b2b2b') {
    const glyph = (typeof require === 'function' ? require('./printfont.js') : window.PrintFont).glyph;
    canvas.width = COLUMNS * CELL_W * scale; canvas.height = tape.length * CELL_H * scale;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = ink;
    tape.lines.forEach((line, row) => {
      [...line.text].slice(0, COLUMNS).forEach((ch, col) => {
        glyph(ch).forEach((bits, dx) => {
          for (let dy = 0; dy < 7; dy++) {
            if (!(bits >> dy & 1)) continue;
            ctx.beginPath(); ctx.arc((col * CELL_W + dx + 0.5) * scale, (row * CELL_H + dy + 0.5) * scale, scale * 0.45, 0, 2 * Math.PI); ctx.fill();
          }
        });
      });
    });
  }

  const api = { Tape, renderTape, COLUMNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.TapeLib = api;
})();
