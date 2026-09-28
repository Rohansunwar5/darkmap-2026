// The REF dashboard's API (REF darkmap/api.py) over the ScrapingDog pipeline. Handlers keep REF's order, detail
// strings and response shapes; each cites the REF lines it ports.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record as auditRecord } from './audit.js';
import { inlineIngest } from './account-search.js';
import { PagedCollector, hitKey } from './collector.js';
import { decodeCursor, encodeCursor, resolveCursorSecret } from './cursor.js';
import { dedupe, or, pyCasefold, pyLstrip, pyRepr, pyRound, pySplit, pyStrip, sorted, truthy } from './engine/pycompat.js';
import { assessAccount } from './engine/risk.js';
import { nullAnalysis } from './engine/risk-core.js';
import { search } from './engine/search.js';
import { HttpError, InvalidSearchCursor, NotAuthorized } from './errors.js';
import { protect, readJson, send } from './http.js';
import { complete, enqueue, jobOut } from './jobs.js';
import { ingestBundle } from './normalize.js';
import { usage } from './quota.js';
import { parseAnalyzeIn, parseBrandIn, parseCaseIn, parseCaseUpdate, parseScrapeIn, parseSearchPageIn } from './schemas.js';
import { LAWFUL_BASIS, PROVIDER, createClient } from './scrapingdog.js';
import { createStore, newId } from './store.js';
import { parseTs, utcnowIso } from './time.js';

const STATIC = new URL('../public/static/', import.meta.url);
const USERNAMEISH = /^[A-Za-z0-9._]{2,30}$/;
// Reviewed aliases used only for the quick brand search with the short brand name (REF api.py:47-60).
const QUICK_SEARCH_OFFICIAL_CONTEXTS = {
  sbi: { handles: ['theofficialsbi', 'sbilifeinsurance', 'sbimutualfund'], domains: ['sbi.bank.in'] },
  hdfc: { handles: ['hdfcbank', 'hdfcsec'], domains: ['hdfcbank.com', 'hdfcsec.com'] },
};
const asciiLower = value => String(value ?? '').replace(/[A-Z]/g, c => c.toLowerCase());   // SQLite lower()
const byDesc = key => (a, b) => (a[key] == null ? (b[key] == null ? 0 : 1) : b[key] == null ? -1
  : a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0);   // ORDER BY key DESC: NULLs sort last in SQLite
const COLLECTION_FAILED = { code: 'collection_failed', message: 'Collection could not be completed because the source '
  + 'returned errors. Retry this search. No results does not mean no matching Instagram content exists.' };

function applyQuickSearchOfficialContext(brand, query) {   // REF :63-71
  const context = QUICK_SEARCH_OFFICIAL_CONTEXTS[pyCasefold(query)] ?? {};
  const handles = new Set(or(brand.official_handles, []).map(v => pyLstrip(String(v).toLowerCase(), '@')));
  const domains = new Set(or(brand.official_domains, []).map(v => pyLstrip(String(v).toLowerCase(), '.')));
  for (const handle of context.handles ?? []) handles.add(handle);
  for (const domain of context.domains ?? []) domains.add(domain);
  brand.official_handles = sorted([...handles]);
  brand.official_domains = sorted([...domains]);
}

// FastAPI query parameters, with its 422 shape.
function queryParam(query, name, { type = 'str', fallback = null, le = null, pattern = null } = {}) {
  const raw = query.get(name);
  if (raw == null) return fallback;
  const fail = (errorType, msg, ctx) => {
    throw new HttpError(422, [{ type: errorType, loc: ['query', name], msg, input: raw, ...(ctx ? { ctx } : {}) }]);
  };
  let value = raw;
  if (type === 'int') {
    if (!/^\s*[+-]?\d+\s*$/.test(raw)) fail('int_parsing', 'Input should be a valid integer, unable to parse string as an integer');
    value = Number(raw);
  } else if (type === 'float') {
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) fail('float_parsing', 'Input should be a valid number, unable to parse string as a number');
    value = Number(raw);
  } else if (type === 'bool') {
    const text = raw.trim().toLowerCase();
    if (['1', 'on', 't', 'true', 'y', 'yes'].includes(text)) value = true;
    else if (['0', 'off', 'f', 'false', 'n', 'no'].includes(text)) value = false;
    else fail('bool_parsing', 'Input should be a valid boolean, unable to interpret input');
  }
  if (le != null && value > le) fail('less_than_equal', `Input should be less than or equal to ${le}`, { le });
  if (pattern && !pattern.test(value)) fail('string_pattern_mismatch', `String should match pattern '${pattern.source}'`, { pattern: pattern.source });
  return value;
}

const brandOut = b => ({ name: b.name, official_handles: or(b.official_handles, []), official_domains: or(b.official_domains, []),
  keywords: or(b.keywords, []), id: b.id });
const accountOut = a => ({ id: a.id, platform: a.platform, handle: a.handle, display_name: a.display_name ?? null,
  biography: a.biography ?? null, external_url: a.external_url ?? null, is_verified: a.is_verified ?? null,
  followers_count: a.followers_count ?? null, media_count: a.media_count ?? null,
  latest_risk_score: a.latest_risk_score ?? null, latest_action: a.latest_action ?? null,
  provenance: or(a.provenance, {}), last_seen_at: a.last_seen_at ?? null });
const assessmentOut = a => ({ id: a.id, account_id: a.account_id, brand_id: a.brand_id ?? null,
  overall_score: a.overall_score, category_scores: or(a.category_scores, {}), dimensions: or(a.dimensions, {}),
  alert_families: or(a.alert_families, {}), independent_indicators: or(a.independent_indicators, 0),
  evidence: or(a.evidence, []), confidence: a.confidence, limitations: or(a.limitations, []),
  recommended_action: a.recommended_action ?? null, summary: a.summary ?? null, heuristic_score: a.heuristic_score ?? null,
  ai_score: a.ai_score ?? null, ai_available: Boolean(a.ai_available), model: a.model ?? null,
  engine_version: a.engine_version ?? null, created_at: a.created_at ?? null });
// The assessment summary REF returns with search pages and inline jobs (api.py:162-183, 347-360).
const assessmentSummary = (a, account) => ({ assessment_id: a.id, account_id: a.account_id,
  handle: account?.handle ?? null, profile_pic_url: account?.profile_pic_url ?? null,
  instagram_url: account ? `https://www.instagram.com/${account.handle}/` : null, overall_score: a.overall_score,
  category_scores: or(a.category_scores, {}), evidence: or(a.evidence, []), limitations: or(a.limitations, []),
  ai_available: a.ai_available, dimensions: or(a.dimensions, {}), alert_families: or(a.alert_families, {}),
  independent_indicators: or(a.independent_indicators, 0), summary: a.summary, top_evidence: or(a.evidence, []).slice(0, 8),
  recommended_action: a.recommended_action, confidence: a.confidence, created_at: a.created_at ?? null });

export function createApp({ config, store, client, clock = Date.now, monotonic = () => performance.now(),
  collectorFactory = opts => new PagedCollector(opts), fetchImpl } = {}) {
  if (!store) {
    store = createStore({ file: config.dataFile });
    store.load();
  }
  client ??= createClient({ config, store, fetchImpl, clock });
  const cursorSecret = resolveCursorSecret(config, { dir: dirname(config.dataFile) });
  const replay = new Map();   // Review Focus 4: the last 20 page responses, keyed `${checkpoint id}:${page}`
  const table = name => store.table(name);
  const now = () => utcnowIso(clock);

  // ---------------- health (REF :214-256) ----------------
  const healthz = () => ({
    status: 'ok',
    env: 'local',
    database: 'json',
    ai: { provider: 'experiential_labs_claude', model: 'claude-opus-5', configured: false },
    instagram: { provider: 'meta_graph_api_v26', configured: false },
    instagram_alternative: { provider: PROVIDER, configured: Boolean(config.scrapingdogApiKey),
      keyword_search_configured: Boolean(config.scrapingdogApiKey) },
    ingestion_providers: [{ name: 'instagram_graph', lawful_basis: 'official_api' }, { name: PROVIDER, lawful_basis: LAWFUL_BASIS }],
    quota: { instagram_graph: usage(store, 'instagram_graph', clock), [PROVIDER]: usage(store, PROVIDER, clock) },
    compliance: { authorized_sources_only: true,
      evasion_features: 'none (no rate-limit bypass, rotation, stealth, or CAPTCHA solving)', public_page_allowlist: [] },
    brand_protection: {
      alert_families: ['credential_takeover', 'payment_fraud', 'fake_customer_support', 'scam_promotions',
        'counterfeit_sales', 'employee_recruiter_impersonation', 'malicious_apps_downloads',
        'investment_financial_impersonation'],
      risk_dimensions: ['deception', 'harm', 'exposure', 'coordination'],
      media_observations: ['ocr_text', 'qr_payloads', 'transcript', 'brand_match_score', 'synthetic_media_score',
        'perceptual_hash'],
      account_change_monitoring: true, campaign_clustering: true, victim_signal_analysis: true,
      velocity_monitoring: true, redirect_tls_inspection: true, evidence_hashing_and_cases: true,
    },
  });

  // ---------------- brands (REF :260-277) ----------------
  function createBrand({ body }) {
    const payload = parseBrandIn(body);
    if (table('brands').find(b => b.name === payload.name)) throw new HttpError(409, `brand "${payload.name}" already exists`);
    return brandOut(table('brands').insert({ name: payload.name,
      official_handles: payload.official_handles.map(h => pyLstrip(h, '@').toLowerCase()),
      official_domains: payload.official_domains.map(d => d.toLowerCase()), keywords: payload.keywords, created_at: now() }));
  }
  const listBrands = () => sorted(table('brands').all(), { key: b => b.name }).map(brandOut);

  // ---------------- search page (REF :281-431) ----------------
  async function searchPage({ body }) {
    const started = monotonic();
    const payload = parseSearchPageIn(body);
    if (!config.scrapingdogApiKey) throw new HttpError(503, 'An Instagram keyword collection source is required');
    let checkpoint;
    if (truthy(payload.continuation)) {
      try {
        checkpoint = decodeCursor(payload.continuation, cursorSecret, clock);
      } catch (error) {
        if (error instanceof InvalidSearchCursor) throw new HttpError(400, error.message);
        throw error;
      }
      if (pyStrip(payload.query) && pyStrip(payload.query) !== checkpoint.query) {
        throw new HttpError(400, 'Search continuation belongs to another query');
      }
    } else {
      const query = pySplit(payload.query).join(' ');
      if (!query) throw new HttpError(422, 'Enter an Instagram search keyword');
      let brand = truthy(payload.brand_id) ? table('brands').get(payload.brand_id) : null;
      if (truthy(payload.brand_id) && brand == null) throw new HttpError(404, 'brand not found');
      brand ??= table('brands').find(b => asciiLower(b.name) === query.toLowerCase());
      brand ??= { name: query, official_handles: USERNAMEISH.test(query) ? [query.toLowerCase()] : [], official_domains: [],
        keywords: [query] };
      applyQuickSearchOfficialContext(brand, query);
      const { continuation: _c, query: _q, brand_id: _b, ...params } = payload;
      checkpoint = { version: 1, id: randomBytes(16).toString('hex'), expires_at: clock() / 1000 + 21600, query,
        retrieved_at: now(), visible: [], page: 0, params: { ...params, mode: 'keyword' },
        brand: { name: brand.name, official_handles: brand.official_handles, official_domains: brand.official_domains,
          keywords: brand.keywords } };
    }
    // A retried page must not buy the same work twice, including a duplicate that arrives while the first is still
    // collecting: both share one promise. Successes and a 413 (too large; retrying spends again) stay cached.
    const replayKey = `${checkpoint.id}:${checkpoint.page}`;
    if (replay.has(replayKey)) return replay.get(replayKey);
    const work = collectPage(checkpoint, started);
    replay.set(replayKey, work);
    if (replay.size > 20) replay.delete(replay.keys().next().value);
    work.catch(error => { if (!(error instanceof HttpError && error.status === 413)) replay.delete(replayKey); });
    return work;
  }

  async function collectPage(checkpoint, started) {
    const options = { store, state: checkpoint, client, config, clock, monotonic };
    const collector = collectorFactory({ ...options, makeReal: () => new PagedCollector(options) });
    let bundles;
    try {
      bundles = await collector.collect({ targetResults: checkpoint.visible.length + 50 });
    } catch (error) {
      if (error instanceof NotAuthorized) {
        throw new HttpError(403, 'The connected collection source refused access. Check access settings.');
      }
      throw error;
    }

    const brandData = checkpoint.brand;
    const brand = table('brands').find(b => b.name === brandData.name)
      ?? table('brands').insert({ ...brandData, created_at: now() });
    const imported = bundles.map(bundle => ingestBundle(store, bundle, { brand, clock }));
    const accountIds = dedupe(imported.map(item => item.account_id));
    const assessments = [];
    if (checkpoint.params.analyze ?? true) {
      const provider = { name: 'null', analyze: () => nullAnalysis('paged_live_search: deterministic risk assessment') };
      for (const accountId of accountIds) {
        const assessment = assessAccount(store, accountId, { brandId: brand.id, provider, clock });
        assessments.push(assessmentSummary(assessment, table('accounts').get(accountId)));
      }
    }
    const snapshot = search(store, { q: null, scope: 'all', accountIds, limit: 2000 });
    // Keep previously shown identities, then add at most 50 new identities in ranked order.
    const unique = new Map();
    for (const hit of snapshot.hits) if (!unique.has(hitKey(hit))) unique.set(hitKey(hit), hit);
    snapshot.hits = [...unique.values()];
    const previous = new Set(checkpoint.visible);
    const newHits = snapshot.hits.filter(hit => !previous.has(hitKey(hit))).slice(0, 50);
    checkpoint.visible.push(...newHits.map(hitKey));
    const visible = new Set(checkpoint.visible);
    const hits = snapshot.hits.filter(hit => visible.has(hitKey(hit)));
    const buffered = snapshot.hits.filter(hit => !visible.has(hitKey(hit))).length;
    const hasMore = collector.hasWork() || buffered > 0;
    const errors = checkpoint.errors ?? [];
    let sourceError = checkpoint.source_error ?? null;
    let outcome;
    if (truthy(sourceError)) outcome = 'blocked';
    else if (!hits.length && !hasMore && errors.length) {
      outcome = 'failed';
      sourceError = { ...COLLECTION_FAILED };
    } else if (!hits.length && hasMore) outcome = 'pending';
    else if (hasMore || errors.length) outcome = 'partial';
    else outcome = hits.length ? 'complete' : 'empty';
    checkpoint.page += 1;
    checkpoint.elapsed_seconds = (checkpoint.elapsed_seconds ?? 0) + (monotonic() - started) / 1000;
    Object.assign(snapshot, { query: checkpoint.query, hits, total: hits.length, total_all: hits.length,
      complete_collection: !hasMore && !errors.length && !truthy(sourceError) });
    snapshot.facets = { accounts: hits.filter(h => h.doc_type === 'account').length,
      posts: hits.filter(h => h.doc_type === 'post').length,
      ...Object.fromEntries(['hashtags', 'mentions', 'urls'].map(name => [name,
        hits.filter(h => or(h.matched_fields, []).includes(name)).length])) };
    let continuation = null;
    if (hasMore) {
      try {
        continuation = encodeCursor(checkpoint, cursorSecret);
      } catch (error) {
        if (error instanceof InvalidSearchCursor) throw new HttpError(413, error.message);
        throw error;
      }
    }
    const result = {
      serverless_inline: true, inline_search: snapshot, accounts: imported, account_count: snapshot.facets.accounts,
      posts: snapshot.facets.posts, comments: hits.reduce((n, h) => n + or(h.comments, []).length, 0),
      assessments, analysis_mode: 'heuristics_inline',
      collection_partial: hasMore || errors.length > 0 || truthy(sourceError),
      collection_outcome: outcome, collection_error: sourceError,
      pagination: { has_more: hasMore, continuation, outcome, page_size: 50, page: checkpoint.page,
        new_results: newHits.length, loaded_results: hits.length, buffered_results: buffered,
        pending_snapshots: (checkpoint.inputs ?? []).reduce((n, task) => n + task.inputs.length, 0),
        queries_completed: checkpoint.queries_completed ?? 0, queries_total: 17,
        collection_complete: !collector.hasWork() && !errors.length && !truthy(sourceError),
        failed_branches: errors.length,
        retry_after_seconds: Math.max(0, Math.trunc((checkpoint.blocked_until ?? 0) - clock() / 1000)),
        total_seconds: pyRound(checkpoint.elapsed_seconds, 3), credits_used: checkpoint.credits_used ?? 0 },
    };
    const failed = !hits.length && ['blocked', 'failed'].includes(outcome);
    auditRecord(store, { action: 'ingest.page', target: checkpoint.query, status: outcome, detail: {
      new_results: newHits.length, loaded_results: hits.length, has_more: hasMore, page: checkpoint.page,
      error_code: sourceError ? sourceError.code : null } }, clock);
    const response = { id: checkpoint.id, kind: 'ingest', status: failed ? 'failed' : 'succeeded', attempts: 1,
      payload: { handle: checkpoint.query }, result, error: sourceError ? sourceError.message : null,
      created_at: checkpoint.retrieved_at, updated_at: now() };
    return response;
  }

  // ---------------- scrape (REF :434-524; always inline, as on Vercel: there is no worker) ----------------
  async function scrape({ body }) {
    const payload = parseScrapeIn(body);
    if (['account', 'hashtag_recent', 'hashtag_top', 'keyword'].includes(payload.mode) && !pyStrip(payload.query)) {
      throw new HttpError(422, 'query is required for account, hashtag, and keyword modes');
    }
    if (payload.brand_id != null && table('brands').get(payload.brand_id) == null) throw new HttpError(404, 'brand not found');
    const metaReady = false;
    const scrapingdogReady = Boolean(config.scrapingdogApiKey);
    const metaOnly = ['owned', 'tagged'].includes(payload.mode);
    let provider;
    if (payload.provider === 'meta') {
      if (!metaReady) throw new HttpError(503, 'Meta Instagram credentials are not configured');
      provider = 'instagram_graph';
    } else if (payload.provider === 'bright_data') {   // accepted as the licensed-scraper choice
      if (metaOnly) throw new HttpError(422, 'owned and tagged modes require the authorized Meta API');
      if (!scrapingdogReady) throw new HttpError(503, 'SCRAPINGDOG_API_KEY is not configured');
      provider = PROVIDER;
    } else if (!metaOnly && scrapingdogReady) {
      provider = PROVIDER;
    } else {
      provider = 'instagram_graph';   // the ingest records a clear ProviderNotConfigured failure
    }
    let brandId = payload.brand_id;
    const cleanQuery = pyLstrip(pyStrip(payload.query), '@#');
    if (brandId == null && ['keyword', 'hashtag_recent', 'hashtag_top'].includes(payload.mode) && USERNAMEISH.test(cleanQuery)) {
      const inferred = table('brands').find(b => asciiLower(b.name) === cleanQuery.toLowerCase())
        ?? table('brands').insert({ name: cleanQuery, official_handles: [cleanQuery.toLowerCase()], keywords: [cleanQuery],
          official_domains: [], created_at: now() });
      applyQuickSearchOfficialContext(inferred, cleanQuery);
      brandId = inferred.id;
    }
    const params = { mode: payload.mode, max_items: payload.max_items, page_size: payload.page_size,
      max_pages: payload.max_pages, include_comments: payload.include_comments,
      comments_per_post: payload.comments_per_post, profile_limit: payload.profile_limit, fresh: payload.fresh };
    const jobPayload = { provider, handle: payload.query, params, brand_id: brandId, analyze: payload.analyze };
    return inlineIngest({ store, client, config, jobPayload, query: payload.query, clock, monotonic });
  }

  // ---------------- jobs (REF :537-551) ----------------
  function getJob(_c, publicId) {
    const job = table('jobs').byUnique(0, publicId);
    if (!job) throw new HttpError(404, 'job not found');
    return jobOut(job);
  }
  function listJobs({ query }) {
    const status = queryParam(query, 'status');
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 50, le: 200 });
    return table('jobs').all().reverse().filter(j => !status || j.status === status).slice(0, Math.max(0, limit)).map(jobOut);
  }

  // ---------------- accounts (REF :555-589, 660-669) ----------------
  function listAccounts({ query }) {
    const minRisk = queryParam(query, 'min_risk', { type: 'float' });
    const action = queryParam(query, 'action');
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 50, le: 200 });
    const offset = queryParam(query, 'offset', { type: 'int', fallback: 0 });
    return table('accounts').all()
      .filter(a => (minRisk == null || (a.latest_risk_score != null && a.latest_risk_score >= minRisk))
        && (!action || a.latest_action === action))
      .sort((x, y) => byDesc('latest_risk_score')(x, y) || x.id - y.id)
      .slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit)).map(accountOut);
  }
  const assessmentsOf = accountId => table('risk_assessments').whereEq('account_id', accountId);
  const newestFirst = rows => [...rows].sort((x, y) => byDesc('created_at')(x, y) || y.id - x.id);
  function getAccount(_c, id) {
    const account = table('accounts').get(Number(id));
    if (!account) throw new HttpError(404, 'account not found');
    const [latest] = newestFirst(assessmentsOf(account.id));
    return { account: accountOut(account), post_count: table('posts').whereEq('account_id', account.id).length,
      latest_assessment: latest ? assessmentOut(latest) : null };
  }
  function accountAssessments({ query }, id) {
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 20, le: 100 });
    return assessmentsOf(Number(id)).reverse().slice(0, Math.max(0, limit)).map(assessmentOut);
  }
  function accountHistory({ query }, id) {
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 50, le: 200 });
    if (!table('accounts').get(Number(id))) throw new HttpError(404, 'account not found');
    return table('account_snapshots').where(s => s.account_id === Number(id)).reverse().slice(0, Math.max(0, limit))
      .map(s => ({ id: s.id, captured_at: s.captured_at, fingerprint: s.fingerprint, state: or(s.state, {}),
        changes: or(s.changes, []) }));
  }

  // ---------------- analysis (REF :593-617) ----------------
  function analyzeAccount({ body }, id) {
    const payload = parseAnalyzeIn(body);
    const accountId = Number(id);
    if (!table('accounts').get(accountId)) throw new HttpError(404, 'account not found');
    if (payload.inline) {
      const assessment = assessAccount(store, accountId, { brandId: payload.brand_id, mediaAnalysis: payload.media_analysis, clock });
      return { mode: 'inline', assessment: assessmentOut(assessment) };
    }
    // REF queues this for a worker. There is no worker here, so the job runs now and is returned already finished.
    const job = enqueue(store, 'analyze', { account_id: accountId, brand_id: payload.brand_id,
      media_analysis: payload.media_analysis }, { clock });
    Object.assign(job, { status: 'running', locked_at: now(), locked_by: 'inline', attempts: 1 });
    const assessment = assessAccount(store, accountId, { brandId: payload.brand_id, mediaAnalysis: payload.media_analysis, clock });
    complete(store, job, { assessment_id: assessment.id, overall_score: assessment.overall_score,
      recommended_action: assessment.recommended_action, ai_available: assessment.ai_available }, { clock });
    return { mode: 'queued', job: jobOut(job) };
  }
  function getAssessment(_c, id) {
    const item = table('risk_assessments').get(Number(id));
    if (!item) throw new HttpError(404, 'assessment not found');
    return assessmentOut(item);
  }

  // ---------------- alerts / campaigns / cases (REF :621-793) ----------------
  function listAlerts({ query }) {
    const family = queryParam(query, 'family');
    const minScore = queryParam(query, 'min_score', { type: 'float', fallback: 45 });
    const criticalOnly = queryParam(query, 'critical_only', { type: 'bool', fallback: false });
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 100, le: 500 });
    const threshold = criticalOnly ? 85 : minScore;
    const assessments = newestFirst(table('risk_assessments').where(r => r.overall_score >= threshold))
      .slice(0, Math.max(0, limit * 4));
    const seen = new Set();
    const out = [];
    for (const assessment of assessments) {
      if (seen.has(assessment.account_id)) continue;
      const familyData = or(assessment.alert_families, {});
      if (family && !or(familyData[family], {}).active) continue;   // inherited as-is: this account is not marked seen
      const account = table('accounts').get(assessment.account_id);
      seen.add(assessment.account_id);
      out.push({ assessment_id: assessment.id, account_id: assessment.account_id, handle: account?.handle ?? null,
        profile_pic_url: account?.profile_pic_url ?? null,
        instagram_url: account ? `https://www.instagram.com/${account.handle}/` : null,
        overall_score: assessment.overall_score, dimensions: or(assessment.dimensions, {}), alert_families: familyData,
        independent_indicators: or(assessment.independent_indicators, 0), confidence: assessment.confidence,
        recommended_action: assessment.recommended_action, summary: assessment.summary,
        top_evidence: or(assessment.evidence, []).slice(0, 8), created_at: assessment.created_at ?? null });
      if (out.length >= limit) break;
    }
    return out;
  }
  function listCampaigns({ query }) {
    const status = queryParam(query, 'status');
    const minSeverity = queryParam(query, 'min_severity', { type: 'float', fallback: 0 });
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 100, le: 500 });
    return table('campaigns').all()
      .filter(c => Number(or(c.severity, 0)) >= minSeverity && (!status || c.status === status))
      .sort((x, y) => byDesc('severity')(x, y) || byDesc('last_seen_at')(x, y))
      .slice(0, Math.max(0, limit))
      .map(campaign => ({ id: campaign.id, public_id: campaign.public_id, name: campaign.name, status: campaign.status,
        severity: campaign.severity, dimensions: or(campaign.dimensions, {}), shared_artifacts: or(campaign.shared_artifacts, []),
        summary: campaign.summary, first_seen_at: campaign.first_seen_at, last_seen_at: campaign.last_seen_at,
        members: table('campaign_members').whereEq('campaign_id', campaign.id).map(member => ({
          account_id: member.account_id, handle: table('accounts').get(member.account_id)?.handle ?? null,
          confidence: member.confidence, match_reasons: or(member.match_reasons, []) })) }));
  }
  const caseJson = c => ({ id: c.id, public_id: c.public_id, campaign_id: c.campaign_id, title: c.title, status: c.status,
    priority: c.priority, assignee: c.assignee, disposition: c.disposition, notes: c.notes,
    artifact_ids: table('case_evidence').whereEq('case_id', c.id).map(link => link.artifact_id),
    created_at: c.created_at, updated_at: c.updated_at });
  function createCase({ body }) {
    const payload = parseCaseIn(body);
    if (truthy(payload.campaign_id) && !table('campaigns').get(payload.campaign_id)) throw new HttpError(404, 'campaign not found');
    const created = now();
    const record = table('investigation_cases').insert({ public_id: newId(), campaign_id: payload.campaign_id,
      title: payload.title, status: 'open', priority: payload.priority, assignee: payload.assignee, disposition: null,
      notes: payload.notes, created_at: created, updated_at: created });
    const artifactIds = [...payload.artifact_ids];
    if (truthy(payload.assessment_id)) {
      if (!table('risk_assessments').get(payload.assessment_id)) throw new HttpError(404, 'assessment not found');
      artifactIds.push(...table('evidence_artifacts').whereEq('assessment_id', payload.assessment_id).map(a => a.id));
    }
    for (const artifactId of dedupe(artifactIds)) {
      if (table('evidence_artifacts').get(artifactId)) {
        table('case_evidence').insert({ case_id: record.id, artifact_id: artifactId, added_at: created });
      }
    }
    auditRecord(store, { action: 'case.create', target: record.public_id, status: 'ok',
      detail: { title: record.title, priority: record.priority } }, clock);
    return caseJson(record);
  }
  function listCases({ query }) {
    const status = queryParam(query, 'status');
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 100, le: 500 });
    return table('investigation_cases').all().filter(c => !status || c.status === status)
      .sort(byDesc('updated_at')).slice(0, Math.max(0, limit)).map(caseJson);
  }
  function updateCase({ body }, id) {
    const record = table('investigation_cases').get(Number(id));
    if (!record) throw new HttpError(404, 'case not found');
    const payload = parseCaseUpdate(body);
    for (const field of ['status', 'priority', 'assignee', 'disposition', 'notes']) {
      if (payload.fieldsSet.has(field)) record[field] = payload[field];
    }
    for (const artifactId of dedupe(payload.artifact_ids)) {
      if (table('evidence_artifacts').get(artifactId) && !table('case_evidence').byUnique(0, record.id, artifactId)) {
        table('case_evidence').insert({ case_id: record.id, artifact_id: artifactId, added_at: now() });
      }
    }
    record.updated_at = now();
    auditRecord(store, { action: 'case.update', target: record.public_id, status: 'ok',
      detail: { fields: sorted([...payload.fieldsSet]) } }, clock);
    return caseJson(record);
  }
  function evidencePackage(_c, id) {
    const record = table('investigation_cases').get(Number(id));
    if (!record) throw new HttpError(404, 'case not found');
    const artifacts = table('case_evidence').whereEq('case_id', record.id)
      .map(link => table('evidence_artifacts').get(link.artifact_id)).filter(Boolean);
    const pack = { format: 'darkmap-evidence-package/v1', exported_at: now(), case: caseJson(record), campaign: null,
      artifacts: artifacts.map(a => ({ id: a.id, kind: a.kind, source_url: a.source_url, content_hash: a.content_hash,
        captured_at: a.captured_at, payload: a.payload, provenance: a.provenance })) };
    if (truthy(record.campaign_id)) {
      const campaign = table('campaigns').get(record.campaign_id);
      if (campaign) {
        pack.campaign = { id: campaign.id, public_id: campaign.public_id, name: campaign.name,
          shared_artifacts: campaign.shared_artifacts, severity: campaign.severity };
      }
    }
    // Python str([(id, hash), ...]) of the artifacts, hashed as REF does.
    const manifest = `[${artifacts.map(a => `(${pyRepr(a.id)}, ${pyRepr(a.content_hash)})`).join(', ')}]`;
    pack.manifest_hash = createHash('sha256').update(manifest, 'utf8').digest('hex');
    auditRecord(store, { action: 'case.export', target: record.public_id, status: 'ok',
      detail: { artifacts: artifacts.length, manifest_hash: pack.manifest_hash } }, clock);
    return pack;
  }

  // ---------------- search and audit (REF :815-847) ----------------
  function searchRoute({ query }) {
    let accountIds = null;
    const rawIds = queryParam(query, 'account_ids');
    if (rawIds != null) {
      const parts = rawIds.split(',').filter(Boolean);
      if (!parts.every(part => /^\s*[+-]?\d+\s*$/.test(part))) {
        throw new HttpError(422, 'account_ids must be comma-separated integers');
      }
      accountIds = parts.map(Number).slice(0, 100);
    }
    const when = name => {
      const value = queryParam(query, name);
      if (value == null) return null;
      const parsed = parseTs(value);
      if (parsed == null) {
        throw new HttpError(422, [{ type: 'datetime_from_date_parsing', loc: ['query', name],
          msg: 'Input should be a valid datetime or date', input: value }]);
      }
      return parsed;
    };
    return search(store, { q: queryParam(query, 'q'), docType: queryParam(query, 'doc_type', { pattern: /^(account|post)$/ }),
      scope: queryParam(query, 'scope', { fallback: 'all', pattern: /^(all|accounts|posts|hashtags|mentions|urls)$/ }),
      accountIds, handle: queryParam(query, 'handle'), hashtag: queryParam(query, 'hashtag'),
      mention: queryParam(query, 'mention'), domain: queryParam(query, 'domain'),
      minRisk: queryParam(query, 'min_risk', { type: 'float' }), since: when('since'), until: when('until'),
      limit: queryParam(query, 'limit', { type: 'int', fallback: 25, le: 500 }),
      offset: queryParam(query, 'offset', { type: 'int', fallback: 0 }) });
  }
  function auditTail({ query }) {
    const action = queryParam(query, 'action');
    const provider = queryParam(query, 'provider');
    const limit = queryParam(query, 'limit', { type: 'int', fallback: 100, le: 500 });
    return table('audit_logs').all().reverse()
      .filter(row => (!action || row.action === action) && (!provider || row.provider === provider))
      .slice(0, Math.max(0, limit))
      .map(row => ({ id: row.id, at: row.at ?? null, actor: row.actor ?? null, action: row.action,
        provider: row.provider ?? null, target: row.target ?? null, status: row.status ?? null,
        lawful_basis: row.lawful_basis ?? null, duration_ms: row.duration_ms ?? null, detail: or(row.detail, {}) }));
  }

  const routes = [
    ['GET', /^\/healthz$/, healthz],
    ['GET', /^\/privacy$/, () => ({ html: 'privacy.html' })],
    ['GET', /^\/data-deletion$/, () => ({ html: 'data-deletion.html' })],
    ['POST', /^\/v1\/brands$/, createBrand, 201],
    ['GET', /^\/v1\/brands$/, listBrands],
    ['POST', /^\/v1\/instagram\/search-page$/, searchPage],
    ['POST', /^\/v1\/instagram\/scrape$/, scrape, 202],
    ['GET', /^\/v1\/ingest\/jobs\/([^/]+)$/, getJob],
    ['GET', /^\/v1\/jobs$/, listJobs],
    ['GET', /^\/v1\/accounts$/, listAccounts],
    ['GET', /^\/v1\/accounts\/(\d+)$/, getAccount],
    ['GET', /^\/v1\/accounts\/(\d+)\/assessments$/, accountAssessments],
    ['GET', /^\/v1\/accounts\/(\d+)\/history$/, accountHistory],
    ['POST', /^\/v1\/analysis\/accounts\/(\d+)$/, analyzeAccount],
    ['GET', /^\/v1\/assessments\/(\d+)$/, getAssessment],
    ['GET', /^\/v1\/alerts$/, listAlerts],
    ['GET', /^\/v1\/campaigns$/, listCampaigns],
    ['POST', /^\/v1\/cases$/, createCase, 201],
    ['GET', /^\/v1\/cases$/, listCases],
    ['PATCH', /^\/v1\/cases\/(\d+)$/, updateCase],
    ['GET', /^\/v1\/cases\/(\d+)\/evidence-package$/, evidencePackage],
    ['GET', /^\/v1\/search$/, searchRoute],
    ['GET', /^\/v1\/audit$/, auditTail],
  ];
  const match = req => {
    const path = req.url.split('?')[0];
    let pathMatched = false;
    for (const [method, pattern, handler, status = 200] of routes) {
      const m = pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (method === req.method) return { handler, status, args: m.slice(1) };
    }
    return pathMatched ? { notAllowed: true } : null;
  };

  return {
    store,
    handles: req => match(req) !== null || req.url.startsWith('/v1/'),
    async handle(req, res) {
      const blocked = protect(req, config);
      if (blocked) return send(res, blocked.status, blocked.body);
      const route = match(req);
      if (!route) return send(res, 404, { detail: 'Not Found' });
      if (route.notAllowed) return send(res, 405, { detail: 'Method Not Allowed' });
      try {
        const query = new URL(req.url, 'http://local').searchParams;
        const body = ['POST', 'PATCH'].includes(req.method) ? await readJson(req, config.maxRequestBytes) : undefined;
        const out = await route.handler({ query, body }, ...route.args);
        if (out?.html) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(readFileSync(fileURLToPath(new URL(out.html, STATIC))));
        }
        store.save();
        return send(res, route.status, out);
      } catch (error) {
        store.save();   // a failed request can still have written audit rows
        if (error instanceof HttpError) return send(res, error.status, { detail: error.detail });
        console.error(error);
        return send(res, 500, { detail: 'Internal Server Error' });
      }
    },
  };
}
