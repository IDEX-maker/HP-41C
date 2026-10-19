# Installing the HP-41 emulator on a Google Pixel

Detailed steps for a Pixel (or any Android phone) using Chrome. No Android Studio or Play Store
listing is needed: the app installs straight from the web as a Progressive Web App (PWA).

App address: **https://idex-maker.github.io/HP-41C/**

## Before you start
- Use **Chrome**. Other browsers can run the page, but Chrome offers the cleanest install.
- Be online for the first visit. After that the app works offline.
- Optional: keep any extra `.ROM` files on the phone if you want modules beyond the four built-in
  OS ROMs. The built-in ones need no files.

## Step 1: open the app
1. Open **Chrome** on the Pixel.
2. Go to **https://idex-maker.github.io/HP-41C/**
3. You should see the dark HP-41 calculator. The display says it needs ROMs, and a
   **ROMs & setup** panel is below it.

## Step 2: install it
1. Tap the **⋮** menu at the top right of Chrome.
2. Tap **Install app**. Some versions say **Add to Home screen**, which is the same thing.
3. Tap **Install** in the confirmation box.
4. An **HP-41** icon appears on the home screen or in the app drawer (swipe up if you don't see it).

If neither menu entry appears:
- Reload the page once and wait a few seconds. Chrome offers installation only after the app has
  loaded fully.
- Make sure you opened it in Chrome itself, not inside another app (Gmail, Drive, a messenger).
  Use "Open in Chrome" if offered.
- Don't use an Incognito tab; it doesn't offer installs.

## Step 3: first launch
1. Tap the **HP-41** icon. It opens full-screen without browser bars.
2. Tap **ROMs & setup** to expand it.
3. Tap **Use built-in 41CX ROMs** (this includes the clock, so `TIME` and `DATE` work).
4. The calculator starts and shows `MEMORY LOST` the first time. That is normal for a cold start.
5. Press any key. Try `1 2 ENTER↑ 3 +`; it should show `15.0000`.

## Step 4: using it
- Tap keys briefly. Holding a function key for about a second shows its name; holding longer
  cancels it with `NULL`, like the real calculator.
- Gold labels above the keys are the shifted functions: press the gold key first.
- The small blue letters are for **ALPHA** mode: press **ALPHA** first.
- **ON** turns the calculator off and on. Memory and the on/off state are saved between sessions.
- **ROMs & setup** also lets you change the speed, or choose 41C / 41CV / 41CX memory.

## Set the time and date
The clock keeps running while the app is closed and remembers its setting. It uses the clock of the device
you run it on, so set it once on each device (a phone and a PC do not share it). These steps were tested on
the emulated 41CX firmware.

**Time.** Enter the time as `HH.MMSS` in 24-hour form, then run `SETIME`:
1. Type `1 0 . 3 0 0 0` for 10:30:00 (for 1:45 PM type `13.4500`).
2. Press `XEQ`, press `ALPHA`, type `S E T I M E`, press `ALPHA` again.
3. Check it with `XEQ` `ALPHA` `T I M E` `ALPHA`: it shows `10:30:02 AM`.

**Date.** Enter the date as `MM.DDYYYY`, then run `SETDATE`:
1. Type `1 0 . 1 9 2 0 2 6` for 19 October 2026.
2. Press `XEQ`, press `ALPHA`, type `S E T D A T E`, press `ALPHA` again.
3. Check it with `XEQ` `ALPHA` `D A T E` `ALPHA`: it shows `10/19/2026` and the weekday (cut off, e.g. `:MO` for Monday).

In ALPHA mode you type the blue letters on the keys (for example `S` is on the `8` key, `E` on `LN`, `T` on
`9`, `I` on `COS`, `M` on `RCL`). Digits typed in ALPHA mode need `SHIFT` first.

`CLOCK` shows a live clock (any key stops it); `TIME` and `DATE` show the current values.
If you get `DATA ERROR`, the number was not a valid `HH.MMSS` or `MM.DDYYYY` value; enter it again.

## Optional: import and export programs
- **Import program (.RAW)…** loads a `.RAW` program file from the phone's storage into the calculator's
  program memory. Afterwards run it with `XEQ`, `ALPHA` (label name) `ALPHA`, or press `R/S`.
- **Export programs (.RAW)** saves your programs as `hp41-programs.raw` in the phone's Downloads, so you
  can back them up or move them to a PC.

## Optional: add other ROM modules
1. Copy `.ROM` or `.MOD` files to the phone, for example through Google Drive or USB.
2. In the app open **ROMs & setup** and tap **Load other ROM/MOD files…**.
3. Pick the files. Each gets a page number, which you can change in the table.

Please read the ROM notice in the main [README](../README.md#rom-notice) about the copyright status
of ROM images.

## Updating and troubleshooting
- **Updates:** after a new version is published, open the app twice. The first open fetches the
  update, the second runs it.
- **Blank screen:** press **ON**.
- **Lost memory:** clearing Chrome's site data, or choosing **Clear memory**, erases it. A phone and
  a PC do not share memory.
- **Uninstall:** long-press the icon and choose **Uninstall**. This also removes the stored ROMs
  and memory.
