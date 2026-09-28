// Typed settings (spec §11). The ScrapingDog key never leaves the server.
const int = (env, name, fallback) => {
  const value = env[name];
  if (value === undefined || String(value).trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
};

export function loadConfig(env = process.env) {
  return {
    scrapingdogApiKey: env.SCRAPINGDOG_API_KEY || '',
    concurrency: Math.max(1, int(env, 'SCRAPINGDOG_CONCURRENCY', 5)),
    timeoutMs: int(env, 'SCRAPINGDOG_TIMEOUT_MS', 45000),
    creditBudgetPerSearch: int(env, 'CREDIT_BUDGET_PER_SEARCH', 15000),
    creditCapPerDay: int(env, 'CREDIT_CAP_PER_DAY', 100000),
    creditCapPerMinute: int(env, 'CREDIT_CAP_PER_MINUTE', 0),
    commentsScope: env.COMMENTS_SCOPE === 'matched_posts' ? 'matched_posts' : 'all_collected_posts',
    apiKey: env.DARKMAP_API_KEY || '',
    maxRequestBytes: int(env, 'DARKMAP_MAX_REQUEST_BYTES', 2000000),
    cursorSecret: env.DARKMAP_SEARCH_CURSOR_SECRET || '',
    dataFile: env.DATA_FILE || 'data/darkmap.json',
    port: int(env, 'PORT', 5173),
  };
}
