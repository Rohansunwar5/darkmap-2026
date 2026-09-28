"""Self-check for the channel extraction + merge logic. Run: python test_channels.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main2 import channel_name_from_url, cse_url

# --- URL -> channel name ---------------------------------------------------
assert channel_name_from_url("https://tgstat.com/channel/@leakbase") == "leakbase"
assert channel_name_from_url("https://tgstat.com/en/channel/@leakbase") == "leakbase"
assert channel_name_from_url("https://tgstat.com/channel/@leakbase?p=2") == "leakbase", "query string must not leak into the name"
assert channel_name_from_url("https://t.me/s/darkleaks") == "darkleaks"
assert channel_name_from_url("https://telegram.me/s/darkleaks") == "darkleaks"
assert channel_name_from_url("https://t.me/s/darkleaks/1420") == "darkleaks"
assert channel_name_from_url("https://telemetr.io/en/channels/1234567-breachforum") == "breachforum"
assert channel_name_from_url("https://google.com/search?q=x") is None
assert channel_name_from_url("https://t.me/darkleaks") is None, "non-/s/ telegram links are not channel previews"

# --- query must survive into the CSE fragment intact ------------------------
# Unencoded, "&" truncated the fragment and CSE searched for '"AT' instead.
u = cse_url('"AT&T" AND ("database leak" OR "data breach")', 1)
frag = u.split("#", 1)[1]
assert frag.count("&gsc.") == 3, f"query leaked extra fragment params: {frag}"  # q, sort, page
assert "%26" in u, "ampersand must be percent-encoded"
assert "gsc.sort=date" in u and "gsc.page=1" in u
from urllib.parse import unquote
q = [kv for kv in frag.split("&") if kv.startswith("gsc.q=")][0][len("gsc.q="):]
assert unquote(q) == '"AT&T" AND ("database leak" OR "data breach")', unquote(q)

# --- dedupe keeps the richest description ----------------------------------
def dedupe(scraped):
    """Mirror of the loop in retrieve_channels()."""
    channels = {}
    for item in scraped:
        name = channel_name_from_url(item["url"])
        if not name:
            continue
        existing = channels.get(name)
        if existing is None or len(item["description"]) > len(existing["description"]):
            channels[name] = {"name": name, "title": item["title"],
                              "description": item["description"], "url": item["url"]}
    return list(channels.values())

scraped = [
    {"url": "https://t.me/s/darkleaks",              "title": "Dark Leaks", "description": ""},
    {"url": "https://tgstat.com/channel/@darkleaks", "title": "Dark Leaks", "description": "Fresh database dumps and combolists, daily."},
    {"url": "https://t.me/s/upsc_notes",             "title": "UPSC",       "description": "Daily current affairs."},
    {"url": "https://cse.google.com/cse",            "title": "",           "description": "ignored"},
]
out = dedupe(scraped)
assert len(out) == 2, out
by_name = {c["name"]: c for c in out}
assert by_name["darkleaks"]["description"].startswith("Fresh database dumps"), "longest description must win"
assert by_name["upsc_notes"]["description"] == "Daily current affairs."

# --- Lambda merge + noise demotion -----------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ECS-Service-Controller"))
import json as _json
os.environ.setdefault("API_URLS", "")
import index as controller  # noqa: E402

merged = controller.lambda_handler(
    {"body": _json.dumps({"search_query": "x"})}, None
)
assert merged["statusCode"] == 200

# exercise the merge/demote path directly with fake service responses
controller.fetch_all_apis = lambda urls, payload: [
    {"channels": [{"name": "darkleaks", "title": "", "description": "combolists", "url": "u1"},
                  {"name": "upsc_notes", "title": "", "description": "exam prep", "url": "u2"}]},
    {"channels": [{"name": "darkleaks", "title": "", "description": "a much longer description here", "url": "u1"}]},
    {"channel_names": ["oldimagechannel"]},  # service still on the previous image
]
body = _json.loads(controller.lambda_handler({"body": _json.dumps({"search_query": "x"})}, None)["body"])
names = body["channel_names"]
assert names == [c["name"] for c in body["channels"]], "both keys must stay in the same order"
assert set(names) == {"darkleaks", "upsc_notes", "oldimagechannel"}
assert names[-1] == "upsc_notes", f"noise channel must be demoted to the end, got {names}"
assert next(c for c in body["channels"] if c["name"] == "darkleaks")["description"] == "a much longer description here"
assert next(c for c in body["channels"] if c["name"] == "oldimagechannel")["description"] == ""

print("all checks passed")
