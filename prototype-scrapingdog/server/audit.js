// REF darkmap/audit.py: append-only audit rows.
import { pySlice } from './engine/pycompat.js';
import { utcnowIso } from './time.js';

export function record(store, { action, provider = null, target = null, status = null, lawful_basis = null,
  duration_ms = null, actor = 'system', detail = null } = {}, clock = Date.now) {
  return store.table('audit_logs').insert({ at: utcnowIso(clock), actor, action, provider,
    target: pySlice(target || '', 0, 400), status, lawful_basis, duration_ms, detail: detail || {} });
}
