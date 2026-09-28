import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROJECT_ROOT, refPath } from '../helpers/ref.js';

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

test('index.html is byte-identical to REF', () => {
  assert.equal(sha(join(PROJECT_ROOT, 'index.html')), sha(refPath('darkmap', 'static', 'index.html')));
});

test('public/static matches REF darkmap/static file for file', () => {
  const refDir = refPath('darkmap', 'static');
  const ours = join(PROJECT_ROOT, 'public', 'static');
  const expected = walk(refDir).map(f => relative(refDir, f)).filter(f => f !== 'index.html').sort();
  assert.deepEqual(walk(ours).map(f => relative(ours, f)).sort(), expected);
  for (const file of expected) assert.equal(sha(join(ours, file)), sha(join(refDir, file)), file);
});
