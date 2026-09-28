// Sync port of REF providers/instagram_pages.py over ScrapingDog (spec §7). Methods keep REF's order and names.
import { record as auditRecord } from './audit.js';
import { ENDPOINTS, PROFILE_HAS_RECENT_POSTS, USE_ADVANCED_FOR_CRITICAL } from './costs.js';
import { commentsToNodes, googleToOrganic, postToNode, postsToNodes, postsTotal, profileToNode } from './adapters.js';
import { account as parseAccount, author as parseAuthor, bucketDiscovery, canonicalInstagramUrl,
  comment as parseComment, discoveryQueries, post as parsePost, provenance, urlKind } from './discovery.js';
import { FetchFailed, NotAuthorized, NotFound, ProviderNotConfigured, QuotaExceeded, SourceUnavailable,
  ValueError } from './errors.js';
import { dedupe, or, pyCasefold, pyLstrip, pyRstrip, pySlice, pyStr, truthy } from './engine/pycompat.js';
import { windowsFor } from './quota.js';
import { rawAccount, rawBundle } from './raw.js';
import { PROVIDER } from './scrapingdog.js';
import { utcnowIso } from './time.js';

export const PAGE_NETWORK_SECONDS = 48;
export const REF_DATASETS = { gd_l1vikfch901nx3by4: 'profile', gd_lk5ns7kz21pck8jpis: 'post',
  gd_lyclm20il4r5helnj: 'reel', gd_ltppn085pokosxh13: 'comment' };
const ACCOUNT_FIELDS = Object.keys(rawAccount({ handle: '' }));
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const emptyObject = v => isPlainObject(v) && Object.keys(v).length === 0;
const lastSegment = url => pyRstrip(url, '/').split('/').at(-1);

export function hitKey(hit) {   // REF instagram_pages.py:32-37
  if (hit.doc_type === 'account') return `account:${pyCasefold(or(hit.handle, ''))}`;
  return `post:${lastSegment(or(hit.instagram_url, ''))}`;
}

export class PagedCollector {
  constructor({ store, state, client, config, clock = Date.now, monotonic = () => performance.now() }) {
    Object.assign(this, { store, state, client, config, clock, monotonic });
    this.params = state.params;
    this.inFlight = new Set();
    this.reserved = 0;
    this.provenanceFor = mode => provenance(mode, this.state.query, utcnowIso(this.clock));
    const s = state;
    s.organic ??= [];
    s.query_tasks ??= discoveryQueries(s.query).map(([query, country], index) => ({ query, country, index, attempt: 0 }));
    s.inputs ??= [];
    s.scheduled ??= {};
    s.records ??= {};
    s.errors ??= [];
    s.queries_completed ??= 0;
    s.blocked_until ??= 0;
    s.profile_target ??= Math.min(this.limit(), Math.trunc(Number(this.params.profile_limit ?? 50)));
    s.credits_used ??= 0;
  }

  limit() { return Math.max(1, Math.min(Math.trunc(Number(this.params.max_items ?? 100)), 500)); }

  checkConfiguration() {
    if (!this.config.scrapingdogApiKey) throw new ProviderNotConfigured('scrapingdog_instagram requires SCRAPINGDOG_API_KEY');
  }

  deferRefusal(error) {   // REF :58-71
    if (!(error instanceof FetchFailed) || ![429, 503].includes(error.statusCode)) return false;
    let delay = 30.0;
    const header = error.retryAfter == null ? '' : String(error.retryAfter).trim();
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds)) delay = Math.max(0, seconds);
      else if (!Number.isNaN(Date.parse(header))) delay = Math.max(0, Date.parse(header) / 1000 - this.clock() / 1000);
    }
    this.state.blocked_until = this.clock() / 1000 + delay;
    return true;
  }

  quotaCheckpoint(restore) {   // REF :73-89, over credit counters
    const w = windowsFor(new Date(this.clock()));
    const table = this.store.table('quota_counters');
    const windows = [w.minute, w.day];
    if (restore) {
      for (const [window, count] of Object.entries(this.state.quota ?? {})) {
        if (!windows.includes(window)) continue;
        const row = table.byUnique(0, PROVIDER, window);
        if (row) row.count = Math.max(row.count, count);
        else table.insert({ scope: PROVIDER, window, count });
      }
    } else {
      this.state.quota = Object.fromEntries(windows.map(window => [window, table.byUnique(0, PROVIDER, window)?.count])
        .filter(([, count]) => count != null));
    }
  }

  bundles() {   // REF :91-167
    const { buckets, serpFallback } = bucketDiscovery(this.state.organic, this.state.query,
      { limit: this.limit(), provenanceFor: this.provenanceFor });
    const merged = new Map(serpFallback.map(b => [pyCasefold(b.account.handle), b]));
    const add = bundle => {
      const key = pyCasefold(bundle.account.handle);
      if (!key) return;
      const current = merged.get(key);
      if (!current) { merged.set(key, bundle); return; }
      for (const field of ACCOUNT_FIELDS) {
        const value = bundle.account[field];
        if (value != null && !emptyObject(value)) current.account[field] = value;
      }
      const posts = new Map(current.posts.map(p => [or(p.permalink, p.platform_post_id), p]));
      for (const p of bundle.posts) posts.set(or(p.permalink, p.platform_post_id), p);
      current.posts = [...posts.values()];
      current.provenance = bundle.provenance;
    };
    const prov = { ...this.provenanceFor('keyword'), retrieved_at: this.state.retrieved_at };
    for (const node of this.state.records.profile ?? []) {
      add(rawBundle(parseAccount(node), or(node.posts, []).filter(isPlainObject).map(p => parsePost(p)).slice(0, this.limit()), prov));
    }
    for (const dataset of ['post', 'reel']) {
      for (const node of this.state.records[dataset] ?? []) {
        const name = parseAuthor(node);
        if (!name) continue;
        const key = pyCasefold(name);
        const mediaAccount = parseAccount(node, name);
        if (!merged.has(key)) merged.set(key, rawBundle(mediaAccount, [], prov));
        else {
          const current = merged.get(key).account;
          for (const field of ACCOUNT_FIELDS) {
            const existing = current[field];
            const value = mediaAccount[field];
            const placeholder = field === 'display_name' && typeof existing === 'string'
              && pyLstrip(pyCasefold(existing), '@') === pyCasefold(current.handle);
            if ((existing == null || existing === '' || placeholder) && !(value == null || value === '' || emptyObject(value))) current[field] = value;
          }
        }
        const bundle = merged.get(key);
        const p = parsePost(node);
        const existing = new Map(bundle.posts.map(x => [x.permalink, x]));
        existing.set(p.permalink, p);
        bundle.posts = [...existing.values()];
      }
    }
    const comments = new Map();
    for (const node of this.state.records.comment ?? []) {
      const url = canonicalInstagramUrl(pyStr(or(node.post_url, '')));
      if (!url) continue;
      const parent = parseComment(node);
      if (!comments.has(url)) comments.set(url, []);
      comments.get(url).push(parent, ...or(node.replies, []).filter(isPlainObject).map(r => parseComment(r, parent.platform_comment_id)));
    }
    for (const bundle of merged.values()) {
      for (const p of bundle.posts) {
        const combined = new Map();
        for (const c of [...p.comments, ...(comments.get(p.permalink) ?? [])]) {
          combined.set(truthy(c.platform_comment_id) ? `id:${c.platform_comment_id}` : `t:${JSON.stringify([c.author_handle, c.text])}`, c);
        }
        p.comments = [...combined.values()].slice(0, this.params.comments_per_post ?? 20);
      }
    }
    return { bundles: [...merged.values()], buckets };
  }

  commentTargets(bundles, buckets) {
    const all = bundles.flatMap(b => b.posts.map(p => p.permalink)).filter(truthy);
    if (this.config.commentsScope !== 'matched_posts') return all;
    const matched = new Set([...buckets.post, ...buckets.reel,
      ...(this.state.records.post ?? []).map(n => canonicalInstagramUrl(pyStr(or(n.url, '')))),
      ...(this.state.records.reel ?? []).map(n => canonicalInstagramUrl(pyStr(or(n.url, ''))))]);
    return all.filter(url => matched.has(url));
  }

  schedule() {   // REF :169-217
    if (this.state.budget_exhausted) return;   // spec §9: the search's queue stays empty once its budget is spent
    const { bundles, buckets } = this.bundles();
    const profileLimit = Math.min(this.limit(), Math.trunc(Number(this.state.profile_target ?? this.params.profile_limit ?? 50)));
    const exactProbe = buckets.probe_profile.slice(0, 1);
    const evidence = bundles.filter(b => truthy(b.account.handle)).map(b => `https://www.instagram.com/${b.account.handle}/`);
    const speculative = this.state.query_tasks.length ? [] : buckets.probe_profile.slice(1);
    const candidates = dedupe([...exactProbe, ...evidence, ...buckets.profile, ...speculative]);
    const knownProfiles = (this.state.scheduled.profile ??= []);
    const remaining = Math.max(0, profileLimit - knownProfiles.length);
    const profiles = candidates.filter(url => !knownProfiles.includes(lastSegment(url))).slice(0, remaining);
    const plan = [['profile', profiles.map(url => ({ user_name: lastSegment(url) }))],
      ['post', buckets.post.slice(0, this.limit()).map(url => ({ url }))],
      ['reel', buckets.reel.slice(0, this.limit()).map(url => ({ url }))]];
    if (this.params.include_comments ?? true) {
      // One comment request per post: /p/ABC/, /reel/ABC/ and /author/reel/ABC/ are one post (REF hit_key).
      const byCode = new Map();
      for (const url of this.commentTargets(bundles, buckets)) if (!byCode.has(lastSegment(url))) byCode.set(lastSegment(url), url);
      plan.push(['comment', [...byCode.values()].slice(0, this.limit()).map(url => ({ url }))]);
    }
    for (const [dataset, inputs] of plan) {
      const known = (this.state.scheduled[dataset] ??= []);
      const knownCodes = dataset === 'comment' ? new Set(known.map(lastSegment)) : null;
      let fresh = inputs.filter(item => !known.includes(Object.values(item)[0])
        && !(knownCodes && knownCodes.has(lastSegment(item.url))));
      if (dataset === 'profile' && fresh.length) {
        const pending = [...this.state.inputs].reverse()
          .find(t => t.dataset === 'profile' && !truthy(t.attempt) && t.inputs.length < 20);
        if (pending) {
          const room = 20 - pending.inputs.length;
          pending.inputs.push(...fresh.slice(0, room));
          known.push(...fresh.slice(0, room).map(item => Object.values(item)[0]));
          fresh = fresh.slice(room);
        }
      }
      for (let start = 0; start < fresh.length; start += 20) {
        const chunk = fresh.slice(start, start + 20);
        this.state.inputs.push({ dataset, inputs: chunk, attempt: 0 });
        known.push(...chunk.map(item => Object.values(item)[0]));
      }
    }
  }

  profileEnrichmentPending(bundles) {   // REF :219-228; "in flight" replaces "snapshots"
    const missing = bundles.some(b => truthy(b.account.handle)
      && (!truthy(b.account.profile_pic_url) || b.account.followers_count == null));
    return missing && (this.state.inputs.some(t => t.dataset === 'profile')
      || [...this.inFlight].some(op => op.dataset === 'profile'));
  }

  hasWork() { return Boolean(this.state.query_tasks.length || this.state.inputs.length || this.inFlight.size); }

  costOf(kind, dataset) {
    if (kind === 'discovery') {
      const critical = this.state.query_tasks[0]?.index < 5;
      return ENDPOINTS[critical && USE_ADVANCED_FOR_CRITICAL ? 'google_advanced' : 'google'].credits;
    }
    if (dataset === 'profile') return ENDPOINTS.profile.credits + (PROFILE_HAS_RECENT_POSTS ? 0 : ENDPOINTS.posts.credits);
    return ENDPOINTS[dataset === 'comment' ? 'comments' : 'post'].credits;
  }

  peekInput() {
    const tasks = this.state.inputs;
    let index = tasks.findIndex(t => t.dataset === 'profile');
    if (index < 0) index = tasks.findIndex(t => t.dataset === 'post' || t.dataset === 'reel');
    return { index: index < 0 ? 0 : index, task: tasks[index < 0 ? 0 : index] };
  }

  takeInput() {
    const { index, task } = this.peekInput();
    const input = task.inputs.shift();
    if (!task.inputs.length) this.state.inputs.splice(index, 1);
    return { dataset: task.dataset, input, attempt: task.attempt ?? 0 };
  }

  putBack({ dataset, input, attempt }) { this.state.inputs.unshift({ dataset, inputs: [input], attempt }); }

  async discoverOne() {   // REF :230-263 (the single discovery lane guarantees query_tasks[0] is ours)
    const task = this.state.query_tasks[0];
    const critical = task.index < 5;
    try {
      const { json, credits } = await this.client.call(critical && USE_ADVANCED_FOR_CRITICAL ? 'google_advanced' : 'google',
        { query: task.query, country: task.country, language: 'en', results: 10, page: 0 });
      this.state.credits_used += credits;
      const organic = googleToOrganic(json);
      if (critical && !organic.length && task.attempt === 0) { task.attempt += 1; return; }
      this.state.organic.push(...organic);
      this.state.query_tasks.shift();
      this.state.queries_completed += 1;
      auditRecord(this.store, { action: 'ingest.discover.page', provider: PROVIDER, target: this.state.query, status: 'ok',
        lawful_basis: 'licensed_public_data_api', detail: { query_index: task.index, organic_results: organic.length } }, this.clock);
    } catch (error) {
      if (!(error instanceof FetchFailed || error instanceof ValueError) || error instanceof SourceUnavailable) throw error;
      if (this.deferRefusal(error)) return;
      task.attempt += 1;
      if (task.attempt >= 3) {
        this.state.query_tasks.shift();
        this.state.errors.push({ stage: 'discovery', index: task.index, error: pySlice(String(error.message), 0, 300) });
      }
    }
  }

  async enrichOne(job) {
    const { dataset, input } = job;
    try {
      if (dataset === 'profile') {
        const r = await this.client.call('profile', { [ENDPOINTS.profile.param]: input.user_name });
        this.state.credits_used += r.credits;
        const node = profileToNode(r.json);
        if (!PROFILE_HAS_RECENT_POSTS && node.id != null) {
          try {
            const posts = await this.client.call('posts', { [ENDPOINTS.posts.param]: node.id });
            this.state.credits_used += posts.credits;
            node.posts = postsToNodes(posts.json);
            node.posts_count ??= postsTotal(posts.json);   // the profile's own media count is null (CONTRACT §3)
          } catch (error) {
            if (!(error instanceof FetchFailed) || error instanceof SourceUnavailable) { (this.state.records.profile ??= []).push(node); throw error; }
            this.state.errors.push({ stage: 'enrich', dataset: 'posts', error: pySlice(String(error.message), 0, 300) });
          }
        }
        (this.state.records.profile ??= []).push(node);
      } else if (dataset === 'comment') {
        const r = await this.client.call('comments', { [ENDPOINTS.comments.param]: input.url });
        this.state.credits_used += r.credits;
        (this.state.records.comment ??= []).push(...commentsToNodes(r.json, input.url));
      } else {
        const param = ENDPOINTS.post.param;
        const r = await this.client.call('post', { [param]: param === 'shortcode' ? lastSegment(input.url) : input.url });
        this.state.credits_used += r.credits;
        const node = postToNode(r.json, input.url);
        (this.state.records[urlKind(input.url) === 'reel' ? 'reel' : dataset] ??= []).push(node);
      }
    } catch (error) {
      if (error instanceof NotFound) {                             // REF: missing inputs are dropped dataset errors
        this.state.credits_used += error.credits ?? 0;              // ScrapingDog still bills a missing handle
        return;
      }
      if (error instanceof SourceUnavailable || error instanceof QuotaExceeded || error instanceof NotAuthorized) {
        this.putBack(job);
        throw error;
      }
      if (!(error instanceof FetchFailed || error instanceof ValueError)) throw error;
      if (this.deferRefusal(error)) { this.putBack(job); return; }
      if (job.attempt + 1 >= 3) {
        this.state.errors.push({ stage: 'enrich', dataset, error: pySlice(String(error.message), 0, 300) });
        return;
      }
      this.putBack({ ...job, attempt: job.attempt + 1 });
    }
  }

  async collect({ targetResults = 50, budgetSeconds = PAGE_NETWORK_SECONDS } = {}) {   // REF :370-428
    this.checkConfiguration();
    delete this.state.source_error;
    const stopAt = this.monotonic() + budgetSeconds * 1000;
    const pageProfileLimit = Math.max(0, Math.min(50, Math.trunc(Number(this.params.profile_limit ?? 50))));
    const requestedPages = Math.max(1, Math.floor((Math.trunc(targetResults) + 49) / 50));
    this.state.profile_target = Math.min(this.limit(), Math.max(Math.trunc(Number(this.state.profile_target ?? 0)),
      pageProfileLimit * requestedPages));
    this.quotaCheckpoint(true);
    this.schedule();
    const slots = Math.max(1, this.config.concurrency);
    let halted = false;
    let fatal = null;
    let lastKind = 'discovery';   // concurrency 1: REF's turn 0 enriches a queued input before discovering
    const canStart = () => {
      if (halted || fatal || this.state.budget_exhausted || this.monotonic() >= stopAt - 12_000) return false;
      if (this.state.blocked_until > this.clock() / 1000) return false;
      const { bundles } = this.bundles();
      const shortcodes = new Set(bundles.flatMap(b => b.posts).filter(p => truthy(p.permalink)).map(p => lastSegment(p.permalink)));
      return !(bundles.length + shortcodes.size >= targetResults && !this.profileEnrichmentPending(bundles));
    };
    const pick = () => {
      const discovering = [...this.inFlight].some(op => op.kind === 'discovery');
      const canDiscover = this.state.query_tasks.length > 0 && !discovering;
      const canEnrich = this.state.inputs.length > 0;
      if (slots === 1) {
        if (canEnrich && (lastKind === 'discovery' || !canDiscover)) return 'enrich';
        return canDiscover ? 'discovery' : null;
      }
      if (canDiscover) return 'discovery';
      const enrichSlots = slots - (this.state.query_tasks.length ? 1 : 0);
      const enriching = [...this.inFlight].filter(op => op.kind === 'enrich').length;
      return canEnrich && enriching < enrichSlots ? 'enrich' : null;
    };
    const onError = error => {
      if (error instanceof SourceUnavailable) {
        this.state.source_error = { code: error.code, message: error.message };
        auditRecord(this.store, { action: 'ingest.source_blocked', provider: PROVIDER, target: this.state.query,
          status: 'blocked', detail: { code: error.code } }, this.clock);
        halted = true;
      } else if (error instanceof QuotaExceeded) {
        this.state.blocked_until = this.clock() / 1000 + error.retryAfter;
      } else {
        fatal ??= error;
      }
    };
    const launch = kind => {
      const peek = kind === 'enrich' ? this.peekInput() : null;
      const cost = this.costOf(kind, peek?.task.dataset);
      if (this.state.credits_used + this.reserved + cost > this.config.creditBudgetPerSearch) {
        const remaining = this.state.inputs.reduce((n, t) => n + t.inputs.length, 0) + this.state.query_tasks.length;
        this.state.errors.push({ stage: 'budget', error: 'credit budget reached', remaining_inputs: remaining });
        this.state.budget_exhausted = true;
        this.state.inputs = [];
        this.state.query_tasks = [];
        halted = true;
        return false;
      }
      const job = kind === 'enrich' ? this.takeInput() : null;
      const op = { kind, dataset: job?.dataset };
      this.reserved += cost;
      this.inFlight.add(op);
      lastKind = kind;
      op.promise = (kind === 'discovery' ? this.discoverOne() : this.enrichOne(job))
        .catch(onError)
        .finally(() => { this.reserved -= cost; this.inFlight.delete(op); this.schedule(); });
      return true;
    };
    for (;;) {
      while (this.inFlight.size < slots && canStart()) {
        const kind = pick();
        if (!kind || !launch(kind)) break;
      }
      if (!this.inFlight.size) break;
      await Promise.race([...this.inFlight].map(op => op.promise));
    }
    // Requests still in flight at the budget stop may have put work back; the spent search keeps an empty queue.
    if (this.state.budget_exhausted) {
      this.state.inputs = [];
      this.state.query_tasks = [];
    }
    this.quotaCheckpoint(false);
    if (fatal) throw fatal;
    return this.bundles().bundles;
  }
}
