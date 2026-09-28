import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecret, stripApiKey } from '../../server/redact.js';

test('stripApiKey removes only api_key', () => {
  assert.equal(stripApiKey('https://api.scrapingdog.com/google?api_key=S3CRET&query=a%26b&page=0'),
    'https://api.scrapingdog.com/google?query=a%26b&page=0');
});

test('redactSecret replaces every occurrence and ignores an empty secret', () => {
  assert.equal(redactSecret('k=S3CRET;again S3CRET', 'S3CRET'), 'k=[REDACTED];again [REDACTED]');
  assert.equal(redactSecret('unchanged', ''), 'unchanged');
});
