import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { SequenceMatcher } from '../../server/engine/sequence-matcher.js';

test('ratio and matching blocks equal difflib for every fixture pair', () => {
  const cases = golden('sequence-matcher');
  assert.ok(cases.length >= 16);
  for (const [a, b, ratio, blocks] of cases) {
    const matcher = new SequenceMatcher(a, b);
    assert.deepEqual(matcher.getMatchingBlocks(), blocks, `${a} vs ${b}`);
    assert.equal(matcher.ratio(), ratio, `${a} vs ${b}`);
  }
});
