# Handover — Advanced search (dork6), message ranking, and the Decodo render outage

**Session date:** 2026-09-22 → 2026-09-24
**Scope:** the Advance form / dork6 path, per-message keyword ranking, the two
shortcut presets, and a live scraping outage found on the last day.

Read §1 first — there is an unresolved production problem.

---

## 1. ACTIVE PRODUCTION ISSUE — Decodo returns un-rendered pages

### Symptom
Advanced searches return `{"channel_names":[],"channels":[]}`. Normal search
looks fine. On the platform you see `additional-channel` calls but no
`channel-messages` calls, because the channel list is empty.

### Root cause (confirmed)
Decodo intermittently returns the Google CSE page **without executing its
JavaScript**. The CSE injects all results via JS, so the HTML contains nothing.

| | un-rendered | rendered |
|---|---|---|
| size | **2,284 bytes** | ~92,000 bytes |
| duration | 3–5 s | 8–9 s |
| Decodo `type` | `raw` | `raw` |
| HTTP | 200 (and **billed**) | 200 |

The shell carries `<noscript><h3>Programmable Search Engine requires
JavaScript</h3></noscript>`. Example Decodo `task_id` for a support ticket:
`7508597021926784001`.

Measured render rate swung from ~90% (2026-09-22) to **0/8 then 3/12 (25%)**
on 2026-09-24. Failures arrive in **windows** — tries 7, 8, 9 of 12 all
rendered while 1–6 and 10–12 all failed.

### Why it hit the shortcuts hardest
Nothing to do with keywords or query length. It is purely request count:

| path | Decodo requests | at ~18% render rate |
|---|---|---|
| normal search (dorks 1-5 × PAGES=2) | 10 | ~86% chance ≥1 renders |
| advanced (dork6 × PAGES=2) | 2 | ~33% |

Measured back to back: normal `32, 39, 30` channels; advanced `0, 14, 0`.

Query length was tested and ruled out — a 106-char plain query failed at the
same rate as the 758-char preset query (1/4 vs 0/4).

### Mitigation shipped
`fetch()` in `Iac/decodo-scraper/lambda_function.py` now detects the shell and
retries. Result: advanced went from **1/5 to 8/8 non-empty**.

```python
RENDERED_MIN_BYTES = 20000
def _rendered(html):
    if not html: return False
    if len(html) >= RENDERED_MIN_BYTES: return True
    return "requires JavaScript" not in html
```

> **Trap — do not "improve" this by matching on `gsc-webResult`.** The
> un-rendered shell contains that exact string inside a class-name list, so a
> substring test reports every shell as rendered. That bug shipped once and
> silently disabled the whole retry path; the invocation returned in 5.9 s
> instead of retrying. `test_shell_is_not_treated_as_rendered` now asserts the
> fixture still contains the trap.

### UNRESOLVED — the timeout tension
Retrying costs wall-clock, and the route has a hard ceiling.

* `/tg-decodo` on API Gateway `4phuyf7tlf` → **29,000 ms integration timeout**
* backend `SCRAPER_TIMEOUT_MS` default **30,000 ms**
* a Function URL also exists with **no** 29 s cap:
  `https://dfudsov7focjbu75xqojlvvku40uutwd.lambda-url.us-east-1.on.aws/`
  (AuthType NONE)

Measured with `FETCH_DEADLINE_S=16`: **8/8 non-empty but 7/8 over 29 s**
(max 44.3 s). Dropping to 8 s made it *worse* (4/6 non-empty) and still ran
33–60 s, because the duration is Decodo throughput under its 10-connection cap,
not the deadline. Lambda timeout was raised 60 → 90 s after a 59.7 s run.

**Decision needed: what does the backend's `SCRAPER_URL` actually point at?**
- If the **API Gateway** route → searches >29 s now fail. Either move
  `SCRAPER_URL` to the Function URL, or cut `PAGES` to 1, or accept lower
  recall.
- If the **Function URL** → only `SCRAPER_TIMEOUT_MS` (30 s) binds; raise it.

The retry is a band-aid on a vendor outage. The real fix is Decodo rendering
reliably — open a ticket with the task_ids. `MEMORY.md` records ScrapingDog and
Bright Data prototypes as fallback providers.

---

## 2. What is deployed

| Lambda | CodeSha256 | Timeout |
|---|---|---|
| `darkmap-decodo-scraper` | `66j04bWuSNg9Lb2kyikAjf/RNjEdZo9y6cIfEKLPzoo=` | 90 s |
| `telethon_dynamo_code` | `p/TmRnh00lug9YhYi08+WJkSeze2z0tGIf2OBTrz6F4=` | 63 s |
| `Additional-Channels-Telethon` | `Q8UEFXY005E1NKZP8EsHznJJvkfcSavfDydIQOYM/T0=` | 90 s |

`darkmap-decodo-scraper` env:
```
DECODO_POOL=standard  MAX_WORKERS=10  PAGES=2  RETRIES=2
FETCH_DEADLINE_S=16   HEDGE_AFTER_MS=600000   (hedging effectively OFF)
DECODO_TOKEN=***      SHARED_SECRET=***
```
Hedging was disabled because `fetch()` now retries internally; a hedge started a
*second* retry chain and pushed one invocation to 43.7 s.

`telethon_dynamo_code` / `Additional-Channels-Telethon` env:
```
SCAN_LIMIT=100  BASE_LIMIT=5  MAX_LIMIT=20  MAX_TERM_SEARCHES=4
SESSION_ATTEMPTS=3  EXCLUDE_MODE=demote
```

Git — both repos clean and pushed:
- client `e37b612`, backend `013f7f1`

---

## 3. Source now lives in the repo

`telethon_dynamo_code` and `Additional-Channels-Telethon` previously existed
**only in AWS**. They are vendored now:

```
Iac/telethon-get-tg-msg/lambda_function.py   + test_keyword_filter.py  (29 tests)
Iac/telethon-add-ch/lambda_function.py       (shares the logic, no own suite)
Iac/decodo-scraper/lambda_function.py        + test_parser.py          (20 tests)
```

Run: `cd Iac/telethon-get-tg-msg && python test_keyword_filter.py`
(boto3/telethon are stubbed; no AWS or Telegram needed).

> **Trap — never edit these with index-range deletes.** Twice in this session a
> `src[start:end]` splice silently removed `lambda_handler`, `_session_candidates`,
> `_open_session`, `fetch_session_from_dynamodb` and `resolve_channel` because
> the range spanned them. Syntax checks passed; the Lambda would have died with
> `NameError`. Use exact-string replacement plus an AST check that the
> definition list is unchanged (see `scratchpad/patch_*.py` for the pattern).

---

## 4. Changes shipped this session

### 4.1 Decodo pagination was broken (fixed, verified)
`&start=10` was **silently ignored** — both pages reported
`gsc-cursor-current-page=1`, so `PAGES=2` fetched page 1 twice and nothing past
the first 20 results was ever reachable. Only the URL **fragment** paginates:

```python
def cse_url(query, page):
    q = quote(query, safe='')
    if "&" in query:          # see below
        return f"https://cse.google.com/cse?cx={CX}&q={q}&sort=date"
    return f"https://cse.google.com/cse?cx={CX}#gsc.q={q}&gsc.sort=date&gsc.page={page}"
```

Tested and rejected: `?page=`, `?gsc.page=`, `/cse/publicurl?start=`,
`?q=…#gsc.page=2` — all served page 1.

**The `&` branch is mandatory.** Decodo URL-decodes before navigating, so an
`&` inside the fragment truncates `gsc.q` — `"AT&T"` searched as `"AT`, measured
**0/9 channel overlap** against the correct results. `%26`, `%2526`, `%252526`
all failed. Terms containing `&` keep the query-string form and lose paging.

Effect: the same advanced query went 13 → 18 channels, with `DhawanSir`,
`SenguptaAmit`, `TECH_MUKUL` reachable for the first time.

### 4.2 Hedging threshold
`HEDGE_AFTER_MS` 7000 → 12000 originally: hedges were firing on **3–8 of every
10** requests (~1.6× the request volume) because the real median exceeded the
assumed 6 s. Now 600000 = off, per §2.

### 4.3 Telethon: keyword-aware message search
Previously stage 2 fetched messages with `search_query` **only** — the advance
form's keywords never reached it, which is why only "apk" was ever highlighted.

Telegram's `messages.search` takes one plain string (telethon maps it to `q=`);
it cannot express OR or negation. So the Lambda runs **one search per term**
(`MAX_TERM_SEARCHES=4` → query + first 3 keywords), merges, dedupes by
`message_id`, and ranks.

**Priority (lower = better), emitted per message as `priority`:**
```python
missing * 100 + excluded * 50 + no_query * 25 + min(sum(matched_indices), 24)
```
giving, for query + kw1 + kw2:
```
  3  Q + kw1 + kw2, clean            ← 1st
 53  Q + kw1 + kw2, excluded word    ← 2nd
101  Q + kw1
102  Q + kw2
128  kw1 + kw2  (no query)
200  Q only
226  kw1 only
```
Field order carries priority because the frontend concatenates Include Keyword
before Include Second Keyword — `include_keywords[0]` is always kw1, so **no
frontend change was needed** for "kw1 outranks kw2".

`EXCLUDE_MODE=demote` — excludes rank last instead of deleting, which is what
makes the "all terms but carries an excluded word" group reachable. Set
`EXCLUDE_MODE=remove` to restore hard filtering (that collapses group 2).

Per-channel cap `min(5 * (1 + n_include), 20)`; scans `4 × 100 = 400` messages.

**The dorks 1-5 guarantee:** with no keywords the code takes `scan = limit`, the
filter branch is dead and behaviour is byte-identical to before. Pinned by
`test_no_keywords_is_unchanged`.

### 4.4 Session rotation + retry
`get_update_current_index()` kept a round-robin cursor in `os.environ`, which
lives only inside one warm container — every cold start reset to index 0.
Measured **7:1 skew** onto session `3` over 60 invocations, with 17/18 idle.
Replaced with `random.choice`.

That immediately exposed **dead session 18** (*"authorization key used under two
different IP addresses"*) as a **1-in-3 failure rate**. Both Lambdas now retry
across up to `SESSION_ATTEMPTS=3` distinct sessions via `random.sample`.
Result: 14/14 success. **Session 18 still needs replacing.**

### 4.5 Frontend
- `Navbar.jsx` — top Search button **and** the Enter key are disabled while the
  Advance panel is open. Both were needed; gating only the button left Enter
  able to silently fire a plain search and discard the typed keywords.
- `searchSlice.js` — `activeSearchQuery` / `activeKeywords` added. `searchQuery`
  was doing two jobs (live input + "which search is current"), so a reset effect
  keyed on it wiped rendered results on **every keystroke**. View More now also
  carries the keywords.
- `searchSlice.js` — `orderMessages()`: **pinned → dork6 priority → AI score**.
  The AI ranker's `.sort((a,b) => b._score - a._score)` was discarding the
  Lambda's order entirely; that is why the requested ranking never appeared.
  Normal searches carry no `priority` and degrade to pinned-then-AI.
- `constants/channels.js` — `PINNED_CHANNELS = {"sucai_renshe"}`, compared
  lowercase. Floats that channel to the top of **every** search. Caveat: a weak
  match from a pinned channel currently outranks a genuine all-terms hit from
  another. Move the pin check after the priority comparison if that is too
  aggressive.
- `MessageBox/TelegramBox.jsx` — the snippet used to window ±10 words around the
  **base term only**, so an include keyword deeper in the message was cropped
  out of the visible text. Now anchors on the include keyword and highlights all
  terms. HTML escaping added (message text goes through `innerHTML` and was
  previously unescaped); regex metacharacters in keywords are escaped.

---

## 5. The shortcut presets — what is proven and what is NOT

`QUICK_OPTIONS` in `Navbar.jsx`: financial 19 include / 11 exclude,
crypto 16 / 12.

### Proven
Financial preset on "India", repeated across clean runs:

| variant | channels | job-posting channels |
|---|---|---|
| FULL 19 kw (as shipped) | 13–14 | **53–64%** |
| FULL minus 6 phrases (**still 13 kw**) | 11 | **9%** |
| TRIMMED to 3 kw | 18 | **0%** |

The middle row is the point: it is still a long list. The cause is **six
recruitment phrases**, not length:

```
"free salary"  "bank work"  "salary without work"
"register and earn"  "document required"  "login sharing"
```

Trimmed returns `smartxteam`, `znpay_official`, `dragonpay_exchange`,
`davidteam095`, `kobepay_ads` — actual payment/mule infrastructure.
Crypto trimmed cut noise 55% → 7% in one clean run.

### DISPROVEN — do not repeat these claims
1. **"Google truncates at ~32 words so half the preset is dropped."** Wrong.
   The full 72-word query and a hand-truncated 32-word version returned
   **4% overlap** — if truncation were happening they would be near-identical.
2. **"The exclusions never apply."** Wrong at message level — the Lambda applies
   all 11–12 excludes itself. Measured `excluded-word msgs = 0`.
3. **"Every result ties at the same rank."** Wrong — 4 distinct priorities
   measured across 6 channels. Coarse, not flat. (`priority 1809` for query+1kw
   when a perfect score of 24 is unreachable with 19 terms.)
4. **Crypto did not replicate.** Removing generic terms made crypto *worse*
   (40% → 53% off-target). One run each. Needs re-testing.

### Not yet applied
The trimmed preset lists were **not** written to `Navbar.jsx` — awaiting the
product owner's choice of keywords. Suggested:
```js
financial: include ["bank mule", "account on rent", "OTP work"]
           exclude ["actress", "sex", "mms", "OnlyFans"]
crypto:    include ["USDT", "crypto payout", "wallet address"]
           exclude ["actress", "sex", "mms", "news"]
```
Also relevant: `MAX_TERM_SEARCHES=4` means only 4 of 20 terms are ever searched
at message level, so a 19-keyword preset can never behave like the 2-term form.

**Caveat on all preset measurements:** they were taken while the render outage
was active. A "0 channels" result may have been an un-rendered page rather than
a bad keyword list. Re-run the A/B now that the retry is in.

---

## 6. Measurement gotchas

- **`sort=date` makes results non-deterministic.** The same query 20 s apart
  agreed only **82%** with itself. Never conclude from a single run.
- **Empty ≠ throttled ≠ un-rendered.** Check page size: 2,284 B = shell.
- **MSYS path conversion** mangles `/aws/lambda/...` in Git Bash. Use
  `MSYS_NO_PATHCONV=1` or the PowerShell tool for CloudWatch calls.
- Heavy testing hits the same Decodo pool and CSE the platform uses — it can
  degrade live search.

---

## 7. Open items

1. **Confirm `SCRAPER_URL`** (API Gateway vs Function URL) and resolve the 29 s
   ceiling — §1.
2. **Decodo support ticket** for the un-rendered pages; they bill for them.
3. **Replace Telegram session 18.**
4. **Re-run the preset A/B** now the retry is in, then apply trimmed lists.
5. **Re-test crypto** specifically — it contradicted the financial result.
6. **Rotate credentials** — `DECODO_TOKEN`, `SHARED_SECRET` and a Telegram
   bearer were pasted in plaintext during this session.
7. `Additional-Channels-Telethon` has **no test suite**; it shares the filter
   logic with `telethon-get-tg-msg` but is only exercised indirectly.
8. `match_stats` UI copy exists in `BoxContainer.jsx` but the two states
   (no results at all / results with no keyword hits) have not been seen on a
   real screen yet.
