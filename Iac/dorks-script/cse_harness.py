"""Side-by-side comparison: Custom Search JSON API vs the Chromium scraper.

Decides whether the $217/mo scraping fleet can be replaced by the official API
serving the same Programmable Search Engine. Reuses main2.py's channel regexes
and dedupe verbatim so the only variable is where the results come from.

  python cse_harness.py --key AIza... --mode api
  python cse_harness.py --key AIza... --mode both --terms delhi "AT&T" "delhi police"

ponytail: stdlib only for the API path so it runs anywhere; pyppeteer is imported
lazily and only for --mode scrape/both.
"""
import argparse, asyncio, json, os, re, sys, time
from urllib.parse import quote, urlencode
from urllib.request import urlopen
from urllib.error import HTTPError

CX = "006368593537057042503:efxu7xprihg"
PAGES = 2  # scraper does gsc.page=1,2 -> API start=1,11

# --- the six dork queries. This is the actual IP; preserve verbatim. ---------
# dork1-5 from Iac/dorks-script/dork-dockers/main2.py (build_query per image),
# dork6 from Iac/Channel_links_Extraction/dork4-extracted/channels.py.
# Quirks left intact deliberately: dork3's curly quotes (Google normalises them),
# dork4's missing space after the term, dork5's \W matching a space.
DORK6_INCLUDE = ["database leak", "data breach"]
DORK6_EXCLUDE = ["telegraph", "news"]


def dork6(q, include=None, exclude=None):
    include = DORK6_INCLUDE if include is None else include
    exclude = DORK6_EXCLUDE if exclude is None else exclude
    parts = [f'"{q}"']
    includes = " OR ".join(f'"{k.strip()}"' for k in include if k.strip())
    if includes:
        parts.append(f"AND ({includes})")
    excludes = " ".join(f"-{k.strip()}" for k in exclude if k.strip())
    if excludes:
        parts.append(excludes)
    return " ".join(parts)


DORKS = {
    1: lambda q: f'"{q}" AND ("database leak" OR "data breach") AND ("hack" OR "database" OR "leak") -telegraph -news',
    2: lambda q: f'"{q}" AND "database" "leak" -telegraph',
    3: lambda q: f'"{q}" AND "leak" OR \u201cleaked\u201d OR \u201chack\u201d OR \u201chacked\u201d OR \u201cattack\u201d OR \u201cattacked\u201d -telegraph -news',
    4: lambda q: f'"{q}"AND ("database leak" OR "data breach") AND ("hack" OR "database" OR "leak" OR "link" OR "download") -telegraph -news',
    5: lambda q: (f'"{q}"' if re.search(r"[\d\W]", q)
                  else f'"{q}" AND ("malware" OR "c2") AND ("hack" OR "trojan" OR "leak" OR "stealer") -telegraph -news'),
    6: dork6,
}

# --- verbatim from main2.py --------------------------------------------------
CHANNEL_PATTERNS = (
    re.compile(r"tgstat\.com/.*?@([^/?#]+)"),
    re.compile(r"https?://(?:t\.me|telegram\.me)/s/([^/?#]+)"),
    re.compile(r"telemetr\.io/\w+/channels/\d+-(\w+)"),
)


def channel_name_from_url(url):
    for pattern in CHANNEL_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    return None


def dedupe(items):
    """Dedupe by channel name keeping the longest description. Same as main2.py."""
    channels = {}
    for item in items:
        name = channel_name_from_url(item["url"])
        if not name:
            continue
        existing = channels.get(name)
        if existing is None or len(item["description"]) > len(existing["description"]):
            channels[name] = {"name": name, "title": item["title"],
                              "description": item["description"], "url": item["url"]}
    return list(channels.values())


# --- path A: Custom Search JSON API -----------------------------------------
def api_fetch(key, query, sort_by_date=True):
    """One page-pair through the JSON API. Returns (items, quota_used, error)."""
    items, used = [], 0
    for start in [1 + 10 * p for p in range(PAGES)]:
        params = {"key": key, "cx": CX, "q": query, "num": 10, "start": start}
        if sort_by_date:
            params["sort"] = "date"  # scraper pins gsc.sort=date
        try:
            with urlopen("https://www.googleapis.com/customsearch/v1?" + urlencode(params), timeout=20) as r:
                data = json.load(r)
            used += 1
        except HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            return items, used, f"HTTP {e.code}: {body}"
        except Exception as e:
            return items, used, f"{type(e).__name__}: {e}"
        for it in data.get("items", []):
            items.append({"url": it.get("link", ""), "title": it.get("title", ""),
                          "description": it.get("snippet", "") or ""})
        if len(data.get("items", [])) < 10:
            break  # no page 2 -> don't burn the quota
    return items, used, None


# --- path B: the current Chromium scraper -----------------------------------
EXTRACT_RESULTS_JS = """() => {
    const usable = (a) => a.href && a.href.trim() !== '' && !a.href.startsWith('javascript:');
    const out = [];
    document.querySelectorAll('.gsc-webResult.gsc-result, .gsc-imageResult').forEach(card => {
        const snippetEl = card.querySelector('.gs-snippet');
        const titleEl = card.querySelector('a.gs-title');
        const description = snippetEl ? snippetEl.innerText.trim() : '';
        const title = titleEl ? titleEl.innerText.trim() : '';
        card.querySelectorAll('a').forEach(a => {
            if (usable(a)) out.push({ url: a.href, title: title, description: description });
        });
    });
    if (out.length === 0) {
        document.querySelectorAll('a').forEach(a => {
            if (usable(a)) out.push({ url: a.href, title: '', description: '' });
        });
    }
    return out;
}"""


def cse_url(query, page_num):
    return (f"https://cse.google.com/cse?&cx={CX}"
            f"#gsc.tab=0&gsc.q={quote(query)}&gsc.sort=date&gsc.page={page_num}")


async def scrape_fetch(browser, query, proxy=None):
    """Both pages of one dork. `proxy` only supplies auth; the browser was
    already launched pointing at it (pyppeteer pins --proxy-server at launch)."""
    out = []
    for page_num in range(1, PAGES + 1):
        page = await browser.newPage()
        try:
            if proxy and proxy.get("user"):
                await page.authenticate({"username": proxy["user"], "password": proxy["pass"]})
            await page.goto(cse_url(query, page_num), {"waitUntil": "networkidle2", "timeout": 60000})
            await asyncio.sleep(2)  # ponytail: CSE renders after networkidle2; 2s beats a selector race
            out += await page.evaluate(EXTRACT_RESULTS_JS)
        except Exception as e:
            print(f"    scrape page {page_num} failed: {type(e).__name__}: {e}", file=sys.stderr)
        finally:
            await page.close()
    return out


# --- comparison -------------------------------------------------------------
def summarise(channels):
    return {c["name"]: c for c in channels}


def report(term, dork_id, query, api_ch, scr_ch, api_ms, scr_ms, quota):
    """Either side may be None (single-mode run); jaccard only when both ran."""
    a = summarise(api_ch) if api_ch is not None else None
    s = summarise(scr_ch) if scr_ch is not None else None
    print(f"\n  dork{dork_id}  q={query}")
    if a is not None:
        print(f"    API     {len(a):3d} channels, {sum(1 for c in api_ch if c['description']):3d} w/ snippet, {api_ms:5.0f}ms, {quota} quota")
    if s is not None:
        print(f"    SCRAPER {len(s):3d} channels, {sum(1 for c in scr_ch if c['description']):3d} w/ snippet, {scr_ms:5.0f}ms")
        if s:
            print(f"      {', '.join(sorted(s)[:14])}")

    jac = None
    if a is not None and s is not None:
        both, only_a, only_s = set(a) & set(s), set(a) - set(s), set(s) - set(a)
        union = set(a) | set(s)
        jac = len(both) / len(union) if union else 1.0
        print(f"    overlap {len(both)}/{len(union)}  jaccard={jac:.2f}")
        if only_s:
            print(f"    MISSED by API   ({len(only_s)}): {', '.join(sorted(only_s)[:12])}")
        if only_a:
            print(f"    EXTRA from API  ({len(only_a)}): {', '.join(sorted(only_a)[:12])}")

    return {"term": term, "dork": dork_id, "query": query,
            "api": sorted(a) if a is not None else None,
            "scraper": sorted(s) if s is not None else None,
            "jaccard": jac, "api_ms": api_ms, "scraper_ms": scr_ms, "quota": quota,
            "api_channels": api_ch, "scraper_channels": scr_ch}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.getenv("GOOGLE_CSE_API_KEY"))
    ap.add_argument("--mode", choices=["api", "scrape", "both"], default="both")
    ap.add_argument("--terms", nargs="+", default=["delhi", "AT&T", "delhi police"])
    ap.add_argument("--dorks", nargs="+", type=int, default=sorted(DORKS))
    ap.add_argument("--no-sort-date", action="store_true", help="drop sort=date (scraper pins it, but it costs results)")
    ap.add_argument("--out", default="cse_harness_results.json")
    ap.add_argument("--proxies", help="file of ip:port:user:pass - routes each dork through a different proxy")
    ap.add_argument("--chrome", default=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    args = ap.parse_args()

    if args.mode in ("api", "both") and not args.key:
        sys.exit("need --key or GOOGLE_CSE_API_KEY")

    # ponytail: one proxy per dork, mirroring production where each dork hits a
    # different service on a different IP. pyppeteer can't switch proxy per page,
    # so each dork gets its own short-lived browser.
    pool = [None]
    if args.proxies:
        from proxy_probe import parse_proxy
        with open(args.proxies, encoding="utf-8") as f:
            pool = [p for p in (parse_proxy(l) for l in f) if p]
        print(f"routing each dork through 1 of {len(pool)} proxies")

    browser = None
    if args.mode in ("scrape", "both") and not args.proxies:
        from pyppeteer import launch
        browser = await launch(executablePath=args.chrome,
                               args=["--no-sandbox", "--disable-setuid-sandbox"])

    rows, total_quota = [], 0
    try:
        for term in args.terms:
            print(f"\n{'=' * 78}\nTERM: {term!r}")
            for d in args.dorks:
                query = DORKS[d](term)
                api_ch, scr_ch, api_ms, scr_ms, quota = None, None, 0, 0, 0

                if args.mode in ("api", "both"):
                    t0 = time.perf_counter()
                    items, quota, err = api_fetch(args.key, query, not args.no_sort_date)
                    api_ms = (time.perf_counter() - t0) * 1000
                    total_quota += quota
                    if err:
                        print(f"\n  dork{d}  API ERROR: {err}")
                        if "403" in err or "429" in err:
                            print("  aborting: quota or access problem, not a result difference")
                            return
                        continue
                    api_ch = dedupe(items)

                if args.mode in ("scrape", "both"):
                    t0 = time.perf_counter()
                    proxy = pool[(d - 1) % len(pool)]
                    if proxy:
                        from pyppeteer import launch
                        b = await launch(executablePath=args.chrome, args=[
                            "--no-sandbox", "--disable-setuid-sandbox",
                            f"--proxy-server=http://{proxy['host']}:{proxy['port']}"])
                        try:
                            scr_ch = dedupe(await scrape_fetch(b, query, proxy))
                        finally:
                            await b.close()
                    else:
                        scr_ch = dedupe(await scrape_fetch(browser, query))
                    scr_ms = (time.perf_counter() - t0) * 1000

                rows.append(report(term, d, query, api_ch, scr_ch, api_ms, scr_ms, quota))
    finally:
        if browser:
            await browser.close()

    # verdict
    scored = [r for r in rows if r["jaccard"] is not None]
    print(f"\n{'=' * 78}\nSUMMARY   {len(rows)} dork-runs, {total_quota} API queries used")
    if scored:
        mean = sum(r["jaccard"] for r in scored) / len(scored)
        print(f"mean jaccard {mean:.2f}   worst {min(r['jaccard'] for r in scored):.2f}")
        api_only = sum(len(set(r['api']) - set(r['scraper'])) for r in scored)
        scr_only = sum(len(set(r['scraper']) - set(r['api'])) for r in scored)
        print(f"channels the API misses: {scr_only}   channels the API adds: {api_only}")
        print(f"latency  API {sum(r['api_ms'] for r in scored) / len(scored):.0f}ms"
              f"  vs SCRAPER {sum(r['scraper_ms'] for r in scored) / len(scored):.0f}ms  (per dork, serial)")
        print("VERDICT:", "migrate" if mean >= 0.7 else "investigate before migrating")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"full detail -> {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
