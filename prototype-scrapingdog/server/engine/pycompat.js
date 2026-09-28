// Python-compatible primitives for the REF port; each mirrors CPython 3.12 on the inputs REF sees.
// ponytail: pyRepr prints integral numbers without ".0" (JS cannot tell 1 from 1.0). REF only reprs
// floats inside media_analysis dicts, which ScrapingDog never supplies. Upgrade: pass explicit float tags.
// ponytail: under IGNORECASE, Python's [a-z] also matches 'İ' and 'ı'; JS 'iu' does not. Turkish
// dotted/dotless I in handles is the only affected input.

export const PY_SPACE_CHARS =
  '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
export const W = '[\\p{L}\\p{N}_]';
export const NW = '[^\\p{L}\\p{N}_]';
export const D = '\\p{Nd}';
export const S = `[${PY_SPACE_CHARS}]`;
export const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;

export function truthy(value) {
  if (value == null || value === false || value === 0 || value === '' || Number.isNaN(value)) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function or(...values) {
  for (let i = 0; i < values.length - 1; i++) if (truthy(values[i])) return values[i];
  return values[values.length - 1];
}

export const codePoints = s => Array.from(s ?? '');
export const pyLen = s => codePoints(s).length;
export const pySlice = (s, start = 0, end = undefined) => codePoints(s).slice(start, end).join('');
export function pyFind(s, sub) {
  const index = s.indexOf(sub);
  return index < 0 ? -1 : codePoints(s.slice(0, index)).length;
}

const LEADING = new RegExp(`^[${PY_SPACE_CHARS}]+`, 'u');
const TRAILING = new RegExp(`[${PY_SPACE_CHARS}]+$`, 'u');
const RUNS = new RegExp(`[${PY_SPACE_CHARS}]+`, 'u');
function stripChars(s, chars, fromStart, fromEnd) {
  const drop = new Set(codePoints(chars));
  const cps = codePoints(s);
  let start = 0;
  let end = cps.length;
  if (fromStart) while (start < end && drop.has(cps[start])) start++;
  if (fromEnd) while (end > start && drop.has(cps[end - 1])) end--;
  return cps.slice(start, end).join('');
}
export const pyLstrip = (s, chars) => (chars == null ? s.replace(LEADING, '') : stripChars(s, chars, true, false));
export const pyRstrip = (s, chars) => (chars == null ? s.replace(TRAILING, '') : stripChars(s, chars, false, true));
export const pyStrip = (s, chars) => (chars == null ? pyRstrip(pyLstrip(s)) : stripChars(s, chars, true, true));
export const pySplit = s => s.split(RUNS).filter(part => part !== '');
export const pyCasefold = s => s.toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ')
  .replaceAll('ﬁ', 'fi').replaceAll('ﬂ', 'fl').replaceAll('ſ', 's');

// Exact decimal expansion of a finite, non-negative double below 1e21 (toFixed is exact per ECMA-262).
const exactDecimal = abs => abs.toFixed(100).replace(/\.?0+$/, '');
function roundHalfEven(decimal, ndigits) {
  const [intPart, frac = ''] = decimal.split('.');
  let kept = BigInt(intPart + frac.padEnd(ndigits, '0').slice(0, ndigits));
  const rest = frac.slice(ndigits);
  if (rest !== '') {
    const tailNonZero = /[1-9]/.test(rest.slice(1));
    if (rest[0] > '5' || (rest[0] === '5' && (tailNonZero || kept % 2n === 1n))) kept += 1n;
  }
  const digits = kept.toString().padStart(ndigits + 1, '0');
  return ndigits ? `${digits.slice(0, digits.length - ndigits)}.${digits.slice(digits.length - ndigits)}` : digits;
}
export function pyRound(x, ndigits = 0) {
  if (!Number.isFinite(x) || x === 0) return x;
  const rounded = Number(roundHalfEven(exactDecimal(Math.abs(x)), ndigits));
  return x < 0 ? -rounded : rounded;
}
export function pyFixed(x, ndigits) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const text = roundHalfEven(exactDecimal(Math.abs(x)), ndigits);
  return x < 0 || Object.is(x, -0) ? `-${text}` : text;
}
// CPython 3.12 sum(): floats are added with Neumaier compensation (bltinmodule.c), so sum([.1, .2, .3]) is 0.6.
// ponytail: every item is treated as a float; CPython adds int items uncompensated, which only differs for
// int/float mixes with a non-zero start. REF sums floats only.
export function pySum(values, start = 0) {
  let total = start;
  let c = 0;
  for (const x of values) {
    const t = total + x;
    c += Math.abs(total) >= Math.abs(x) ? (total - t) + x : (x - t) + total;
    total = t;
  }
  return c && Number.isFinite(c) ? total + c : total;
}

const NON_PRINTABLE = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u;
function reprStr(s) {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === quote || ch === '\\') out += `\\${ch}`;
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch !== ' ' && NON_PRINTABLE.test(ch)) {
      const hex = cp.toString(16);
      out += cp < 0x100 ? `\\x${hex.padStart(2, '0')}` : cp < 0x10000 ? `\\u${hex.padStart(4, '0')}`
        : `\\U${hex.padStart(8, '0')}`;
    } else out += ch;
  }
  return out + quote;
}
function reprNumber(x) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return String(x);
  const abs = Math.abs(x);
  if (abs >= 1e16 || abs < 1e-4) {
    const [mantissa, exponent] = x.toExponential().split('e');
    const e = Number(exponent);
    return `${mantissa}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  return String(x);
}
export function pyRepr(value) {
  if (value == null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return reprNumber(value);
  if (typeof value === 'string') return reprStr(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  return `{${entries.map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(', ')}}`;
}
export const pyStr = value => (typeof value === 'string' ? value : pyRepr(value));

export function cmpCodePoints(a, b) {
  const x = codePoints(a);
  const y = codePoints(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}
export function cmpPy(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return cmpCodePoints(a, b);
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = cmpPy(a[i], b[i]);
      if (d !== 0) return d;
    }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }
  throw new TypeError(`'<' not supported between ${typeof a} and ${typeof b}`);
}
export function sorted(items, { key = item => item, reverse = false } = {}) {
  return [...items]
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((p, q) => {
      const d = cmpPy(p.k, q.k);
      return d !== 0 ? (reverse ? -d : d) : p.index - q.index;
    })
    .map(entry => entry.item);
}

export function findall(regex, text) {
  if (!regex.global) throw new Error('findall needs a regex with the g flag');
  const out = [];
  for (const match of String(text).matchAll(regex)) {
    if (match.length === 1) out.push(match[0]);
    else if (match.length === 2) out.push(match[1] ?? '');
    else out.push(match.slice(1).map(group => group ?? ''));
  }
  return out;
}
export const dedupe = items => [...new Set(items)];
export const pyDedupe = items => dedupe([...items].filter(item => truthy(item)));
export function counter(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}
