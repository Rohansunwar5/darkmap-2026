import { createServer } from 'node:http';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { createApp } from '../../server/api.js';

export async function startApp({ env = {}, client, collectorFactory, store = createStore(), clock, monotonic } = {}) {
  const config = loadConfig({ SCRAPINGDOG_API_KEY: 'k', DARKMAP_SEARCH_CURSOR_SECRET: 'test-secret', CREDIT_CAP_PER_DAY: '0', ...env });
  const app = createApp({ config, store, client, collectorFactory, ...(clock ? { clock } : {}), ...(monotonic ? { monotonic } : {}) });
  const server = createServer((req, res) => (app.handles(req) ? app.handle(req, res) : (res.statusCode = 404, res.end())));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  server.unref();   // a failed assertion skips close(); an open server must not keep the test process alive
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, body, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await response.text();
    const json = (response.headers.get('content-type') ?? '').includes('json');
    return { status: response.status, body: text && json ? JSON.parse(text) : null, text };
  };
  return { app, store, request, close: () => new Promise(resolve => server.close(resolve)) };
}
