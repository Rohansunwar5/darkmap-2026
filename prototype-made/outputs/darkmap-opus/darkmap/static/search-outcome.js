/* Distinguish finished searches from pending work and failed source requests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DarkmapSearchOutcome = factory();
})(globalThis, function () {
  return function describe(job) {
    const result = job.result || {};
    const page = result.pagination;
    const loaded = Number(result.inline_search?.hits?.length || 0);
    const errors = Number(page?.failed_branches || 0);
    const outcome = result.collection_outcome || (job.status === 'failed' ? 'failed'
      : page?.has_more && !loaded ? 'pending'
      : !loaded && errors ? 'failed'
      : page?.has_more || errors ? 'partial' : loaded ? 'complete' : 'empty');
    const problem = result.collection_error?.message || job.error
      || 'The collection source returned errors. Retry this search; this does not mean no matching Instagram content exists.';
    if (outcome === 'blocked' || outcome === 'failed') {
      return { outcome, level: 'failed', title: outcome === 'blocked' ? 'Collection account unavailable' : 'Instagram search failed',
        detail: (loaded ? `${loaded} collected results are preserved. ` : '') + problem,
        save: loaded > 0, resume: false };
    }
    if (outcome === 'pending') {
      return { outcome, level: '', title: 'Collection is still processing',
        detail: 'Waiting for the first results. Collection will continue automatically.', save: false, resume: true };
    }
    if (outcome === 'empty') {
      return { outcome, level: 'succeeded', title: 'No matches returned',
        detail: 'The completed search returned no public matches. Try a more specific keyword or an exact @username.',
        save: true, resume: false };
    }
    return { outcome, level: errors ? 'partial' : 'succeeded',
      title: errors ? 'Partial Instagram results' : 'Instagram results ready',
      detail: `${loaded} results loaded${page ? ` · ${page.new_results} new in this batch` : ''}.`
        + (page?.has_more ? ' Use View more to collect the next batch; unfinished work is saved.' : '')
        + (errors ? ' Some collection requests failed; these results are incomplete.' : ''),
      save: true, resume: false };
  };
});
