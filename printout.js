// Decides when the printer tape is sent to the browser print dialog.
(function () {
  'use strict';
  /** dest: 'screen' | 'print' | 'pdf'; mode: 'collect' | 'immediate'; event: 'line' | 'adv' | 'manual'. */
  function shouldPrintNow(dest, mode, event) {
    if (dest === 'screen') return false;
    return event === 'manual' || (mode === 'immediate' && event === 'adv');
  }

  const ANN_ALPHA = 1, ANN_PRGM = 2, ANN_SHIFT = 128;
  const NUMBER = /^-?[0-9.,]+( -?[0-9]{1,2})?$/;          // e.g. 3.0000, -1.5000, 1.2345 -12

  /**
   * "Print each calculation": the paper line for the display the calculator settled on, or null.
   * Only a plain number is printed, right-aligned like PRX; prompts, digit entry (with "_"), messages,
   * ALPHA, PRGM and SHIFT are skipped. Not the real printer's TRACE/NORM output.
   */
  function calcLine(text, ann, width = 24) {
    if (ann & (ANN_ALPHA | ANN_PRGM | ANN_SHIFT)) return null;
    const t = text.trim().replace(/\s+/g, ' ');
    if (!NUMBER.test(t)) return null;
    return t.padStart(width);
  }

  const api = { shouldPrintNow, calcLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Printout = api;
})();
