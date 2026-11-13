// Writes the PWA icons into public/: a white ring on the accent (#b23809), drawn
// pixel by pixel so no image tool is needed. Run once; the PNGs are committed.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const ACCENT = [0xb2, 0x38, 0x09];
const WHITE = [0xff, 0xff, 0xff];

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
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** `scale`: the ring's outer radius as a share of half the size (smaller for maskable, to stay in the safe zone). */
function icon(size, scale) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const c = size / 2;
  const outer = c * scale;
  const inner = outer * 0.62;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const [r, g, b] = d <= outer && d >= inner ? WHITE : ACCENT;
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.resolve(import.meta.dirname, '..', 'public');
writeFileSync(path.join(out, 'icon-192.png'), icon(192, 0.62));
writeFileSync(path.join(out, 'icon-512.png'), icon(512, 0.62));
writeFileSync(path.join(out, 'icon-maskable-512.png'), icon(512, 0.5));
