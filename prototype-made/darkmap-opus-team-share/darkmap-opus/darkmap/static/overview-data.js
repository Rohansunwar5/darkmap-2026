/* Shared, deterministic overview projections. No collection requests or scoring happen here. */
(function (root) {
  const record = value => value && typeof value === 'object';
  const list = value => Array.isArray(value) ? value.filter(record) : [];
  const key = account => record(account)
    ? String(account.handle || '').replace(/^@/, '').toLowerCase() : '';
  const timestamp = value => {
    const text = String(value || '');
    // The API stores UTC datetimes without a timezone suffix.
    return Date.parse(text.includes('T') && !/(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text + 'Z' : text) || 0;
  };
  const score = value => value == null || value === '' || !Number.isFinite(Number(value))
    ? null : Number(value);

  function accountsFromResult(result, collectedAt) {
    result = record(result) ? result : {};
    const assessments = new Map(list(result.assessments).filter(key).map(item => [key(item), item]));
    const accounts = new Map();
    // Count unique authors of loaded evidence, never account + post rows twice.
    for (const hit of list(result.inline_search?.hits)) {
      if (!key(hit)) continue;
      const previous = accounts.get(key(hit));
      if (previous && hit.doc_type !== 'account') continue;
      const assessment = assessments.get(key(hit));
      accounts.set(key(hit), {
        id: hit.account_id, platform: 'instagram', handle: hit.handle,
        display_name: hit.doc_type === 'account' ? hit.title : hit.handle,
        biography: hit.doc_type === 'account' ? hit.content || hit.snippet : null,
        external_url: hit.doc_type === 'account' ? hit.outbound_url : null,
        profile_pic_url: hit.doc_type === 'account' ? hit.image_url : assessment?.profile_pic_url,
        followers_count: hit.followers_count, is_verified: hit.is_verified,
        media_count: hit.media_count, provenance: hit.provenance || {},
        latest_risk_score: score(assessment?.overall_score ?? hit.risk_score),
        latest_action: assessment?.recommended_action || null,
        last_seen_at: collectedAt, collected_query: result.inline_search?.query || '',
        snapshot: true,
        latest_assessment: assessment ? {
          ...assessment, id: assessment.assessment_id,
          evidence: assessment.evidence || assessment.top_evidence || [],
        } : null,
      });
    }
    return [...accounts.values()];
  }

  function mergeAccounts(existing, incoming) {
    const merged = new Map(list(existing).filter(key).map(item => [key(item), item]));
    for (const item of list(incoming)) {
      if (!key(item)) continue;
      const previous = merged.get(key(item));
      // A cold instance may return an older index; it must not erase a newer live snapshot.
      if (previous && timestamp(previous.last_seen_at) > timestamp(item.last_seen_at)) continue;
      if (previous?.snapshot && !item.snapshot
          && timestamp(previous.last_seen_at) === timestamp(item.last_seen_at)) continue;
      merged.set(key(item), { ...item });
    }
    return [...merged.values()].sort((a, b) =>
      (score(b.latest_risk_score) ?? -1) - (score(a.latest_risk_score) ?? -1)
      || (a.followers_count ?? Infinity) - (b.followers_count ?? Infinity)
      || key(a).localeCompare(key(b)));
  }

  function bucket(value) {
    const valueScore = score(value);
    if (valueScore == null) return 'unscored';
    return valueScore >= 85 ? 'critical' : valueScore >= 70 ? 'high'
      : valueScore >= 45 ? 'elevated' : 'low';
  }

  function metrics(accounts, jobs) {
    const buckets = { critical: 0, high: 0, elevated: 0, low: 0, unscored: 0 };
    let sum = 0;
    for (const account of accounts) {
      buckets[bucket(account.latest_risk_score)] += 1;
      sum += score(account.latest_risk_score) ?? 0;
    }
    const scored = accounts.length - buckets.unscored;
    return { total: accounts.length, scored, buckets, average: scored ? sum / scored : null,
      high: buckets.critical + buckets.high,
      active: list(jobs).filter(job => ['queued', 'running'].includes(job.status)).length };
  }

  function filterAccounts(accounts, filter) {
    return accounts.filter(account => {
      const value = score(account.latest_risk_score);
      if (filter === 'all') return true;
      if (['critical', 'high', 'elevated', 'low', 'unscored'].includes(filter))
        return bucket(value) === filter;
      return value != null && value >= Number(filter);
    });
  }

  function mergeJobs(existing, incoming) {
    const merged = new Map(list(existing).filter(item => item.id != null)
      .map(item => [item.id, item]));
    for (const item of list(incoming).filter(item => item.id != null)) {
      const previous = merged.get(item.id);
      if (!previous || timestamp(item.updated_at || item.created_at)
          >= timestamp(previous.updated_at || previous.created_at)) merged.set(item.id, item);
    }
    return [...merged.values()].sort((a, b) =>
      timestamp(b.updated_at || b.created_at) - timestamp(a.updated_at || a.created_at));
  }

  function jobSummary(job) {
    if (!record(job) || job.id == null) return null;
    const result = job.result || {};
    return { id: job.id, kind: job.kind, status: job.status, attempts: job.attempts,
      payload: { handle: job.payload?.handle, account_id: job.payload?.account_id },
      created_at: job.created_at, updated_at: job.updated_at,
      overview_summary: job.overview_summary || {
        accounts: result.account_count ?? null, posts: result.posts ?? null,
        loaded: result.pagination?.loaded_results ?? result.inline_search?.total ?? null,
        has_more: Boolean(result.pagination?.has_more),
      } };
  }

  function mergeMedia(existing, hits) {
    const media = new Map(list(existing).filter(item => item.key)
      .map(item => [item.key, item]));
    for (const hit of list(hits)) {
      if (hit.doc_type !== 'post') continue;
      let path;
      try {
        const url = new URL(hit.instagram_url);
        if (!/(^|\.)instagram\.com$/i.test(url.hostname)) continue;
        path = url.pathname.match(/^\/(p|reel|reels|tv)\/([^/]+)/i);
      } catch { continue; }
      if (!path) continue;
      const id = `media:${path[2]}`;
      const kind = String(hit.post_type || '').toLowerCase();
      const type = ['reel', 'reels'].includes(kind) || /^reels?$/i.test(path[1]) ? 'reels'
        : ['post', 'image', 'photo', 'video', 'carousel', 'sidecar', 'carousel_album'].includes(kind) ? 'posts' : 'unknown';
      const previous = media.get(id);
      media.set(id, { key: id, handle: key(hit) || previous?.handle || '',
        type: type === 'unknown' && previous ? previous.type : type });
    }
    return [...media.values()];
  }

  function reachBucket(value) {
    const count = score(value);
    if (count == null || count < 0) return 'unknown';
    return count < 1000 ? 'under1k' : count < 10000 ? '1k10k' : count < 100000 ? '10k100k' : 'over100k';
  }

  function chartSummary(accounts, media, familyNames) {
    const content = { accounts: accounts.length, posts: 0, reels: 0, unknown: 0 };
    const reach = Object.fromEntries(['under1k', '1k10k', '10k100k', 'over100k', 'unknown']
      .map(name => [name, { total: 0, high: 0 }]));
    const families = Object.fromEntries(familyNames.map(name => [name, 0]));
    let assessed = 0;
    for (const item of media) if (Object.hasOwn(content, item.type) && item.type !== 'accounts') content[item.type] += 1;
    for (const account of accounts) {
      const range = reach[reachBucket(account.followers_count)];
      range.total += 1;
      if (score(account.latest_risk_score) >= 70) range.high += 1;
      const assessment = account.latest_assessment;
      if (!assessment) continue;
      assessed += 1;
      for (const name of familyNames) if (assessment.alert_families?.[name]?.active === true) families[name] += 1;
    }
    return { content, reach, families, assessed };
  }

  function filterChartAccounts(accounts, media, selection) {
    if (!selection) return accounts;
    if (selection.kind === 'reach') return accounts.filter(account => reachBucket(account.followers_count) === selection.value);
    if (selection.kind === 'family') return accounts.filter(account => account.latest_assessment?.alert_families?.[selection.value]?.active === true);
    if (selection.kind === 'content' && selection.value !== 'accounts') {
      const handles = new Set(media.filter(item => item.type === selection.value).map(item => item.handle));
      return accounts.filter(account => handles.has(key(account)));
    }
    return accounts;
  }

  const api = { accountsFromResult, mergeAccounts, metrics, filterAccounts, mergeJobs, jobSummary, key, timestamp,
    mergeMedia, reachBucket, chartSummary, filterChartAccounts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DarkmapOverview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
