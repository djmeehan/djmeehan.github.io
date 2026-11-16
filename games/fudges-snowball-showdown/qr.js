// A small QR code encoder (byte mode, error correction L or M, versions 1-25), written for this game so no third-party script is needed.
// QR.encode(text) -> { size, version, mask, ecl, get(x, y) }   QR.draw(canvas, text, cellPx) draws it with a quiet zone.
// Checked by test.js (capacities, structure, error-correction maths) and by decoding real renders with macOS's barcode reader.
(function (root) {
  'use strict';

  // Error-correction codewords per block, and number of blocks, by version (index = version).
  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28],
  };
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21],
  };
  const FORMAT_BITS = { L: 1, M: 0 };
  const MAX_VERSION = 25;

  const rawDataModules = ver => {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  };
  const dataCodewords = (ver, ecl) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  const byteCapacity = (ver, ecl) => Math.floor((dataCodewords(ver, ecl) * 8 - 4 - (ver < 10 ? 8 : 16)) / 8);

  // ---- Reed-Solomon over GF(256) ----
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
    }
    return result;
  }

  function utf8(text) {
    const out = [];
    for (const ch of unescape(encodeURIComponent(text))) out.push(ch.charCodeAt(0));
    return out;
  }

  function pickVersion(len, eclWanted) {
    const tries = eclWanted === 'auto' ? ['M', 'L'] : [eclWanted];
    for (const ecl of tries) {
      for (let v = 1; v <= MAX_VERSION; v++) {
        if (byteCapacity(v, ecl) >= len) return { version: v, ecl };
        if (eclWanted === 'auto' && ecl === 'M' && v >= 14) break;   // prefer the roomier L over a big M code
      }
    }
    throw new Error('text too long for a QR code here (' + len + ' bytes)');
  }

  function encode(text, opts) {
    const bytes = utf8(text);
    const { version, ecl } = pickVersion(bytes.length, (opts && opts.ecl) || 'auto');
    const size = version * 4 + 17;

    // data bits: mode 0100, character count, the bytes, terminator, padding
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0x4, 4);
    put(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    const capBits = dataCodewords(version, ecl) * 8;
    put(0, Math.min(4, capBits - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

    // error correction, interleaved across blocks
    const numBlocks = NUM_BLOCKS[ecl][version], eccLen = ECC_PER_BLOCK[ecl][version];
    const raw = Math.floor(rawDataModules(version) / 8);
    const numShort = numBlocks - (raw % numBlocks), shortLen = Math.floor(raw / numBlocks);
    const div = rsDivisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= numShort) all.push(blk[i]); });

    // the grid
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, dark) => { modules[y][x] = dark; isFn[y][x] = true; };
    const bit = (v, i) => ((v >>> i) & 1) !== 0;

    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = [];
    if (version > 1) {
      const n = Math.floor(version / 7) + 2, step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
      align.push(6);
      for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
    }
    for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = mask => {
      const d = (FORMAT_BITS[ecl] << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const f = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(f, i));
      setFn(8, 7, bit(f, 6)); setFn(8, 8, bit(f, 7)); setFn(7, 8, bit(f, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(f, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(f, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(f, i));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const v = (version << 12) | rem;
      for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); setFn(a, b, bit(v, i)); setFn(b, a, bit(v, i)); }
    }

    // data in the zigzag order
    for (let i = 0, right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < all.length * 8) { modules[y][x] = bit(all[i >>> 3], 7 - (i & 7)); i++; }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const runs = line => {
        let sc = 0, run = 1;
        for (let i = 1; i <= line.length; i++) {
          if (i < line.length && line[i] === line[i - 1]) run++; else { if (run >= 5) sc += 3 + (run - 5); run = 1; }
        }
        const s = line.map(v => (v ? 1 : 0)).join('');
        for (const pat of ['10111010000', '00001011101']) { let at = s.indexOf(pat); while (at >= 0) { sc += 40; at = s.indexOf(pat, at + 1); } }
        return sc;
      };
      for (let y = 0; y < size; y++) p += runs(modules[y]);
      for (let x = 0; x < size; x++) p += runs(modules.map(r => r[x]));
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = modules[y][x]; if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3; }
      for (const r of modules) for (const c of r) if (c) dark++;
      p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
      return p;
    };
    let bestMask = 0, bestPen = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const pen = penalty();
      if (pen < bestPen) { bestPen = pen; bestMask = m; }
      applyMask(m);
    }
    applyMask(bestMask); drawFormat(bestMask);
    return { size, version, mask: bestMask, ecl, modules, get: (x, y) => x >= 0 && y >= 0 && x < size && y < size && modules[y][x] };
  }

  function draw(canvas, text, cell, opts) {
    const qr = encode(text, opts);
    const quiet = 4, px = cell || 4, n = (qr.size + quiet * 2) * px;
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#000';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) ctx.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
    return qr;
  }

  const api = { encode, draw, byteCapacity, dataCodewords, rawDataModules, rsDivisor, rsRemainder, gfMul, MAX_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QR = api;
})(typeof window !== 'undefined' ? window : globalThis);
