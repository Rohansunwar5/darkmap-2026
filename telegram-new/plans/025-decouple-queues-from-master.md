# 025 — Decouple scrape/alert queues from the decoy master

**Status:** DRAFT — not applied. **Gated** on the `[MEM]` diagnostic confirming the
memory spike is queue-side (scrape/alert), not in the decoy clients themselves.
Only execute this if a daytime restart is preceded by a large `📥 Fetching N
scrape data files` and/or `[MEM]` shows the growth in `external/arrayBuffers`
driven by the alert/scrape path. If instead the growth is in the decoy clients,
this plan does NOT help — fix the decoy Buffers instead.

## Problem

The PM2 master process ([src/index.ts](../telegram-premium-server/src/index.ts))
does everything except serve HTTP: it runs the Bull scrape + alert queue
processors AND holds all ~15 long-lived decoy MTProto connections. It is also the
process PM2 memory-caps (`max_memory_restart`). So any memory spike from queue
work (e.g. an alert job fetching a large S3 backlog) trips the cap and PM2
recycles the master — dropping every decoy connection for ~5s on each recycle.
The two workloads share fate for no reason: they are completely independent
(verified — the queue path has no decoy references).

## Goal

The process holding the MTProto connections does **nothing else** and is **not**
tightly memory-capped. Queue work runs in a **separate, disposable** process with
a tight cap, so recycling it is harmless to decoys.

## Approach — separate PM2 app (Option A, least-code)

Bull queues are Redis-backed, so processors can run in any process that connects
to the same Redis. Move them into their own entrypoint + PM2 app.

### Changes

1. **New `src/worker.ts`** (compiles to `dist/worker.js`):
   - `connectDB()` + `redisClient.connect()` (same as index.ts boot).
   - `await import('./app')` is **not** needed (no HTTP here).
   - Call `initializeQueueProcessors()` and nothing else.
   - Graceful shutdown: `cleanupQueues()` + close Redis/Mongo on SIGINT/SIGTERM.
   - No cluster, no decoy service, no socket emitter.

2. **`src/index.ts` master** — remove the queue block:
   - Delete the `initializeQueueProcessors()` / `cleanupQueues` calls in the
     master branch ([index.ts:36-52](../telegram-premium-server/src/index.ts#L36-L52))
     and drop `cleanupQueues` from `gracefulShutdown`.
   - Keep: decoy resume + IPC + socket emitter + HTTP-worker forking + `wait_ready`.
   - The HTTP workers still send `DECOY_*` IPC to the master via cluster —
     unchanged (they remain cluster children of the master).

3. **`ecosystem.config.js`** — two apps:
   ```js
   apps: [
     {
       name: 'telegram-premium-server',   // decoy master + HTTP workers
       script: 'dist/index.js',
       exec_mode: 'fork', instances: 1,
       wait_ready: true, listen_timeout: 15000, kill_timeout: 30000,
       // LOOSE cap — recycling this drops decoys, so avoid it. Only a
       // safety backstop well above normal steady-state.
       max_memory_restart: '2560M',
       env: { NODE_ENV: 'production', DECOY_BOT_ENABLED: 'true' },
     },
     {
       name: 'telegram-worker',           // scrape + alert queues only
       script: 'dist/worker.js',
       exec_mode: 'fork', instances: 1,
       kill_timeout: 30000,
       // TIGHT cap — recycling is harmless; catch spikes early.
       max_memory_restart: '1024M',
       env: { NODE_ENV: 'production' },
     },
   ]
   ```

4. **`package.json`** — build already compiles all of `src/`; confirm `dist/worker.js`
   is emitted. No script change needed (`pm2 startOrReload ecosystem.config.js`
   starts both apps).

### Concurrency guard

Both index.ts (master) and worker.ts must NOT both register queue processors, or
jobs get double-processed. After this change, ONLY worker.ts calls
`initializeQueueProcessors()`. Grep to confirm no other caller remains.

### Decoy IPC — no change needed

`DECOY_*` IPC flows HTTP-worker → master (cluster). The new `telegram-worker` is a
standalone PM2 app, not a cluster child, and does not need decoy signaling (queues
are decoy-independent). If a future queue job ever needs to nudge a decoy, use
Redis pub/sub — do NOT rely on cluster IPC across PM2 apps.

## Rollout

1. Deploy. Both apps start: `pm2 startOrReload ecosystem.config.js --update-env`.
2. Verify exactly one process registers processors:
   `pm2 logs telegram-worker | grep "Queue processors registered"` present;
   `pm2 logs telegram-premium-server` shows NO queue init.
3. Confirm jobs process once (no duplicate scrape/alert logs across the two apps).
4. Watch `telegram-premium-server` RSS — should now be flat (decoys only); the
   `[MEM]` line stays low. `telegram-worker` may recycle on spikes — that's fine,
   decoys are unaffected.

## Rollback

Revert `ecosystem.config.js` to the single app and re-add the queue block to
index.ts master (`git revert`), redeploy. Bull jobs persist in Redis, so no job
loss either direction.

## Follow-ups (separate, not blocking)

- Migrate `S3Service` off AWS SDK v2 → v3 (streaming, v2 is EOL).
- The batched alert-fetch (chunked S3, already applied) stays regardless — it
  bounds the worker's own memory too.
