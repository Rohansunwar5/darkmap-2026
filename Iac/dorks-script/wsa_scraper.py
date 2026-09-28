"""Channel discovery with no browser: Decodo Web Scraping API + lxml.

Replaces the whole ECS fleet. Decodo renders the CSE page server-side (it acts
on the URL fragment and waits for the results XHR - both verified), returns
HTML, and this parses it with the same selectors channels.py used in the DOM.

Same output contract as main2.py, so the controller Lambda and both frontends
need no changes:
    {"channel_names": [...], "channels": [{name,title,description,url}]}

  # one dork
  python wsa_scraper.py --token BASIC --term delhi --dork 2

  # a full search: all 6 dorks x 2 pages, 12 concurrent (as production does)
  python wsa_scraper.py --token BASIC --term delhi --all --json out.json

  # burst latency + success rate, the numbers that decide the migration
  python wsa_scraper.py --token BASIC --soak 15

ponytail: stdlib HTTP + lxml only. No browser, no container, no ALB.
"""
import argparse, json, os, statistics, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

from lxml import html as lx

from cse_harness import DORKS, CX, channel_name_from_url

API = "https://scraper-api.decodo.com/v2/scrape"
PAGES = 2
TERMS = ["delhi", "AT&T", "delhi police", "airtel", "mumbai police"]


def cse_url(query, page_num):
    """Query-string form, NOT the #fragment form main2.py uses.

    Decodo URL-decodes before navigating, so a '&' inside the fragment
    (e.g. the term "AT&T") terminates gsc.q early and Google silently searches
    '"AT' - the same truncation bug fixed in the browser scraper. The
    query-string form has no fragment to mangle: verified identical channel
    sets for both "delhi" and "AT&T".
    """
    u = f"https://cse.google.com/cse?cx={CX}&q={quote(query, safe='')}&sort=date"
    if page_num > 1:
        u += f"&start={(page_num - 1) * 10}"
    return u


def fetch(token, url, pool="premium", timeout=120):
    """One rendered page. Decodo retries internally and bills only successes."""
    req = urllib.request.Request(
        API,
        data=json.dumps({"url": url, "headless": "html", "proxy_pool": pool}).encode(),
        headers={"Accept": "application/json", "Content-Type": "application/json",
                 "Authorization": f"Basic {token}"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    return d["results"][0]["content"]


# Same three sources channels.py walked in the DOM, now in lxml.
# ponytail: the all-anchors fallback is kept - if Google changes the card markup
# this degrades to "names, no descriptions" instead of returning nothing.
CARDS_XP = ("//*[contains(@class,'gsc-webResult') and contains(@class,'gsc-result')]"
            " | //*[contains(@class,'gsc-imageResult')]")
SNIPPET_XP = ".//*[contains(@class,'gs-snippet')]"
TITLE_XP = ".//a[contains(@class,'gs-title')]"


def parse(page_html):
    # ponytail: XPath not cssselect - lxml ships XPath, cssselect is an extra dep
    doc = lx.fromstring(page_html)
    out = []
    for card in doc.xpath(CARDS_XP):
        snip = card.xpath(SNIPPET_XP)
        title = card.xpath(TITLE_XP)
        desc = snip[0].text_content().strip() if snip else ""
        ttl = title[0].text_content().strip() if title else ""
        for a in card.xpath(".//a[@href]"):
            href = a.get("href", "")
            if href and not href.startswith("javascript:"):
                out.append({"url": href, "title": ttl, "description": desc})
    if not out:
        for a in doc.xpath("//a[@href]"):
            href = a.get("href", "")
            if href and not href.startswith("javascript:"):
                out.append({"url": href, "title": "", "description": ""})
    return out


def dedupe(items):
    """Keep the longest description per channel - identical to main2.py."""
    channels = {}
    for it in items:
        name = channel_name_from_url(it["url"])
        if not name:
            continue
        prev = channels.get(name)
        if prev is None or len(it["description"]) > len(prev["description"]):
            channels[name] = {"name": name, "title": it["title"],
                              "description": it["description"], "url": it["url"]}
    return list(channels.values())


def search(token, term, pool="premium", workers=10):
    # ponytail: 10 not 12 - the $0/$19 plans cap at 10 req/s and firing all 12
    # at once cost 2 requests to HTTP 429 (and ~15 channels). $49 lifts it to 25.
    """One user search: 6 dorks x 2 pages, all concurrent. Returns the contract."""
    jobs = [(d, p) for d in sorted(DORKS) for p in range(1, PAGES + 1)]
    urls = [cse_url(DORKS[d](term), p) for d, p in jobs]

    raw, failures = [], 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for r in ex.map(lambda u: _safe(token, u, pool), urls):
            if r is None:
                failures += 1
            else:
                raw += parse(r)

    chans = dedupe(raw)
    return {"channel_names": [c["name"] for c in chans], "channels": chans}, failures


def _safe(token, url, pool):
    try:
        return fetch(token, url, pool)
    except Exception as e:
        print(f"    request failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", default=os.getenv("DECODO_BASIC"))
    ap.add_argument("--term", default="delhi")
    ap.add_argument("--dork", type=int, default=2)
    ap.add_argument("--pool", default="premium", choices=["standard", "premium"])
    ap.add_argument("--all", action="store_true", help="full search: 6 dorks x 2 pages")
    ap.add_argument("--soak", type=int, help="N full searches; reports latency + failures")
    ap.add_argument("--json", help="write the payload here")
    ap.add_argument("--workers", type=int, default=10, help="concurrency (plan rate limit: 10 req/s on $0/$19)")
    args = ap.parse_args()
    if not args.token:
        sys.exit("need --token or DECODO_BASIC")

    if args.soak:
        lats, fails, yields = [], 0, []
        n_req = args.soak * 6 * PAGES
        print(f"{args.soak} searches x 12 requests = {n_req} requests "
              f"({n_req/1272*30:.0f} days of real traffic), pool={args.pool}\n")
        for i in range(1, args.soak + 1):
            term = TERMS[(i - 1) % len(TERMS)]
            t0 = time.perf_counter()
            payload, f = search(args.token, term, args.pool)
            ms = (time.perf_counter() - t0) * 1000
            lats.append(ms); fails += f; yields.append(len(payload["channels"]))
            print(f"  search {i:3d}/{args.soak}  {term:14s} {ms:7.0f}ms  "
                  f"{len(payload['channels']):3d} channels  {f} failed req")
        print(f"\n{'=' * 66}")
        print(f"  requests:            {n_req}   failed: {fails} ({100*fails/n_req:.1f}%)")
        print(f"  latency per search:  median {statistics.median(lats):.0f}ms"
              f"  p95 {sorted(lats)[max(0,int(.95*len(lats))-1)]:.0f}ms"
              f"  max {max(lats):.0f}ms")
        print(f"  channels per search: median {statistics.median(yields):.0f}"
              f"  min {min(yields)}  max {max(yields)}")
        rate = {"standard": 0.75, "premium": 1.50}[args.pool]
        print(f"  cost at 1,272 req/mo ({args.pool}+JS @ ${rate}/1K): ${1.272*rate:.2f}/month")
        print(f"  API Gateway cap is 29000ms")
        return

    if args.all:
        t0 = time.perf_counter()
        payload, f = search(args.token, args.term, args.pool, args.workers)
        ms = (time.perf_counter() - t0) * 1000
        for i, c in enumerate(payload["channels"], 1):
            print(f"{i:3d}. {c['name']}")
            print(f"     {c['description'] or '(no description)'}")
        print(f"\n{'=' * 70}")
        print(f"  term:        {args.term!r}")
        print(f"  channels:    {len(payload['channels'])}"
              f"  ({sum(1 for c in payload['channels'] if c['description'])} with descriptions)")
        print(f"  requests:    {6*PAGES} ({f} failed), pool={args.pool}, "
              f"{args.workers} concurrent")
        print(f"  TOTAL TIME:  {ms:.0f}ms          (API Gateway cap: 29000ms)")
    else:
        q = DORKS[args.dork](args.term)
        t0 = time.perf_counter()
        raw = []
        for p in range(1, PAGES + 1):
            raw += parse(fetch(args.token, cse_url(q, p), args.pool))
        chans = dedupe(raw)
        payload = {"channel_names": [c["name"] for c in chans], "channels": chans}
        print(f"dork{args.dork} '{args.term}': {len(chans)} channels, "
              f"{sum(1 for c in chans if c['description'])} with descriptions, "
              f"{(time.perf_counter()-t0)*1000:.0f}ms")
        print(", ".join(payload["channel_names"]))

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
        print(f"-> {args.json}")


if __name__ == "__main__":
    main()
