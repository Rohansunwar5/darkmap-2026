// Sync ports of REF _account_search (bright_data_instagram.py:767-790), fetch_many (:926-944),
// worker.handle_ingest (worker.py:21-53) and api._serverless_inline_ingest (api.py:128-211).
import { record as auditRecord } from './audit.js';
import { ENDPOINTS, PROFILE_HAS_RECENT_POSTS } from './costs.js';
import { commentsToNodes, postsToNodes, postsTotal, profileToNode } from './adapters.js';
import { account as parseAccount, canonicalInstagramUrl, comment as parseComment, post as parsePost, provenance,
  SUPPORTED_MODES, USERNAME_RE } from './discovery.js';
import { CollectionNotPermitted, FetchFailed, NotFound, ProviderNotConfigured, SourceUnavailable, ValueError } from './errors.js';
import { or, pyLstrip, pyRepr, pyStrip, pyStr, truthy } from './engine/pycompat.js';
import { nullAnalysis } from './engine/risk-core.js';
import { assessAccount } from './engine/risk.js';
import { search } from './engine/search.js';
import { ingestBundle } from './normalize.js';
import { PagedCollector } from './collector.js';
import { rawBundle } from './raw.js';
import { PROVIDER } from './scrapingdog.js';
import { complete, enqueue, fail, jobOut } from './jobs.js';
import { newId } from './store.js';
import { utcnowIso } from './time.js';

const limitOf = params => Math.max(1, Math.min(Math.trunc(Number(params.max_items ?? 100)), 500));

async function attempts(fn, times = 3) {   // failed ScrapingDog requests are free, so transient errors are retried
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (error) {
      const transient = error instanceof FetchFailed && !(error instanceof SourceUnavailable) && ![429, 503].includes(error.statusCode);
      if (!transient || attempt >= times) throw error;
    }
  }
}

export async function accountSearch({ client, query, params, clock = Date.now }) {
  const username = pyStrip(pyLstrip(query, '@'));
  if (!USERNAME_RE.test(username)) {
    throw new CollectionNotPermitted('account search requires an Instagram username containing letters, numbers, dots, or underscores');
  }
  let node;
  try { node = profileToNode((await attempts(() => client.call('profile', { [ENDPOINTS.profile.param]: username }))).json); }
  catch (error) { if (error instanceof NotFound) return { bundles: [], partial: false }; throw error; }
  let partial = false;
  if (!PROFILE_HAS_RECENT_POSTS && node.id != null) {
    try {
      const { json } = await attempts(() => client.call('posts', { [ENDPOINTS.posts.param]: node.id }));
      node.posts = postsToNodes(json);
      node.posts_count ??= postsTotal(json);   // the profile's own media count is null (CONTRACT §3)
    } catch (error) {
      if (!(error instanceof FetchFailed) || error instanceof SourceUnavailable) throw error;
      partial = true;
    }
  }
  const account = parseAccount(node, username);
  const posts = or(node.posts, []).filter(p => p && typeof p === 'object').map(p => parsePost(p)).slice(0, limitOf(params));
  const grouped = new Map();
  if (params.include_comments ?? true) {
    const limit = Math.max(1, Math.min(Math.trunc(Number(or(params.comments_per_post, 50))), 100));
    const urls = [...new Set(posts.map(p => p.permalink).filter(truthy))].slice(0, limitOf(params));
    await Promise.all(urls.map(async url => {
      try {
        const records = commentsToNodes((await attempts(() => client.call('comments', { [ENDPOINTS.comments.param]: url }))).json, url);
        for (const record of records) {
          const key = canonicalInstagramUrl(pyStr(or(record.post_url, '')));
          if (!key) continue;
          if (!grouped.has(key)) grouped.set(key, []);
          const list = grouped.get(key);
          if (list.length >= limit) continue;
          const parent = parseComment(record);
          list.push(parent);
          for (const reply of or(record.replies, [])) if (list.length < limit) list.push(parseComment(reply, parent.platform_comment_id));
        }
      } catch (error) {
        if (error instanceof NotFound) return;
        if (!(error instanceof FetchFailed) || error instanceof SourceUnavailable) throw error;
        partial = true;
      }
    }));
  }
  for (const p of posts) p.comments = grouped.get(or(p.permalink, '')) ?? [];   // REF one-shot replaces embedded comments
  return { bundles: [rawBundle(account, posts, provenance('account', username, utcnowIso(clock)))], partial };
}

export async function keywordScrape({ store, client, config, query, params, clock = Date.now, monotonic = () => performance.now() }) {
  const state = { version: 1, id: newId(), expires_at: clock() / 1000 + 21600, query, retrieved_at: utcnowIso(clock),
    visible: [], page: 0, params: { ...params, mode: 'keyword' } };
  const collector = new PagedCollector({ store, state, client, config, clock, monotonic });
  const started = monotonic();
  for (let target = 50; ; target += 50) {
    const left = 145 - (monotonic() - started) / 1000;
    if (left <= 12) break;
    await collector.collect({ targetResults: target, budgetSeconds: Math.min(48, left) });
    if (!collector.hasWork() || state.source_error || state.blocked_until > clock() / 1000) break;
  }
  return { bundles: collector.bundles().bundles, partial: collector.hasWork() || state.errors.length > 0 };
}

async function fetchMany(ctx, payload) {   // REF fetch_many + provider selection results (api.py:449-467)
  const params = payload.params ?? {};
  if (payload.provider === 'instagram_graph') {
    throw new ProviderNotConfigured('instagram_graph requires DARKMAP_IG_ACCESS_TOKEN and DARKMAP_IG_BUSINESS_ID');
  }
  if (!ctx.config.scrapingdogApiKey) throw new ProviderNotConfigured('scrapingdog_instagram requires SCRAPINGDOG_API_KEY');
  const mode = String(or(params.mode, 'account')).toLowerCase();
  if (!SUPPORTED_MODES.has(mode)) {   // REF BrightDataInstagramProvider._mode (:246-252), with this provider's name
    throw new CollectionNotPermitted(`ScrapingDog supports account and keyword/hashtag discovery, not ${pyRepr(mode)}; `
      + 'owned and tagged modes require the authorized Meta API');
  }
  const handle = payload.handle ?? '';
  const result = mode === 'account'
    ? await accountSearch({ client: ctx.client, query: handle, params, clock: ctx.clock })
    : await keywordScrape({ ...ctx, query: pyStrip(pyLstrip(handle, '#')), params });
  const bundles = result.bundles.filter(b => truthy(b.account.handle));
  auditRecord(ctx.store, { action: 'ingest.fetch', provider: PROVIDER, target: pyLstrip(handle, '@#'), status: 'ok',
    lawful_basis: 'licensed_public_data_api', detail: { mode, accounts: bundles.length,
      posts: bundles.reduce((n, b) => n + b.posts.length, 0) } }, ctx.clock);
  return { bundles, partial: result.partial };
}

export async function inlineIngest(ctx) {
  const { store, jobPayload, query, clock = Date.now } = ctx;
  let job = enqueue(store, 'ingest', jobPayload, { maxAttempts: 1, clock });
  Object.assign(job, { status: 'running', locked_at: utcnowIso(clock), locked_by: 'vercel:inline', attempts: 1 });
  try {
    const { bundles, partial } = await fetchMany(ctx, jobPayload);
    if (!bundles.length) throw new CollectionNotPermitted('provider returned no ingestible accounts');
    const brand = jobPayload.brand_id != null ? store.table('brands').get(jobPayload.brand_id) : null;
    if (jobPayload.brand_id != null && !brand) throw new ValueError(`brand ${jobPayload.brand_id} not found`);
    const imported = bundles.map(bundle => ingestBundle(store, bundle, { brand, clock }));
    const result = { accounts: imported.map(i => ({ account_id: i.account_id, posts: i.posts, media: i.media, comments: i.comments })),
      account_count: imported.length, posts: imported.reduce((n, i) => n + i.posts, 0),
      media: imported.reduce((n, i) => n + i.media, 0), comments: imported.reduce((n, i) => n + i.comments, 0),
      collection_partial: partial };
    if (imported.length === 1) result.account_id = imported[0].account_id;
    const accountIds = imported.map(i => i.account_id);
    if (jobPayload.analyze ?? true) {
      const provider = { name: 'null', analyze: () => nullAnalysis('serverless_live_search: fast heuristic assessment; '
        + 'run a durable deployment for queued Claude analysis') };
      result.assessments = accountIds.map(accountId => {
        const a = assessAccount(store, accountId, { brandId: jobPayload.brand_id, provider, clock });
        const acc = store.table('accounts').get(accountId);
        return { assessment_id: a.id, account_id: accountId, handle: acc?.handle ?? null,
          profile_pic_url: acc?.profile_pic_url ?? null,
          instagram_url: acc ? `https://www.instagram.com/${acc.handle}/` : null,
          overall_score: a.overall_score, category_scores: or(a.category_scores, {}), evidence: or(a.evidence, []),
          limitations: or(a.limitations, []), ai_available: a.ai_available, dimensions: or(a.dimensions, {}),
          alert_families: or(a.alert_families, {}), independent_indicators: or(a.independent_indicators, 0),
          summary: a.summary, top_evidence: or(a.evidence, []).slice(0, 8), recommended_action: a.recommended_action,
          confidence: a.confidence, created_at: a.created_at ?? null };
      });
      result.analysis_mode = 'heuristics_inline';
    }
    const snapshot = search(store, { q: null, scope: 'all', accountIds, limit: 500 });
    result.inline_search = { ...snapshot, query, complete_collection: !result.collection_partial };
    result.serverless_inline = true;
    complete(store, job, result, { clock });
  } catch (error) {
    fail(store, job, `${error.name}: ${error.message}`, { clock });
  }
  return jobOut(job);
}
