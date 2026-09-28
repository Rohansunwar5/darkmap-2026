// Mounts the REF-compatible API inside Vite's dev and preview servers (spec §4.2).
import { createApp } from './api.js';
import { loadConfig } from './config.js';

export default function darkmapApi(env) {
  let app = null;
  const mount = server => {
    app ??= createApp({ config: loadConfig(env) });
    server.middlewares.use((req, res, next) => (app.handles(req) ? app.handle(req, res) : next()));
  };
  return { name: 'darkmap-api', configureServer: mount, configurePreviewServer: mount };
}
