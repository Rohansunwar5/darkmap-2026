import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { PROJECT_ROOT } from '../helpers/ref.js';

const walk = dir => readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const envKey = () => {
  const file = join(PROJECT_ROOT, '.env');
  return existsSync(file) ? (readFileSync(file, 'utf8').match(/^SCRAPINGDOG_API_KEY=(.*)$/m)?.[1] ?? '').trim() : '';
};

test('neither the key name nor its value reaches index.html, public/ or the built bundle', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'dm-dist-'));
  await build({ root: PROJECT_ROOT, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const needles = ['SCRAPINGDOG_API_KEY', envKey()].filter(Boolean);
  const files = [join(PROJECT_ROOT, 'index.html'), ...walk(join(PROJECT_ROOT, 'public')), ...walk(outDir)];
  for (const file of files) {
    const text = readFileSync(file, 'latin1');
    for (const needle of needles) assert.ok(!text.includes(needle), `${needle === envKey() ? 'key value' : needle} found in ${file}`);
  }
});
