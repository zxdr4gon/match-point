// Draws the app icons (a volt shuttlecock on court green) and writes them as PNGs.
// Run from the repo root: node tools/icons.js
const { mkdirSync, writeFileSync } = require("fs");
const zlib = require("zlib");

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (bytes) => {
  let c = -1;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const png = (size, pixel) => {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const at = y * (size * 4 + 1) + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

// The shape in a 0..1 square. inset shrinks it for maskable icons' safe zone.
const shape = (u, v, inset) => {
  const k = 1 - inset * 2;
  const x = (u - 0.5) / k + 0.5;
  const y = (v - 0.5) / k + 0.5;
  // Cork at the bottom.
  if (Math.hypot(x - 0.5, y - 0.7) < 0.11) return "cork";
  // Skirt: a trapezoid flaring upwards, with feather gaps.
  if (y > 0.2 && y < 0.64) {
    const t = (0.64 - y) / 0.44;
    const half = 0.08 + t * 0.2;
    const dx = Math.abs(x - 0.5);
    if (dx < half) {
      const ribs = Math.abs(((x - 0.5) / half) * 3.5) % 1;
      if (y < 0.26 || (ribs > 0.12 && ribs < 0.88) || y > 0.58) return "skirt";
      return "rib";
    }
  }
  return null;
};

const COLOURS = {
  bg: [8, 19, 15],
  court: [21, 90, 67],
  cork: [216, 255, 62],
  skirt: [241, 245, 238],
  rib: [180, 196, 186],
};

const draw = (size, { inset, rounded }) =>
  png(size, (px, py) => {
    const samples = 3;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const u = (px + (sx + 0.5) / samples) / size;
        const v = (py + (sy + 0.5) / samples) / size;
        // Rounded square for normal icons; full bleed for maskable.
        if (rounded) {
          const d = 0.22;
          const cx = Math.min(Math.max(u, d), 1 - d);
          const cy = Math.min(Math.max(v, d), 1 - d);
          if (Math.hypot(u - cx, v - cy) > d) continue;
        }
        const glow = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.55) / 0.62);
        let colour = COLOURS.bg.map((c, i) => c + (COLOURS.court[i] - c) * glow * 0.85);
        const part = shape(u, v, inset);
        if (part) colour = COLOURS[part];
        r += colour[0];
        g += colour[1];
        b += colour[2];
        a += 255;
      }
    }
    const n = samples * samples;
    return [r / n, g / n, b / n, a / n].map(Math.round);
  });

mkdirSync("icons", { recursive: true });
writeFileSync("icons/icon-192.png", draw(192, { inset: 0.08, rounded: true }));
writeFileSync("icons/icon-512.png", draw(512, { inset: 0.08, rounded: true }));
writeFileSync("icons/icon-maskable-512.png", draw(512, { inset: 0.2, rounded: false }));
writeFileSync("icons/apple-touch-icon.png", draw(180, { inset: 0.12, rounded: false }));
console.log("icons written");
