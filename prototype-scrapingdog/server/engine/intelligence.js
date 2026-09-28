// Port of REF darkmap/intelligence.py: change history, evidence and campaign clustering. FIX-1 (spec §8.1): profile
// snapshots and changes use fetched (non-discovery-grade) account state only.
import { createHash } from 'node:crypto';
import { isDiscoveryGrade } from '../normalize.js';
import { newId } from '../store.js';
import { toMicros, utcnowIso } from '../time.js';
import { S, cmpCodePoints, dedupe, or, pyLen, pyRepr, pySlice, pyStrip, sorted, truthy } from './pycompat.js';

export const PIVOT_KINDS = new Set(['url', 'email', 'phone', 'upi', 'crypto_wallet', 'telegram', 'download']);
export const PROFILE_FIELDS = ['handle', 'display_name', 'biography', 'external_url', 'profile_pic_url'];
const WHITESPACE_RUNS = new RegExp(`${S}+`, 'gu');
const HOUR_MICROS = 3_600_000_000n;

// Python json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':')). JSON.stringify escapes strings
// exactly as Python does except lone surrogates, which Python cannot encode to UTF-8 anyway.
export function canonicalJson(value) {
  if (value == null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return pyRepr(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort(cmpCodePoints);
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export const hashValue = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

export function profileState(account) {
  return {
    ...Object.fromEntries(PROFILE_FIELDS.map(field => [field, account[field] ?? null])),
    is_verified: Boolean(account.is_verified),
    followers_count: account.followers_count ?? null,
    follows_count: account.follows_count ?? null,
    media_count: account.media_count ?? null,
  };
}

function latestSnapshots(store, accountId, limit) {
  return store.table('account_snapshots').whereEq('account_id', accountId).reverse().slice(0, limit);
}

export function profileChanges(store, account, { clock = Date.now } = {}) {
  if (isDiscoveryGrade(account.provenance)) return [];                 // FIX-1
  const [previous] = latestSnapshots(store, account.id, 1);
  if (!previous) return [];
  const current = profileState(account);
  const changes = [];
  for (const field of PROFILE_FIELDS) {
    const before = or(previous.state, {})[field] ?? null;
    const after = current[field];
    if (before !== after) changes.push({ field, before, after, observed_at: utcnowIso(clock) });
  }
  return changes;
}

export function sharedArtifactContext(store, accountId) {
  const entities = store.table('entities');
  const pairKey = (kind, valueLower) => `${kind}\u0000${valueLower}`;
  const byPair = new Map();
  for (const entity of entities.whereEq('account_id', accountId).filter(e => PIVOT_KINDS.has(e.kind))) {
    if (truthy(entity.value_lower)) byPair.set(pairKey(entity.kind, entity.value_lower), { kind: entity.kind,
      value: entity.value, valueLower: entity.value_lower });
  }
  if (!byPair.size) return [];
  const linkedByPair = new Map();
  // Other accounts' pivots with the same (kind, value_lower), looked up by value as REF's IN query does.
  for (const valueLower of new Set([...byPair.values()].map(p => p.valueLower))) {
    for (const entity of entities.whereEq('value_lower', valueLower)) {
      const key = pairKey(entity.kind, entity.value_lower);
      if (entity.account_id === accountId || !PIVOT_KINDS.has(entity.kind) || !byPair.has(key)) continue;
      if (!linkedByPair.has(key)) linkedByPair.set(key, new Set());
      linkedByPair.get(key).add(entity.account_id);
    }
  }

  const item = (kind, value, linked) => ({ kind, value, linked_account_ids: sorted([...linked]),
    account_count: linked.size + 1 });
  const out = [...linkedByPair].map(([key, linked]) => item(byPair.get(key).kind, byPair.get(key).value, linked));

  // Exact perceptual hashes and copied captions connect accounts even without shared links.
  const posts = store.table('posts');
  const accountOfPost = { get: postId => posts.get(postId)?.account_id };
  const media = store.table('media_assets').where(m => m.perceptual_hash != null);
  const ownHashes = media.filter(m => accountOfPost.get(m.post_id) === accountId).map(m => m.perceptual_hash);
  for (const mediaHash of sorted(dedupe(ownHashes.filter(truthy)))) {
    const linked = new Set(media.filter(m => m.perceptual_hash === mediaHash)
      .map(m => accountOfPost.get(m.post_id)).filter(id => id != null && id !== accountId));
    if (linked.size) out.push(item('media_hash', mediaHash, linked));
  }

  // REF CORR-10, kept as-is: the normalized own caption is compared with other posts' raw caption_lower.
  const ownCaptions = posts.whereEq('account_id', accountId).filter(p => p.caption_lower != null).map(p => p.caption_lower);
  const templates = dedupe(ownCaptions.filter(v => truthy(v) && pyLen(pyStrip(v)) >= 40)
    .map(v => pyStrip(v.replace(WHITESPACE_RUNS, ' '))));
  for (const caption of templates) {
    const linked = new Set(posts.whereEq('caption_lower', caption).filter(p => p.account_id !== accountId)
      .map(p => p.account_id));
    if (linked.size) out.push(item('caption_template', pySlice(caption, 0, 240), linked));
  }
  return sorted(out, { key: i => [-i.account_count, i.kind, i.value] }).slice(0, 50);
}

export function velocityContext(store, account, { clock = Date.now } = {}) {
  const now = toMicros(utcnowIso(clock));
  const posts = store.table('posts').whereEq('account_id', account.id);
  const since = hours => posts.filter(p => truthy(p.posted_at) && toMicros(p.posted_at) >= now - hours * HOUR_MICROS)
    .length;
  const snapshots = latestSnapshots(store, account.id, 2);
  let followerDelta = null;
  if (snapshots.length) {
    const previous = or(snapshots[0].state, {}).followers_count;
    const current = account.followers_count;
    if (Number.isInteger(previous) && Number.isInteger(current)) followerDelta = current - previous;
  }
  const captions = posts.map(p => pyStrip(or(p.caption_lower, '').replace(WHITESPACE_RUNS, ' ')));
  const duplicated = captions.length - new Set(captions.filter(Boolean)).size;   // REF CORR-02, kept as-is
  return { posts_last_hour: since(1n), posts_last_24h: since(24n), follower_delta: followerDelta,
    duplicate_post_count: Math.max(0, duplicated) };
}

export function enrichDossier(store, account, dossier, { clock = Date.now } = {}) {
  dossier.account_changes = profileChanges(store, account, { clock });
  dossier.shared_artifacts = sharedArtifactContext(store, account.id);
  dossier.velocity = velocityContext(store, account, { clock });
}

function captureSnapshot(store, account, changes, clock) {
  const [latest = null] = latestSnapshots(store, account.id, 1);
  if (isDiscoveryGrade(account.provenance)) return latest;             // FIX-1: never snapshot snippet state
  const state = profileState(account);
  const fingerprint = hashValue(state);
  if (latest && latest.fingerprint === fingerprint) return latest;
  return store.table('account_snapshots').insert({ account_id: account.id, captured_at: utcnowIso(clock), fingerprint,
    state, changes });
}

// Fields come from heuristics.js, which writes ASCII digits.
const postIndexFromField = field => {
  const match = /posts\[(\d+)\]/.exec(field || '');
  return match ? Number(match[1]) : null;
};

function preserveEvidence(store, assessment, dossier, clock) {
  const posts = or(dossier.posts, []);
  const postIds = posts.map(post => post.id ?? null);
  const postUrls = new Map(posts.map(post => [post.id ?? null, post.permalink ?? null]));
  const account = or(dossier.account, {});
  const accountUrl = truthy(account.handle) ? `https://www.instagram.com/${account.handle}/` : null;
  const created = [];
  const seen = new Set();
  for (const evidence of or(assessment.evidence, [])) {
    if (Number(or(evidence.weight, 0)) < 0.45) continue;
    const idx = postIndexFromField(String(or(evidence.field, '')));
    const postId = idx != null && idx < postIds.length ? postIds[idx] : null;
    const payload = { assessment_id: assessment.id, evidence, account, captured_at: utcnowIso(clock) };
    const contentHash = hashValue(payload);
    if (seen.has(contentHash)) continue;
    seen.add(contentHash);
    created.push(store.table('evidence_artifacts').insert({ assessment_id: assessment.id,
      account_id: assessment.account_id, post_id: postId, kind: 'risk_signal',
      source_url: or(postUrls.get(postId), accountUrl), content_hash: contentHash, captured_at: utcnowIso(clock),
      payload, provenance: or(dossier.provenance, {}) }));
  }
  return created;
}

function clusterCampaign(store, assessment, dossier, clock) {
  const shared = or(dossier.shared_artifacts, []);
  if (!truthy(shared)) return null;
  const strongest = shared[0];
  const clusterKey = hashValue({ brand_id: assessment.brand_id ?? null, kind: strongest.kind, value: strongest.value });
  const campaigns = store.table('campaigns');
  let campaign = campaigns.byUnique(1, clusterKey);
  const linkedIds = new Set([assessment.account_id]);
  for (const artifact of shared) for (const id of or(artifact.linked_account_ids, [])) linkedIds.add(id);
  const now = utcnowIso(clock);
  if (campaign == null) {
    campaign = campaigns.insert({ public_id: newId(), cluster_key: clusterKey, brand_id: assessment.brand_id ?? null,
      name: `Shared ${strongest.kind}: ${pySlice(String(strongest.value), 0, 80)}`, status: 'open', severity: 0,
      dimensions: {}, shared_artifacts: shared, summary: `${linkedIds.size} accounts share investigation pivots.`,
      first_seen_at: now, last_seen_at: now });
  }
  campaign.last_seen_at = now;
  campaign.severity = Math.max(Number(or(campaign.severity, 0)), Number(assessment.overall_score));
  campaign.dimensions = or(assessment.dimensions, {});
  campaign.shared_artifacts = shared;
  campaign.summary = `${linkedIds.size} accounts share ${shared.length} infrastructure, payment, media, or content pivots.`;
  const members = store.table('campaign_members');
  // ponytail: REF iterates a Python set of ids; CPython yields small ints in ascending order, so sorted() matches
  // it for small stores. Only member row ids depend on it.
  for (const accountId of sorted([...linkedIds])) {
    if (members.byUnique(0, campaign.id, accountId) != null) continue;
    const reasons = shared.filter(item => accountId === assessment.account_id
      || or(item.linked_account_ids, []).includes(accountId));
    members.insert({ campaign_id: campaign.id, account_id: accountId, match_reasons: reasons,
      confidence: Math.min(0.95, 0.55 + 0.08 * reasons.length), added_at: now });
  }
  return campaign;
}

export function finalizeAssessment(store, account, assessment, dossier, { clock = Date.now } = {}) {
  const snapshot = captureSnapshot(store, account, or(dossier.account_changes, []), clock);
  const artifacts = preserveEvidence(store, assessment, dossier, clock);
  const campaign = clusterCampaign(store, assessment, dossier, clock);
  return { snapshot_id: snapshot?.id ?? null, evidence_artifacts: artifacts.length,
    campaign_id: campaign?.public_id ?? null };
}
