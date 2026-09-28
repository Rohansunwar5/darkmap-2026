// In-memory tables mirroring REF models.py, saved atomically to one JSON file (spec §10).
import * as nodeFs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

export const newId = () => randomBytes(16).toString('hex');
export class IntegrityError extends Error {}
const key = (...parts) => (parts.some(part => part == null) ? null : parts.map(String).join('\u0000'));

// Unique constraints of REF models.py; a key with a null part is not enforced (SQL NULL semantics). `lookup` lists the
// columns REF indexes and queries by equality; whereEq() answers those from an index instead of a table scan.
export const SCHEMA = {
  brands: { unique: [r => key(r.name)] },
  accounts: { unique: [r => key(r.platform, r.handle_lower)] },
  posts: { unique: [r => key(r.account_id, r.platform_post_id)], lookup: ['account_id', 'caption_lower'] },
  media_assets: { lookup: ['post_id'] },
  comments: { lookup: ['post_id'] },
  entities: { lookup: ['account_id', 'value_lower'] },
  search_documents: { unique: [r => key(r.doc_type, r.account_id, r.post_id)], lookup: ['account_id'] },
  risk_assessments: { lookup: ['account_id'] },
  account_snapshots: { lookup: ['account_id'] },
  evidence_artifacts: { lookup: ['assessment_id'] },
  campaigns: { unique: [r => key(r.public_id), r => key(r.cluster_key)] },
  campaign_members: { unique: [r => key(r.campaign_id, r.account_id)], lookup: ['campaign_id'] },
  investigation_cases: { unique: [r => key(r.public_id)] },
  case_evidence: { unique: [r => key(r.case_id, r.artifact_id)], lookup: ['case_id'] },
  jobs: { unique: [r => key(r.public_id)] },
  audit_logs: { cap: 5000 },
  quota_counters: { unique: [r => key(r.scope, r.window)] },
};

// Rows are kept in a Map in id order: every insert takes max+1, so appending preserves the order and all() needs no
// sort. Callers may assign ordinary fields directly, but unique-key and `lookup` columns must go through update().
class Table {
  constructor(name, spec) {
    this.name = name;
    this.spec = spec;
    this.rows = new Map();
    this.indexes = (spec.unique ?? []).map(() => new Map());
    this.lookups = new Map((spec.lookup ?? []).map(field => [field, new Map()]));
    this.max = 0;
    this.maxStale = false;
  }
  #keys(row) { return (this.spec.unique ?? []).map(fn => fn(row)); }
  #assertUnique(row, selfId) {
    this.#keys(row).forEach((value, i) => {
      if (value != null && this.indexes[i].has(value) && this.indexes[i].get(value) !== selfId) {
        throw new IntegrityError(`UNIQUE constraint failed: ${this.name}`);
      }
    });
  }
  #index(row) {
    this.#keys(row).forEach((value, i) => { if (value != null) this.indexes[i].set(value, row.id); });
    for (const [field, index] of this.lookups) {
      const value = row[field] ?? null;
      if (!index.has(value)) index.set(value, new Set());
      index.get(value).add(row.id);
    }
  }
  #unindex(row) {
    this.#keys(row).forEach((value, i) => { if (value != null) this.indexes[i].delete(value); });
    for (const [field, index] of this.lookups) {
      const ids = index.get(row[field] ?? null);
      ids?.delete(row.id);
      if (ids && !ids.size) index.delete(row[field] ?? null);
    }
  }
  // SQLite rowids: max(rowid) + 1, so deleting the highest id lets it be reused.
  #nextId() {
    if (this.maxStale) {
      this.max = 0;
      for (const id of this.rows.keys()) if (id > this.max) this.max = id;
      this.maxStale = false;
    }
    return this.max + 1;
  }
  insert(values) {
    const row = { ...values, id: this.#nextId() };
    this.#assertUnique(row, null);
    this.rows.set(row.id, row);
    this.max = row.id;
    this.#index(row);
    if (this.spec.cap && this.rows.size > this.spec.cap) this.remove(this.rows.keys().next().value);
    return row;
  }
  get(id) { return this.rows.get(Number(id)) ?? null; }
  update(id, patch) {
    const row = this.get(id);
    if (!row) return null;
    this.#assertUnique({ ...row, ...patch }, row.id);
    this.#unindex(row);
    Object.assign(row, patch);
    this.#index(row);
    return row;
  }
  remove(id) {
    const row = this.get(id);
    if (!row) return;
    this.#unindex(row);
    this.rows.delete(row.id);
    if (row.id === this.max) this.maxStale = true;
  }
  removeWhere(predicate) { for (const row of this.where(predicate)) this.remove(row.id); }
  // Remove the rows whose `field` equals `value` (and that pass `predicate`), using the index when there is one.
  removeEq(field, value, predicate = () => true) {
    for (const row of this.whereEq(field, value)) if (predicate(row)) this.remove(row.id);
  }
  all() { return [...this.rows.values()]; }
  where(predicate) {
    const out = [];
    for (const row of this.rows.values()) if (predicate(row)) out.push(row);
    return out;
  }
  find(predicate) {
    for (const row of this.rows.values()) if (predicate(row)) return row;
    return null;
  }
  // Rows whose `field` equals `value`, in id order (what SQLite returns for an equality lookup on an index).
  whereEq(field, value) {
    const index = this.lookups.get(field);
    if (!index) return this.where(row => row[field] === value);
    const ids = index.get(value ?? null);
    return ids ? [...ids].sort((a, b) => a - b).map(id => this.rows.get(id)) : [];
  }
  byUnique(indexNo, ...parts) {
    const id = this.indexes[indexNo]?.get(key(...parts));
    return id == null ? null : this.get(id);
  }
  count() { return this.rows.size; }
  load(rows) {
    this.rows.clear();
    this.indexes.forEach(index => index.clear());
    this.lookups.forEach(index => index.clear());
    this.max = 0;
    this.maxStale = false;
    for (const row of [...rows].sort((a, b) => a.id - b.id)) {
      this.rows.set(row.id, row);
      this.max = Math.max(this.max, row.id);
      this.#index(row);
    }
  }
}

export function createStore({ file = null, fs = nodeFs, debounceMs = 250 } = {}) {
  const tables = new Map(Object.entries(SCHEMA).map(([name, spec]) => [name, new Table(name, spec)]));
  let timer = null;
  let pending = Promise.resolve();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function write() {
    if (!file) return;
    const body = JSON.stringify({ version: 1, tables: Object.fromEntries([...tables].map(([n, t]) => [n, t.all()])) });
    fs.mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, body);
    for (let attempt = 1; ; attempt++) {
      try { fs.renameSync(temp, file); return; }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) {
          try { fs.unlinkSync(temp); } catch { /* leave nothing behind */ }
          throw error;
        }
        await sleep(50 * attempt);   // antivirus/indexer briefly holds the file on Windows
      }
    }
  }
  // A failed write must not poison the chain: the next save still writes the whole store.
  const enqueue = () => (pending = pending.catch(() => {}).then(write));
  return {
    table(name) {
      const table = tables.get(name);
      if (!table) throw new Error(`unknown table ${name}`);
      return table;
    },
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; enqueue().catch(() => {}); }, debounceMs);
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; enqueue(); }
      return pending;
    },
    load() {
      if (!file || !fs.existsSync(file)) return;
      let data;
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch { throw new Error(`data file is corrupt: ${file}. Move it aside to start with an empty store.`); }
      for (const [name, rows] of Object.entries(data.tables ?? {})) tables.get(name)?.load(rows);
    },
  };
}
