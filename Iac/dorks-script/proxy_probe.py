"""How many CSE requests does one IP survive before Google CAPTCHAs it?

Fires the same dork query at Google CSE repeatedly, rotating across a pool of
proxies, and records per run: CAPTCHA or not, channels returned, latency, bytes.
Two numbers come out that decide the whole architecture:

  1. requests-per-IP before the first CAPTCHA  -> how many IPs you need
  2. KB per page load                          -> what a metered proxy costs

  # control: no proxy, your own IP (keep --runs low, it WILL burn your address)
  python proxy_probe.py --runs 6 --label direct

  # through a pool, one line per proxy: ip:port:user:pass  (or a full URL)
  python proxy_probe.py --proxies /path/to/proxies.txt --runs 30

Touches nothing in AWS.

ponytail: relaunches the browser per run because pyppeteer pins --proxy-server at
launch and has no per-context proxy. Costs ~2s a run; fine for a probe, and it
also stops cache reuse from flattering the bandwidth number.
"""
import argparse, asyncio, collections, statistics, sys, time
from urllib.parse import urlparse

from cse_harness import DORKS, cse_url, dedupe, EXTRACT_RESULTS_JS

# Text Google serves instead of results when it wants a human.
CAPTCHA_MARKERS = (
    "unusual traffic", "not a robot", "recaptcha", "/sorry/",
    "systems have detected", "captcha",
)


def parse_proxy(line):
    """Accepts 'ip:port:user:pass' (Webshare export) or a full proxy URL."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if "://" in line:
        u = urlparse(line)
        return {"host": u.hostname, "port": u.port, "user": u.username, "pass": u.password}
    parts = line.split(":")
    if len(parts) == 4:
        return {"host": parts[0], "port": int(parts[1]), "user": parts[2], "pass": parts[3]}
    if len(parts) == 2:
        return {"host": parts[0], "port": int(parts[1]), "user": None, "pass": None}
    raise ValueError(f"unparseable proxy line: {line!r}")


async def one_run(chrome, proxy, query, page_num=1, block_images=False):
    """Fresh browser -> one CSE page load. Returns (captcha?, channels, ms, bytes)."""
    from pyppeteer import launch
    args = ["--no-sandbox", "--disable-setuid-sandbox"]
    if proxy:
        args.append(f"--proxy-server=http://{proxy['host']}:{proxy['port']}")

    browser = await launch(executablePath=chrome, args=args)
    page = await browser.newPage()
    seen = {"bytes": 0}

    async def on_response(resp):
        try:
            cl = resp.headers.get("content-length")
            if cl:
                seen["bytes"] += int(cl)
        except Exception:
            pass  # ponytail: bandwidth is an estimate, never fail the probe over it

    page.on("response", lambda r: asyncio.ensure_future(on_response(r)))

    t0 = time.perf_counter()
    captcha, channels = False, []
    try:
        if proxy and proxy["user"]:
            await page.authenticate({"username": proxy["user"], "password": proxy["pass"]})
        if block_images:
            await page.setRequestInterception(True)

            async def route(req):
                if req.resourceType in ("image", "media", "font"):
                    await req.abort()
                else:
                    await req.continue_()

            page.on("request", lambda r: asyncio.ensure_future(route(r)))

        await page.goto(cse_url(query, page_num), {"waitUntil": "networkidle2", "timeout": 60000})
        await asyncio.sleep(2)
        body = (await page.content()).lower()
        # ponytail: marker text alone missed every block in the first run - a
        # CAPTCHA page still renders one .gsc-webResult shell. Card count is the
        # reliable signal (blocked ~1 card, real results ~20+); markers confirm.
        cards = await page.evaluate("() => document.querySelectorAll('.gsc-webResult.gsc-result').length")
        captcha = any(m in body for m in CAPTCHA_MARKERS) or cards < 2
        if not captcha:
            channels = dedupe(await page.evaluate(EXTRACT_RESULTS_JS))
    except Exception as e:
        print(f"    run failed: {type(e).__name__}: {e}", file=sys.stderr)
        captcha = None  # distinguish "error" from "CAPTCHA"
    finally:
        ms = (time.perf_counter() - t0) * 1000
        try:
            await browser.close()
        except Exception:
            pass
    return captcha, channels, ms, seen["bytes"]


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proxies", help="file, one 'ip:port:user:pass' or proxy URL per line")
    ap.add_argument("--runs", type=int, default=30)
    ap.add_argument("--dork", type=int, default=2)
    ap.add_argument("--term", default="delhi")
    ap.add_argument("--label", default="")
    ap.add_argument("--chrome", default=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    ap.add_argument("--no-images", action="store_true", help="block images/media: cuts metered proxy bandwidth")
    args = ap.parse_args()

    pool = [None]
    if args.proxies:
        with open(args.proxies, encoding="utf-8") as f:
            pool = [p for p in (parse_proxy(l) for l in f) if p]
        if not pool:
            sys.exit("no usable proxies in file")
    else:
        print("!! No --proxies: DIRECT control run from your own IP.")
        print("!! Keep --runs low. Enough runs will CAPTCHA your own address.\n")

    query = DORKS[args.dork](args.term)
    label = args.label or (f"pool of {len(pool)}" if args.proxies else "direct")
    print(f"[{label}] dork{args.dork} x{args.runs} runs  q={query}\n")

    stats = collections.defaultdict(lambda: {"n": 0, "cap": 0, "first_cap": None, "err": 0})
    counts, lats, byts = [], [], []

    for i in range(1, args.runs + 1):
        proxy = pool[(i - 1) % len(pool)]
        key = f"{proxy['host']}:{proxy['port']}" if proxy else "direct"
        cap, chans, ms, b = await one_run(args.chrome, proxy, query, block_images=args.no_images)

        st = stats[key]
        st["n"] += 1
        if cap is None:
            st["err"] += 1
            flag = "ERROR"
        elif cap:
            st["cap"] += 1
            if st["first_cap"] is None:
                st["first_cap"] = st["n"]
            flag = "CAPTCHA"
        else:
            counts.append(len(chans))
            flag = f"{len(chans):3d} channels"
        lats.append(ms)
        byts.append(b)
        print(f"  run {i:3d}/{args.runs}  {key:22s} {flag:13s} {ms:6.0f}ms {b/1024:6.0f} KB")

    print(f"\n{'=' * 72}\n[{label}] {args.runs} runs over {len(pool)} IP(s)")
    print(f"\n  {'IP':24s} {'runs':>5s} {'captcha':>8s} {'err':>4s}  first CAPTCHA at request #")
    for key, st in stats.items():
        fc = st["first_cap"] if st["first_cap"] else "-  (never)"
        print(f"  {key:24s} {st['n']:5d} {st['cap']:8d} {st['err']:4d}  {fc}")

    tot_cap = sum(s["cap"] for s in stats.values())
    tot_err = sum(s["err"] for s in stats.values())
    print(f"\n  CAPTCHA rate: {tot_cap}/{args.runs} ({100*tot_cap/args.runs:.0f}%)   errors: {tot_err}")
    if counts:
        print(f"  channels:     median {statistics.median(counts):.0f}  min {min(counts)}  max {max(counts)}")
    print(f"  latency:      median {statistics.median(lats):.0f}ms")

    mb = sum(byts) / 1024 / 1024
    per_page_kb = mb / args.runs * 1024
    monthly_gb = (mb / args.runs) * 1272 / 1024  # 1,272 page loads/mo, measured from live Lambda invocations
    print(f"  bandwidth:    {per_page_kb:.0f} KB/page  ->  {monthly_gb:.2f} GB/month at your real volume")
    print(f"                ~${monthly_gb*3:.2f}-${monthly_gb*8:.2f}/month on metered residential ($3-8/GB)")

    firsts = [s["first_cap"] for s in stats.values() if s["first_cap"]]
    print()
    if not tot_cap:
        print(f"  VERDICT: no CAPTCHAs in {args.runs} runs. {len(pool)} IP(s) may be enough for")
        print(f"           your 12-requests-per-search load. Push --runs higher to find the ceiling.")
    else:
        print(f"  VERDICT: IPs burn after ~{min(firsts)}-{max(firsts)} requests each.")
        print(f"           One search = 12 requests, so you need >= {12//max(1,min(firsts))+1} fresh IPs per search.")


if __name__ == "__main__":
    asyncio.run(main())
