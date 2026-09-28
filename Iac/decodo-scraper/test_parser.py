"""Self-check for lambda_function.py. Run: python test_parser.py

The parser is the risky part of this Lambda - it replaced a browser DOM walk
with a stdlib HTMLParser. The first version silently merged EVERY snippet on
the page into EVERY channel (void tags like <br> fire handle_starttag but never
handle_endtag, so the card never closed). These assertions fail if that or
anything like it comes back.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lambda_function as L

# Two cards, each with its own snippet, with void tags (<br>, <img>) inside -
# the exact shape that broke the first parser.
TWO_CARDS = """
<div class="gsc-webResult gsc-result">
  <div class="gsc-thumbnail-inside"><a class="gs-title" href="https://t.me/s/alpha">Alpha Chan</a></div>
  <img src="x.png"><br>
  <div class="gs-snippet">ALPHA snippet<br>with a break</div>
</div>
<div class="gsc-webResult gsc-result">
  <div class="gsc-thumbnail-inside"><a class="gs-title" href="https://tgstat.com/channel/@beta">Beta</a></div>
  <hr>
  <div class="gs-snippet">BETA snippet</div>
</div>
"""


def by_name(items):
    out = {}
    for it in items:
        n = L.channel_name_from_url(it["url"])
        if n and (n not in out or len(it["description"]) > len(out[n]["description"])):
            out[n] = it
    return out


def test_snippets_stay_with_their_own_card():
    got = by_name(L.parse(TWO_CARDS))
    assert set(got) == {"alpha", "beta"}, got
    assert "ALPHA" in got["alpha"]["description"], got["alpha"]
    assert "BETA" not in got["alpha"]["description"], "card bleed: beta's snippet leaked into alpha"
    assert "BETA" in got["beta"]["description"], got["beta"]
    assert "ALPHA" not in got["beta"]["description"], "card bleed: alpha's snippet leaked into beta"
    assert got["alpha"]["title"] == "Alpha Chan", got["alpha"]["title"]


def test_void_tags_do_not_break_card_boundaries():
    # a card ending in unclosed void tags must still close
    html = TWO_CARDS.replace("</div>\n</div>", "</div><br><img src=y></div>")
    got = by_name(L.parse(html))
    assert len(got) == 2, f"void tags broke card boundaries: {list(got)}"


def test_fallback_when_no_cards():
    """A markup change must degrade to names-without-descriptions, not nothing."""
    html = '<a href="https://t.me/s/gamma">g</a><a href="javascript:void(0)">x</a>'
    items = L.parse(html)
    got = by_name(items)
    assert set(got) == {"gamma"}, got
    assert got["gamma"]["description"] == "", "fallback should have no description"
    assert all("javascript:" not in i["url"] for i in items)


def test_channel_name_extraction():
    cases = {
        "https://tgstat.com/channel/@indohaxsec": "indohaxsec",
        "https://t.me/s/darkleaks": "darkleaks",
        "https://telegram.me/s/foo?x=1": "foo",
        "https://telemetr.io/en/channels/12345-mychan": "mychan",
        "https://example.com/nope": None,
    }
    for url, want in cases.items():
        assert L.channel_name_from_url(url) == want, (url, L.channel_name_from_url(url))


def test_cse_url_survives_ampersand():
    """The '&' in AT&T must be encoded; the fragment form let it truncate the
    query so Google silently searched '"AT' and returned confident junk."""
    u = L.cse_url(L.DORKS[2]("AT&T"), 1)
    assert "#" not in u, "fragment form: Decodo decodes it and truncates at '&'"
    assert "%26" in u, u
    assert "&q=" in u and "sort=date" in u, u
    # Paging is asserted in test_cse_url_pages_via_fragment. It used to be
    # checked here as endswith("&start=10") - which passed while ?start=
    # was in fact re-serving page 1.


def test_dorks_verbatim():
    """These strings are the product's IP - quirks included."""
    assert L.DORKS[3]("d").count("“") == 5, "dork3 curly quotes must survive"
    assert '"d"AND' in L.DORKS[4]("d"), "dork4's missing space is deliberate"
    assert L.DORKS[5]("delhi police") == '"delhi police"', "dork5 \\W branch: space -> bare term"
    assert "malware" in L.DORKS[5]("delhi"), "dork5 single word -> malware branch"
    assert L.dork6("q", ["a", "b"], ["c"]) == '"q" AND ("a" OR "b") -c'


def test_noise_is_demoted_not_dropped():
    chans = [{"name": "cyber_yodha", "description": ""},
             {"name": "DailyNews", "description": ""},
             {"name": "indohaxsec", "description": ""}]
    out = L.demote_noise(chans)
    assert len(out) == 3, "noise must be demoted, never removed"
    assert [c["name"] for c in out][-1] == "DailyNews", out


def test_dedupe_keeps_longest_description():
    items = [{"url": "https://t.me/s/a", "title": "T", "description": "short"},
             {"url": "https://t.me/s/a", "title": "T", "description": "a much longer one"}]
    got = by_name(items)
    assert got["a"]["description"] == "a much longer one", got


def test_collect_returns_by_the_deadline_with_what_rendered():
    """API Gateway drops /tg-decodo at 29s. On 2026-09-24 'india' found 71
    channels in 58s and the user got a 504 with none of them - one slow page
    held the whole response. Late pages must be abandoned, not waited for."""
    import time as _t
    CARD = ('<div class="gsc-webResult gsc-result">'
            '<a class="gs-title" href="https://t.me/s/fast">T</a>'
            '<div class="gs-snippet">s</div></div>')

    def fake_fetch(url, deadline=None):
        if "gsc.page=2" in url:
            _t.sleep(2)              # the straggler
        return CARD

    real, L.fetch = L.fetch, fake_fetch
    try:
        t0 = _t.time()
        chans, n_req, failures = L.collect(['q1'], deadline=_t.time() + 0.3)
        elapsed = _t.time() - t0
    finally:
        L.fetch = real

    assert elapsed < 1.0, f"waited past the deadline: {elapsed:.1f}s"
    assert (n_req, failures) == (2, 1), (n_req, failures)
    assert [c["name"] for c in chans] == ["fast"], "lost the page that did render"


def test_fetch_never_outlives_the_deadline():
    """Checking the deadline only BETWEEN tries is what let a retry started at
    15s run to 35s+: each Decodo call waited up to 120s on its own."""
    import time as _t
    timeouts = []

    def shell(req, timeout=None):
        timeouts.append(timeout)
        payload = json.dumps({"results": [{"content": SHELL}]})

        class R:
            def read(self_inner):
                return payload.encode()
            def __enter__(self_inner):
                return self_inner
            def __exit__(self_inner, *a):
                return False
        return R()

    real_open, real_sleep = L.urllib.request.urlopen, L.time.sleep
    L.urllib.request.urlopen, L.time.sleep = shell, (lambda *a: None)
    try:
        assert L.fetch("x", deadline=_t.time() + L.MIN_ATTEMPT_S / 2) is None
        assert timeouts == [], "started an attempt that could not finish in time"
        L.fetch("x", deadline=_t.time() + 10)
    finally:
        L.urllib.request.urlopen, L.time.sleep = real_open, real_sleep
    assert timeouts and max(timeouts) <= 10, f"a call may outlive the budget: {timeouts}"


def test_fallback_only_fires_on_zero_results():
    """dork6 (bare term) runs ONLY when dorks 1-5 found nothing, so it can never
    dilute a search that already worked."""
    CARD = ('<div class="gsc-webResult gsc-result">'
            '<a class="gs-title" href="https://t.me/s/real">T</a>'
            '<div class="gs-snippet">s</div></div>')
    seen = []

    def fake_collect(queries, deadline=None):
        seen.append(list(queries))
        # first call = dorks 1-5, return a hit -> fallback must NOT run
        return [{"name": "real", "title": "T", "description": "s", "url": "u"}], len(queries) * 2, 0

    real, L.collect = L.collect, fake_collect
    try:
        payload, stats = L.search("delhi")
    finally:
        L.collect = real
    assert len(seen) == 1, f"fallback fired despite results: {seen}"
    assert stats["fallback"] is False, stats
    assert len(seen[0]) == 5, "plain search must run all 5 dorks"


def test_fallback_uses_bare_term_when_nothing_found():
    calls = []

    def fake_collect(queries, deadline=None):
        calls.append(list(queries))
        if len(calls) == 1:
            return [], 10, 0                      # dorks 1-5 -> nothing
        return [{"name": "rescued", "title": "", "description": "d", "url": "u"}], 2, 0

    real, L.collect = L.collect, fake_collect
    try:
        payload, stats = L.search("obscure term")
    finally:
        L.collect = real

    assert len(calls) == 2, "fallback did not run on an empty result"
    assert calls[1] == ['"obscure term"'], f"fallback must be the bare term: {calls[1]}"
    assert payload["channel_names"] == ["rescued"], payload
    assert stats["fallback"] is True, stats
    assert stats["requests"] == 12, f"fallback requests not counted: {stats}"


def test_fallback_skipped_on_the_keyword_path():
    """The advanced path already IS dork6 - it must not fall back to itself."""
    calls = []

    def fake_collect(queries, deadline=None):
        calls.append(list(queries))
        return [], 2, 0

    real, L.collect = L.collect, fake_collect
    try:
        _, stats = L.search("q", ["database leak"], ["news"])
    finally:
        L.collect = real
    assert len(calls) == 1, f"fallback ran on the keyword path: {calls}"
    assert stats["fallback"] is False, stats


# --- cse_url: paging must actually page -------------------------------------
# Regression for the bug where ?start=10 silently re-served page 1, so PAGES=2
# fetched the same page twice and nothing past the first 20 cards was reachable.
def test_cse_url_pages_via_fragment():
    p1 = L.cse_url('"india" AND ("china")', 1)
    p2 = L.cse_url('"india" AND ("china")', 2)
    assert p1 != p2, "page 2 must not be the page 1 URL"
    assert "gsc.page=1" in p1 and "gsc.page=2" in p2
    assert "start=" not in p2, "?start= does not advance the CSE pager"


def test_cse_url_ampersand_keeps_querystring_form():
    # A '&' in the fragment is eaten by Decodo's decode (measured 0/9 channel
    # overlap), so these stay on the query-string form: correct, page 1 only.
    u = L.cse_url('"AT&T" AND ("leak")', 2)
    assert "#" not in u, "an '&' term must not use the fragment form"
    assert "q=%22AT%26T%22" in u


def test_collect_dedupes_identical_page_urls():
    # An '&' term yields the same URL for every page; fetching it twice would
    # bill Decodo twice and report a phantom failure.
    seen, pages, fetch = [], L.PAGES, L.fetch
    L.PAGES, L.fetch = 3, lambda u, **kw: (seen.append(u), "")[1]
    try:
        L.collect(['"AT&T"'])
    finally:
        L.PAGES, L.fetch = pages, fetch
    assert len(seen) == 1, f"fetched duplicates: {seen}"


# --- Decodo's un-rendered shell --------------------------------------------
# Decodo intermittently returns the CSE page with its JavaScript never
# executed: ~2.3KB of shell instead of ~92KB of results, HTTP 200, billed as a
# success. fetch() used to accept it, the parser found nothing, and the search
# came back empty. Normal search hid it behind 10 requests; an advanced search
# makes 2 and mostly returned nothing at all.
# Captured verbatim from Decodo. Note it contains the literal string
# "gsc-webResult" inside a class-name list - matching on that substring
# is what made the first version of _rendered() accept every shell.
SHELL = '<!DOCTYPE html><html lang="en"><head><meta content="text/html; charset=UTF-8" http-equiv="content-type"><meta content="noindex" name="robots"><link href="https://www.google.com/favicon.ico" rel="icon" type="image/x-icon"><link href="https://fonts.googleapis.com/css?family=Product+Sans" rel="stylesheet" nonce=""><title>Programmable Search Engine</title><script type="text/javascript" async="" src="/cse.js?sca_esv=4f1d8192d28e47ff&amp;hpg=1&amp;cx=006368593537057042503:efxu7xprihg"></script><script nonce="">(function(){var relativeUrl=\'/cse.js?sca_esv\\x3d4f1d8192d28e47ff\\x26hpg\\x3d1\\x26cx\\x3d006368593537057042503:efxu7xprihg\';(function(){var gcse = document.createElement(\'script\');gcse.type = \'text/javascript\';gcse.async = true;gcse.src = relativeUrl;var s = document.getElementsByTagName(\'script\')[0];s.parentNode.insertBefore(gcse,s);})();})();</script><style>body{background-color:#FFFFFF;color:#4D5156;font-family:arial,sans-serif}.gsc-results .gsc-cursor-box{text-align:center}#cse-header{display:-ms-flexbox;display:flex;-ms-flex-align:end;align-items:flex-end;margin:16px 0 -16px 0}#cse-footer{clear:both;font-size:82%;text-align:center;padding:16px}#DZPTFe{display:none}</style></head><body><noscript><h3>Programmable Search Engine requires JavaScript</h3><p>JavaScript is either disabled or not supported by your browser. To use Programmable Search Engine, enable JavaScript by changing your browser options and reloading this page.</p></noscript><div id="cse-hosted"><div id="cse-header"><a href="https://cse.google.com/cse?&amp;cx=006368593537057042503:efxu7xprihg" id="cse-logo-target"><img height="28" src="https://te.legra.ph/file/52179ee00f0feeb06973a.png" id="cse-logo" alt="Logo"></a><div class="gcse-searchbox" id="cse-search-form"></div></div><div id="cse-body"><div id="cse"><div data-adclient="hosted-page-client" data-personalizedads="false" data-queryparametername="q" class="gcse-searchresults"> </div><div class="gsc-adBlock gsc-branding gsc-clear-button gsc-control-cse gsc-cursor-box gsc-imageResult-classic gsc-imageResult-column gsc-result gsc-results gsc-webResult gs-promotion gs-title gs-visibleUrl-long gs-visibleUrl-short gs-webResult hidden" id="DZPTFe"></div></div></div><div id="cse-footer">©&nbsp;2026&nbsp;Google</div></div></body></html>'


def test_shell_is_not_treated_as_rendered():
    assert "gsc-webResult" in SHELL, "fixture must keep the trap that broke this"
    assert not L._rendered(SHELL)
    assert not L._rendered("")
    assert not L._rendered(None)


def test_real_result_page_is_rendered():
    assert L._rendered("x" * L.RENDERED_MIN_BYTES)
    # a rendered page that found nothing is still rendered - do not retry it
    assert L._rendered("<html>" + "y" * L.RENDERED_MIN_BYTES + "</html>")


def test_fetch_retries_past_the_shell():
    """The whole point: keep going until a page actually rendered."""
    good = '<div class="gsc-webResult gsc-result"><a class="gs-title" href="https://t.me/s/a">T</a></div>'
    seq = [SHELL, SHELL, good]
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        i = calls["n"]
        calls["n"] += 1
        payload = json.dumps({"results": [{"content": seq[min(i, len(seq) - 1)]}]})

        class R:
            def read(self_inner):
                return payload.encode()
            def __enter__(self_inner):
                return self_inner
            def __exit__(self_inner, *a):
                return False
        return R()

    real_open, real_sleep = L.urllib.request.urlopen, L.time.sleep
    L.urllib.request.urlopen = fake_urlopen
    L.time.sleep = lambda *a: None
    try:
        html = L.fetch("http://example/x")
    finally:
        L.urllib.request.urlopen = real_open
        L.time.sleep = real_sleep
    assert html == good, html
    assert calls["n"] == 3, calls["n"]


def test_fetch_gives_up_and_returns_none():
    def always_shell(req, timeout=None):
        payload = json.dumps({"results": [{"content": SHELL}]})

        class R:
            def read(self_inner):
                return payload.encode()
            def __enter__(self_inner):
                return self_inner
            def __exit__(self_inner, *a):
                return False
        return R()

    real_open, real_sleep = L.urllib.request.urlopen, L.time.sleep
    L.urllib.request.urlopen = always_shell
    L.time.sleep = lambda *a: None
    try:
        assert L.fetch("http://example/x") is None
    finally:
        L.urllib.request.urlopen = real_open
        L.time.sleep = real_sleep


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
