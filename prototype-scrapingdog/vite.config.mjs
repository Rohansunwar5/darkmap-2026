import { defineConfig, loadEnv } from 'vite';
import darkmapApi from './server/vite-plugin.js';

export default defineConfig(({ mode }) => {
  // Server-side only: Vite exposes just VITE_-prefixed values to client code, and the dashboard reads none.
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT || 5173);
  // Vite serves files under the project root; keep secrets and the scraped store unreachable.
  const deny = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/.superpowers/**'];
  return {
    plugins: [darkmapApi(env)],
    server: { port, strictPort: true, fs: { deny } },
    preview: { port, strictPort: true },
  };
});
