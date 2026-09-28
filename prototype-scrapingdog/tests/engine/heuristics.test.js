import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { analyze, handleSimilarity } from '../../server/engine/heuristics.js';

test('analyze equals REF for every harvested and fixture dossier', () => {
  const calls = golden('heuristics');
  assert.ok(calls.length >= 40, `only ${calls.length} recorded analyses`);
  for (const { source, args, result } of calls) assert.deepEqual(analyze(structuredClone(args[0])), result, source);
});

test('handleSimilarity equals REF for every recorded call', () => {
  for (const { source, args, result } of golden('handle-similarity')) {
    assert.equal(handleSimilarity(...args), result, `${source}: ${JSON.stringify(args)}`);
  }
});
