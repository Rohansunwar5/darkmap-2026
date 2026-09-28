import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { counter, dedupe, findall, or, pyCasefold, pyDedupe, pyFind, pyFixed, pyLen, pyLstrip, pyRepr,
  pyRound, pySlice, pySplit, pyStr, pyStrip, pySum, sorted, truthy } from '../../server/engine/pycompat.js';

const g = golden('pycompat');

test('pySum matches Python 3.12 sum() on floats (compensated)', () => {
  assert.ok(g.sum.length >= 8);
  for (const [values, expected] of g.sum) assert.equal(pySum(values), expected, `sum(${JSON.stringify(values)})`);
});

test('pyRound matches Python round()', () => {
  for (const [x, n, expected] of g.round) assert.equal(pyRound(x, n), expected, `round(${x}, ${n})`);
});
test('pyFixed matches Python format spec', () => {
  for (const [x, n, expected] of g.fixed) assert.equal(pyFixed(x, n), expected, `f'{${x}:.${n}f}'`);
});
test('pyRepr matches Python repr()', () => {
  for (const [value, expected] of g.repr) assert.equal(pyRepr(value), expected);
});
test('sorted matches Python sorted() on strings', () => {
  for (const [input, expected] of g.sorted) assert.deepEqual(sorted(input), expected);
});
test('strip, split, lower, casefold, len and slice match Python', () => {
  for (const [s, expected] of g.strip) assert.equal(pyStrip(s), expected, JSON.stringify(s));
  for (const [s, expected] of g.split) assert.deepEqual(pySplit(s), expected, JSON.stringify(s));
  for (const [s, expected] of g.lower) assert.equal(s.toLowerCase(), expected);
  for (const [s, expected] of g.casefold) assert.equal(pyCasefold(s), expected);
  for (const [s, expected] of g.len) assert.equal(pyLen(s), expected);
  for (const [s, a, b, expected] of g.slice) assert.equal(pySlice(s, a, b), expected);
});
test('truthiness, or, dedupe, counter, findall, pyFind, pyStr', () => {
  for (const v of [null, undefined, false, 0, '', [], {}, new Map()]) assert.equal(truthy(v), false);
  for (const v of [1, 'x', [0], { a: 1 }, true]) assert.equal(truthy(v), true);
  assert.deepEqual(or([], null, 'x'), 'x');
  assert.deepEqual(or([], {}), {});
  assert.deepEqual(dedupe(['a', 'b', 'a']), ['a', 'b']);
  assert.deepEqual(pyDedupe(['', 'a', null, 'a']), ['a']);
  assert.deepEqual([...counter(['x', 'y', 'x'])], [['x', 2], ['y', 1]]);
  assert.deepEqual(findall(/@(\w+)/g, '@a b @c'), ['a', 'c']);
  assert.deepEqual(findall(/\d+/g, 'a1b22'), ['1', '22']);
  assert.equal(pyFind('😀ab', 'b'), 2);
  assert.equal(pyLstrip('@@x', '@'), 'x');
  assert.equal(pyStr(['a']), "['a']");
});
