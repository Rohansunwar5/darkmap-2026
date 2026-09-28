// Scripted stand-in for server/scrapingdog.js createClient(); advances a fake clock per call.
export function fakeClock(start = Date.UTC(2026, 8, 23, 12, 0, 0)) {
  let now = start;
  return { now: () => now, tick: ms => { now += ms; }, monotonic: () => now };
}
export function fakeClient(handler, { clock, stepMs = 2000 } = {}) {
  const calls = [];
  return {
    calls,
    async call(endpoint, params) {
      calls.push([endpoint, params]);
      clock?.tick(stepMs);
      await Promise.resolve();
      return handler(endpoint, params);
    },
  };
}
