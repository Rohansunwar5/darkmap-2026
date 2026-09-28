import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { assertRoom, consume, usage, windowsFor } from '../../server/quota.js';

test('windows and per-minute cap follow REF quota.py bucket names', () => {
  assert.deepEqual(windowsFor(new Date(Date.UTC(2026, 8, 23, 7, 5))), { minute: 'm:202609230705', day: 'd:20260923' });
  const store = createStore();
  const clock = () => Date.UTC(2026, 8, 23, 7, 5, 20);
  const cfg = { creditCapPerMinute: 10, creditCapPerDay: 0 };
  consume(store, 's', 10, cfg, clock);
  assert.throws(() => assertRoom(store, 's', 1, cfg, clock), e => e.window === 'm:202609230705' && e.retryAfter === 40);
  assert.deepEqual(usage(store, 's', clock), { minute: 10, day: 10 });
});
