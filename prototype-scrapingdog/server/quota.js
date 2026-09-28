// REF darkmap/quota.py, denominated in ScrapingDog credits (spec §9). A cap of 0 disables that window.
import { QuotaExceeded } from './errors.js';

const pad = n => String(n).padStart(2, '0');
export function windowsFor(date) {
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  return { minute: `m:${day}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`, day: `d:${day}` };
}
function counter(store, scope, window) {
  const table = store.table('quota_counters');
  return table.byUnique(0, scope, window) ?? table.insert({ scope, window, count: 0 });
}
function limits(config, date) {
  const w = windowsFor(date);
  return [[w.minute, config.creditCapPerMinute, 60 - date.getUTCSeconds()], [w.day, config.creditCapPerDay, 3600.0]];
}
export function assertRoom(store, scope, cost, config, clock = Date.now) {
  for (const [window, cap, retryAfter] of limits(config, new Date(clock()))) {
    if (cap > 0 && counter(store, scope, window).count + cost > cap) throw new QuotaExceeded(scope, window, retryAfter);
  }
}
export function consume(store, scope, cost, config, clock = Date.now) {
  for (const [window] of limits(config, new Date(clock()))) counter(store, scope, window).count += cost;
}
export function usage(store, scope, clock = Date.now) {
  const w = windowsFor(new Date(clock()));
  const table = store.table('quota_counters');
  return { minute: table.byUnique(0, scope, w.minute)?.count ?? 0, day: table.byUnique(0, scope, w.day)?.count ?? 0 };
}
