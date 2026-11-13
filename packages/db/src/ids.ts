import { randomBytes } from 'node:crypto';

let lastMs = 0;
let seq = 0;

/**
 * A UUIDv7 (RFC 9562): 48-bit Unix milliseconds, then a 12-bit sequence in
 * rand_a so ids made in the same millisecond still sort in creation order,
 * then 62 random bits. Ids sort by time, so b-tree inserts stay local.
 */
export function uuidv7(): string {
  const now = Date.now();
  if (now > lastMs) {
    lastMs = now;
    seq = randomBytes(2).readUInt16BE() & 0x7ff; // random start, leaving room to count up
  } else if (++seq > 0xfff) {
    lastMs++; // sequence exhausted (or the clock went back): borrow the next millisecond
    seq = 0;
  }
  const b = randomBytes(16);
  b.writeUIntBE(lastMs, 0, 6);
  b[6] = 0x70 | (seq >> 8);
  b[7] = seq & 0xff;
  b[8] = 0x80 | (b[8]! & 0x3f);
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
