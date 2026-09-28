import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { domainOf, extract } from '../../server/engine/extract.js';

test('extract equals REF for every recorded call', () => {
  const calls = golden('extract');
  assert.ok(calls.length >= 12);
  for (const { source, args, result } of calls) assert.deepEqual(extract(...args), result, source);
});

test('domainOf equals REF for every recorded call', () => {
  const calls = golden('domain-of');
  assert.ok(calls.length >= 15);
  for (const { source, args, result } of calls) assert.equal(domainOf(...args), result, `${source}: ${args[0]}`);
});
