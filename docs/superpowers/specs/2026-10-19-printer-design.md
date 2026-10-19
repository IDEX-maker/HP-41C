# HP 82143A printer emulation - design

## Intent
Let the emulated HP-41 print: `PRINT`, `PRX`, `PRA`, `LIST`, `ADV`, `PRP`, TRACE/NORM/MAN mode, as with a
real HP 82143A. The user chooses where the output goes.

## Goals
- The firmware believes a 82143A is attached (printer ROM page plus printer hardware on the peripheral
  bus), so the real printer functions run unchanged.
- Output is always rendered on an on-screen paper strip in the 5x7 printer dot font (24 columns).
- The user picks the destination in a setting that is remembered between visits:
  1. On-screen paper only (default).
  2. Print: the browser print dialog (PC printers; on Android, Wi-Fi printers via Android print service).
  3. Save as PDF (same print dialog, "Save as PDF").
  4. Collect vs. print immediately: batch is the default, with a **Print tape** button and a **Clear
     tape** button; "print immediately" opens the dialog when a print/ADV finishes.
- Works offline, in the PWA, and on Android, with no server and no native helper.

## Non-goals
- Silent printing to a chosen printer (browsers forbid it; a dialog each time is accepted).
- Other peripherals (HP-IL, card reader, wand), the 82143A's battery/paper-feed noise, graphics (`PRBUF`
  of graphic data beyond what the ROM sends) beyond plain dot-column rendering.

## Constraints / decisions
- Printer firmware ROM: `PRINTER.ROM` (8192 bytes, in the user's ROM collection and `rom_files_260929.zip`).
  Bundled like the other HP ROMs in `roms/`; same copyright note as the README already carries.
- Hardware model written in `printer.js`, hooked into `nut.js` peripheral select (`pfAddr`), the
  `ST_SELPF` flag test (currently hard-wired false) and the ext/service-request flags.
  The register-level protocol is derived by disassembling PRINTER.ROM (`tools/dis.js`) and checked against
  real firmware behaviour, not guessed.
- Memory-config independent: works with 41C/CV/CX.
- UI in `app.js` / `index.html`: paper strip panel, destination setting, buttons; print via a print-only
  CSS stylesheet and `window.print()`.
- Service worker cache list updated for new files.

## Left to the builder
Exact tape layout, fonts/dot size, print stylesheet details, how the printer hardware registers are
modelled once the ROM has been disassembled.

## Verification
Node tests in `tools/` (like `rawtest.js`): run `PRX`, `PRA`, `LIST`, `ADV` and TRACE mode on the real
firmware and compare the printed tape; plus a manual browser check of print/PDF.
