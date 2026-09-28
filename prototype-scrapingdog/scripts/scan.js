// Terminal scan through the dashboard's own API code path (spends credits).
//   npm run scan -- "brand" --pages=2        npm run scan -- "@handle"
import { createServer } from 'node:http';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/api.js';

try { process.loadEnvFile('.env'); } catch { /* use exported variables */ }
const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('--'));
const pages = Number((args.find(a => a.startsWith('--pages=')) ?? '--pages=1').split('=')[1]);
if (!query) { console.error('usage: npm run scan -- "<keyword>" [--pages=N] | "@handle"'); process.exit(1); }
const app = createApp({ config: loadConfig(process.env) });
const server = createServer((req, res) => app.handle(req, res)).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body) }).then(r => r.json());
const started = Date.now();
let job;
if (query.startsWith('@')) {
  job = await post('/v1/instagram/scrape', { provider: 'auto', mode: 'account', query: query.slice(1), max_items: 250,
    page_size: 100, max_pages: 10, profile_limit: 50, include_comments: true, comments_per_post: 20, analyze: true, fresh: true });
} else {
  let continuation = null;
  for (let page = 0; page < pages; page++) {
    job = await post('/v1/instagram/search-page', { query, continuation, max_items: 250, page_size: 100, max_pages: 10,
      profile_limit: 50, include_comments: true, comments_per_post: 20, analyze: true, fresh: true });
    continuation = job.result?.pagination?.continuation;
    console.log(`page ${page + 1}: ${job.result?.pagination?.new_results ?? 0} new, outcome ${job.result?.collection_outcome}, `
      + `credits ${job.result?.pagination?.credits_used ?? '?'}`);
    if (!continuation) break;
  }
}
const hits = job.result?.inline_search?.hits ?? [];
console.table(hits.slice(0, 40).map((h, i) => ({ rank: i + 1, type: h.doc_type, handle: h.handle,
  risk: h.risk_score, followers: h.followers_count, url: h.instagram_url })));
console.log(`${hits.length} results · status ${job.status} · ${((Date.now() - started) / 1000).toFixed(1)}s`
  + (job.error ? ` · error: ${job.error}` : ''));
await app.store.flush();
server.close();
