// Port of REF darkmap/queue.py:20-101 (enqueue, complete, fail) and api._job_out/_redact (api.py:111-125).
// The prototype runs every ingest inline, so there is no claim loop.
import { record as auditRecord } from './audit.js';
import { pySlice, sorted } from './engine/pycompat.js';
import { newId } from './store.js';
import { addSeconds, utcnowIso } from './time.js';

export function enqueue(store, kind, payload, { maxAttempts = 3, delaySeconds = 0, clock = Date.now } = {}) {
  const now = utcnowIso(clock);
  const job = store.table('jobs').insert({ public_id: newId(), kind, status: 'queued', payload, result: {}, error: null,
    attempts: 0, max_attempts: maxAttempts, available_at: addSeconds(now, delaySeconds), locked_at: null,
    locked_by: null, created_at: now, updated_at: now });
  auditRecord(store, { action: 'queue.enqueue', target: `${kind}:${job.public_id}`, status: 'queued',
    detail: { payload_keys: sorted(Object.keys(payload)) } }, clock);
  return job;
}

export function complete(store, job, result, { clock = Date.now } = {}) {
  if (job.status !== 'running' || !job.locked_by) throw new Error('cannot complete a job without an active worker lease');
  Object.assign(job, { status: 'succeeded', result, error: null, locked_at: null, locked_by: null,
    updated_at: utcnowIso(clock) });
  auditRecord(store, { action: 'queue.complete', target: `${job.kind}:${job.public_id}`, status: 'succeeded',
    detail: { attempts: job.attempts } }, clock);
}

export function fail(store, job, error, { retryAfter = 0, clock = Date.now } = {}) {
  if (job.status !== 'running' || !job.locked_by) throw new Error('cannot fail a job without an active worker lease');
  const now = utcnowIso(clock);
  Object.assign(job, { error: pySlice(error, 0, 4000), locked_at: null, locked_by: null, updated_at: now });
  let status;
  if ((job.attempts || 0) < (job.max_attempts || 3)) {
    job.status = 'queued';
    job.available_at = addSeconds(now, retryAfter || Math.min(300, 2 ** (job.attempts || 1)));
    status = 'retry_scheduled';
  } else {
    job.status = 'failed';
    status = 'failed';
  }
  auditRecord(store, { action: 'queue.fail', target: `${job.kind}:${job.public_id}`, status,
    detail: { attempts: job.attempts, error: pySlice(error, 0, 500) } }, clock);
}

const SECRET_KEY_TERMS = ['token', 'secret', 'password', 'api_key'];
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      SECRET_KEY_TERMS.some(term => key.toLowerCase().includes(term)) ? '[REDACTED]' : redact(item)]));
  }
  return value;
}

export const jobOut = job => ({ id: job.public_id, kind: job.kind, status: job.status, attempts: job.attempts || 0,
  payload: redact(job.payload || {}), result: job.result || {}, error: job.error ?? null, created_at: job.created_at,
  updated_at: job.updated_at });
