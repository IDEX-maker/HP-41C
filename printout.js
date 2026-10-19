// Decides when the printer tape is sent to the browser print dialog.
(function () {
  'use strict';
  /** dest: 'screen' | 'print' | 'pdf'; mode: 'collect' | 'immediate'; event: 'line' | 'adv' | 'manual'. */
  function shouldPrintNow(dest, mode, event) {
    if (dest === 'screen') return false;
    return event === 'manual' || (mode === 'immediate' && event === 'adv');
  }

  const api = { shouldPrintNow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Printout = api;
})();
