import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { addSeconds, isoFromMicros, parseTs, toMicros, utcnowIso } from '../../server/time.js';

test('parseTs equals REF export_file.parse_ts', () => {
  for (const [value, expected] of golden('parse-ts')) assert.equal(parseTs(value), expected, JSON.stringify(value));
});
test('isoformat omits a zero fraction and keeps microseconds', () => {
  assert.equal(isoFromMicros(1758363330000000n), '2025-09-20T10:15:30');
  assert.equal(isoFromMicros(1758363330000001n), '2025-09-20T10:15:30.000001');
  assert.equal(toMicros('2025-09-20T10:15:30.5'), 1758363330500000n);
  assert.equal(addSeconds('2025-09-20T10:15:30', -3600), '2025-09-20T09:15:30');
  assert.match(utcnowIso(() => 1758363330123), /^2025-09-20T10:15:30\.123000$/);
});
