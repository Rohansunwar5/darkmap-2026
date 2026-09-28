import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidSearchCursor } from '../../server/errors.js';
import { decodeCursor, encodeCursor, resolveCursorSecret } from '../../server/cursor.js';

const state = (extra = {}) => ({ version: 1, expires_at: Date.now() / 1000 + 1000, query: 'Brand',
  retrieved_at: '2026-09-23T00:00:00', visible: [], params: { mode: 'keyword', max_items: 250 }, ...extra });

test('round trip, tamper detection and expiry', () => {
  const secret = 's3cret';
  const original = state({ inputs: [{ dataset: 'post', inputs: [{ url: 'https://www.instagram.com/p/A/' }], attempt: 0 }] });
  const token = encodeCursor(original, secret);
  assert.deepEqual(decodeCursor(token, secret), original);
  assert.ok(!token.includes(secret));
  assert.throws(() => decodeCursor((token[0] === 'a' ? 'b' : 'a') + token.slice(1), secret), InvalidSearchCursor);
  assert.throws(() => decodeCursor(token, 'other-secret'), InvalidSearchCursor);
  assert.throws(() => decodeCursor(encodeCursor(state({ expires_at: Date.now() / 1000 - 1 }), secret), secret),
    /Search continuation is invalid or expired\. Start a new search\./);
  assert.throws(() => decodeCursor('bad', secret), InvalidSearchCursor);
});

test('oversized state is refused with REF wording', () => {
  const big = state({ organic: Array.from({ length: 120_000 }, (_, i) => ({ link: `https://x/${i}`, title: 'y'.repeat(200) })) });
  assert.throws(() => encodeCursor(big, 's'), /Search checkpoint is too large; narrow the search/);
});

test('a missing secret is generated once and reused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const first = resolveCursorSecret({ cursorSecret: '' }, { dir });
  assert.equal(resolveCursorSecret({ cursorSecret: '' }, { dir }), first);
  assert.equal(resolveCursorSecret({ cursorSecret: 'fixed' }, { dir }), 'fixed');
});
