// Port of REF darkmap/search_cursor.py: compressed, HMAC-signed, 6-hour checkpoints (spec §5 item 10).
import * as nodeFs from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { InvalidSearchCursor } from './errors.js';

export const MAX_TOKEN_BYTES = 1_800_000;
export const MAX_STATE_BYTES = 24_000_000;
const INVALID = 'Search continuation is invalid or expired. Start a new search.';
const key = secret => createHmac('sha256', secret).update('darkmap-search-cursor-v1').digest();

export function resolveCursorSecret(config, { fs = nodeFs, dir = 'data' } = {}) {
  if (config.cursorSecret) return config.cursorSecret;
  const file = join(dir, 'cursor-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  fs.mkdirSync(dir, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function encodeCursor(state, secret) {
  const raw = Buffer.from(JSON.stringify(state), 'utf8');
  if (raw.length > MAX_STATE_BYTES) throw new InvalidSearchCursor('Search checkpoint is too large; narrow the search');
  const body = deflateSync(raw, { level: 6 }).toString('base64url');
  const token = `${body}.${createHmac('sha256', key(secret)).update(body).digest('hex')}`;
  if (token.length > MAX_TOKEN_BYTES) throw new InvalidSearchCursor('Search checkpoint is too large; narrow the search');
  return token;
}

export function decodeCursor(token, secret, clock = Date.now) {
  try {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_BYTES) throw new Error('size');
    const dot = token.lastIndexOf('.');
    if (dot < 0) throw new Error('format');
    const body = token.slice(0, dot);
    const signature = Buffer.from(token.slice(dot + 1), 'utf8');
    const expected = Buffer.from(createHmac('sha256', key(secret)).update(body).digest('hex'), 'utf8');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('signature');
    const raw = inflateSync(Buffer.from(body, 'base64url'), { maxOutputLength: MAX_STATE_BYTES + 1 });
    if (raw.length > MAX_STATE_BYTES) throw new Error('size');
    const state = JSON.parse(raw.toString('utf8'));
    if (state.version !== 1 || !(state.expires_at > clock() / 1000)) throw new Error('expired');
    return state;
  } catch {
    throw new InvalidSearchCursor(INVALID);
  }
}
