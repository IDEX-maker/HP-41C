'use strict';
/*
 * Reader for the MOD1 module file format (V41/Emu42 style) and the packed 5120-byte "BIN" page image.
 * Each ROM page is 4096 ten-bit words; 4 words are packed into 5 bytes.
 */
(function (root) {

const HEADER = 729, PAGE = 5188;

function cstr(b, off, len) {
  let s = '';
  for (let i = 0; i < len && b[off + i]; i++) s += String.fromCharCode(b[off + i]);
  return s;
}

/** Unpack a 5120-byte packed image into 4096 ten-bit words. */
function unpackImage(b, off) {
  const w = new Uint16Array(4096);
  for (let i = 0, o = off; i < 4096; i += 4, o += 5) {
    const b0 = b[o], b1 = b[o + 1], b2 = b[o + 2], b3 = b[o + 3], b4 = b[o + 4];
    w[i] = b0 | ((b1 & 0x03) << 8);
    w[i + 1] = (b1 >> 2) | ((b2 & 0x0f) << 6);
    w[i + 2] = (b2 >> 4) | ((b3 & 0x3f) << 4);
    w[i + 3] = (b3 >> 6) | (b4 << 2);
  }
  return w;
}

/** Parse a .MOD file; returns null when it is not a valid MOD1 file. */
function parseMod(b) {
  if (b.length < HEADER || cstr(b, 0, 5) !== 'MOD1') return null;
  const n = b[HEADER - 33 - 0 + 0 - 0] === undefined ? 0 : b[696];   // NumPages
  if ((b.length - HEADER) % PAGE !== 0 || (b.length - HEADER) / PAGE !== n) return null;
  const mod = {
    title: cstr(b, 5, 50), version: cstr(b, 55, 10), partNumber: cstr(b, 65, 20), author: cstr(b, 85, 50),
    copyright: cstr(b, 135, 100), license: cstr(b, 235, 200), comments: cstr(b, 435, 255),
    category: b[690], hardware: b[691], memModules: b[692], xmemModules: b[693], pages: [],
  };
  for (let p = 0; p < n; p++) {
    const o = HEADER + p * PAGE;
    mod.pages.push({
      name: cstr(b, o, 20), id: cstr(b, o + 20, 9), page: b[o + 29], pageGroup: b[o + 30], bank: b[o + 31],
      bankGroup: b[o + 32], ram: b[o + 33] === 1, writeProtect: b[o + 34] === 1, fat: b[o + 35] === 1,
      words: unpackImage(b, o + 36),
    });
  }
  return mod;
}

const api = { parseMod, unpackImage };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Mod = api;
})(typeof window !== 'undefined' ? window : globalThis);
