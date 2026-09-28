"""Self-check for the advanced-keyword message search. Run:

    python test_keyword_filter.py

Two things here are easy to break and expensive to get wrong.

1. The dorks 1-5 path. Every normal (non-advanced) search sends no keywords at
   all, and must behave exactly as it did before keywords existed: one Telegram
   search on the query, 5 messages, no filtering.

2. The priority order. Messages rank by how many of the requested terms they
   carry - query + kw1 + kw2, then query + kw1, then query + kw2, then the
   singles - with field order breaking ties so the first keyword outranks the
   second. Excludes remove outright. The requirement was read four different
   ways (strict AND, plain union, three tiers, match count); the tests below
   pin the one that shipped.

boto3 and telethon are stubbed, so this needs no AWS and no Telegram.
"""
import os
import sys
import types
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# --- stub the heavy imports before loading the handler ----------------------
_boto3 = types.ModuleType("boto3")
_boto3.resource = lambda *a, **k: types.SimpleNamespace(Table=lambda n: None)
sys.modules["boto3"] = _boto3
sys.modules["botocore"] = types.ModuleType("botocore")
_exc = types.ModuleType("botocore.exceptions")
_exc.ClientError = type("ClientError", (Exception,), {})
sys.modules["botocore.exceptions"] = _exc
for _name, _attrs in [
    ("telethon", {}),
    ("telethon.sync", {"TelegramClient": object}),
    ("telethon.sessions", {"StringSession": object}),
    ("telethon.errors", {"ChannelInvalidError": type("A", (Exception,), {}),
                         "ChannelPrivateError": type("B", (Exception,), {}),
                         "FloodWaitError": type("C", (Exception,), {})}),
    ("telethon.tl", {}),
    ("telethon.tl.functions", {}),
    ("telethon.tl.functions.channels", {"JoinChannelRequest": object}),
    ("telethon.tl.types", {"InputPeerUser": object}),
]:
    _m = types.ModuleType(_name)
    for _k, _v in _attrs.items():
        setattr(_m, _k, _v)
    sys.modules[_name] = _m

import lambda_function as L  # noqa: E402


class FakeClient:
    """Serves canned messages per search term.

    `by_term` maps a search string to what Telegram would return for it. That
    mapping is the crux of the original bug: the query and the keyword match
    DIFFERENT messages, so an AND across them came back almost empty. Pass a
    list instead of a dict to serve the same texts for any term.
    """

    def __init__(self, by_term):
        if isinstance(by_term, list):
            by_term = {None: by_term}
        self.by_term = by_term
        self.limits = []
        self.terms = []

    def iter_messages(self, channel_name, limit=None, search=None):
        self.limits.append(limit)
        self.terms.append(search)
        texts = self.by_term.get(search, self.by_term.get(None, []))
        for i, text in enumerate(texts[:limit]):
            # id derives from the text: Telegram returns the same message_id
            # however the message was surfaced, which is what makes
            # dedupe-by-id correct when several term searches overlap.
            yield types.SimpleNamespace(
                id=hash(text) & 0xFFFF,
                text=text,
                date=datetime(2026, 1, 1 + (i % 27), tzinfo=timezone.utc),
                sender_id=1,
            )


TEXTS = [
    "free apk download here",       # query only
    "SBI yono apk bypass",          # both
    "sbi netbanking mirror",        # keyword only
    "apk mod game news roundup",    # query only, and hits an exclude
    "SBI CSP apk v1.0.17",          # both
]

APK_ONLY = ["apk build %d" % i for i in range(4)]
SBI_ONLY = ["Yono SBI zygisk patch %d" % i for i in range(3)]
BOTH = ["fake SBI apk v2 mirror", "sbi yono apk bypass"]
MIXED = {"apk": APK_ONLY + BOTH, "SBI": SBI_ONLY + BOTH}
DISJOINT = {"apk": APK_ONLY, "SBI": SBI_ONLY}


def _prios_of(out):
    """The priority the Lambda stamped on each message."""
    return [m["priority"] for m in out]


def _matched_of(out, base="apk", include=("SBI",)):
    low = [m["text"].lower() for m in out]
    terms = [base] + list(include)
    return [sum(1 for t in terms if t.lower() in text) for text in low]


# --- the dorks 1-5 guarantee ------------------------------------------------
def test_no_keywords_is_unchanged():
    c = FakeClient(TEXTS)
    out, stats = L.fetch_messages_from_channel(c, "chan", "apk", limit=5)
    assert c.terms == ["apk"], c.terms
    assert c.limits == [5], f"scan limit changed for the no-keyword path: {c.limits}"
    assert [m["text"] for m in out] == TEXTS
    assert stats["filtered"] is False


def test_no_keywords_never_scans_wider():
    c = FakeClient({None: ["apk %d" % i for i in range(60)]})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=5)
    assert c.limits == [5], c.limits
    assert len(out) == 5, len(out)


def test_blank_keywords_are_ignored():
    """Empty advance-panel fields arrive as [""] and must not filter."""
    c = FakeClient(TEXTS)
    out, stats = L.fetch_messages_from_channel(c, "chan", "apk", limit=5,
                                               include_keywords=["", "  "],
                                               exclude_keywords=[])
    assert len(out) == 5, out
    assert stats["filtered"] is False


# --- priority ranking -----------------------------------------------------------
def test_both_terms_rank_above_individual_matches():
    out, stats = L.fetch_messages_from_channel(FakeClient(MIXED), "chan", "apk",
                                               limit=20, include_keywords=["SBI"])
    prios = _prios_of(out)
    assert prios == sorted(prios), prios
    assert _matched_of(out)[:2] == [2, 2], _matched_of(out)
    assert set(m["text"] for m in out[:2]) == set(BOTH), out[:2]
    assert stats["both_terms"] == 2, stats


def test_all_three_groups_are_present():
    out, stats = L.fetch_messages_from_channel(FakeClient(MIXED), "chan", "apk",
                                               limit=20, include_keywords=["SBI"])
    assert set(_matched_of(out)) == {1, 2}, _matched_of(out)
    assert stats["both_terms"] == 2, stats
    # 2 messages carry both terms, the other 7 carry exactly one
    assert stats["all_terms"] == 2, stats
    assert stats["terms"] == 2, stats


def test_no_both_terms_still_shows_the_individual_matches():
    """The strict-AND build returned nothing at all here."""
    out, stats = L.fetch_messages_from_channel(FakeClient(DISJOINT), "chan", "apk",
                                               limit=20, include_keywords=["SBI"])
    assert len(out) == 7, out
    assert stats["both_terms"] == 0, stats
    assert set(_matched_of(out)) == {1}, _matched_of(out)


def test_never_returns_less_than_a_keyword_free_search():
    plain, _ = L.fetch_messages_from_channel(FakeClient(DISJOINT), "chan", "apk",
                                             limit=20)
    ranked, _ = L.fetch_messages_from_channel(FakeClient(DISJOINT), "chan", "apk",
                                              limit=20, include_keywords=["SBI"])
    assert len(ranked) >= len(plain), (len(ranked), len(plain))


def test_newest_first_inside_a_rank_group():
    c = FakeClient({"apk": ["apk one", "apk two", "apk three"]})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                           include_keywords=["SBI"])
    dates = [m["date"] for m in out]
    assert dates == sorted(dates, reverse=True), dates


def test_include_ranks_but_does_not_remove():
    c = FakeClient(TEXTS)
    out, stats = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                               include_keywords=["SBI"])
    assert c.limits[0] == L.SCAN_LIMIT, c.limits
    assert set(m["text"] for m in out[:2]) == {TEXTS[1], TEXTS[4]}, out[:2]
    assert len(out) == len(TEXTS), out      # nothing dropped
    assert stats["both_terms"] == 2, stats


def test_multiple_includes_are_or_not_and():
    """dork6 is base AND (inc1 OR inc2), so either keyword qualifies."""
    c = FakeClient({"apk": ["apk with SBI", "apk with HDFC", "apk with neither"]})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                           include_keywords=["SBI", "HDFC"])
    assert set(m["text"] for m in out[:2]) == {"apk with SBI", "apk with HDFC"}, out


def test_unmatched_keyword_falls_back_to_the_query_results():
    c = FakeClient(TEXTS)
    out, stats = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                               include_keywords=["nonexistentbank"])
    assert len(out) == len(TEXTS), out
    assert stats["both_terms"] == 0, stats
    assert stats["returned"] == len(TEXTS), stats


# --- excludes ---------------------------------------------------------------
def test_exclude_demotes_instead_of_removing():
    """dork6 exception: the excluded message stays, ranked below the clean ones,
    so the "all terms but carries an excluded word" group is reachable."""
    c = FakeClient(TEXTS)
    out, stats = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                               exclude_keywords=["news"])
    texts = [m["text"] for m in out]
    assert TEXTS[3] in texts, texts          # "apk mod game news roundup"
    excluded = next(m for m in out if m["text"] == TEXTS[3])
    # Only within the same match band does "clean" win: `missing` outranks the
    # exclude penalty, so a clean message matching fewer terms still sorts
    # below an excluded message that matched them all.
    band = excluded["priority"] // 100
    same_band_clean = [m for m in out
                       if m["priority"] // 100 == band and "news" not in m["text"]]
    assert same_band_clean, _prios_of(out)
    assert all(m["priority"] < excluded["priority"] for m in same_band_clean), _prios_of(out)
    assert _prios_of(out) == sorted(_prios_of(out)), _prios_of(out)
    assert stats["demoted_by_exclude"] == 1, stats


def test_excluded_all_terms_message_sorts_below_the_clean_one():
    c = FakeClient({"apk": ["SBI apk news bulletin", "SBI apk clean"]})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                           include_keywords=["SBI"],
                                           exclude_keywords=["news"])
    assert [m["text"] for m in out] == ["SBI apk clean", "SBI apk news bulletin"], out


def test_include_and_exclude_together():
    c = FakeClient(TEXTS + ["SBI apk news bulletin"])
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                           include_keywords=["SBI"],
                                           exclude_keywords=["news"])
    texts = [m["text"] for m in out]
    # the two clean both-terms messages lead
    assert set(texts[:2]) == {TEXTS[1], TEXTS[4]}, texts
    # the excluded both-terms message is present but below them
    assert texts.index("SBI apk news bulletin") > 1, texts
    assert _prios_of(out) == sorted(_prios_of(out)), _prios_of(out)


# --- request cost and caps --------------------------------------------------
def test_searches_every_term_for_recall():
    """Searching only the query would scan apk-messages alone and miss a
    both-terms message Telegram surfaces under the keyword instead."""
    c = FakeClient({"apk": APK_ONLY, "SBI": BOTH})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=20,
                                           include_keywords=["SBI"])
    assert c.terms == ["apk", "SBI"], c.terms
    assert set(BOTH) <= set(m["text"] for m in out), out


def test_term_searches_are_capped():
    c = FakeClient({None: ["x apk"]})
    L.fetch_messages_from_channel(c, "chan", "apk", limit=5,
                                  include_keywords=["a", "b", "c", "d", "e", "f"])
    assert len(c.terms) == L.MAX_TERM_SEARCHES, c.terms


def test_dedupes_a_message_found_under_two_terms():
    both = "apk with SBI inside"
    c = FakeClient({"apk": [both], "SBI": [both]})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=5,
                                           include_keywords=["SBI"])
    assert len(out) == 1, out


def test_limit_scales_with_include_keywords():
    texts = {"apk": ["SBI apk hit %d" % i for i in range(40)]}
    one, _ = L.fetch_messages_from_channel(FakeClient(texts), "chan", "apk",
                                           limit=5, include_keywords=["SBI"])
    two, _ = L.fetch_messages_from_channel(FakeClient(texts), "chan", "apk",
                                           limit=5, include_keywords=["SBI", "hit"])
    assert len(one) == 10, len(one)     # base 5 + 5 per keyword
    assert len(two) == 15, len(two)


def test_limit_is_capped():
    texts = {"apk": ["SBI apk hit %d" % i for i in range(60)]}
    many, _ = L.fetch_messages_from_channel(FakeClient(texts), "chan", "apk",
                                            limit=5, include_keywords=["SBI"] * 19)
    assert len(many) == L.MAX_LIMIT, len(many)


def test_scaling_does_not_touch_the_no_keyword_path():
    out, stats = L.fetch_messages_from_channel(
        FakeClient({None: ["m %d" % i for i in range(30)]}), "chan", "apk", limit=5)
    assert len(out) == L.BASE_LIMIT, len(out)
    assert stats["filtered"] is False


def test_stops_at_limit_not_scan_limit():
    c = FakeClient({"apk": ["SBI apk hit %d" % i for i in range(50)]})
    out, _ = L.fetch_messages_from_channel(c, "chan", "apk", limit=5,
                                           include_keywords=["SBI"])
    assert len(out) == L._effective_limit(["SBI"]), len(out)
    assert len(out) < 50


def test_priority_is_emitted_for_the_client():
    """The client merges ~10 channels and sorts the whole set by this."""
    out, _ = L.fetch_messages_from_channel(FakeClient(MIXED), "chan", "apk",
                                           limit=20, include_keywords=["SBI"])
    assert all(isinstance(m["priority"], int) for m in out), out[0]
    assert all("_rank" not in m for m in out), out[0]


def test_no_priority_on_the_keyword_free_path():
    out, _ = L.fetch_messages_from_channel(FakeClient(TEXTS), "chan", "apk", limit=5)
    assert all("priority" not in m for m in out), out[0]


def test_stats_explain_a_truly_empty_channel():
    """Only a channel with nothing for any term comes back blank, and the stats
    say so instead of looking like a failed request."""
    out, stats = L.fetch_messages_from_channel(
        FakeClient({}), "chan", "apk", limit=5, include_keywords=["SBI"])
    assert out == []
    assert stats["returned"] == 0 and stats["both_terms"] == 0, stats
    assert stats["filtered"] is True


# --- session rotation -------------------------------------------------------
def test_rotation_candidates_are_distinct():
    """A retry must never land on the session that just failed."""
    for _ in range(200):
        got = L._session_candidates("search")
        assert len(got) == len(set(got)), got
        assert len(got) == min(L.SESSION_ATTEMPTS, len(L.SEARCH_SESSION_IDS))
        assert set(got) <= set(L.SEARCH_SESSION_IDS), got


def test_rotation_uses_whole_pool():
    """The old os.environ cursor reset to index 0 on every cold start, so the
    tail of the pool was almost never reached."""
    seen = {sid for _ in range(400) for sid in L._session_candidates("search")}
    assert seen == set(L.SEARCH_SESSION_IDS), sorted(seen)
    seen_u = {sid for _ in range(400) for sid in L._session_candidates("user")}
    assert seen_u == set(L.USER_SESSION_IDS), sorted(seen_u)


def test_rotation_is_roughly_even():
    """Measured 7:1 skew onto session "3" before this changed."""
    c = Counter(L._session_candidates("search")[0] for _ in range(12000))
    lo, hi = min(c.values()), max(c.values())
    assert hi / lo < 1.5, f"skew {hi / lo:.2f}: {dict(c)}"


# --- the stated priority order ---------------------------------------------
def test_priority_order_with_two_keywords():
    """query+kw1+kw2, then query+kw1, then query+kw2, then the singles.

    Field order carries the priority: the frontend concatenates Include Keyword
    before Include Second Keyword, so include_keywords[0] is kw1.
    """
    texts = {
        "apk": ["apk SBI HDFC all", "apk SBI two", "apk HDFC two", "apk lone"],
        "SBI": ["SBI lone"],
        "HDFC": ["HDFC lone"],
    }
    out, stats = L.fetch_messages_from_channel(
        FakeClient(texts), "chan", "apk", limit=20,
        include_keywords=["SBI", "HDFC"])
    order = [m["text"] for m in out]
    assert order[0] == "apk SBI HDFC all", order
    assert order[1] == "apk SBI two", order
    assert order[2] == "apk HDFC two", order
    assert set(order[3:]) == {"apk lone", "SBI lone", "HDFC lone"}, order
    assert stats["all_terms"] == 1, stats
    assert stats["both_terms"] == 3, stats
    assert stats["terms"] == 3, stats


def test_first_keyword_outranks_the_second():
    texts = {"apk": ["apk HDFC second", "apk SBI first"]}
    out, _ = L.fetch_messages_from_channel(
        FakeClient(texts), "chan", "apk", limit=20,
        include_keywords=["SBI", "HDFC"])
    assert [m["text"] for m in out] == ["apk SBI first", "apk HDFC second"], out


def test_query_plus_keyword_outranks_two_keywords_without_the_query():
    texts = {"apk": ["apk SBI hit"], "SBI": ["SBI HDFC no query"]}
    out, _ = L.fetch_messages_from_channel(
        FakeClient(texts), "chan", "apk", limit=20,
        include_keywords=["SBI", "HDFC"])
    assert [m["text"] for m in out] == ["apk SBI hit", "SBI HDFC no query"], out


# --- the dork6 exception: excludes demote, they do not delete ---------------
def test_excluded_all_terms_message_ranks_second_not_dropped():
    """Requested order: clean all-terms first, then all-terms carrying an
    excluded word, then the partial matches."""
    texts = {"apk": ["apk SBI clean hit", "apk SBI news hit", "apk lone"]}
    out, stats = L.fetch_messages_from_channel(
        FakeClient(texts), "chan", "apk", limit=20,
        include_keywords=["SBI"], exclude_keywords=["news"])
    order = [m["text"] for m in out]
    assert order == ["apk SBI clean hit", "apk SBI news hit", "apk lone"], order
    assert stats["all_terms_clean"] == 1, stats
    assert stats["demoted_by_exclude"] == 1, stats


def test_exclude_mode_remove_restores_the_hard_filter():
    texts = {"apk": ["apk SBI clean hit", "apk SBI news hit"]}
    saved = L.EXCLUDE_MODE
    L.EXCLUDE_MODE = "remove"
    try:
        out, _ = L.fetch_messages_from_channel(
            FakeClient(texts), "chan", "apk", limit=20,
            include_keywords=["SBI"], exclude_keywords=["news"])
    finally:
        L.EXCLUDE_MODE = saved
    assert [m["text"] for m in out] == ["apk SBI clean hit"], out


def test_full_requested_priority_order():
    texts = {
        "apk": ["apk SBI yono all", "apk SBI yono news all", "apk SBI two",
                "apk yono two", "apk lone"],
        "SBI": ["SBI yono noquery", "SBI lone"],
    }
    out, _ = L.fetch_messages_from_channel(
        FakeClient(texts), "chan", "apk", limit=20,
        include_keywords=["SBI", "yono"], exclude_keywords=["news"])
    order = [m["text"] for m in out]
    assert order[0] == "apk SBI yono all", order
    assert order[1] == "apk SBI yono news all", order
    assert order[2] == "apk SBI two", order
    assert order[3] == "apk yono two", order
    assert order.index("SBI yono noquery") > order.index("apk yono two"), order
    assert _prios_of(out) == sorted(_prios_of(out)), _prios_of(out)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
