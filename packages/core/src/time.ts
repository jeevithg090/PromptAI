/**
 * Timestamps as plain arithmetic. Core reads no clock (src/ never names the
 * Date global), so the caller passes "now" as an ISO 8601 string and rows carry
 * ISO strings too.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

const DAY_MS = 86_400_000;

/** Days from 1970-01-01 to a proleptic Gregorian date (Hinnant's days_from_civil). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Milliseconds since the Unix epoch for an ISO 8601 date or date-time (no zone means UTC), or NaN. */
export function isoMs(s: string): number {
  const m = ISO.exec(s.trim());
  if (!m) return NaN;
  const [y, mo, d, h = 0, mi = 0, sec = 0] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => (x === undefined ? undefined : Number(x))) as number[];
  if (mo! < 1 || mo! > 12 || d! < 1 || d! > 31 || h > 23 || mi > 59 || sec > 60) return NaN;
  const frac = m[7] ? Math.round(Number(`0${m[7]}`) * 1000) : 0;
  let offset = 0;
  if (m[8] && m[8].toUpperCase() !== 'Z') {
    const z = /^([+-])(\d{2}):?(\d{2})$/.exec(m[8])!;
    offset = (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3])) * 60_000;
  }
  return daysFromCivil(y!, mo!, d!) * DAY_MS + h * 3_600_000 + mi * 60_000 + sec * 1000 + frac - offset;
}

/** Age in days of `at` relative to `now` (both ISO); NaN if either is invalid, 0 for a row from the future. */
export function ageDays(at: string, now: string): number {
  const a = isoMs(at), n = isoMs(now);
  return Number.isNaN(a) || Number.isNaN(n) ? NaN : Math.max(0, (n - a) / DAY_MS);
}
