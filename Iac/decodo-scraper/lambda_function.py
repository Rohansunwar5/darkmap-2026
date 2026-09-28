"""Drop-in replacement for ECS-Service-Controller: Decodo instead of the fleet.

Same handler contract as Iac/ECS-Service-Controller/index.py - same event shape,
same {channel_names, channels} response, same noise demotion - so the backend
and both frontends need zero changes. What changes is underneath: instead of
fanning out to 5 ALBs backed by 18 Fargate tasks running Chromium, it asks
Decodo's Web Scraping API to render the same CSE pages.

  no include/exclude keywords -> dorks 1-5   (what /tg does today, 10 requests)
  with keywords               -> dork 6      (what /tg-2 does today, 2 requests)

Env:
  DECODO_TOKEN   basic auth token from the Decodo dashboard   (required)
  DECODO_POOL    standard | premium         (default standard: measured faster AND cheaper)
  MAX_WORKERS    concurrency               (default 10 - the $0/$19 plan caps at 10 req/s)
  PAGES          result pages per dork      (default 2)
  RETRIES        per-request retries        (default 2 - ~1.7% of calls fail on transport)

ponytail: stdlib only. No lxml (would need a compiled Lambda layer), no browser,
no container. Plain zip deploy, same as the Lambda it replaces.
"""
import json
import os
import re
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, wait
from html.parser import HTMLParser
from urllib.parse import quote

API = "https://scraper-api.decodo.com/v2/scrape"
CX = "006368593537057042503:efxu7xprihg"

TOKEN = os.getenv("DECODO_TOKEN", "")
POOL = os.getenv("DECODO_POOL", "standard")
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "10"))
PAGES = int(os.getenv("PAGES", "2"))
RETRIES = int(os.getenv("RETRIES", "1"))

# Last-resort widening when dorks 1-5 find nothing. Defaults to the bare quoted
# term - no include/exclude filters - which is the widest net the CSE allows.
FALLBACK_ENABLED = os.getenv("FALLBACK_ENABLED", "1") not in ("0", "false", "False")
FALLBACK_INCLUDE = [k for k in os.getenv("FALLBACK_INCLUDE", "").split(",") if k.strip()]
FALLBACK_EXCLUDE = [k for k in os.getenv("FALLBACK_EXCLUDE", "").split(",") if k.strip()]

# ---------------------------------------------------------------------------
# The dork queries. This is the actual IP - preserve verbatim.
# Known quirks kept deliberately: dork3's curly quotes (Google normalises them),
# dork4's missing space after the term, dork5's \W matching a space.
# ---------------------------------------------------------------------------
DORKS = {
    1: lambda q: f'"{q}" AND ("database leak" OR "data breach") AND ("hack" OR "database" OR "leak") -telegraph -news',
    2: lambda q: f'"{q}" AND "database" "leak" -telegraph',
    3: lambda q: f'"{q}" AND "leak" OR “leaked” OR “hack” OR “hacked” OR “attack” OR “attacked” -telegraph -news',
    4: lambda q: f'"{q}"AND ("database leak" OR "data breach") AND ("hack" OR "database" OR "leak" OR "link" OR "download") -telegraph -news',
    5: lambda q: (f'"{q}"' if re.search(r"[\d\W]", q)
                  else f'"{q}" AND ("malware" OR "c2") AND ("hack" OR "trojan" OR "leak" OR "stealer") -telegraph -news'),
}


def dork6(q, include=None, exclude=None):
    parts = [f'"{q}"']
    includes = " OR ".join(f'"{k.strip()}"' for k in (include or []) if k.strip())
    if includes:
        parts.append(f"AND ({includes})")
    excludes = " ".join(f"-{k.strip()}" for k in (exclude or []) if k.strip())
    if excludes:
        parts.append(excludes)
    return " ".join(parts)


def cse_url(query, page):
    """Fragment form so paging works; query-string form when the term has '&'.

    Only #gsc.page advances the pager. ?start=, ?page=, ?gsc.page= and
    /cse/publicurl?start= were all measured re-serving page 1
    (gsc-cursor-current-page=1 every time), so PAGES=2 was fetching page 1
    twice and nothing past the first 20 cards was ever reachable.

    The catch is §5.2: Decodo URL-decodes before navigating, so a '&' inside
    the fragment terminates gsc.q early and Google searches '"AT' instead of
    '"AT&T"'. Measured 0/9 channel overlap against the query-string form. No
    escaping survives - %26, %2526 and %252526 all came back wrong or empty.

    ponytail: '&' in the term keeps the safe query-string form and forfeits
    paging. Correct page 1 beats a wrong page 2, and the dorks contain no '&' -
    only a user's own term can, so this costs paging on "AT&T" and nothing else.
    """
    q = quote(query, safe='')
    if "&" in query:
        return f"https://cse.google.com/cse?cx={CX}&q={q}&sort=date"
    return f"https://cse.google.com/cse?cx={CX}#gsc.q={q}&gsc.sort=date&gsc.page={page}"


# --- HTML extraction, stdlib only -------------------------------------------
def _has(cls, *want):
    return all(w in cls for w in want)


# Void elements fire handle_starttag but never handle_endtag. Counting them
# makes the depth drift upward so a card never closes - which merged every
# snippet on the page into every channel. Caught by test_parser.py.
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}


class CSEParser(HTMLParser):
    """Walks CSE result cards, pairing every link in a card with that card's
    title and snippet - the same pairing channels.py did in the live DOM.

    Cards are delimited by where the NEXT card starts, not by matching close
    tags. Depth counting was tried first and got it wrong on real CSE markup
    (21 cards in the page, 2 detected), which merged every snippet into every
    channel. Boundary-by-next-card has no arithmetic to get wrong, and its worst
    failure is a truncated description rather than a contaminated one.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []          # {url, title, description} per link, per card
        self.all_links = []      # fallback if the card markup ever changes
        self._card = None        # {links, title, desc}
        self._grab = None        # 'title' | 'desc'
        self._grab_tag = None    # tag whose close ends the grab

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "") or ""

        if tag not in VOID and (_has(cls, "gsc-webResult", "gsc-result")
                                or "gsc-imageResult" in cls):
            self._flush()        # previous card ends where this one begins
            self._card = {"links": [], "title": "", "desc": ""}

        href = a.get("href")
        if tag == "a" and href and not href.startswith("javascript:"):
            self.all_links.append(href)
            if self._card is not None:
                self._card["links"].append(href)

        if self._card is not None and self._grab is None:
            if "gs-snippet" in cls:
                self._grab, self._grab_tag = "desc", tag
            elif tag == "a" and "gs-title" in cls:
                self._grab, self._grab_tag = "title", tag

    def handle_endtag(self, tag):
        if self._grab is not None and tag == self._grab_tag:
            self._grab = self._grab_tag = None

    def _flush(self):
        if self._card is None:
            return
        for url in self._card["links"]:
            self.items.append({"url": url,
                               "title": self._card["title"].strip(),
                               "description": self._card["desc"].strip()})
        self._card = self._grab = self._grab_tag = None

    def close(self):
        super().close()
        self._flush()            # the last card has no next card to end it

    def handle_data(self, data):
        if self._card is not None and self._grab:
            key = "desc" if self._grab == "desc" else "title"
            self._card[key] += data


def parse(html):
    p = CSEParser()
    try:
        p.feed(html)
        p.close()
    except Exception as e:  # malformed markup should degrade, not fail the search
        print(f"parse warning: {type(e).__name__}: {e}")
    if p.items:
        return p.items
    # ponytail: fall back to the old all-anchors sweep, so a markup change
    # degrades to "names, no descriptions" instead of returning nothing.
    return [{"url": u, "title": "", "description": ""} for u in p.all_links]


# Same three sources as channels.py; first match wins.
CHANNEL_PATTERNS = (
    re.compile(r"tgstat\.com/.*?@([^/?#]+)"),
    re.compile(r"https?://(?:t\.me|telegram\.me)/s/([^/?#]+)"),
    re.compile(r"telemetr\.io/\w+/channels/\d+-(\w+)"),
)


def channel_name_from_url(url):
    for pattern in CHANNEL_PATTERNS:
        m = pattern.search(url)
        if m:
            return m.group(1)
    return None


# --- fetching ---------------------------------------------------------------
# Decodo sometimes returns the CSE page without executing its JavaScript: ~2.3KB
# of shell carrying a <noscript> notice instead of ~92KB of rendered results. It
# is a 200 and Decodo bills it, so it has to be caught by content, not status.
RENDER_RETRIES = int(os.environ.get("RENDER_RETRIES", "6"))
# One budget for the WHOLE search. /tg-decodo is API Gateway (29s integration
# timeout, and the Function URL is blocked account-wide) and the backend's axios
# gives up at 30s. Anything that finishes later is thrown away: on 2026-09-24
# every normal search ran 31-58s and returned a 504 with 40-71 channels found.
SEARCH_BUDGET_S = float(os.environ.get("SEARCH_BUDGET_S", "25"))
# A rendered page takes ~5-13s, so an attempt with less than this left can't win.
MIN_ATTEMPT_S = float(os.environ.get("MIN_ATTEMPT_S", "5"))
RENDER_RETRY_SLEEP = float(os.environ.get("RENDER_RETRY_SLEEP", "1.5"))


# The shell is ~2.3KB; any page whose JavaScript ran is tens of KB.
RENDERED_MIN_BYTES = int(os.environ.get("RENDERED_MIN_BYTES", "20000"))


def _rendered(html):
    """True when the CSE's JavaScript actually ran.

    Do NOT test for "gsc-webResult": the un-rendered shell ships a class-name
    list containing that exact string, so substring matching reports every
    shell as rendered - which silently disabled this whole retry path once
    already. Size is the honest signal (2.3KB shell vs ~92KB rendered), and it
    stays correct for a rendered page that genuinely found no results.
    """
    if not html:
        return False
    if len(html) >= RENDERED_MIN_BYTES:
        return True
    return "requires JavaScript" not in html

def fetch(url, deadline=None, retries=RETRIES):
    """One RENDERED page, or None.

    Two failure modes, not one. Transport errors (measured ~1.7%:
    IncompleteRead) were always retried. The second is newer and was silently
    accepted: Decodo returns 200 with the CSE shell and no JavaScript executed,
    so the page carries zero results. The parser then found nothing and the
    search looked empty - normal search survived it by firing 10 requests while
    an advanced search fires 2 and usually came back with nothing at all.

    Un-rendered pages come back in ~3-5s and rendered ones in ~8-9s, and the
    failures cluster in windows, so retries are spaced rather than immediate.

    Every call is capped at the time left before `deadline`. Checking only
    between tries let a retry that started at 15s run to 35s+ on its own.
    """
    deadline = deadline or time.time() + SEARCH_BUDGET_S
    body = json.dumps({"url": url, "headless": "html", "proxy_pool": POOL}).encode()
    last, shells = None, 0
    for attempt in range(max(retries, RENDER_RETRIES) + 1):
        left = deadline - time.time()
        if left < MIN_ATTEMPT_S:
            print(f"fetch out of budget after {attempt} tries ({shells} un-rendered)")
            return None
        try:
            req = urllib.request.Request(API, data=body, headers={
                "Accept": "application/json", "Content-Type": "application/json",
                "Authorization": f"Basic {TOKEN}"})
            with urllib.request.urlopen(req, timeout=left) as r:
                html = json.load(r)["results"][0]["content"]
            if _rendered(html):
                if shells:
                    print(f"rendered after {shells} un-rendered attempt(s)")
                return html
            shells += 1
            last = "un-rendered shell"
        except Exception as e:
            last = e
        if attempt < max(retries, RENDER_RETRIES):
            time.sleep(RENDER_RETRY_SLEEP)
    print(f"fetch gave up after {max(retries, RENDER_RETRIES) + 1} tries "
          f"({shells} un-rendered): {last}")
    return None


def collect(queries, deadline=None):
    """queries -> deduped channels. Every page of every dork, concurrently.

    All requests run in parallel, so total latency is the SLOWEST one. Waiting
    for it is what made searches take 31-58s behind a 29s gateway, so pages
    still missing at `deadline` are abandoned and the search returns with what
    rendered. Partial results beat a 504 that discards all of them.

    ponytail: hedging (a duplicate request after HEDGE_AFTER_MS) was removed.
    It was already off in production because fetch() retries internally and a
    hedge started a second retry chain, and its wait had no deadline.
    """
    deadline = deadline or time.time() + SEARCH_BUDGET_S
    # dict.fromkeys dedupes: an "&" term returns the same page-1 URL for every
    # page, and paying Decodo twice for it would also inflate the failure count.
    urls = list(dict.fromkeys(cse_url(q, p)
                              for q in queries for p in range(1, PAGES + 1)))
    results = {}
    ex = ThreadPoolExecutor(max_workers=MAX_WORKERS)
    try:
        futures = {ex.submit(fetch, u, deadline=deadline): u for u in urls}
        done, _ = wait(list(futures), timeout=max(0.0, deadline - time.time()))
        for f in done:
            html = f.result()
            if html is not None:
                results[futures[f]] = html
    finally:
        # wait=False so an abandoned page can't hold the response back
        ex.shutdown(wait=False, cancel_futures=True)

    raw = []
    for u in urls:
        if u in results:
            raw += parse(results[u])
    failures = len(urls) - len(results)

    channels = {}
    for item in raw:
        name = channel_name_from_url(item["url"])
        if not name:
            continue
        prev = channels.get(name)
        if prev is None or len(item["description"]) > len(prev["description"]):
            channels[name] = {"name": name, "title": item["title"],
                              "description": item["description"], "url": item["url"]}
    return list(channels.values()), len(urls), failures


# Verbatim from the Lambda this replaces: these are demoted, never dropped.
NOISE = [k.lower() for k in [
    "News", "ias", "upsc", "exam", "movies", "movie", "currentaffairs", "affair",
    "times", "Newspaper", "paper", "academy", "chess", "bytes", "MEGHUPDATES",
    "Insight SSB", "Insight", "Gurukul", "Premier League", "Geopolitics", "politics",
    "Update", "Updates", "tech", "noel", "Pravda", "course", "helper", "University",
    "success", "football", "sports", "Mechanical", "PapersWIKI", "Papers", "soccer",
    "memes", "Editorial", "Bulletin", "Coverage", "Story", "Newsletter", "Headline",
    "notes", "Media", "latest", "Ngo", "journalist", "reporter", "live", "Lovers",
    "Literature", "facts", "telugu", "RAJA_Loot_Deals", "southfronteng", "bgmi",
    "game", "deals", "gamer", "Bazaar", "Coupons", "Editor", "itarmyofukraine2022",
    "TV", "Study", "education"]]


def demote_noise(channels):
    def is_noise(c):
        low = c["name"].lower()
        return any(sub in low for sub in NOISE)
    return [c for c in channels if not is_noise(c)] + [c for c in channels if is_noise(c)]


def search(search_query, include_keywords=None, exclude_keywords=None):
    """The whole job. Returns (payload, stats)."""
    started = time.time()
    deadline = started + SEARCH_BUDGET_S   # shared with the fallback below
    if include_keywords or exclude_keywords:
        queries = [dork6(search_query, include_keywords, exclude_keywords)]
    else:
        queries = [DORKS[d](search_query) for d in sorted(DORKS)]

    channels, n_req, failures = collect(queries, deadline=deadline)
    fallback_used = False

    # Last-resort widening: dorks 1-5 are all narrow AND-queries, so a term with
    # no exact matches returns nothing at all. dork6 with no filters - the bare
    # quoted term - is the widest net the CSE allows. It fires ONLY on a zero
    # result, so it can never dilute a search that already worked; the worst
    # case is turning "nothing" into weak leads.
    # Measured: on 'Perambalur' (1 channel from dorks 1-5) the bare term found
    # 10, though they skewed to local news/jobs rather than threat intel; on a
    # genuinely empty term it returns nothing either. FALLBACK_ENABLED=0 disables.
    if (not channels and FALLBACK_ENABLED
            and not (include_keywords or exclude_keywords)):
        fb_query = dork6(search_query, FALLBACK_INCLUDE, FALLBACK_EXCLUDE)
        print(f"[decodo] no results from dorks 1-5; fallback -> {fb_query!r}")
        fb_channels, fb_req, fb_fail = collect([fb_query], deadline=deadline)
        n_req += fb_req
        failures += fb_fail
        if fb_channels:
            channels = fb_channels
            fallback_used = True

    channels = demote_noise(channels)
    elapsed = (time.time() - started) * 1000
    stats = {"requests": n_req, "failed": failures, "channels": len(channels),
             "with_description": sum(1 for c in channels if c["description"]),
             "fallback": fallback_used, "ms": round(elapsed)}
    print(f"[decodo] query={search_query!r} {stats}")
    return {"channel_names": [c["name"] for c in channels], "channels": channels}, stats


def _authorised(event):
    """A Function URL is public and every call spends Decodo credits, so gate it
    when SHARED_SECRET is set. Unset = open, matching the existing API Gateway."""
    secret = os.getenv("SHARED_SECRET", "")
    if not secret:
        return True
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    return headers.get("x-api-key") == secret


def lambda_handler(event, context):
    try:
        if not _authorised(event):
            return _resp(403, {"error": "forbidden"})
        body = event.get("body")
        if not body:
            return _resp(400, {"error": "search_query is required"})
        body_dict = json.loads(body) if isinstance(body, str) else body
        search_query = body_dict.get("search_query")
        if not search_query:
            return _resp(400, {"error": "search_query is required"})
        if not TOKEN:
            return _resp(500, {"error": "DECODO_TOKEN is not set"})

        payload, _ = search(search_query,
                            body_dict.get("include_keywords"),
                            body_dict.get("exclude_keywords"))
        return _resp(200, payload)
    except Exception as e:
        print(f"Error in Lambda function: {e}")
        return _resp(500, {"error": "Internal Server Error"})


def _resp(code, payload):
    return {
        "statusCode": code,
        "body": json.dumps(payload),
        "headers": {
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
        },
    }


if __name__ == "__main__":  # local end-to-end run, same path the Lambda takes
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--term", default="delhi")
    ap.add_argument("--include", nargs="*")
    ap.add_argument("--exclude", nargs="*")
    ap.add_argument("--json")
    a = ap.parse_args()
    ev = {"body": json.dumps({"search_query": a.term,
                              **({"include_keywords": a.include} if a.include else {}),
                              **({"exclude_keywords": a.exclude} if a.exclude else {})})}
    out = lambda_handler(ev, None)
    data = json.loads(out["body"])
    print(f"status {out['statusCode']}  channels {len(data.get('channels', []))}")
    for i, c in enumerate(data.get("channels", [])[:15], 1):
        print(f"{i:3d}. {c['name']}\n     {(c['description'] or '(none)')[:120]}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"-> {a.json}")
