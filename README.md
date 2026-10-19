# HP-41 emulator (web)

A browser emulator of the HP-41C/CV/CX. It runs **real HP firmware**: the Nut CPU is emulated
instruction by instruction, together with the LCD driver, keyboard scanner, RAM and ROM paging, so
the calculator behaves like the original (including `MEMORY LOST`, the `NULL` cancel on long key
holds, `ALPHA` mode and the comma/period/colon punctuation).

The six 41CX system ROMs (`roms/`: `NUT0-N`, `NUT1-F`, `NUT2-L`, `XFNS3-3B`, `TIME-3B`, `XFNS5-2D`)
are included; tap *Use built-in 41CX ROMs*. Other ROM modules are not included: add your own
`.ROM` or `.MOD` files with *Load other ROM/MOD files…* (or drag and drop). Those are read locally,
stored in the browser's IndexedDB, and never uploaded.

## Run it

**Web page (PC, Mac, Linux, Chromebook, phone):** <https://idex-maker.github.io/HP-41C/>

Open the link, expand **ROMs & setup**, and tap **Use built-in 41CX ROMs**. The calculator powers
on showing `MEMORY LOST` the first time; after that it remembers its memory and on/off state.
Works in current Chrome, Edge, Firefox and Safari. Everything runs in your browser; nothing is
sent to a server.

### Install on a Google Pixel (or any Android phone)
Full walkthrough with troubleshooting: **[docs/INSTALL-PIXEL.md](docs/INSTALL-PIXEL.md)**. Short version:

1. Open <https://idex-maker.github.io/HP-41C/> in **Chrome**.
2. Tap the **⋮** menu, then **Install app** (some versions say **Add to Home screen**), then **Install**.
3. Open **HP-41** from the home screen. It runs full-screen and works offline.
4. First launch only: open **ROMs & setup** and tap **Use built-in 41CX ROMs**.

To add other ROM modules, tap **Load other ROM/MOD files…** and pick the files from the phone's
storage (copy them over via Google Drive or USB first). Rotate the phone to portrait; the keys are
sized for touch.

### Install on a PC or Mac (optional, gives it its own window)
Open the link in **Chrome or Edge** and click the install icon at the right end of the address bar
(or menu → *Install HP-41* / *Apps → Install this site as an app*). Safari on macOS: *File → Add to Dock*.
iPhone/iPad: open it in Safari, tap *Share → Add to Home Screen*.

### Run your own copy locally
The page needs a web server (browsers block key features from `file://`):
```
git clone https://github.com/IDEX-maker/HP-41C.git
cd HP-41C
python -m http.server 8000        # use python3 on Mac/Linux
```
Then open <http://localhost:8000/>.

### Good to know
- Your memory, programs and loaded ROMs are stored **per browser, per device**. Clearing the
  site's data (or "Clear memory" in the app) erases them. Phone and PC do not share memory.
- After an update is published, reload the page once or twice to pick up the new version.
- Keys follow the real 41 timing, so tap keys briefly; holding a function key about a second
  shows its name, and holding longer cancels it with `NULL`, like the real calculator.
- Troubleshooting: if the screen stays blank, press **ON**; if it says it can't load ROMs,
  check your connection once (the app caches itself for offline use after the first visit).

## ROM notice
HP-41 ROM images are **most likely still protected by copyright**, both HP's firmware and the
third-party modules. The four OS ROMs in `roms/` and `rom_files_260929.zip` come from the ROM set
published at <https://www.systemyde.com/hp41/files.html>; that page states no licence or
public-domain status. The maintainer treats them as public domain, but that is unverified and is
not legal advice. (Community `.MOD` files such as the 41CX one used by Nonpareil are labelled
"public domain", but that label is not an authoritative release.) Check the rules where you live and
use them at your own risk. If a rights holder objects, they will be removed.

## Using it
Other ROM modules (Math Pac, Stat Pac, Finance, PPC ROM, …) go into the port pages 8–F; the
page/bank of each file can be changed in the table. System ROMs (`NUT0*`–`NUT2*`, `XFNS3*`,
`TIME-*`, `XFNS5*`) are placed automatically. `.MOD` files bring their own page and bank settings.
Tested on the real firmware: Math Pac (`1 SINH` = 1.1752), Stat Pac, Finance and the two-page PPC ROM
are recognised in `CATALOG 2`, alone and together.

### Programs (.RAW files)
- **Import program (.RAW)…** inserts the programs of a `.RAW` file after the programs already in the
  calculator (an unfinished program is closed with an `END` first). Several programs separated by
  `END` are fine. Key assignments stored in a label are cleared.
- **Export programs (.RAW)** saves everything in program memory as `hp41-programs.raw`.
- `.RAW` is the plain program memory extract (no header) used by V41, Emu41/42 and `rom2raw`.
  Only standard HP-41 byte codes are accepted; files that use synthetic byte `1F` are refused with an
  error message. Programs that do not fit in free memory are refused.
- Import and export were verified on the real firmware: a program typed on one emulated calculator
  was exported, imported into a fresh one, and gave identical results.

### Time module
The 41CX clock runs in real time (also while the calculator is off or the page is closed), keeps its
setting between visits. `TIME` and `DATE` were verified on the real firmware, and the alarm, wake-up and
interval-timer logic of the clock chip is unit-tested (`tools/chiptest.js`); the other Time module
functions use the same chip but have not each been tried. An alarm wakes the calculator while the page
is open; a closed page cannot beep.

- Memory (registers and programs) is kept between visits, like Continuous Memory.
- ALPHA letters follow the real keyboard (`N` is on `ENTER↑`, `O` on `CHS`, `P` on `EEX`).
- Physical keyboard: digits, `+ - * /`, `Enter`, `Backspace`, `f`/`Shift` = gold shift, `x s r` = XEQ STO RCL,
  `Space` = R/S, `a`/`p`/`u` = ALPHA/PRGM/USER, `Esc` = ON. In ALPHA mode, letters type letters.
- Speed 1× is the original ~6,700 instructions/s; faster settings keep key timing realistic.

## Files
| File | Purpose |
|---|---|
| `nut.js` | Nut CPU + HP-41 hardware (no DOM, works in Node and browsers) |
| `raw.js` | `.RAW` program import/export (program memory format) |
| `mod.js` | `.MOD` module file reader |
| `chargen.js` | LCD character generator (generated by `tools/genchargen.js`) |
| `app.js`, `index.html` | UI: faceplate, 14-segment display, ROM manager, sound, persistence |
| `tools/` | Node scripts for headless testing and ROM analysis (below) |

Headless tests (Node 18+, using the ROMs in `roms/`; `ROM_DIR` and `EXTRA_ROM_DIR` can point elsewhere):
```
node tools/rawtest.js     # .RAW export/import round trip on the real firmware
node tools/chiptest.js    # clock chip: alarm, wake-up, interval timer
node tools/timetest.js roms   # TIME / DATE through the firmware
node tools/modtest.js     # extra ROM modules (needs the larger ROM collection)
node tools/keys.js <romDir> "1 2 ENTER 3 +"   # prints 15.0000
node tools/modinfo.js file.mod [romDir]       # list the pages of a .MOD file
```

## Not implemented yet
Printer, HP-IL, card reader and bar-code wand peripherals, and write-enabled RAM modules
(HEPAX/MLDL; such pages in a `.MOD` file are skipped).

## Android
The app is plain client-side JavaScript with touch-friendly keys, so it can be wrapped as an
installable PWA or with Capacitor without code changes.

## Credits
Instruction behaviour and LCD/keyboard details were checked against the published source of
[Nonpareil](https://github.com/brouhaha/nonpareil) (Eric Smith). This is an independent
JavaScript implementation, released under the MIT licence (see `LICENSE`), which covers the source
code only. The ROM images (`roms/`, the zip) are not covered by it; see the ROM notice.
