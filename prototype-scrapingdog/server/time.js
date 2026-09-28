// Naive-UTC timestamps exactly as REF writes them (Python isoformat, microseconds, no zone).
import { ValueError } from './errors.js';
import { pyRound } from './engine/pycompat.js';

const pad = (n, width = 2) => String(n).padStart(width, '0');
function civil(ms) {
  const d = new Date(Number(ms));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T`
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
export function isoFromMicros(micros) {
  const seconds = micros >= 0n ? micros / 1000000n : (micros - 999999n) / 1000000n;
  const fraction = micros - seconds * 1000000n;
  const base = civil(seconds * 1000n);
  return fraction ? `${base}.${String(fraction).padStart(6, '0')}` : base;
}
export const utcnowIso = (clock = Date.now) => isoFromMicros(BigInt(clock()) * 1000n);
function utcMillis(y, mo, d, h = 0, mi = 0, s = 0) {
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, 0);
  return date.getTime();
}
export function toMicros(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(iso);
  if (!m) throw new ValueError(`not a naive isoformat timestamp: ${iso}`);
  return BigInt(utcMillis(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6])) * 1000n + BigInt((m[7] ?? '').padEnd(6, '0'));
}
export const addSeconds = (iso, seconds) => isoFromMicros(toMicros(iso) + BigInt(Math.round(seconds * 1e6)));

// ---- parse_ts (REF providers/export_file.py:18-37) ----
function valid(y, mo, d, h, mi, s) {
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  const probe = new Date(utcMillis(y, mo, d));
  return probe.getUTCDate() === d && probe.getUTCMonth() === mo - 1;
}
function build(y, mo, d, h, mi, s, fracDigits, offsetMinutes) {
  if (!valid(y, mo, d, h, mi, s)) return null;
  const micros = BigInt(utcMillis(y, mo, d, h, mi, s)) * 1000n
    + BigInt((fracDigits ?? '').slice(0, 6).padEnd(6, '0'))
    - BigInt(offsetMinutes ?? 0) * 60000000n;
  return isoFromMicros(micros);
}
const OFFSET = '([+-])(\\d{2})(?::?(\\d{2}))?';
// Python 3.12 datetime.fromisoformat subset used by Instagram data: extended and basic dates, any single-character
// separator, hours[:minutes[:seconds[.fraction]]], and an optional +HH[:MM] offset ('Z' was already replaced).
const ISO_EXT = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})(?:[\\s\\S](\\d{2})(?::(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?)?(?:${OFFSET})?)?$`, 'u');
const ISO_BASIC = /^(\d{4})(\d{2})(\d{2})$/;
// strptime fallbacks (REF :24-30): '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'.
const STRP_TZ = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])T(2[0-3]|[01]\d|\d):([0-5]\d|\d):(6[01]|[0-5]\d|\d)([+-])(\d\d):?([0-5]\d)$/;
const STRP_SPACE = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9]) (2[0-3]|[01]\d|\d):([0-5]\d|\d):(6[01]|[0-5]\d|\d)$/;
const STRP_DATE = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])$/;

export function parseTs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') {
    const t = Number(value);
    const seconds = Math.floor(t);
    let micros = BigInt(pyRound((t - seconds) * 1e6, 0));
    return isoFromMicros(BigInt(seconds) * 1000000n + micros);
  }
  const text = String(value).replaceAll('Z', '+00:00');
  let m = ISO_EXT.exec(text);
  if (m) {
    const offset = m[8] ? (m[8] === '-' ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10] ?? 0)) : 0;
    const out = build(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), m[7], offset);
    if (out) return out;
  }
  if ((m = ISO_BASIC.exec(text))) { const out = build(+m[1], +m[2], +m[3], 0, 0, 0); if (out) return out; }
  if ((m = STRP_TZ.exec(text))) {
    const offset = (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
    const out = build(+m[1], +m[2], +m[3].trim(), +m[4], +m[5], Math.min(+m[6], 59), null, offset);
    if (out) return out;
  }
  if ((m = STRP_SPACE.exec(text))) { const out = build(+m[1], +m[2], +m[3].trim(), +m[4], +m[5], Math.min(+m[6], 59)); if (out) return out; }
  if ((m = STRP_DATE.exec(text))) { const out = build(+m[1], +m[2], +m[3].trim(), 0, 0, 0); if (out) return out; }
  return null;
}
