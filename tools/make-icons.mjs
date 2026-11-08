// Generates the app icons (PNG + SVG) with no dependencies: node tools/make-icons.mjs
// Design: three "name tags" (as in the app's roster) on the app's dark ink color,
// each with one of the app's accent dots.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = [0x22, 0x26, 0x1f];
const PAPER = [0xf7, 0xf6, 0xef];
const DOTS = [[0xe2, 0x54, 0x2d], [0x2f, 0x6e, 0x62], [0xc0, 0x91, 0x2e]];

// All geometry is in a 100x100 design space. `scale` shrinks the artwork toward the
// center (used for the maskable icon, which needs a safe zone), `round` is the corner radius
// of the background (0 = full-bleed square).
function shapes(scale) {
  const out = [];
  const t = (v) => 50 + (v - 50) * scale;
  const s = (v) => v * scale;
  for (let i = 0; i < 3; i++) {
    const y = 24 + i * 20;
    out.push({ kind: 'rrect', x: t(20), y: t(y), w: s(60), h: s(14), r: s(3), color: PAPER });
    out.push({ kind: 'circle', cx: t(29), cy: t(y + 7), r: s(3.6), color: DOTS[i] });
    out.push({ kind: 'rrect', x: t(38), y: t(y + 5), w: s(i === 1 ? 28 : i === 2 ? 34 : 22), h: s(4), r: s(2), color: [0xc9, 0xc7, 0xb8] });
  }
  return out;
}

function inside(sh, px, py) {
  if (sh.kind === 'circle') return (px - sh.cx) ** 2 + (py - sh.cy) ** 2 <= sh.r ** 2;
  const { x, y, w, h, r } = sh;
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function render(size, { scale = 1, bgRadius = 0 } = {}) {
  const list = shapes(scale);
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 100;
          const y = ((py + (sy + 0.5) / SS) / size) * 100;
          let col = null;
          if (bgRadius === 0 || inside({ kind: 'rrect', x: 0, y: 0, w: 100, h: 100, r: bgRadius }, x, y)) col = INK;
          for (const sh of list) if (inside(sh, x, y)) col = sh.color;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
        }
      }
      const n = SS * SS, o = (py * size + px) * 4;
      buf[o] = a ? Math.round(r / a) : 0;
      buf[o + 1] = a ? Math.round(g / a) : 0;
      buf[o + 2] = a ? Math.round(b / a) : 0;
      buf[o + 3] = Math.round((a / n) * 255);
    }
  }
  return buf;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../docs/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
const save = (name, size, opts) => writeFileSync(new URL(name, dir), png(size, render(size, opts)));

save('icon-192.png', 192, { bgRadius: 20 });
save('icon-512.png', 512, { bgRadius: 20 });
// Maskable: full-bleed background, artwork inside the central safe zone.
save('icon-maskable-512.png', 512, { scale: 0.74 });
// iOS applies its own rounding, so the touch icon is a full-bleed square.
save('apple-touch-icon.png', 180, { scale: 0.9 });

const svgShapes = shapes(1).map((sh) => {
  const c = `rgb(${sh.color.join(',')})`;
  return sh.kind === 'circle'
    ? `<circle cx="${sh.cx}" cy="${sh.cy}" r="${sh.r}" fill="${c}"/>`
    : `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" rx="${sh.r}" fill="${c}"/>`;
}).join('\n  ');
writeFileSync(new URL('icon.svg', dir),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <rect width="100" height="100" rx="20" fill="rgb(${INK.join(',')})"/>\n  ${svgShapes}\n</svg>\n`);
console.log('icons written');
