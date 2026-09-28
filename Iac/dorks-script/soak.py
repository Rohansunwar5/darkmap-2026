"""Production-shaped soak test: does proxying cost us CAPTCHAs or speed?

Mimics the live fleet exactly:
  - 6 warm browsers, one per dork, each pinned to its own proxy IP
    (= 6 ECS services, each with a persistent Chromium and its own egress IP)
  - all 6 dorks fired in parallel
  - both pages of a dork fired in parallel (as scrape_links already does)
  - CAPTCHA on a dork triggers a retry through a spare proxy

Reports per-SEARCH latency (what a user feels) and CAPTCHA rate before and
after failover. Run it against --direct too for a like-for-like speed number.

  python soak.py --proxies proxies.txt --searches 50
  python soak.py --direct --searches 5        # control; burns your own IP

ponytail: browsers are launched once and reused for every search - relaunching
per request was what made the earlier probe look 3x slower than reality.
"""
import argparse, asyncio, collections, json, statistics, sys, time

from cse_harness import DORKS, cse_url, dedupe, EXTRACT_RESULTS_JS, PAGES
from proxy_probe import parse_proxy, CAPTCHA_MARKERS

TERMS = ["delhi", "AT&T", "delhi police", "airtel", "mumbai police"]


async def load_page(browser, proxy, query, page_num):
    """One CSE page. Returns (blocked?, raw_results)."""
    page = await browser.newPage()
    try:
        if proxy and proxy.get("user"):
            await page.authenticate({"username": proxy["user"], "password": proxy["pass"]})
        await page.goto(cse_url(query, page_num), {"waitUntil": "networkidle2", "timeout": 60000})
        await asyncio.sleep(1.5)
        body = (await page.content()).lower()
        cards = await page.evaluate("() => document.querySelectorAll('.gsc-webResult.gsc-result').length")
        if any(m in body for m in CAPTCHA_MARKERS) or cards < 2:
            return True, []
        return False, await page.evaluate(EXTRACT_RESULTS_JS)
    except Exception as e:
        print(f"      page{page_num} error: {type(e).__name__}", file=sys.stderr)
        return True, []
    finally:
        await page.close()


async def load_via_pool(pool, query, page_num, stats):
    """Borrow an IP, use it for exactly one request, return it.

    The 28% block rate in the first soak came from 2 concurrent requests per IP.
    A queue guarantees one-at-a-time per IP, which is what the 18-task fleet
    achieves by accident (12 concurrent requests spread over 18 IPs).
    """
    browser, proxy = await pool.get()
    try:
        blocked, raw = await load_page(browser, proxy, query, page_num)
    finally:
        pool.put_nowait((browser, proxy))
    if not blocked:
        return raw

    stats["blocked_first_try"] += 1
    for _ in range(2):  # ponytail: 2 retries; each lands on a different IP via the queue
        b2, p2 = await pool.get()
        try:
            blocked, raw = await load_page(b2, p2, query, page_num)
        finally:
            pool.put_nowait((b2, p2))
        if not blocked:
            stats["rescued_by_retry"] += 1
            return raw
    stats["failed_after_retry"] += 1
    return []


async def run_dork(pool, term, dork_id, stats):
    """Both pages in parallel, each through its own IP."""
    query = DORKS[dork_id](term)
    pages = await asyncio.gather(*[
        load_via_pool(pool, query, p, stats) for p in range(1, PAGES + 1)])
    raw = [r for rs in pages for r in rs]
    return dedupe(raw), not raw


async def one_search(pool, term, stats):
    """All 6 dorks in parallel - one user search."""
    t0 = time.perf_counter()
    results = await asyncio.gather(*[
        run_dork(pool, term, d, stats) for d in sorted(DORKS)])
    ms = (time.perf_counter() - t0) * 1000
    merged, hit = {}, False
    for chans, was_blocked in results:
        hit = hit or was_blocked
        for c in chans:
            prev = merged.get(c["name"])
            if prev is None or len(c["description"]) > len(prev["description"]):
                merged[c["name"]] = c
    return list(merged.values()), ms, hit


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxies")
    ap.add_argument("--direct", action="store_true", help="no proxy: speed control, burns your IP")
    ap.add_argument("--searches", type=int, default=25)
    ap.add_argument("--chrome", default=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    ap.add_argument("--out", default="soak_results.json")
    args = ap.parse_args()
    if not args.proxies and not args.direct:
        sys.exit("need --proxies FILE or --direct")

    from pyppeteer import launch
    pool = [None] * 6
    if args.proxies:
        with open(args.proxies, encoding="utf-8") as f:
            pool = [p for p in (parse_proxy(l) for l in f) if p]

    async def spawn(proxy):
        a = ["--no-sandbox", "--disable-setuid-sandbox"]
        if proxy:
            a.append(f"--proxy-server=http://{proxy['host']}:{proxy['port']}")
        return (await launch(executablePath=args.chrome, args=a), proxy)

    # one browser per IP, handed out via a queue so no IP ever serves
    # two requests at once
    browsers = [await spawn(p) for p in pool]
    bq = asyncio.Queue()
    for b in browsers:
        bq.put_nowait(b)
    concurrent = 6 * PAGES
    print(f"{len(browsers)} IP(s) in the pool, {concurrent} concurrent requests per search "
          f"=> {concurrent/len(browsers):.2f} concurrent per IP")
    print(f"{args.searches} searches x 6 dorks x {PAGES} pages "
          f"= {args.searches * 6 * PAGES} page loads "
          f"({args.searches * 6 * PAGES / 1272 * 30:.0f} days of real traffic)\n")

    stats = collections.Counter()
    lats, yields, rows = [], [], []
    try:
        for i in range(1, args.searches + 1):
            term = TERMS[(i - 1) % len(TERMS)]
            chans, ms, hit = await one_search(bq, term, stats)
            lats.append(ms)
            yields.append(len(chans))
            rows.append({"i": i, "term": term, "ms": ms, "channels": len(chans),
                         "captcha_seen": hit, "names": sorted(c["name"] for c in chans)})
            print(f"  search {i:3d}/{args.searches}  {term:14s} {ms:7.0f}ms  "
                  f"{len(chans):3d} channels  {'CAPTCHA(recovered)' if hit else ''}")
    finally:
        for b, _ in browsers:
            try:
                await b.close()
            except Exception:
                pass

    total_pages = args.searches * 6 * PAGES
    print(f"\n{'=' * 74}")
    print(f"  searches:            {args.searches}   ({total_pages} page loads)")
    print(f"  dork-level blocks:   {stats['blocked_first_try']} of {args.searches*6}"
          f"  ({100*stats['blocked_first_try']/max(1,args.searches*6):.1f}%)")
    print(f"  rescued by retry:    {stats['rescued_by_retry']}")
    print(f"  UNRECOVERED:         {stats['failed_after_retry']}   <-- what a user would actually see")
    print(f"\n  latency per search:  median {statistics.median(lats):.0f}ms"
          f"   p95 {sorted(lats)[int(.95*len(lats))-1]:.0f}ms"
          f"   max {max(lats):.0f}ms")
    print(f"  channels per search: median {statistics.median(yields):.0f}"
          f"   min {min(yields)}   max {max(yields)}")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"mode": "direct" if args.direct else "proxied", "stats": dict(stats),
                   "latency_ms": lats, "rows": rows}, f, indent=2)
    print(f"\n  detail -> {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
