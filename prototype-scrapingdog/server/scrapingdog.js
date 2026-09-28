// ScrapingDog HTTP client (spec §6): pool, timeout, error mapping, credit meter and audit rows.
import { record as auditRecord } from './audit.js';
import { ENDPOINTS } from './costs.js';
import { FetchFailed, NotAuthorized, NotFound, SourceUnavailable } from './errors.js';
import { pyCasefold } from './engine/pycompat.js';
import { assertRoom, consume } from './quota.js';
import { redactSecret, stripApiKey } from './redact.js';

export const PROVIDER = 'scrapingdog_instagram';
export const LAWFUL_BASIS = 'licensed_public_data_api';
const BASE = 'https://api.scrapingdog.com';
const USER_AGENT = 'DarkmapBrandProtection/1.0 (+https://example.com/darkmap-bot)';

export function createPool(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => { active -= 1; next(); });
  };
  return { run: task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); }) };
}

// REF http.check_source_availability (http.py:42-54). Checked before 401/403 because vendors send those for credit
// problems: ScrapingDog documents a 403 for an exhausted plan, but not its wording, so a 403 that talks about limits
// or credits counts as one. The recorded bad-key 403 (CONTRACT.md §5) mentions neither.
const INACTIVE = ['customer is not active', 'account is inactive'];
const NO_CREDITS = ['insufficient balance', 'not enough credits', 'insufficient credits', 'credits exhausted'];
const NO_CREDITS_403 = ['request limit', 'credit limit', 'limit reached', 'limit exceeded', 'out of credits',
  'no credits', 'exhausted', 'quota'];
export function checkSourceAvailability(status, text) {
  const message = pyCasefold(String(text || ''));
  if (INACTIVE.some(term => message.includes(term))) {
    throw new SourceUnavailable('source_account_inactive', 'The connected collection account is inactive. '
      + 'Reactivate it in the collection service dashboard, then retry this search.', { statusCode: status });
  }
  if (status === 402 || NO_CREDITS.some(term => message.includes(term))
      || (status === 403 && NO_CREDITS_403.some(term => message.includes(term)))) {
    throw new SourceUnavailable('source_credits_required', 'The connected collection account has insufficient '
      + 'credits. Restore its balance, then retry this search.', { statusCode: status });
  }
}

// A 2xx body that is an error envelope is a failed attempt, never "no results" (Review Focus 3).
const isErrorBody = json => json !== null && typeof json === 'object' && !Array.isArray(json)
  && (json.success === false || typeof json.error === 'string'
    || (Object.keys(json).length === 1 && typeof json.message === 'string'));
const MISSING_WORDS = /not found|does not exist|no user|page isn't available/i;
// Only an envelope's own message is read: a caption or comment saying "not found" must stay a result.
const envelopeSaysMissing = json => MISSING_WORDS.test(`${json.message ?? ''} ${json.error ?? ''}`);
// CONTRACT.md §5: an unknown handle answers 200 with every profile field null, and it is charged.
const isMissingProfile = (endpointName, json) => endpointName === 'profile' && json !== null
  && typeof json === 'object' && Object.hasOwn(json, 'username') && json.username == null;
// The container each Instagram reply must carry (CONTRACT.md §3-4). Anything else is a failed attempt, never an
// empty profile or zero comments (Review Focus 3). Google replies are checked by googleToOrganic.
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const EXPECTED_SHAPE = {
  profile: json => Object.hasOwn(json, 'username'),
  posts: json => Array.isArray(json.posts_data),
  post: json => isPlainObject(json.post),
  comments: json => Array.isArray(json.comments),
};

export function createClient({ config, store, fetchImpl = fetch, clock = Date.now }) {
  const pool = createPool(config.concurrency);
  async function send(endpointName, endpoint, params) {
    const url = new URL(endpoint.path, BASE);
    url.searchParams.set('api_key', config.scrapingdogApiKey);
    for (const [name, value] of Object.entries({ ...(endpoint.params ?? {}), ...params })) {
      if (value != null) url.searchParams.set(name, String(value));
    }
    const target = stripApiKey(url.href);
    const started = clock();
    let response;
    let text;
    // ScrapingDog echoes the key in pagination URLs; redact it before the text reaches any JSON, error or audit row.
    const redact = value => redactSecret(value, config.scrapingdogApiKey);
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(config.timeoutMs), headers: { 'User-Agent': USER_AGENT } });
      text = redact(await response.text());
    } catch (error) {
      const message = redact(String(error.message));
      auditRecord(store, { action: 'http.error', provider: PROVIDER, target, status: 'transport_error',
        lawful_basis: LAWFUL_BASIS, detail: { error: message.slice(0, 300), endpoint: endpointName } }, clock);
      throw new FetchFailed(error.name === 'TimeoutError' ? 'The read operation timed out' : message);
    }
    auditRecord(store, { action: 'http.request', provider: PROVIDER, target, status: String(response.status),
      lawful_basis: LAWFUL_BASIS, duration_ms: clock() - started, detail: { bytes: text.length, endpoint: endpointName } }, clock);
    // REF reads account-status phrases only from error answers (http.py:165-166, 241-242). On a 200 they are just
    // content: scam captions say "your account is inactive" and "insufficient balance".
    if (response.status >= 400) checkSourceAvailability(response.status, text);
    if (response.status === 401 || response.status === 403) {
      throw new NotAuthorized(`${PROVIDER} returned ${response.status}; access is not authorized. `
        + 'Check the provider API key and subscription.');
    }
    if (response.status === 429 || response.status === 503) {
      auditRecord(store, { action: 'http.backoff', provider: PROVIDER, target, status: String(response.status),
        lawful_basis: LAWFUL_BASIS, detail: { retry_after: response.headers.get('retry-after') } }, clock);
      throw new FetchFailed(`${response.status} from ${endpoint.path}`, { statusCode: response.status,
        retryAfter: response.headers.get('retry-after') });
    }
    // Missing inputs are dropped silently, like REF's dataset error records. ScrapingDog bills 200 and 404
    // answers, so the credits are metered and carried on the error for the caller's per-search count.
    const charged = message => {
      consume(store, PROVIDER, endpoint.credits, config, clock);
      return Object.assign(new NotFound(message), { credits: endpoint.credits });
    };
    if (endpointName !== 'google' && response.status === 404) throw charged(`${endpoint.path} found nothing`);
    if (response.status >= 400) {
      throw new FetchFailed(`${response.status} from ${endpoint.path}: ${text.slice(0, 300)}`, { statusCode: response.status });
    }
    let json;
    try { json = JSON.parse(text); } catch { throw new FetchFailed(`${endpoint.path} returned a non-JSON body`, { statusCode: response.status }); }
    if (isErrorBody(json)) {
      checkSourceAvailability(response.status, `${json.message ?? ''} ${json.error ?? ''}`);   // the envelope's own words
      if (endpointName !== 'google' && envelopeSaysMissing(json)) throw new NotFound(`${endpoint.path} found nothing`);
      throw new FetchFailed(`${endpoint.path} returned an error body`, { statusCode: response.status });
    }
    if (isMissingProfile(endpointName, json)) throw charged(`${endpoint.path} found no such handle`);
    const shape = EXPECTED_SHAPE[endpointName];
    if (shape && !(isPlainObject(json) && shape(json))) {
      throw new FetchFailed(`${endpoint.path} returned an unexpected body`, { statusCode: response.status });
    }
    consume(store, PROVIDER, endpoint.credits, config, clock);
    return { json, credits: endpoint.credits, status: response.status };
  }
  return {
    pool,
    call(endpointName, params) {
      const endpoint = ENDPOINTS[endpointName];
      if (!endpoint) return Promise.reject(new Error(`unknown ScrapingDog endpoint ${endpointName}`));
      try { assertRoom(store, PROVIDER, endpoint.credits, config, clock); } catch (error) {
        auditRecord(store, { action: 'http.quota_exceeded', provider: PROVIDER, target: endpoint.path, status: 'blocked',
          lawful_basis: LAWFUL_BASIS, detail: { window: error.window, retry_after: error.retryAfter } }, clock);
        return Promise.reject(error);
      }
      return pool.run(() => send(endpointName, endpoint, params));
    },
  };
}
