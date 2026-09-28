// PM2 process definition for the production server.
//
// CRITICAL: exec_mode must be 'fork' with instances:1. The app's own index.ts
// runs Node's cluster module internally — the master process owns the single
// DecoyBot (one MTProto connection per decoy session string; Telegram permits
// only ONE live connection per auth key) and forks the HTTP workers itself.
// If PM2 also clustered (exec_mode:'cluster' / instances:>1) there would be
// multiple masters, each resuming the same decoy sessions → permanent
// AUTH_KEY_DUPLICATED. PM2 must launch exactly one process.
//
// kill_timeout + wait_ready give a clean handoff on deploy/restart: on SIGINT
// the old master disconnects its MTProto clients (disconnectAllClients) to free
// the auth key — it does NOT pause sessions, so they stay 'active' and the new
// master auto-resumes them via resumeActiveSessions() on boot.
// Deploy with:  pm2 startOrReload ecosystem.config.js --update-env
module.exports = {
  apps: [
    {
      name: 'telegram-premium-server',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 15000,
      // Box is a t2.medium (4 GiB). This cap applies to the MASTER process only
      // (PM2 watches the pid it launched; the forked HTTP workers are invisible
      // to it). 1.5 GiB leaves margin under 4 GiB for the 2 HTTP workers (which
      // can spin up Playwright/Chromium), local Redis, the darkmap-server pm2
      // app, and the OS — so PM2 recycles us with a graceful SIGINT *before* the
      // kernel OOM-killer (uncatchable SIGKILL) ever fires. Do not raise much
      // past 2G without first confirming worker memory headroom.
      // 1536M → 2048M, safe NOW that the decoy connection-recycler is live. Before
      // the recycler the arrayBuffers leak grew fast and 2G let RSS spike to ~4.5 GB
      // (true-OOM risk) — hence the earlier revert. With the recycler flushing the
      // update-stream buffers, growth is slow and restarts trip at only ~1.6 GB with
      // a ~10-90 MB overshoot (see pm2.log 2026-08-05 17:36+). So 2G is headroom the
      // recycler keeps us from ever spiking past → pushes restarts to ~never while
      // we chase the residual floor-creep. Do not exceed 2G without confirming
      // worker headroom on the 4 GiB box.
      max_memory_restart: '2048M',
      env: {
        NODE_ENV: 'production',
        DECOY_BOT_ENABLED: 'true',
      },
    },
  ],
};
