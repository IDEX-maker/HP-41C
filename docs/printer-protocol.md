# HP 82143A printer: what the ROM does on the bus

Derived by running the real `PRINTER.ROM` (page 6) and logging every peripheral access (`cpu.onPf` hook in
`nut.js`), plus the HP-41 hardware notes in `hp41-inside.pdf`. This is observation, not a datasheet: where it is
a guess it says so.

## Peripheral
- The printer is peripheral **9**: `PERTCT 9` (opcode `0x264`) followed by one word the peripheral interprets.
- It does not use `C=>PERIPH ADDR` / `READ n` / `WRITE n`; those only touch the LCD, RAM and the clock.

## Words after `PERTCT 9`
| Word | Meaning |
|------|---------|
| `0x003` / `0x043` / `0x083` | Test peripheral flag 0 / 1 / 2; result goes to carry. |
| `0x007` | Transmit C[2:0] (a 12-bit word) to the printer. |
| `0x03a` + `0x005` | A two-word command the ROM sends while waiting for the printer; ignored here. |

Flag meaning, found by trying all combinations on `PRX`, `ADV`, `PRSTK`, `PRFLAGS`: flag 0 = printer busy
(the ROM waits while it is set), flag 1 = printer present and on (clear gives `PRINTER OFF`), flag 2 =
ready; `ADV` does nothing unless it is set. The model returns `busy=0, on=1, ready=1`.

## Transmitted words (c[2:0])
Low byte = what matters; the top nibble carries extra bits whose meaning is not known and is ignored.
- `0xE0`: print the buffered line (also sent once at the start of a print, when the buffer is empty).
- `0xE8` (`0x0E8`): advance the paper (`ADV`).
- `0x1E8` ends a numeric line: `PRX` sends `A4 2A 2A 2A 1E8` after the digits; those five words are dropped
  and the line is printed.
- `0xA0`: `SKPCHR`; ignored.
- Anything below `0xA0`: a character, the HP-41 alpha code (ASCII for `0x20..0x7E`).
Example, `1.5 PRX`: `E0 820 231 02E 235 230 230 230 A4 2A 2A 2A 1E8` prints ` 1.5000`. `PRSTK` sends four
lines `T=`, `Z=`, `Y=`, `X=` each ended by `E0`.

## Handshake routines skipped
The ROM waits for the printer to answer a status sequence before every line (routine at `0x6D5C`) and checks
the result afterwards (`0x6D27`). The real printer's answers are not modelled, so the CPU executes both
addresses as `RTN` (`Nut41.setTraps`). Without this the second line of `PRSTK`/`PRFLAGS` fails with
`PRINTER OFF`. The traps are installed only when the ROM in page 6 has the expected words at those addresses
(`Hp82143a.attach` checks), so another module in page 6 is never patched.
