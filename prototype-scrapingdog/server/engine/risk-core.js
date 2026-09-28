// Pure parts of REF darkmap/risk.py (lines 15-105 and 218-229).
import { CATEGORY_WEIGHTS } from './heuristics.js';
import { or, pyFixed, pyLstrip, pyRound, pyStr, sorted, truthy } from './pycompat.js';

export const ENGINE_VERSION = '2.3.0';
export const CATEGORIES = Object.keys(CATEGORY_WEIGHTS);
export const DEFAULT_ANALYSIS_MODEL = 'claude-opus-5';

export function nullAnalysis(reason = 'ai_provider_not_configured') {
  return { available: false, overall_score: 0.0, category_scores: {}, evidence: [], confidence: 0.0,
    limitations: [reason], recommended_action: null, summary: '', model: null, raw: {}, error: reason };
}

export function recommendAction(score, categories, confidence) {
  const hard = Math.max(categories.credential_harvesting ?? 0, categories.scam_phishing ?? 0,
    categories.counterfeit ?? 0, categories.brand_impersonation ?? 0);
  if (score >= 85 && confidence >= 0.55) return 'enforce';
  if (score >= 70 || (hard >= 80 && confidence >= 0.5)) return 'evidence_package';
  if (score >= 45) return 'investigate';
  return 'monitor';
}

export function limitations(doc, heur, ai) {
  const out = [];
  if (!ai.available) out.push('ai_analysis_unavailable: heuristics-only assessment, lower confidence');
  if (or(heur.notes, []).includes('media_analysis_unavailable')) {
    out.push('media_analysis_unavailable: logo/brand-mark detection was not performed; '
      + 'logo_misuse is scored from text signals only');
  }
  if (!truthy(doc.brand)) {
    out.push('no_brand_context: no protected brand matched this account; impersonation '
      + 'and counterfeit scoring is generic');
  }
  if (!truthy(doc.posts)) out.push('no_post_data: only profile-level fields were available');
  if (!or(doc.posts, []).some(p => truthy(p.comments))) {
    out.push('no_comment_data: comment-level abuse signals could not be evaluated');
  }
  if (or(doc.provenance, {}).lawful_basis === 'permitted_public_page') {
    out.push('metadata_only_source: public page ingestion returns open-graph metadata only');
  }
  out.push('automated_assessment: not a legal determination; human review required before enforcement');
  for (const item of or(ai.limitations, [])) if (!out.includes(item)) out.push(item);
  return out.slice(0, 20);
}

export function fuse(heur, ai, aiWeight) {
  const w = ai.available ? aiWeight : 0.0;
  const cats = {};
  for (const cat of CATEGORIES) {
    const h = Number(heur.category_scores[cat] ?? 0.0);
    const a = ai.available ? Number(ai.category_scores[cat] ?? 0.0) : 0.0;
    const blended = h * (1 - w) + a * w;
    cats[cat] = pyRound(Math.min(100.0, Math.max(blended, 0.75 * Math.max(h, a))), 2);
  }
  let overall = pyRound(Math.min(100.0, Number(heur.overall_score) * (1 - w)
    + (ai.available ? Number(ai.overall_score) : 0.0) * w), 2);
  const values = Object.values(cats);
  overall = pyRound(Math.max(overall, values.length ? 0.8 * Math.max(...values) : 0.0), 2);
  if (overall >= 85 && 'independent_indicators' in heur && Math.trunc(Number(or(heur.independent_indicators, 0))) < 2) {
    overall = 84.0;
  }
  return { overall_score: overall, category_scores: cats };
}

export function computeConfidence(heur, ai, doc) {
  let conf = 0.35;
  if (truthy(doc.brand)) conf += 0.1;
  if (truthy(doc.posts)) conf += 0.1;
  if (or(heur.signals, []).length >= 3) conf += 0.1;
  if (ai.available) conf = conf * 0.5 + (0.5 + ai.confidence * 0.5) * 0.5 + 0.1;
  if (truthy(doc.media_analysis)) conf += 0.05;
  return pyRound(Math.max(0.05, Math.min(0.97, conf)), 3);
}

export function isRegisteredOfficialHandle(doc) {
  const brand = or(doc.brand, {});
  const account = or(doc.account, {});
  const handle = pyLstrip(pyStr(or(account.handle, '')).toLowerCase(), '@');
  const handles = new Set(or(brand.official_handles, []).map(v => pyLstrip(pyStr(v).toLowerCase(), '@')));
  return Boolean(handle && handles.has(handle));
}

export function hasTrustedProfileContext(doc, heur) {
  const notes = or(heur.notes, []);
  return isRegisteredOfficialHandle(doc)
    || notes.includes('established_profile: vocabulary-only alert scoring suppressed')
    || notes.includes('incomplete_profile: ungrounded alert scoring suppressed');
}

export function fallbackSummary(doc, fused, heur) {
  const account = or(doc.account, {});
  const handle = Object.hasOwn(account, 'handle') ? account.handle : 'account';
  const top = sorted(Object.entries(fused.category_scores), { key: kv => kv[1], reverse: true }).slice(0, 3)
    .filter(([, v]) => v > 0).map(([k, v]) => `${k} ${pyFixed(v, 0)}`);
  const brand = or(doc.brand, {}).name;
  const parts = [`Heuristic-only assessment of @${pyStr(handle)}`,
    truthy(brand) ? `against brand "${brand}"` : 'with no matched brand context',
    `- overall ${pyFixed(fused.overall_score, 0)}/100.`];
  if (top.length) parts.push(`Leading categories: ${top.join(', ')}.`);
  parts.push(`${or(heur.signals, []).length} deterministic signals fired.`);
  return parts.join(' ');
}
