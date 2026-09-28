// Request plumbing: JSON bodies, REF's access-key/size middleware (api.py:74-93), JSON responses.
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';

export function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

export function protect(req, config) {
  if (!req.url.startsWith('/v1/')) return null;
  if (config.apiKey) {
    let supplied = req.headers['x-api-key'] ?? '';
    const auth = req.headers.authorization ?? '';
    if (auth.toLowerCase().startsWith('bearer ')) supplied = auth.slice(7).trim();
    const a = Buffer.from(String(supplied));
    const b = Buffer.from(config.apiKey);
    if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401, body: { detail: 'invalid or missing API key' } };
  }
  const length = req.headers['content-length'];
  if (length !== undefined) {
    if (!/^\d+$/.test(length)) return { status: 400, body: { detail: 'invalid Content-Length' } };
    if (Number(length) > config.maxRequestBytes) return { status: 413, body: { detail: 'request body too large' } };
  }
  return null;
}

export async function readJson(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'request body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  // Only JSON bodies are read, as FastAPI does for its models. A page on another site can send text/plain, form or
  // multipart POSTs without a CORS preflight; refusing them keeps it from starting paid collection here.
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json' && !type.endsWith('+json')) {
    throw new HttpError(422, [{ type: 'model_attributes_type', loc: ['body'],
      msg: 'Input should be a valid dictionary or object to extract fields from', input: text.slice(0, 200) }]);
  }
  try { return JSON.parse(text); }
  catch { throw new HttpError(422, [{ type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error', input: {} }]); }
}
