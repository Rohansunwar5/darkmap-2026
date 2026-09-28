const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const overviewData = DarkmapOverview;
const historyStore = DarkmapHistory.createStore();
let historyWrites = Promise.resolve();
let healthRequest = null;
const overviewStorageKey = 'darkmapOverview.v1';
function readOverview() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(overviewStorageKey) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.accounts) || !Array.isArray(saved.jobs)) return {};
    saved.accounts = saved.accounts.filter(item => item && typeof item === 'object');
    saved.jobs = saved.jobs.filter(item => item && typeof item === 'object' && item.id != null)
      .map(job => ['queued', 'running'].includes(job.status)
      ? { ...job, status: 'unknown' } : job);
    return saved;
  } catch { return {}; }
}
const savedOverview = readOverview();

const state = {
  apiKey: localStorage.getItem('darkmapApiKey') || '',
  health: null,
  sourceProblem: null,
  brands: [],
  accounts: savedOverview.accounts || [],
  mediaRecords: Array.isArray(savedOverview.mediaRecords) ? savedOverview.mediaRecords : [],
  mediaTracked: Boolean(savedOverview.mediaTracked),
  chartSelection: null,
  jobs: savedOverview.jobs || [],
  activeCollections: new Map(),
  overviewSaved: Boolean(savedOverview.version),
  audit: [],
  alerts: [],
  campaigns: [],
  cases: [],
  view: 'overview',
  query: '',
  searchScope: 'all',
  liveSearchPending: false,
  liveAccountIds: [],
  inlineSearchResult: null,
  lastSearchResult: null,
  lastSearchMeta: null,
  liveAssessments: [],
  serverlessEphemeral: false,
  searchPage: null,
  searchOutcome: null,
  searchResumeTimer: null,
  searchEpoch: 0,
  historyRun: null,
  historyEntry: null,
  historyEntries: [],
  historyError: '',
  historyReadEpoch: 0,
  polling: new Map(),
};

const viewTitles = {
  overview: 'Protection overview',
  alerts: 'Critical fraud alerts',
  campaigns: 'Campaigns and cases',
  investigations: 'Global search',
  history: 'Search history',
  jobs: 'Collection jobs',
  audit: 'Audit trail',
};

const modeCopy = {
  account: { label: 'Instagram account', prefix: '@', placeholder: 'account.name', required: true,
    note: 'Public account and recent media through the connected source' },
  hashtag_recent: { label: 'Hashtag keyword', prefix: '#', placeholder: 'brandname', required: true,
    note: 'Public Instagram discovery through the connected source' },
  hashtag_top: { label: 'Hashtag keyword', prefix: '#', placeholder: 'brandname', required: true,
    note: 'Public Instagram discovery through the connected source' },
  owned: { label: 'Connected Instagram account', prefix: '◎', placeholder: 'Uses configured account', required: false,
    note: 'Includes comments on media owned by your connected account' },
  tagged: { label: 'Connected Instagram account', prefix: '◎', placeholder: 'Uses configured account', required: false,
    note: 'Media where the connected professional account is tagged' },
};

const searchScopeLabels = {
  all: 'all evidence', accounts: 'accounts', posts: 'posts and reels',
  hashtags: 'hashtags', mentions: 'mentions', urls: 'URLs',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.apiKey) headers.set('X-API-Key', state.apiKey);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.detail || `Darkmap returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function ensureHealth(force = false) {
  if (!force && state.health) return state.health;
  if (!healthRequest) {
    healthRequest = api('/healthz').then(health => {
      state.health = health;
      renderSourceStatus();
      return health;
    }).finally(() => { healthRequest = null; });
  }
  return healthRequest;
}

function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  $('#toastRegion').append(node);
  setTimeout(() => node.remove(), 4300);
}

function formatNumber(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(overviewData.timestamp(value));
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function riskInfo(score) {
  const value = Number(score ?? 0);
  if (value >= 85) return { label: 'Critical', color: '#ff5b6e' };
  if (value >= 70) return { label: 'High', color: '#ff916b' };
  if (value >= 45) return { label: 'Elevated', color: '#f4b84a' };
  return { label: 'Low', color: '#3ac1ff' };
}

function initials(handle) {
  return String(handle || '?').split(/[._-]/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
}

function switchView(view) {
  state.view = view;
  $$('.view').forEach(node => node.classList.toggle('active', node.id === `view-${view}`));
  $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#pageTitle').textContent = viewTitles[view] || 'Darkmap';
  if (view === 'investigations' && !state.liveSearchPending && state.query
      && state.liveAccountIds.length && !state.inlineSearchResult) loadSearch(state.query);
  if (view === 'alerts' || view === 'campaigns') refreshThreatIntel();
  if (view === 'jobs') refreshJobs();
  if (view === 'audit') refreshAudit();
  if (view === 'history') loadHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHistory() {
  const filter = $('#historyFilter').value.trim().toLowerCase();
  const entries = state.historyEntries.filter(entry => entry.displayQuery.toLowerCase().includes(filter));
  $('#historyCount').textContent = state.historyEntries.length;
  $('#historySummary').textContent = `${state.historyEntries.length} saved search${state.historyEntries.length === 1 ? '' : 'es'}`;
  $('#historyEntries').innerHTML = state.historyError
    ? `<div class="empty-state"><h4>History unavailable</h4><p>${escapeHtml(state.historyError)}</p></div>`
    : entries.length ? entries.map(entry => `<article class="history-row">
      <button class="history-open" type="button" data-history-open="${escapeHtml(entry.id)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/></svg>
        <span><strong>${escapeHtml(entry.displayQuery)}</strong><small>${escapeHtml(formatDate(entry.startedAt || entry.savedAt))} · ${entry.accounts} accounts · ${entry.posts} posts / reels</small>
          <small>${entry.batches} batch${entry.batches === 1 ? '' : 'es'} saved${entry.hasMore ? ' · More results were available to collect' : entry.partial ? ' · Some source results were unavailable' : ''}</small></span>
        <span class="history-total">${entry.total} results ↗</span>
      </button>
      <button class="icon-button" type="button" data-history-remove="${escapeHtml(entry.id)}" aria-label="Delete saved search for ${escapeHtml(entry.displayQuery)}" title="Delete saved search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg></button>
    </article>`).join('')
    : `<div class="empty-state"><h4>${filter ? 'No matching saved searches' : 'No saved searches yet'}</h4><p>${filter ? 'Try another query in the history filter.' : 'Your next completed search will appear here with all loaded results.'}</p></div>`;
}

async function loadHistory() {
  const key = state.apiKey;
  try {
    const entries = await historyStore.list(await DarkmapHistory.scope(key));
    if (key !== state.apiKey) return;
    state.historyEntries = entries;
    state.historyError = '';
  } catch {
    if (key !== state.apiKey) return;
    state.historyEntries = [];
    state.historyError = 'Saved searches could not be opened. Allow browser storage and try again.';
  }
  renderHistory();
}

function saveSearchToHistory() {
  if (!state.historyRun || state.historyEntry || !state.lastSearchResult) return;
  if (state.searchOutcome && !state.searchOutcome.save) return;
  const entry = DarkmapHistory.snapshot({ ...state.historyRun, query: state.query,
    result: state.inlineSearchResult || state.lastSearchResult, assessments: state.liveAssessments,
    collection: state.lastSearchMeta, pagination: state.searchPage });
  const key = state.apiKey;
  // Serialize batch updates so a slower first write cannot replace a later, larger batch.
  historyWrites = historyWrites.then(async () => {
    await historyStore.save(await DarkmapHistory.scope(key), entry);
    if (key === state.apiKey) await loadHistory();
  }).catch(() => toast('Results are ready, but history could not be saved. Free browser storage or download the JSON to keep them.', 'error'));
}

async function openHistory(id) {
  if (state.liveSearchPending) {
    toast('Let the current batch finish before opening a saved search.');
    return;
  }
  const epoch = state.searchEpoch;
  const read = ++state.historyReadEpoch;
  const key = state.apiKey;
  try {
    const entry = await historyStore.get(await DarkmapHistory.scope(key), id);
    if (epoch !== state.searchEpoch || read !== state.historyReadEpoch || key !== state.apiKey) return;
    if (!entry) { toast('This saved search is no longer available.', 'error'); await loadHistory(); return; }
    ++state.searchEpoch;
    state.historyEntry = entry;
    state.searchOutcome = null;
    clearTimeout(state.searchResumeTimer);
    state.historyRun = null;
    state.query = entry.query;
    state.searchScope = 'all';
    state.inlineSearchResult = entry.result;
    state.lastSearchResult = entry.result;
    state.lastSearchMeta = { ...entry.collection, opened_from_history: true, history_saved_at: entry.savedAt };
    state.liveAssessments = entry.assessments;
    state.liveAccountIds = [];
    state.searchPage = null; // History is a frozen snapshot, never an automatic continuation.
    state.serverlessEphemeral = true;
    state.alerts = entry.assessments.filter(item => Number(item.overall_score || 0) >= 45);
    syncSearchInputs(entry.displayQuery);
    $('#searchScopes').classList.remove('disabled');
    setSearchLoadingScene(false);
    setLiveSearchBusy(false);
    $('#searchViewEyebrow').textContent = 'SAVED SEARCH RESULTS';
    $('#searchViewDescription').textContent = 'Results and rankings as they were saved. Use the search bar to collect fresh data.';
    setLiveSearchStatus('succeeded saved', 'Saved search results',
      `${entry.result.hits.length} results · Saved ${formatDate(entry.savedAt)}. Search above to collect fresh results.`);
    renderDetectionCoverage(); renderInlineScope(); renderSearchPagination(); renderAlerts();
    switchView('investigations');
  } catch { toast('This saved search could not be opened. Try again.', 'error'); }
}

async function removeHistory(id) {
  const key = state.apiKey;
  try {
    await historyWrites;
    await historyStore.remove(await DarkmapHistory.scope(key), id);
    if (key === state.apiKey) { await loadHistory(); toast('Saved search deleted.'); }
  } catch { toast('The saved search could not be deleted.', 'error'); }
}

function renderBrands() {
  const select = $('#scanBrand');
  const selected = select.value;
  select.innerHTML = '<option value="">No brand selected</option>' + state.brands.map(brand =>
    `<option value="${brand.id}">${escapeHtml(brand.name)}</option>`).join('');
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  else if (state.brands.length === 1) select.value = String(state.brands[0].id);
}

function overviewJobs() {
  return overviewData.mergeJobs(state.jobs, [...state.activeCollections.values()]);
}

function clearOverview() {
  state.accounts = []; state.jobs = []; state.overviewSaved = false;
  state.mediaRecords = []; state.mediaTracked = false; state.chartSelection = null;
  sessionStorage.removeItem(overviewStorageKey);
  renderOverview();
}

function persistOverview() {
  try {
    sessionStorage.setItem(overviewStorageKey, JSON.stringify({ version: 1,
      accounts: state.accounts, mediaRecords: state.mediaRecords, mediaTracked: state.mediaTracked,
      jobs: state.jobs.map(overviewData.jobSummary).filter(Boolean) }));
    state.overviewSaved = true;
  } catch { state.overviewSaved = false; }
}

function renderOverview() {
  renderMetrics(); renderAccounts(); renderActivity(); renderJobs(); renderVisualizations();
}

function rememberJob(job) {
  if (!job || typeof job !== 'object' || job.id == null) return;
  state.jobs = overviewData.mergeJobs(state.jobs, [job]);
  persistOverview();
  renderOverview();
}

function trackCollection(query) {
  const id = `request:${crypto.randomUUID()}`;
  state.activeCollections.set(id, { id, kind: 'ingest', status: 'running', attempts: 1,
    payload: { handle: query }, created_at: new Date().toISOString() });
  renderOverview();
  return () => { state.activeCollections.delete(id); renderOverview(); };
}

function ingestOverview(job) {
  state.mediaRecords = overviewData.mergeMedia(state.mediaRecords, job.result?.inline_search?.hits);
  state.mediaTracked = true;
  state.accounts = overviewData.mergeAccounts(state.accounts,
    overviewData.accountsFromResult(job.result || {}, job.updated_at || new Date().toISOString()));
  persistOverview();
  renderOverview();
}

function renderMetrics() {
  const metrics = overviewData.metrics(state.accounts, overviewJobs());
  $('#metricAccounts').textContent = formatNumber(metrics.total);
  $('#metricAccountsNote').textContent = `${metrics.scored} scored · ${metrics.buckets.unscored} unscored`;
  $('#metricHighRisk').textContent = formatNumber(metrics.high);
  $('#metricHighRiskNote').textContent = `${metrics.buckets.critical} critical · ${metrics.buckets.high} high`;
  $('#metricJobs').textContent = formatNumber(metrics.active);
  $('#metricJobsNote').textContent = metrics.active ? 'Collection in progress' : 'No active collection jobs';
  $('#metricAverage').textContent = metrics.average == null ? '—' : metrics.average.toFixed(1);
  $('#investigationCount').textContent = metrics.total;
  $('#jobCount').textContent = metrics.active;
  const latest = state.accounts.reduce((date, account) =>
    overviewData.timestamp(account.last_seen_at) > overviewData.timestamp(date) ? account.last_seen_at : date, null);
  $('#overviewDataNote').textContent = metrics.total
    ? `${metrics.total} unique collected accounts · Updated ${formatDate(latest)} · ${state.overviewSaved ? 'Summaries saved in this tab' : 'Summaries kept on this page'}`
    : 'Overview fills with collected evidence after a search or scan.';
  $('#riskUnscoredNote').textContent = `${metrics.buckets.unscored} unscored accounts excluded from the chart and average.`;
  let angle = 0;
  for (const [key, color] of [['critical', '#ff5b6e'], ['high', '#ff916b'], ['elevated', '#f4b84a'], ['low', '#3ac1ff']]) {
    const value = metrics.buckets[key];
    const percent = metrics.scored ? value / metrics.scored * 100 : 0;
    $(`#risk${key[0].toUpperCase()}${key.slice(1)}`).textContent = value;
    const button = $(`[data-risk-bucket="${key}"]`);
    button.title = `${value} ${key} accounts · ${percent.toFixed(1)}% of scored accounts`;
    button.setAttribute('aria-label', button.title + '. Show accounts');
    const segment = $(`[data-risk-segment="${key}"]`);
    segment.setAttribute('stroke', color);
    segment.setAttribute('stroke-dasharray', `${percent} ${100 - percent}`);
    segment.setAttribute('stroke-dashoffset', -angle);
    segment.style.display = value ? '' : 'none';
    segment.setAttribute('aria-label', button.title + '. Show accounts');
    segment.querySelector('title').textContent = button.title;
    angle += percent;
  }
  $('#riskRingValue').textContent = metrics.scored;
}

function showOverviewAccounts(filter = 'all') {
  state.chartSelection = null;
  switchView('overview');
  $('#riskFilter').value = filter;
  renderAccounts();
  $('.findings-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const contentLabels = { accounts: 'Accounts', posts: 'Posts', reels: 'Reels', unknown: 'Other media' };
const reachLabels = { under1k: 'Under 1k', '1k10k': '1k–10k', '10k100k': '10k–100k', over100k: '100k+', unknown: 'Unknown' };
const contentColors = { accounts: '#3ac1ff', posts: '#5389d8', reels: '#9a91ef', unknown: '#637988' };

function chartButton(kind, value, label, content, disabled = false, className = '', style = '') {
  return `<button type="button" style="${escapeHtml(style)}" class="${className}" data-chart-kind="${kind}" data-chart-value="${value}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>${content}</button>`;
}

function renderVisualizations() {
  const charts = overviewData.chartSummary(state.accounts, state.mediaRecords, Object.keys(alertFamilyLabels));
  const types = Object.entries(charts.content).filter(([name, count]) => name !== 'unknown' || count > 0);
  const total = types.reduce((sum, [,count]) => sum + count, 0);
  if (!total) {
    $('#contentMixChart').innerHTML = '<div class="chart-empty"><span aria-hidden="true">▥</span><b>Your collection at a glance</b><p>Accounts, posts and reels appear here after a search.</p></div>';
  } else {
    $('#contentMixChart').innerHTML = `<div class="chart-total"><strong>${formatNumber(total)}</strong><span>${state.mediaTracked ? 'collected items' : 'collected accounts'}</span></div>
      <div class="content-stack" aria-label="Collected item proportions">${types.filter(([,count]) => count).map(([name, count]) => chartButton('content', name,
        `${count} ${contentLabels[name].toLowerCase()} · ${(count / total * 100).toFixed(1)}%. Show related accounts`,
        `<span class="sr-only">${count} ${contentLabels[name]}</span>`, false, `stack-segment mix-${name}`, `width:${count / total * 100}%;--segment-color:${contentColors[name]}`)).join('')}</div>
      <div class="mix-legend">${types.map(([name, count]) => chartButton('content', name,
        `${contentLabels[name]}: ${state.mediaTracked || name === 'accounts' ? count : 'not available'}. Show related accounts`,
        `<span class="chart-dot" style="background:${contentColors[name]}"></span><span>${contentLabels[name]}</span><b>${state.mediaTracked || name === 'accounts' ? formatNumber(count) : '—'}</b>`, !count, 'mix-key')).join('')}</div>`;
  }
  $('#contentMixNote').textContent = state.mediaTracked
    ? 'Unique accounts and loaded media. Click a type to see its accounts.'
    : 'Run a search to add the media breakdown to your saved account summaries.';

  const signals = Object.entries(charts.families).filter(([,count]) => count).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxSignal = Math.max(1, ...signals.map(([,count]) => count));
  $('#riskSignalsChart').innerHTML = signals.length ? `<div class="signal-bars">${signals.map(([name, count]) => chartButton('family', name,
    `${alertFamilyLabels[name]}: ${count} accounts. Show matching accounts`,
    `<span class="signal-bar-label">${escapeHtml(alertFamilyLabels[name])}<b>${count}</b></span><span class="insight-bar-track"><span style="width:${count / maxSignal * 100}%"></span></span>`, false, 'signal-bar')).join('')}</div>`
    : `<div class="chart-empty"><span aria-hidden="true">⌁</span><b>${charts.assessed ? 'No active risk signals' : 'Waiting for assessed evidence'}</b><p>${charts.assessed ? 'No active categories were returned in the collected assessments.' : 'This chart fills when collected accounts have a risk assessment.'}</p></div>`;
  $('#riskSignalsNote').textContent = `Top 5 by account count · ${charts.assessed} assessed. Signals may overlap and require review.`;

  const ranges = Object.entries(charts.reach).filter(([name]) => name !== 'unknown');
  const known = ranges.reduce((sum, [,range]) => sum + range.total, 0);
  const maxReach = Math.max(1, ...ranges.map(([,range]) => range.total));
  $('#followerReachChart').innerHTML = known ? `<div class="reach-chart" aria-label="Accounts by follower range"><div class="reach-grid" aria-hidden="true"></div>${ranges.map(([name, range]) => chartButton('reach', name,
    `${reachLabels[name]} followers: ${range.total} accounts, ${range.high} high-risk. Show accounts`,
    `<span class="reach-column"><b>${range.total}</b><span class="reach-bar" style="height:${range.total / maxReach * 118}px"><span class="reach-high" style="height:${range.total ? range.high / range.total * 100 : 0}%"></span></span></span><span class="reach-label">${reachLabels[name]}</span>`, !range.total, 'reach-key')).join('')}</div>
      <div class="chart-key"><span><i style="background:#3ac1ff"></i>Other accounts</span><span><i style="background:#ff916b"></i>High-risk · 70+</span></div>`
    : '<div class="chart-empty"><span aria-hidden="true">▥</span><b>Follower data not available yet</b><p>Known follower counts will appear in these ranges.</p></div>';
  $('#followerReachNote').innerHTML = `${charts.reach.unknown.total ? chartButton('reach', 'unknown', 'Show accounts with unknown follower counts', `${charts.reach.unknown.total} unknown`, false, 'text-button') + ' · ' : ''}Follower count is context, not proof of fraud.`;
}

function showChartAccounts(kind, value) {
  const label = kind === 'family' ? `Signal: ${alertFamilyLabels[value]}`
    : kind === 'reach' ? `Followers: ${reachLabels[value]}`
    : value === 'accounts' ? 'All collected accounts' : `Accounts with ${contentLabels[value].toLowerCase()}`;
  state.chartSelection = { kind, value, label };
  switchView('overview');
  $('#riskFilter').value = 'all';
  renderAccounts();
  $('.findings-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sourceLabel(account) {
  const mode = account.provenance?.collection_mode;
  if (mode === 'hashtag_recent' || mode === 'hashtag_top') return 'Hashtag';
  if (mode === 'owned') return 'Owned';
  if (mode === 'tagged') return 'Tagged';
  if (account.provenance?.lawful_basis === 'user_export') return 'Export';
  if (account.provenance?.lawful_basis === 'permitted_public_page') return 'Public page';
  return 'Instagram';
}

function renderAccounts() {
  const threshold = $('#riskFilter').value;
  const accounts = overviewData.filterAccounts(
    overviewData.filterChartAccounts(state.accounts, state.mediaRecords, state.chartSelection), threshold);
  $('#chartSelection').hidden = !state.chartSelection;
  $('#chartSelectionLabel').textContent = state.chartSelection?.label || '';
  $('#findingsCount').textContent = `${accounts.length} of ${state.accounts.length} accounts`;
  $$('[data-risk-bucket]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.riskBucket === threshold)));
  $('#findingsEmpty').classList.toggle('hidden', accounts.length > 0);
  $('#findingsBody').innerHTML = accounts.map(account => {
    const score = Number(account.latest_risk_score ?? 0);
    const info = riskInfo(score);
    const action = account.latest_action || 'pending';
    return `<tr>
      <td><div class="account-cell"><span class="avatar">${escapeHtml(initials(account.handle))}</span><div><b>@${escapeHtml(account.handle)}</b><span>${escapeHtml(account.display_name || 'Instagram account')}</span></div></div></td>
      <td>${escapeHtml(sourceLabel(account))}</td>
      <td>${formatNumber(account.followers_count)}</td>
      <td><div class="risk-score"><b>${account.latest_risk_score == null ? '—' : score.toFixed(0)}</b><span class="score-track"><i style="width:${Math.max(3, score)}%;background:${info.color}"></i></span></div></td>
      <td><span class="badge ${escapeHtml(action)}">${escapeHtml(action.replaceAll('_', ' '))}</span></td>
      <td>${escapeHtml(formatDate(account.last_seen_at))}</td>
      <td><button class="row-action" data-account="${account.id}" data-account-handle="${escapeHtml(account.handle)}" aria-label="Open @${escapeHtml(account.handle)}">›</button></td>
    </tr>`;
  }).join('');
  $$('[data-account]', $('#findingsBody')).forEach(button => button.addEventListener('click', () => openAccount(button.dataset.account, button.dataset.accountHandle)));
}

function jobTarget(job) {
  return job.payload?.handle || (job.payload?.account_id ? `Account ${job.payload.account_id}` : 'Pipeline task');
}

function renderActivity() {
  const jobs = overviewJobs().slice(0, 4);
  $('#activityList').innerHTML = jobs.length ? jobs.map(job => `<button type="button" class="activity-item" data-activity-job="${escapeHtml(job.id)}">
    <span class="activity-icon">${job.kind === 'ingest' ? 'IG' : 'AI'}</span>
    <div><b>${escapeHtml(jobTarget(job))}</b><span>${escapeHtml(formatDate(job.updated_at || job.created_at))} · ${escapeHtml(jobActivityNote(job))}</span></div>
    <span class="badge ${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
  </button>`).join('') : '<div class="empty-mini">No collection jobs yet</div>';
  $$('[data-activity-job]').forEach(button => button.addEventListener('click', () => showJob(button.dataset.activityJob)));
}

function jobActivityNote(job) {
  const summary = overviewData.jobSummary(job).overview_summary;
  return summary.loaded == null ? job.status === 'unknown' ? 'Refresh to check status' : job.status.replaceAll('_', ' ')
    : `${summary.loaded} results loaded${summary.has_more ? ' · more available' : ''}`;
}

function showJob(id) {
  state.selectedJob = id;
  switchView('jobs');
  renderJobs();
  const row = $$('[data-job-row]').find(node => node.dataset.jobRow === id);
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderJobs() {
  const jobs = overviewJobs();
  $('#jobsBody').innerHTML = jobs.length ? jobs.map(job => `<tr data-job-row="${escapeHtml(job.id)}" class="${state.selectedJob === job.id ? 'selected-job' : ''}">
    <td><code>${escapeHtml(job.id.slice(0, 9))}</code></td>
    <td>${escapeHtml(job.kind)}</td>
    <td>${escapeHtml(jobTarget(job))}</td>
    <td><span class="badge ${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></td>
    <td>${job.attempts ?? 0}</td>
    <td>${escapeHtml(formatDate(job.updated_at || job.created_at))}</td>
  </tr>`).join('') : '<tr><td colspan="6"><div class="empty-mini">No jobs yet</div></td></tr>';
}

function renderAudit() {
  $('#auditStream').innerHTML = state.audit.length ? state.audit.map(entry => `<article class="audit-item">
    <time>${escapeHtml(formatDate(entry.at))}</time>
    <b>${escapeHtml(entry.action)}</b>
    <span class="audit-target">${escapeHtml(entry.target || (entry.provider ? 'collection source' : 'system'))}</span>
    <span class="badge ${escapeHtml(entry.status || '')}">${escapeHtml(entry.status || 'recorded')}</span>
  </article>`).join('') : '<div class="empty-mini">No audit records yet</div>';
}

function humanLabel(value) { return String(value || '').replaceAll('_', ' '); }

const alertFamilyLabels = {
  credential_takeover: 'Credential takeover', payment_fraud: 'Payment fraud',
  fake_customer_support: 'Fake support', scam_promotions: 'Scam promotions',
  counterfeit_sales: 'Counterfeit sales',
  employee_recruiter_impersonation: 'Employee / recruiter',
  malicious_apps_downloads: 'Malicious downloads',
  investment_financial_impersonation: 'Investment fraud',
};

function renderDetectionCoverage() {
  const panel = $('#detectionCoverage');
  if (!panel) return;
  if (!state.liveAssessments.length) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  const counts = Object.fromEntries(Object.keys(alertFamilyLabels).map(name => [name, 0]));
  state.liveAssessments.forEach(assessment => Object.entries(assessment.alert_families || {})
    .forEach(([name, value]) => { if (counts[name] != null && value?.active) counts[name] += 1; }));
  panel.innerHTML = `<div><b>${state.searchPage?.has_more ? 'Risk checks on collected evidence' : 'All critical checks completed'}</b><span>${state.liveAssessments.length} accounts evaluated · critical alerts require 2 independent indicators</span></div><div class="coverage-families">${Object.entries(alertFamilyLabels).map(([name, label]) => `<span class="${counts[name] ? 'active' : ''}">${escapeHtml(label)} <b>${counts[name]}</b></span>`).join('')}</div>`;
  panel.classList.remove('hidden');
}

function renderAlerts() {
  const family = $('#alertFamilyFilter')?.value || '';
  const alerts = state.alerts.filter(alert => !family || alert.alert_families?.[family]?.active);
  $('#alertCount').textContent = state.alerts.filter(alert => Number(alert.overall_score) >= 85).length;
  $('#alertGrid').innerHTML = alerts.length ? alerts.map(alert => {
    const info = riskInfo(alert.overall_score);
    const activeFamilies = Object.entries(alert.alert_families || {})
      .filter(([, value]) => value.active).sort((a, b) => b[1].score - a[1].score).slice(0, 4);
    const evidenceSignals = (alert.top_evidence || []).slice(0, 4).map(item => item.signal);
    const image = safeHttpsUrl(alert.profile_pic_url);
    const profile = safeHttpsUrl(alert.instagram_url);
    return `<article class="alert-card" style="--alert-color:${info.color}">
      <div class="alert-head"><div class="alert-account">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span class="avatar">${escapeHtml(initials(alert.handle))}</span>`}<div><b>@${escapeHtml(alert.handle)}</b><span>${escapeHtml(alert.recommended_action || 'review')} · ${Math.round(Number(alert.confidence) * 100)}% confidence</span></div></div><span class="alert-score">${Number(alert.overall_score).toFixed(0)}</span></div>
      <p class="alert-summary">${escapeHtml(alert.summary || 'Grounded signals require investigator review.')}</p>
      <div class="family-pills">${activeFamilies.map(([name, value]) => `<span>${escapeHtml(humanLabel(name))} ${Number(value.score).toFixed(0)}</span>`).join('')}</div>
      <div class="dimension-grid">${['deception','harm','exposure','coordination'].map(name => `<div><small>${name}</small><b>${Number(alert.dimensions?.[name] || 0).toFixed(0)}</b></div>`).join('')}</div>
      <div class="indicator-pills">${evidenceSignals.map(name => `<span>${escapeHtml(humanLabel(name))}</span>`).join('')}<span>${Number(alert.independent_indicators || 0)} independent indicators</span></div>
      <div class="alert-actions"><button data-alert-account="${alert.account_id}" data-alert-handle="${escapeHtml(alert.handle)}">Open evidence</button><button data-create-case="${alert.assessment_id}" data-case-handle="${escapeHtml(alert.handle)}">Create case</button>${profile ? `<a href="${escapeHtml(profile)}" target="_blank" rel="noopener noreferrer">Instagram ↗</a>` : ''}</div>
    </article>`;
  }).join('') : '<div class="empty-state"><h4>No matching priority alerts</h4><p>Run a brand search or choose another alert family.</p></div>';
  $$('[data-alert-account]').forEach(button => button.addEventListener('click', () => openAccount(button.dataset.alertAccount, button.dataset.alertHandle)));
  $$('[data-create-case]').forEach(button => button.addEventListener('click', () => createCaseFromAlert(button.dataset.createCase, button.dataset.caseHandle)));
}

function renderCampaigns() {
  $('#campaignCount').textContent = state.campaigns.length;
  $('#campaignList').innerHTML = state.campaigns.length ? state.campaigns.map(campaign => `<article class="intel-item"><div class="intel-item-head"><h4>${escapeHtml(campaign.name)}</h4><span class="badge">${Number(campaign.severity || 0).toFixed(0)}</span></div><p>${escapeHtml(campaign.summary || '')}</p><div class="intel-item-meta"><span>${campaign.members?.length || 0} accounts</span><span>${campaign.shared_artifacts?.length || 0} shared pivots</span><span>${escapeHtml(campaign.status)}</span></div></article>`).join('') : '<div class="empty-mini">Campaigns appear when two or more accounts reuse infrastructure, payments, media, or content.</div>';
  $('#caseList').innerHTML = state.cases.length ? state.cases.map(item => `<article class="intel-item"><div class="intel-item-head"><h4>${escapeHtml(item.title)}</h4><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.notes || 'Investigation evidence package ready for review.')}</p><div class="intel-item-meta"><span>${escapeHtml(item.priority)} priority</span><span>${item.artifact_ids?.length || 0} evidence items</span><span>${escapeHtml(formatDate(item.updated_at))}</span></div></article>`).join('') : '<div class="empty-mini">Create a case from any priority alert.</div>';
}

async function refreshThreatIntel() {
  try {
    const [alerts, campaigns, cases] = await Promise.all([
      api('/v1/alerts?min_score=45&limit=200'), api('/v1/campaigns?limit=200'), api('/v1/cases?limit=200')
    ]);
    // Vercel's stateless runtime may not retain records from a just-completed inline search.
    // Keep its in-memory alert results when that follow-up request returns an empty collection;
    // otherwise opening the Alerts view briefly renders findings and then replaces them with blank.
    const keepInlineAlerts = state.serverlessEphemeral && !alerts.length
      && state.liveAssessments.length > 0;
    Object.assign(state, {
      alerts: keepInlineAlerts ? state.alerts : alerts,
      campaigns,
      cases,
    });
    renderAlerts(); renderCampaigns();
  } catch (error) { handleError(error, false); }
}

async function createCaseFromAlert(assessmentId, handle) {
  if (state.serverlessEphemeral) {
    toast('Connect hosted PostgreSQL to preserve cases across Vercel requests.', 'error');
    return;
  }
  try {
    const item = await api('/v1/cases', { method: 'POST', body: JSON.stringify({
      title: `Instagram fraud investigation: @${handle}`,
      assessment_id: Number(assessmentId), priority: 'critical'
    }) });
    state.cases.unshift(item); renderCampaigns();
    toast(`Case ${item.public_id.slice(0, 8)} created with preserved evidence.`, 'success');
  } catch (error) { handleError(error); }
}

function syncSearchInputs(query) {
  $('#globalSearch').value = query;
  $('#universalSearch').value = query;
  $('#resultsSearch').value = query;
}

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, milliseconds) / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function setLiveSearchStatus(status, title, detail, elapsedMilliseconds = null) {
  const panel = $('#liveSearchStatus');
  panel.className = `live-search-status ${status || ''}`.trim();
  $('#liveSearchStatusTitle').textContent = title;
  $('#liveSearchStatusDetail').textContent = detail;
  const timer = $('#liveSearchTimer');
  timer.textContent = elapsedMilliseconds == null ? '' : `TIME ${formatElapsed(elapsedMilliseconds)}`;
  timer.classList.toggle('hidden', elapsedMilliseconds == null);
}

function setLiveSearchBusy(busy) {
  $$('.live-search-submit').forEach(button => { button.disabled = busy; });
}

function setSearchLoadingScene(active) {
  document.body.classList.toggle('search-loading-active', active);
  const overlay = $('#searchFocusOverlay');
  if (overlay) overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
}

function updateDownloadButton() {
  const button = $('#downloadResults');
  if (!button) return;
  const result = state.inlineSearchResult || state.lastSearchResult;
  button.disabled = !result?.hits?.length;
  button.title = button.disabled ? 'Run an Instagram search first' :
    `Download ${result.hits.length} ranked Instagram results`;
}

function downloadSearchResults() {
  const result = state.inlineSearchResult || state.lastSearchResult;
  if (!result?.hits?.length) {
    toast('Run an Instagram search before downloading results.', 'error');
    return;
  }
  const assessments = state.liveAssessments || [];
  const publicAssessments = assessments.map(({ model, ...assessment }) => assessment);
  const assessmentByAccount = new Map(assessments.map(item => [Number(item.account_id), item]));
  const riskOrder = result.hits.map((hit, index) => ({ index, risk: Number(hit.risk_score || 0) }))
    .sort((a, b) => b.risk - a.risk || a.index - b.index);
  const riskRanks = new Map(riskOrder.map((item, index) => [item.index, index + 1]));
  const exportedResults = result.hits.map((hit, index) => {
    const assessment = assessmentByAccount.get(Number(hit.account_id));
    const accountFamilies = Object.entries(assessment?.alert_families || {})
      .filter(([, value]) => value?.active)
      .map(([family, value]) => ({ family, score: value.score, critical: Boolean(value.critical), signals: value.signals || [] }));
    const { provenance: rawProvenance, ...publicHit } = hit;
    const provenance = rawProvenance ? {
      lawful_basis: rawProvenance.lawful_basis,
      collection_mode: rawProvenance.collection_mode,
      query: rawProvenance.query,
      retrieved_at: rawProvenance.retrieved_at,
      source: 'Darkmap authorized public collection',
    } : {};
    return {
      rank: index + 1,
      risk_rank: riskRanks.get(index),
      ranking_score: hit.score,
      ...publicHit,
      provenance,
      assessment_id: assessment?.assessment_id || null,
      active_alert_families: hit.doc_type === 'account' ? accountFamilies : [],
      account_context_alert_families: accountFamilies,
      risk_dimensions: assessment?.dimensions || {},
      independent_indicators: assessment?.independent_indicators || 0,
    };
  });
  const payload = {
    schema: 'darkmap-instagram-search/v1',
    generated_at: new Date().toISOString(),
    query: result.query || state.query,
    scope: 'all',
    ranking: {
      result_rank: 'Displayed Darkmap order combining risk, query relevance, low-follower priority, verification discount, and recency',
      risk_rank: 'Descending risk score with displayed order as the tie breaker',
      higher_score_is_more_relevant: true,
    },
    collection: state.lastSearchMeta || {},
    totals: { results: result.hits.length, total_all: result.total_all ?? result.hits.length, facets: result.facets || {} },
    account_assessments: publicAssessments,
    results: exportedResults,
  };
  const slug = String(result.query || state.query || 'results').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'results';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `darkmap-instagram-${slug}-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Downloaded ${exportedResults.length} ranked Instagram results.`, 'success');
}

async function beginGlobalSearch(query) {
  const searchStartedAt = performance.now();
  const value = query.trim();
  if (!value) {
    toast('Enter a keyword, hashtag, or exact @username.', 'error');
    return;
  }
  const accountSearch = value.startsWith('@');
  const target = value.replace(/^[@#]/, '');
  if (!state.health) {
    setLiveSearchBusy(true);
    try {
      await ensureHealth();
    } catch (error) {
      handleError(error, false);
      return;
    } finally {
      setLiveSearchBusy(false);
    }
  }
  const brightKeywordReady = Boolean(state.health?.instagram_alternative?.keyword_search_configured);
  if (!target || (!accountSearch && !brightKeywordReady && !/^[A-Za-z0-9_]{1,100}$/.test(target))) {
    toast('The connected source supports exact hashtag searches here. Use #hashtag or an exact @username.', 'error');
    return;
  }
  state.query = target;
  clearTimeout(state.searchResumeTimer);
  state.searchOutcome = null;
  const epoch = ++state.searchEpoch;
  state.historyEntry = null;
  state.historyRun = { id: crypto.randomUUID(), displayQuery: value, startedAt: new Date().toISOString() };
  $('#searchViewEyebrow').textContent = 'LIVE DISCOVERY RESULTS';
  $('#searchViewDescription').textContent = "Fresh public results collected through Darkmap's connected source.";
  state.searchPage = null;
  renderSearchPagination();
  state.searchScope = 'all';
  state.liveSearchPending = true;
  setSearchLoadingScene(true);
  state.liveAccountIds = [];
  state.inlineSearchResult = null;
  state.lastSearchResult = null;
  state.lastSearchMeta = null;
  updateDownloadButton();
  state.liveAssessments = [];
  renderDetectionCoverage();
  syncSearchInputs(value);
  switchView('investigations');
  syncSearchInputs(value);
  $('#searchScopes').classList.add('disabled');
  ['All', 'Accounts', 'Posts', 'Hashtags', 'Mentions', 'Urls'].forEach(name => {
    $(`#scope${name}`).textContent = '0';
  });
  $('#searchResultCount').textContent = 'Collecting…';
  $('#searchContext').textContent = `Building fresh evidence for “${target}”`;
  $('#searchResults').innerHTML = `<div class="empty-state search-loading-state">
    <div class="signal-loader" aria-label="Collecting public signals" role="status">
      <span class="signal-loader-core"></span>
    </div>
    <h4>Collecting signals</h4>
  </div>`;

  const metaReady = Boolean(state.health?.instagram?.configured);
  const brightReady = accountSearch
    ? Boolean(state.health?.instagram_alternative?.configured)
    : Boolean(state.health?.instagram_alternative?.keyword_search_configured);
  if (!metaReady && !brightReady) {
    state.liveSearchPending = false;
    setSearchLoadingScene(false);
    setLiveSearchStatus('failed', 'Instagram source required',
      'Connect an authorized Instagram collection source in the deployment settings.');
    $('#searchResultCount').textContent = 'Search unavailable';
    $('#searchContext').textContent = 'Instagram is not connected';
    $('#searchResults').innerHTML = '<div class="empty-state"><span class="empty-mark">!</span><h4>Connect an Instagram source</h4><p>Configure an authorized source to run a fresh public Instagram search.</p></div>';
    toast('Connect an Instagram source to run live search.', 'error');
    return;
  }

  setLiveSearchBusy(true);
  setLiveSearchStatus('', 'Collecting signals',
    accountSearch ? `Retrieving the public @${target} profile and media…` : `Building fresh public evidence for “${target}”…`);
  const stopTracking = trackCollection(target);
  try {
    const brandValue = $('#scanBrand').value;
    const payload = {
      provider: !accountSearch && brightKeywordReady ? 'bright_data' : 'auto',
      mode: accountSearch ? 'account' : 'keyword', query: target,
      brand_id: brandValue ? Number(brandValue) : null,
      max_items: 250, page_size: 100, max_pages: 10, profile_limit: 50,
      include_comments: true, comments_per_post: 20, analyze: true,
      fresh: true,
    };
    const endpoint = !accountSearch && brightKeywordReady
      ? '/v1/instagram/search-page' : '/v1/instagram/scrape';
    const job = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    if (epoch !== state.searchEpoch) return;
    rememberJob(job);
    const options = { liveQuery: target, displayQuery: value, startedAt: searchStartedAt, epoch };
    if (job.status === 'succeeded' || job.status === 'failed') {
      await finishJob(job, options);
    } else {
      setLiveSearchStatus('', 'Collection queued',
        'Darkmap is collecting fresh public signals.');
      pollJob(job.id, options);
    }
  } catch (error) {
    if (epoch !== state.searchEpoch) return;
    state.liveSearchPending = false;
    setSearchLoadingScene(false);
    setLiveSearchStatus('failed', 'Instagram search could not start', error.message || 'Darkmap request failed');
    $('#searchResultCount').textContent = 'Search failed';
    $('#searchContext').textContent = `No completed Instagram results for “${target}”`;
    $('#searchResults').innerHTML = `<div class="empty-state"><span class="empty-mark">!</span><h4>Instagram search failed</h4><p>${escapeHtml(friendlyCollectionError(error.message))}</p></div>`;
    handleError(error);
  } finally {
    stopTracking();
    if (epoch === state.searchEpoch && !state.liveSearchPending) setLiveSearchBusy(false);
  }
}

function renderSearchPagination() {
  const panel = $('#searchPagination');
  if (!panel) return;
  const page = state.searchPage;
  panel.hidden = !page && !state.historyEntry;
  if (state.historyEntry) {
    $('#viewMoreResults').hidden = true;
    $('#paginationSummary').textContent = `${state.historyEntry.result.hits.length} saved results. ${state.historyEntry.pagination?.has_more ? 'Only the batches collected in this search were saved. ' : ''}Use the search bar for a fresh collection.`;
    return;
  }
  if (!page) return;
  const button = $('#viewMoreResults');
  button.hidden = !page.has_more;
  button.disabled = state.liveSearchPending;
  button.classList.toggle('is-loading', state.liveSearchPending);
  button.textContent = state.liveSearchPending ? 'Loading next batch…'
    : page.outcome === 'blocked' ? 'Retry collection'
    : !page.loaded_results ? 'Continue collection' : 'View more · next 50';
  $('#paginationSummary').textContent = page.outcome === 'blocked'
    ? 'Collection paused. Restore access to the collection account, then retry. Unfinished work is saved.'
    : page.outcome === 'failed' ? 'Collection failed. Use the search bar to retry.'
    : page.has_more
    ? `${page.loaded_results} results loaded. Continue collecting the next batch.`
    : `${page.loaded_results} results loaded. ${page.failed_branches
      ? 'Collection finished with some source errors.' : 'Collection complete.'}`;
}

async function loadMoreSearchResults(options = {}) {
  if (state.historyEntry || !state.searchPage?.continuation || state.liveSearchPending) return;
  clearTimeout(state.searchResumeTimer);
  const epoch = state.searchEpoch;
  const startedAt = options.startedAt ?? performance.now();
  const continuation = state.searchPage.continuation;
  state.liveSearchPending = true;
  renderSearchPagination();
  setLiveSearchBusy(true);
  setLiveSearchStatus('', 'Loading next batch', 'Your current results remain available.');
  const stopTracking = trackCollection(state.query);
  try {
    const job = await api('/v1/instagram/search-page', { method: 'POST',
      body: JSON.stringify({ query: state.query, continuation }) });
    if (epoch !== state.searchEpoch) return;
    await finishJob(job, { liveQuery: state.query, startedAt, epoch, append: true });
  } catch (error) {
    if (epoch !== state.searchEpoch) return;
    state.liveSearchPending = false;
    setLiveSearchStatus('failed', 'Could not load the next batch',
      'Your existing results are kept. Click View more to retry. ' + friendlyCollectionError(error.message));
    renderSearchPagination();
  } finally {
    stopTracking();
    if (epoch === state.searchEpoch) {
      state.liveSearchPending = false;
      setLiveSearchBusy(false);
      renderSearchPagination();
    }
  }
}

function resultKind(hit) {
  if (state.searchScope === 'hashtags') return '#';
  if (state.searchScope === 'mentions') return '@';
  if (state.searchScope === 'urls') return 'URL';
  return hit.doc_type === 'account' ? '@' : 'POST';
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function safeImageUrl(value) {
  if (typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) {
    return value;
  }
  return safeHttpsUrl(value);
}

function instagramMark() {
  return `<span class="instagram-mark" aria-label="Instagram">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.1"></circle><circle class="instagram-dot" cx="17.4" cy="6.7" r="1.1"></circle></svg>
  </span>`;
}

function resultMetrics(hit) {
  const items = [];
  if (hit.followers_count != null) items.push(`${formatNumber(hit.followers_count)} followers`);
  if (hit.follows_count != null) items.push(`${formatNumber(hit.follows_count)} following`);
  if (hit.media_count != null) items.push(`${formatNumber(hit.media_count)} profile posts`);
  if (hit.like_count != null) items.push(`${formatNumber(hit.like_count)} likes`);
  if (hit.comment_count != null) items.push(`${formatNumber(hit.comment_count)} comments`);
  if (hit.view_count != null) items.push(`${formatNumber(hit.view_count)} views`);
  if (hit.share_count != null) items.push(`${formatNumber(hit.share_count)} shares`);
  if (hit.language) items.push(String(hit.language).toUpperCase());
  if (hit.posted_at) items.push(formatDate(hit.posted_at));
  return items;
}

function scrapedDataMarkup(hit) {
  const rows = [];
  const add = (label, value) => {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
    rows.push(`<div class="scraped-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</span></div>`);
  };
  if (hit.doc_type === 'account') {
    add('Followers', hit.followers_count == null ? 'Not returned in this batch' : formatNumber(hit.followers_count));
    add('Following', hit.follows_count == null ? 'Not returned in this batch' : formatNumber(hit.follows_count));
    add('Profile posts', hit.media_count == null ? 'Not returned in this batch' : formatNumber(hit.media_count));
    add('Verified', hit.is_verified == null ? 'Not returned in this batch' : (hit.is_verified ? 'Yes' : 'No'));
    add('Profile picture URL', hit.profile_pic_url || 'Not returned in this batch');
  }
  add(hit.doc_type === 'account' ? 'Biography' : 'Full caption and indexed text', hit.content);
  add('Hashtags', (hit.hashtags || []).map(value => `#${value}`));
  add('Mentions', (hit.mentions || []).map(value => `@${value}`));
  add('Outbound domains', hit.domains || []);
  add('Instagram URL', hit.instagram_url);
  add('Outbound URL', hit.outbound_url);
  const media = (hit.media || []).map((item, index) => {
    const url = safeHttpsUrl(item.url || item.thumbnail_url);
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.type || 'media')} ${index + 1} ↗</a>` : '';
  }).filter(Boolean).join('');
  if (media) rows.push(`<div class="scraped-row"><b>Media</b><span class="scraped-links">${media}</span></div>`);
  const comments = (hit.comments || []).map(item => `<li><b>${escapeHtml(item.author ? `@${item.author}` : 'Instagram user')}</b><span>${escapeHtml(item.text || '')}</span>${item.like_count == null ? '' : `<small>${formatNumber(item.like_count)} likes</small>`}</li>`).join('');
  if (comments) rows.push(`<div class="scraped-row scraped-comments"><b>Collected comments (${hit.comments.length})</b><ul>${comments}</ul></div>`);
  const provenance = hit.provenance || {};
  if (Object.keys(provenance).length) add('Source', 'Darkmap authorized public collection');
  add('Collection mode', provenance.collection_mode);
  add('Retrieved', provenance.retrieved_at);
  return rows.length ? `<details class="scraped-details"><summary>All scraped data</summary><div>${rows.join('')}</div></details>` : '';
}

function renderSearchResult(result) {
  $('#searchResultCount').textContent = `${result.total} result${result.total === 1 ? '' : 's'}`;
  $('#searchContext').textContent = state.historyEntry
    ? `Saved results for “${state.query}” · ${searchScopeLabels[state.searchScope]}`
    : result.complete_collection && state.query
    ? `All Instagram data collected for “${state.query}”`
    : state.query
    ? `Matching “${state.query}” in ${searchScopeLabels[state.searchScope]}`
    : 'All normalized Instagram evidence';
  const facets = result.facets || {};
  $('#scopeAll').textContent = result.total_all ?? result.total;
  $('#scopeAccounts').textContent = facets.accounts || 0;
  $('#scopePosts').textContent = facets.posts || 0;
  $('#scopeHashtags').textContent = facets.hashtags || 0;
  $('#scopeMentions').textContent = facets.mentions || 0;
  $('#scopeUrls').textContent = facets.urls || 0;
  updateDownloadButton();
  $$('.search-scope').forEach(button => button.classList.toggle('active', button.dataset.searchScope === state.searchScope));
  const inline = Boolean(state.inlineSearchResult);
  $('#searchResults').innerHTML = result.hits.length ? result.hits.map(hit => {
    const info = riskInfo(hit.risk_score);
    const instagramUrl = safeHttpsUrl(hit.instagram_url);
    const imageUrl = safeImageUrl(hit.image_url);
    const profileImageUrl = safeImageUrl(hit.profile_pic_url);
    const fallbackImageUrl = profileImageUrl && profileImageUrl !== imageUrl ? profileImageUrl : '';
    const outboundUrl = safeHttpsUrl(hit.outbound_url);
    const metrics = resultMetrics(hit);
    const matchLabels = (hit.matched_fields || []).map(field =>
      `${result.complete_collection ? 'Collected' : 'Matched'} ${field.replaceAll('_', ' ')}`);
    const tags = [...matchLabels, ...(hit.hashtags || []).map(x => `#${x}`),
      ...(hit.mentions || []).map(x => `@${x}`), ...(hit.domains || [])];
    const accountAlert = state.liveAssessments.find(item =>
      Number(item.account_id) === Number(hit.account_id));
    const activeFamilies = (hit.doc_type === 'account'
      ? Object.entries(accountAlert?.alert_families || {}) : [])
      .filter(([, value]) => value?.active)
      .sort((a, b) => Number(b[1].score) - Number(a[1].score));
    const accountTarget = !inline && hit.account_id ? ` data-result-account="${hit.account_id}" data-result-handle="${escapeHtml(hit.handle)}"` : '';
    return `<article class="result-card"${accountTarget}>
      <div class="result-visual ${imageUrl ? '' : 'image-empty'}">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}"${fallbackImageUrl ? ` data-fallback-src="${escapeHtml(fallbackImageUrl)}"` : ''} alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        ${instagramMark()}
      </div>
      <div class="result-main">
        <div class="result-title"><h4>${escapeHtml(hit.title || `@${hit.handle}`)}${hit.is_verified ? '<span class="verified-mark" title="Verified">✓</span>' : ''}</h4><span>${escapeHtml(hit.post_type || (hit.doc_type === 'account' ? 'Profile' : resultKind(hit)))}</span></div>
        <p>${escapeHtml(hit.snippet || (hit.doc_type === 'account' ? 'No public biography returned.' : 'No caption returned.'))}</p>
        ${metrics.length ? `<div class="result-metrics">${metrics.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
        ${activeFamilies.length ? `<div class="result-alert-families"><b>Account alerts</b>${activeFamilies.map(([name, value]) => `<span>${escapeHtml(alertFamilyLabels[name] || humanLabel(name))} ${Number(value.score || 0).toFixed(0)}</span>`).join('')}</div>` : ''}
        <div class="result-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="result-links">
          ${instagramUrl ? `<a href="${escapeHtml(instagramUrl)}" target="_blank" rel="noopener noreferrer">${instagramMark()} View on Instagram ↗</a>` : '<span>Instagram URL unavailable</span>'}
          ${outboundUrl ? `<a href="${escapeHtml(outboundUrl)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ''}
        </div>
        ${scrapedDataMarkup(hit)}
      </div>
      <span class="badge" style="color:${info.color}">${hit.risk_score == null ? 'Unscored' : `${Number(hit.risk_score).toFixed(0)} · ${info.label}`}</span>
    </article>`;
  }).join('') : '<div class="empty-state"><span class="empty-mark">⌁</span><h4>No evidence found</h4><p>Try another account, caption, hashtag, mention, or domain.</p></div>';
  if (!result.hits?.length && !state.inlineSearchResult?.hits?.length && state.searchOutcome
      && ['pending', 'blocked', 'failed'].includes(state.searchOutcome.outcome)) {
    renderSearchOutcomeEmpty(state.searchOutcome);
  }
  $$('.result-visual img').forEach(image => image.addEventListener('error', () => {
    const fallback = image.dataset.fallbackSrc;
    if (fallback && image.src !== fallback) {
      image.dataset.fallbackSrc = '';
      image.src = fallback;
      return;
    }
    const visual = image.parentElement;
    image.remove(); visual?.classList.add('image-empty');
  }));
  $$('.result-links a').forEach(link => link.addEventListener('click', event => event.stopPropagation()));
  $$('.scraped-details').forEach(details => details.addEventListener('click', event => event.stopPropagation()));
  $$('[data-result-account]').forEach(card => card.addEventListener('click', () => openAccount(card.dataset.resultAccount, card.dataset.resultHandle)));
}

function renderInlineScope() {
  const base = state.inlineSearchResult;
  if (!base) return false;
  let hits = base.hits || [];
  if (state.searchScope === 'accounts') hits = hits.filter(hit => hit.doc_type === 'account');
  else if (state.searchScope === 'posts') hits = hits.filter(hit => hit.doc_type === 'post');
  else if (['hashtags', 'mentions', 'urls'].includes(state.searchScope)) {
    hits = hits.filter(hit => (hit.matched_fields || []).includes(state.searchScope));
  }
  renderSearchResult({ ...base, scope: state.searchScope, total: hits.length, hits });
  return true;
}

async function loadSearch(query = '') {
  if (state.historyEntry) { renderInlineScope(); return; }
  const epoch = state.searchEpoch;
  state.query = query.trim();
  syncSearchInputs(state.query);
  try {
    const params = new URLSearchParams({ limit: '500', scope: state.searchScope });
    if (state.query) params.set('q', state.query);
    if (state.liveAccountIds.length) params.set('account_ids', state.liveAccountIds.join(','));
    const result = await api(`/v1/search?${params}`);
    if (epoch !== state.searchEpoch || state.historyEntry) return;
    state.inlineSearchResult = null;
    state.lastSearchResult = result;
    state.lastSearchMeta = { source: 'normalized_search_index', completed_at: new Date().toISOString() };
    renderSearchResult(result);
  } catch (error) { handleError(error); }
}

function categoriesMarkup(categories = {}) {
  return Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([name, score]) => {
    const info = riskInfo(score);
    return `<div class="category-row"><span>${escapeHtml(name.replaceAll('_', ' '))}</span><span class="score-track"><i style="width:${score}%;background:${info.color}"></i></span><b>${Number(score).toFixed(0)}</b></div>`;
  }).join('');
}

async function openAccount(id, handle) {
  $('#detailHandle').textContent = 'Loading dossier…';
  $('#drawerContent').innerHTML = '<div class="empty-mini">Loading normalized evidence and latest assessment</div>';
  $('#detailDrawer').classList.add('open');
  $('#drawerScrim').classList.add('open');
  $('#detailDrawer').setAttribute('aria-hidden', 'false');
  try {
    const cached = state.accounts.find(account => account.snapshot && (handle
      ? overviewData.key(account) === String(handle).toLowerCase()
      : String(account.id) === String(id) && state.inlineSearchResult?.hits?.some(hit =>
          String(hit.account_id) === String(id) && overviewData.key(hit) === overviewData.key(account))));
    const detail = cached ? { account: cached, latest_assessment: cached.latest_assessment }
      : await api(`/v1/accounts/${id}`);
    const account = detail.account;
    const assessment = detail.latest_assessment;
    $('#detailHandle').textContent = `@${account.handle}`;
    if (!assessment) {
      $('#drawerContent').innerHTML = `<div class="drawer-section"><h3>Account</h3><p class="dialog-note">${escapeHtml(account.biography || 'No biography available')}</p></div><div class="empty-state"><h4>Risk analysis pending</h4><p>${cached ? 'No completed risk assessment was returned with this account. Run a new scan with analysis enabled.' : 'Run AI analysis after collection to populate the dossier.'}</p>${cached ? '' : '<button class="primary-button" id="analyzeAccount">Analyze account</button>'}</div>`;
      $('#analyzeAccount')?.addEventListener('click', () => analyzeAccount(account.id));
      return;
    }
    const info = riskInfo(assessment.overall_score);
    const evidence = (assessment.evidence || []).slice(0, 12);
    const profileUrl = safeHttpsUrl(`https://www.instagram.com/${account.handle}/`);
    const families = Object.entries(assessment.alert_families || {}).filter(([, value]) => value.active);
    $('#drawerContent').innerHTML = `
      <section class="drawer-section"><h3>${escapeHtml(account.display_name || account.handle)}</h3><p>${escapeHtml(account.biography || 'No biography returned.')}</p><p class="dialog-note">${formatNumber(account.followers_count)} followers · Collected ${escapeHtml(formatDate(account.last_seen_at))}</p><a class="text-button" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">View on Instagram ↗</a></section>
      <section class="dossier-score"><div class="score-orb" style="color:${info.color}"><strong>${Number(assessment.overall_score).toFixed(0)}</strong></div><div class="score-copy"><h3>${escapeHtml(info.label)} risk</h3><p>${escapeHtml(assessment.summary || 'No summary available.')}</p><div class="confidence">${Math.round(Number(assessment.confidence) * 100)}% confidence · ${assessment.ai_available ? 'AI-assisted analysis' : 'Darkmap risk engine'}</div></div></section>
      <section class="drawer-section"><h3>Recommended action</h3><span class="badge ${escapeHtml(assessment.recommended_action)}">${escapeHtml((assessment.recommended_action || 'monitor').replaceAll('_', ' '))}</span><button class="secondary-button" id="drawerCreateCase">Create investigation case</button></section>
      <section class="drawer-section"><h3>Risk dimensions</h3><div class="dimension-grid">${['deception','harm','exposure','coordination'].map(name => `<div><small>${name}</small><b>${Number(assessment.dimensions?.[name] || 0).toFixed(0)}</b></div>`).join('')}</div><p class="dialog-note">${Number(assessment.independent_indicators || 0)} independent grounded indicators</p></section>
      <section class="drawer-section"><h3>Active alert families</h3><div class="family-pills">${families.length ? families.map(([name, value]) => `<span>${escapeHtml(humanLabel(name))} ${Number(value.score).toFixed(0)}</span>`).join('') : '<span>No active critical family</span>'}</div></section>
      <section class="drawer-section"><h3>Category scores</h3><div class="category-list">${categoriesMarkup(assessment.category_scores)}</div></section>
      <section class="drawer-section"><h3>Evidence</h3>${evidence.length ? evidence.map(item => `<article class="evidence-card"><b>${escapeHtml((item.category || 'signal').replaceAll('_', ' '))} · ${escapeHtml(item.signal || '')}</b><blockquote>“${escapeHtml(item.quote || 'No excerpt')}”</blockquote><p>${escapeHtml(item.rationale || '')} · ${escapeHtml(item.field || '')}</p></article>`).join('') : '<p class="dialog-note">No grounded evidence items were returned.</p>'}</section>
      <section class="drawer-section"><h3>Limitations</h3><ul class="limitation-list">${(assessment.limitations || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
    $('#drawerCreateCase').addEventListener('click', () => cached ? toast('Case creation needs a saved account record. The collected evidence remains available here.') : createCaseFromAlert(assessment.id, account.handle));
  } catch (error) { handleError(error); closeDrawer(); }
}

function closeDrawer() {
  $('#detailDrawer').classList.remove('open');
  $('#drawerScrim').classList.remove('open');
  $('#detailDrawer').setAttribute('aria-hidden', 'true');
}

async function analyzeAccount(accountId) {
  try {
    const result = await api(`/v1/analysis/accounts/${accountId}`, { method: 'POST', body: JSON.stringify({ inline: false }) });
    toast('AI risk analysis queued. Darkmap will process it.', 'success');
    if (result.job?.id) pollJob(result.job.id);
    closeDrawer();
    await refreshJobs();
  } catch (error) { handleError(error); }
}

async function refreshJobs() {
  try { state.jobs = overviewData.mergeJobs(state.jobs, await api('/v1/jobs?limit=100')); persistOverview(); renderOverview(); }
  catch (error) { handleError(error, false); }
}

async function refreshAudit() {
  try { state.audit = await api('/v1/audit?limit=100'); renderAudit(); }
  catch (error) { handleError(error, false); }
}

async function loadAccountIndex() {
  const accounts = [];
  for (let offset = 0; ; offset += 200) {
    const page = await api(`/v1/accounts?limit=200&offset=${offset}`);
    accounts.push(...page);
    if (page.length < 200) return accounts;
  }
}

async function loadAll(showToast = false) {
  $('#refreshAll').disabled = true;
  try {
    const [health, brands, accounts, jobs, audit, alerts, campaigns, cases] = await Promise.all([
      ensureHealth(true), api('/v1/brands'), loadAccountIndex(),
      api('/v1/jobs?limit=100'), api('/v1/audit?limit=100'),
      api('/v1/alerts?min_score=45&limit=200'), api('/v1/campaigns?limit=200'), api('/v1/cases?limit=200'),
    ]);
    const keepInlineAlerts = state.serverlessEphemeral && !alerts.length
      && state.liveAssessments.length > 0;
    Object.assign(state, {
      health, brands, audit,
      accounts: overviewData.mergeAccounts(state.accounts, accounts),
      jobs: overviewData.mergeJobs(state.jobs, jobs),
      alerts: keepInlineAlerts ? state.alerts : alerts,
      campaigns, cases,
    });
    persistOverview();
    renderBrands(); renderOverview(); renderAudit(); renderAlerts(); renderCampaigns();
    renderSourceStatus();
    if (showToast) toast('Darkmap data refreshed', 'success');
  } catch (error) { handleError(error); }
  finally { $('#refreshAll').disabled = false; }
}

function renderSourceStatus() {
  const configured = Boolean(state.health?.instagram?.configured || state.health?.instagram_alternative?.configured);
  $('#sourceDot').className = `status-dot ${configured && !state.sourceProblem ? 'live' : 'warn'}`;
  $('#sourceStatus').textContent = state.sourceProblem ? 'Account unavailable'
    : configured ? 'Configured' : 'Connection required';
}

function handleError(error, promptForKey = true) {
  if (error.status === 401 && promptForKey) {
    $('#apiKeyInput').value = state.apiKey;
    $('#settingsDialog').showModal();
    toast('Enter the Darkmap access key to load protected data.', 'error');
  } else {
    toast(error.message || 'Darkmap request failed', 'error');
  }
}

async function submitScan(event) {
  event.preventDefault();
  const button = $('#startScan');
  const mode = $('#scanMode').value;
  const query = $('#scanQuery').value.trim().replace(/^[@#]/, '');
  if (modeCopy[mode].required && !query) {
    $('#scanQuery').focus();
    toast(`Enter ${mode === 'account' ? 'an Instagram account' : 'a hashtag keyword'}.`, 'error');
    return;
  }
  button.disabled = true;
  button.lastChild.textContent = ' Queueing…';
  const stopTracking = trackCollection(query || 'Connected account');
  try {
    const brandValue = $('#scanBrand').value;
    const payload = {
      provider: (mode === 'hashtag_recent' || mode === 'hashtag_top')
        && state.health?.instagram_alternative?.keyword_search_configured ? 'bright_data' : 'auto',
      mode, query, brand_id: brandValue ? Number(brandValue) : null,
      max_items: 250, page_size: 100, max_pages: 10, profile_limit: 50,
      include_comments: $('#includeComments').checked,
      comments_per_post: 50, analyze: $('#analyzeWithAI').checked,
    };
    const job = await api('/v1/instagram/scrape', { method: 'POST', body: JSON.stringify(payload) });
    rememberJob(job);
    if (job.status === 'succeeded' || job.status === 'failed') {
      await finishJob(job);
    } else {
      toast(`Instagram ${mode.replaceAll('_', ' ')} scan queued for ${query || 'the connected account'}.`, 'success');
      pollJob(job.id);
    }
  } catch (error) { handleError(error); }
  finally { stopTracking(); button.disabled = false; button.lastChild.textContent = ' Start scan'; }
}

function friendlyCollectionError(error) {
  const value = String(error || 'The Instagram source did not return results.');
  if (value.includes('provider returned no ingestible accounts')) {
    return 'No public Instagram profiles or posts were returned. Retry, use an exact @username, or try a more specific brand keyword.';
  }
  if (value.includes('did not finish within')) {
    return 'Instagram collection did not finish before the source timeout. Please retry the search.';
  }
  return value.replace(/^[A-Za-z]+(?:Error)?:\s*/, '');
}

async function finishJob(job, options = {}) {
  if (!job || typeof job !== 'object') throw new Error('The collection returned an invalid response. Please retry.');
  if (options.epoch != null && options.epoch !== state.searchEpoch) return;
  rememberJob(job);
  const elapsed = options.startedAt == null ? null : performance.now() - options.startedAt;
  const failureMessage = friendlyCollectionError(job.error);
  const page = job.result?.pagination;
  const outcome = DarkmapSearchOutcome(job);
  state.searchOutcome = outcome;
  if (outcome.outcome === 'blocked') state.sourceProblem = job.result?.collection_error;
  else if (job.status === 'succeeded') state.sourceProblem = null;
  renderSourceStatus();
  if (!outcome.resume) toast(outcome.title + (elapsed == null ? '' : ` · ${formatElapsed(elapsed)}`),
    outcome.level === 'failed' ? 'error' : outcome.level === 'succeeded' ? 'success' : '');

  const inlineResult = job.result?.inline_search || null;
  if (inlineResult) ingestOverview(job);
  if (!inlineResult) await loadAll();
  if (options.epoch != null && options.epoch !== state.searchEpoch) return;
  if (!options.liveQuery) return;

  state.liveSearchPending = false;
  if (job.status === 'succeeded' || inlineResult?.hits?.length) {
    state.liveAccountIds = (job.result?.accounts || []).filter(item => item && typeof item === 'object')
      .map(item => Number(item.account_id)).filter(Boolean);
    state.query = options.liveQuery;
    state.searchScope = options.append ? state.searchScope : 'all';
    syncSearchInputs(options.displayQuery || options.liveQuery);
    if (inlineResult) {
      state.inlineSearchResult = inlineResult;
      state.lastSearchResult = inlineResult;
      state.lastSearchMeta = {
        source: 'live_instagram_collection',
        completed_at: job.updated_at || new Date().toISOString(),
        duration_seconds: elapsed == null ? null : Number((elapsed / 1000).toFixed(3)),
        partial: Boolean(job.result?.collection_partial),
        accounts: Number(job.result?.account_count || 0),
        posts_or_reels: Number(job.result?.posts || 0),
        comments: Number(job.result?.comments || 0),
        job_id: job.id,
        outcome: outcome.outcome,
        collection_error: job.result?.collection_error || null,
        ...(page ? { batch_size: 50, batches_loaded: page.page,
          has_more: page.has_more, total_duration_seconds: page.total_seconds,
          queries_completed: page.queries_completed, queries_total: page.queries_total,
          failed_branches: page.failed_branches } : {}),
      };
      state.searchPage = page || null;
      state.serverlessEphemeral = Boolean(job.result?.serverless_inline);
      state.liveAssessments = (job.result?.assessments || []).filter(item => item && typeof item === 'object');
      const liveAlerts = state.liveAssessments
        .filter(alert => Number(alert.overall_score || 0) >= 45)
        .sort((a, b) => Number(b.overall_score) - Number(a.overall_score));
      if (liveAlerts.length || page) {
        state.alerts = liveAlerts;
        renderAlerts();
      }
      renderDetectionCoverage();
      renderInlineScope();
    } else {
      state.serverlessEphemeral = false;
      state.liveAssessments = [];
      renderDetectionCoverage();
      state.inlineSearchResult = null;
      await loadSearch(options.liveQuery);
      if (options.epoch != null && options.epoch !== state.searchEpoch) return;
    }
    $('#searchScopes').classList.remove('disabled');
    const accounts = Number(job.result?.account_count || 0);
    const posts = Number(job.result?.posts || 0);
    const partialNote = job.result?.collection_partial
      ? ' Some collection branches reached the time budget; all completed results are shown.' : '';
    setLiveSearchStatus('succeeded', 'Fresh Instagram results ready',
      `Retrieved ${accounts} account${accounts === 1 ? '' : 's'} and ${posts} post${posts === 1 ? '' : 's'} or reel${posts === 1 ? '' : 's'}.${partialNote}`, elapsed);
    setLiveSearchStatus(outcome.level, outcome.title, outcome.detail, elapsed);
    renderSearchPagination();
    if (!inlineResult?.hits?.length && page) renderSearchOutcomeEmpty(outcome);
    if (outcome.save) saveSearchToHistory();
  } else {
    // A failed subsequent page must never replace already collected evidence with emptiness.
    state.searchPage = page || state.searchPage;
    if (!options.append || !state.lastSearchResult?.hits?.length) {
      renderSearchOutcomeEmpty(outcome);
      $('#searchScopes').classList.add('disabled');
    }
    setLiveSearchStatus('failed', outcome.title, outcome.detail || failureMessage, elapsed);
    renderSearchPagination();
  }
  setSearchLoadingScene(false);
  setLiveSearchBusy(false);
  if (outcome.resume && page?.continuation) {
    const epoch = state.searchEpoch;
    const delay = Math.max(1, Number(page.retry_after_seconds || 0) + 1) * 1000;
    clearTimeout(state.searchResumeTimer);
    state.searchResumeTimer = setTimeout(() => {
      if (epoch === state.searchEpoch && !state.historyEntry && state.searchPage?.continuation === page.continuation) {
        loadMoreSearchResults({ startedAt: options.startedAt });
      }
    }, delay);
  }
}

function renderSearchOutcomeEmpty(outcome) {
  $('#searchResultCount').textContent = outcome.resume ? 'Still collecting…'
    : outcome.level === 'failed' ? 'Search unavailable' : 'No matches returned';
  $('#searchContext').textContent = outcome.resume ? 'Waiting for collected results' : '';
  $('#searchResults').innerHTML = `<div class="empty-state"><span class="empty-mark">${outcome.resume ? '◌' : '!'}</span><h4>${escapeHtml(outcome.title)}</h4><p>${escapeHtml(outcome.detail)}</p></div>`;
}

function pollJob(jobId, options = {}) {
  if (state.polling.has(jobId)) return;
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const job = await api(`/v1/ingest/jobs/${jobId}`);
      rememberJob(job);
      if (job.status === 'succeeded' || job.status === 'failed') {
        clearInterval(state.polling.get(jobId)); state.polling.delete(jobId);
        await finishJob(job, options);
      } else if (attempts >= 150) {
        clearInterval(state.polling.get(jobId)); state.polling.delete(jobId);
        toast('The job is still queued. Make sure the Darkmap worker is running.');
        if (options.liveQuery) {
          state.liveSearchPending = false;
          setSearchLoadingScene(false);
          setLiveSearchBusy(false);
          setLiveSearchStatus('failed', 'Instagram search is still queued',
            'Start the Darkmap worker to process live collection jobs.');
        }
      }
    } catch (error) {
      clearInterval(state.polling.get(jobId)); state.polling.delete(jobId);
      if (options.liveQuery) {
        state.liveSearchPending = false;
        setSearchLoadingScene(false);
        setLiveSearchBusy(false);
        setLiveSearchStatus('failed', 'Instagram search failed', error.message || 'Darkmap request failed');
      }
      handleError(error);
    }
  };
  state.polling.set(jobId, setInterval(poll, 2000));
  poll();
}

function setMode(mode) {
  const copy = modeCopy[mode];
  $('#scanMode').value = mode;
  $$('.mode-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  $('#queryLabel').textContent = copy.label;
  $('#queryPrefix').textContent = copy.prefix;
  $('#scanQuery').placeholder = copy.placeholder;
  $('#scanQuery').required = copy.required;
  $('#scanQuery').disabled = !copy.required;
  if (!copy.required) $('#scanQuery').value = '';
  $('#includeComments').disabled = mode !== 'owned';
  $('#includeComments').checked = mode === 'owned';
  $('#scopeNote').textContent = copy.note;
}

function commaList(value) { return value.split(',').map(item => item.trim()).filter(Boolean); }

async function saveBrand(event) {
  event.preventDefault();
  try {
    const brand = await api('/v1/brands', { method: 'POST', body: JSON.stringify({
      name: $('#brandName').value.trim(),
      official_handles: commaList($('#brandHandles').value).map(x => x.replace(/^@/, '')),
      official_domains: commaList($('#brandDomains').value),
      keywords: commaList($('#brandKeywords').value),
    }) });
    state.brands.push(brand); state.brands.sort((a, b) => a.name.localeCompare(b.name)); renderBrands();
    $('#scanBrand').value = String(brand.id);
    $('#brandDialog').close(); $('#brandForm').reset();
    toast(`${brand.name} added as a protected brand.`, 'success');
  } catch (error) { handleError(error); }
}

function bindEvents() {
  $('#historyFilter').addEventListener('input', renderHistory);
  $('#historyEntries').addEventListener('click', event => {
    const open = event.target.closest('[data-history-open]');
    const remove = event.target.closest('[data-history-remove]');
    if (open) openHistory(open.dataset.historyOpen);
    if (remove) removeHistory(remove.dataset.historyRemove);
  });
  $('#overviewInsights').addEventListener('click', event => {
    const button = event.target.closest('[data-chart-kind]');
    if (button && !button.disabled) showChartAccounts(button.dataset.chartKind, button.dataset.chartValue);
  });
  $('#clearChartSelection').addEventListener('click', () => showOverviewAccounts('all'));
  $$('[data-overview-filter]').forEach(button => button.addEventListener('click', () => showOverviewAccounts(button.dataset.overviewFilter)));
  $$('[data-risk-bucket], [data-risk-segment]').forEach(button => {
    const activate = () => showOverviewAccounts(button.dataset.riskBucket || button.dataset.riskSegment);
    button.addEventListener('click', activate);
    if (button.dataset.riskSegment) button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
  });
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewLink)));
  $$('.mode-tab').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('#scanForm').addEventListener('submit', submitScan);
  $('#universalSearchForm').addEventListener('submit', event => {
    event.preventDefault();
    beginGlobalSearch($('#universalSearch').value);
  });
  $('#resultsSearchForm').addEventListener('submit', event => {
    event.preventDefault();
    beginGlobalSearch($('#resultsSearch').value);
  });
  $$('.search-scope').forEach(button => button.addEventListener('click', () => {
    if ($('#searchScopes').classList.contains('disabled')) {
      toast('Run a live Instagram search before filtering results.');
      return;
    }
    state.searchScope = button.dataset.searchScope;
    if (!renderInlineScope()) loadSearch(state.query);
  }));
  $('#riskFilter').addEventListener('change', renderAccounts);
  $('#alertFamilyFilter').addEventListener('change', renderAlerts);
  $('#downloadResults').addEventListener('click', downloadSearchResults);
  $('#viewMoreResults').addEventListener('click', loadMoreSearchResults);
  $('#refreshAll').addEventListener('click', () => loadAll(true));
  $('#newBrand').addEventListener('click', () => $('#brandDialog').showModal());
  $('#brandForm').addEventListener('submit', saveBrand);
  $('#openSettings').addEventListener('click', () => { $('#apiKeyInput').value = state.apiKey; $('#settingsDialog').showModal(); });
  $('#settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    if (state.apiKey !== $('#apiKeyInput').value.trim()) clearOverview();
    state.apiKey = $('#apiKeyInput').value.trim();
    if (state.apiKey) localStorage.setItem('darkmapApiKey', state.apiKey); else localStorage.removeItem('darkmapApiKey');
    $('#settingsDialog').close(); loadAll(true); loadHistory();
  });
  $('#clearApiKey').addEventListener('click', () => { clearOverview(); state.apiKey = ''; localStorage.removeItem('darkmapApiKey'); $('#apiKeyInput').value = ''; loadHistory(); toast('Saved API access cleared.'); });
  $('#closeDrawer').addEventListener('click', closeDrawer); $('#drawerScrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#globalSearch').focus(); }
    if (event.key === 'Escape') closeDrawer();
  });
  $('#globalSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      beginGlobalSearch(event.target.value);
    }
  });
}

bindEvents();
setMode('account');
renderOverview();
loadHistory();
loadAll();
