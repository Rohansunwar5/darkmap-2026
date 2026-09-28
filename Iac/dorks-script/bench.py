"""Three-way benchmark: local browser vs Decodo WSA vs ScrapingDog.

All three fetch the SAME CSE URLs (query-string form), so any difference in
channels is the provider, not the query. Reports per backend:

  - total wall time per search (what a user feels: 12 requests in parallel)
  - per-request latency median / p95
  - failures, and specifically rate-limit (429) failures
  - channels found + description coverage
  - cross-backend agreement (they render the same CSE, so they should agree)

  python bench.py --backends local decodo scrapingdog --terms delhi "AT&T"

ponytail: one warm browser for local (as production keeps), threads for the
HTTP backends. Credits are precious - --terms controls the spend.
"""
import argparse, asyncio, json, statistics, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urlencode

from cse_harness import DORKS, CX
from wsa_scraper import parse, dedupe

PAGES = 2
DECODO_API = "https://scraper-api.decodo.com/v2/scrape"


def cse_url(query, page):
    """Query-string form. The #fragment form breaks through providers that
    URL-decode before navigating (Decodo truncated "AT&T" at the '&')."""
    u = f"https://cse.google.com/cse?cx={CX}&q={quote(query, safe='')}&sort=date"
    return u + (f"&start={(page - 1) * 10}" if page > 1 else "")


def _http(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def make_decodo(token, pool="standard"):
    def go(url):
        req = urllib.request.Request(
            DECODO_API,
            data=json.dumps({"url": url, "headless": "html", "proxy_pool": pool}).encode(),
            headers={"Accept": "application/json", "Content-Type": "application/json",
                     "Authorization": f"Basic {token}"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.load(r)["results"][0]["content"]
    return go


def make_scrapingdog(key, wait=4000):
    def go(url):
        return _http("https://api.scrapingdog.com/scrape?" + urlencode(
            {"api_key": key, "url": url, "dynamic": "true", "wait": str(wait)}))
    return go


# --- local browser: one warm Chromium, as the ECS tasks keep -----------------
class LocalBrowser:
    def __init__(self, chrome):
        self.chrome, self.browser, self.loop = chrome, None, None

    def start(self):
        from pyppeteer import launch
        self.loop = asyncio.new_event_loop()
        self.browser = self.loop.run_until_complete(
            launch(executablePath=self.chrome,
                   args=["--no-sandbox", "--disable-setuid-sandbox"]))

    def fetch(self, url):
        async def go():
            page = await self.browser.newPage()
            try:
                await page.goto(url, {"waitUntil": "networkidle2", "timeout": 60000})
                await asyncio.sleep(1.5)
                return await page.content()
            finally:
                await page.close()
        return self.loop.run_until_complete(go())

    def stop(self):
        if self.browser:
            try:
                self.loop.run_until_complete(self.browser.close())
            except Exception:
                pass


def run_search(fetch, term, workers, serial=False):
    """One user search: 6 dorks x 2 pages. Returns (channels, wall_ms, stats)."""
    urls = [cse_url(DORKS[d](term), p) for d in sorted(DORKS) for p in range(1, PAGES + 1)]
    lats, raw, fails, rate_limited = [], [], 0, 0

    def one(u):
        t0 = time.perf_counter()
        try:
            html = fetch(u)
            return (time.perf_counter() - t0) * 1000, html, None
        except urllib.error.HTTPError as e:
            return (time.perf_counter() - t0) * 1000, None, e.code
        except Exception as e:
            return (time.perf_counter() - t0) * 1000, None, type(e).__name__

    t0 = time.perf_counter()
    if serial:  # ponytail: local browser isn't thread-safe; production runs 1 dork per service
        results = [one(u) for u in urls]
    else:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            results = list(ex.map(one, urls))
    wall = (time.perf_counter() - t0) * 1000

    for ms, html, err in results:
        lats.append(ms)
        if err is None:
            raw += parse(html)
        else:
            fails += 1
            if err == 429:
                rate_limited += 1
    chans = dedupe(raw)
    return chans, wall, {"lats": lats, "fails": fails, "429": rate_limited,
                         "n": len(urls)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backends", nargs="+", default=["local", "decodo"])
    ap.add_argument("--terms", nargs="+", default=["delhi", "AT&T", "delhi police"])
    ap.add_argument("--decodo-token", default="")
    ap.add_argument("--scrapingdog-key", default="")
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--chrome", default=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    ap.add_argument("--out", default="bench_results.json")
    args = ap.parse_args()

    local = None
    backends = {}
    for b in args.backends:
        if b == "local":
            local = LocalBrowser(args.chrome); local.start()
            backends["local"] = (local.fetch, True)
        elif b == "decodo":
            backends["decodo"] = (make_decodo(args.decodo_token), False)
        elif b == "scrapingdog":
            backends["scrapingdog"] = (make_scrapingdog(args.scrapingdog_key), False)

    rows = []
    try:
        for term in args.terms:
            print(f"\n{'='*78}\nTERM: {term!r}")
            sets = {}
            for name, (fetch, serial) in backends.items():
                chans, wall, st = run_search(fetch, term, args.workers, serial)
                lats = sorted(st["lats"])
                p95 = lats[max(0, int(.95 * len(lats)) - 1)] if lats else 0
                names = {c["name"] for c in chans}
                sets[name] = names
                print(f"  [{name:12s}] wall {wall:7.0f}ms | req median {statistics.median(lats):6.0f}ms "
                      f"p95 {p95:6.0f}ms | ok {st['n']-st['fails']}/{st['n']} "
                      f"(429s: {st['429']}) | channels {len(chans):3d} | desc "
                      f"{sum(1 for c in chans if c['description'])}")
                rows.append({"term": term, "backend": name, "wall_ms": wall,
                             "median_ms": statistics.median(lats), "p95_ms": p95,
                             "ok": st["n"] - st["fails"], "n": st["n"],
                             "rate_limited": st["429"], "channels": sorted(names),
                             "with_desc": sum(1 for c in chans if c["description"])})
            if len(sets) > 1:
                print("  agreement:")
                ks = list(sets)
                for i in range(len(ks)):
                    for j in range(i + 1, len(ks)):
                        a, b = sets[ks[i]], sets[ks[j]]
                        u = a | b
                        print(f"    {ks[i]:12s} vs {ks[j]:12s}  shared {len(a&b):3d}/{len(u):3d}"
                              f"  jaccard {len(a&b)/len(u) if u else 1:.2f}")
    finally:
        if local:
            local.stop()

    print(f"\n{'='*78}\nSUMMARY")
    for name in backends:
        rs = [r for r in rows if r["backend"] == name]
        if not rs:
            continue
        print(f"  [{name:12s}] wall median {statistics.median([r['wall_ms'] for r in rs]):7.0f}ms "
              f"| req median {statistics.median([r['median_ms'] for r in rs]):6.0f}ms "
              f"| ok {sum(r['ok'] for r in rs)}/{sum(r['n'] for r in rs)} "
              f"| 429s {sum(r['rate_limited'] for r in rs)} "
              f"| channels/search median {statistics.median([len(r['channels']) for r in rs]):.0f}")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"  detail -> {args.out}")


if __name__ == "__main__":
    main()
