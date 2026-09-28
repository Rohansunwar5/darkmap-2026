# DarkMap discovery prototype

Keyword to findings on Instagram and Facebook, live. Any query.

**There is no demo, sample or synthetic data.** Every result is fetched from a
public Instagram or Facebook URL at the moment you scan. Without a token the
server refuses to start rather than showing you something fake.

## Run it

```bash
cd prototype
node test.js                        # 67 self-checks, no network
node --env-file=.env server.js      # then open http://localhost:8787
node --env-file=.env probe.js "Jawan"   # CLI scan with per-source diagnostics
```

Node 20.6+ (for `--env-file`). No dependencies, no `package.json`.
PowerShell works the same way; `--env-file` avoids needing `$env:` exports.

`.env` needs `DECODO_TOKEN` (the Basic auth token from the Decodo dashboard, a
long base64 string). An `AIzaSy...` value is a **Google** key and will fail.

| Variable | Default | Notes |
|---|---|---|
| `DECODO_TOKEN` | required | server exits without it |
| `TIMEOUT_MS` | 60000 | real pages take 20-40s; the old 30s default timed out |
| `MAX_POSTS` | 8 | stage 2 cap. Each post page is ~60s |
| `POST_CONCURRENCY` | 4 | too high and Decodo returns empty bodies |

## How a scan works

```
query "Jawan"
  |
  |  EXPANSION  (local, instant)
  |    #jawanfullmovie #jawandownload #jawanleaked #jawanhd #jawanmovie ... #jawan
  |    specific piracy tags first; the bare title tag last, because it is
  |    dominated by fans and the rights holder
  v
STAGE 1  discovery         ~20s
  instagram.com/explore/tags/<tag>/   -> post shortcodes  (12-25 per page)
  facebook.com/hashtag/<tag>          -> page names
  |
  |  MEASURED: the hashtag page contains ZERO owner->username pairings, so
  |  author and caption cannot be matched here at any level of parser effort.
  v
STAGE 2  enrichment        ~45s (MAX_POSTS pages, POST_CONCURRENCY at a time)
  instagram.com/p/<shortcode>/
    og:title       'WANDERVAMP on Instagram: "caption"'   -> author + caption, PAIRED
    og:description '44K likes, 214 comments - wandervamp' -> handle + likes
  v
SCORE  five weighted components, then sort
```

Full scan: **60 to 90 seconds**. The dashboard does not scan on page load, on
purpose, because every scan spends real requests.

## Scoring

```
score = 0.30 * title match     stronger of handle-match and caption-match
      + 0.30 * harm likelihood piracy lexicon hits in the caption
      + 0.20 * reach           like count, log scaled
      + 0.15 * repeat/network  95 if seen before, 40 if unknown
      + 0.05 * evidence        capture present
```

Separation on real inputs:

| Account | Score | Why |
|---|---|---|
| `@moviehub_hd` "Jawan full movie 1080p download link in bio" | **72** high | match 82, harm 88 |
| `@wandervamp` "Zuzu Tere Ko Uncle Bola #Jawan" | 51 med | match 90, **harm 0** |
| `@tseriessouthofficial` (the rights holder) | 45 med | match 90, harm 11, low reach |
| `@cakerecipes` "chocolate sponge tutorial" | 19 low | match 0, harm 0 |

The pirate beats a fan account with **ten times the likes**, because harm
carries the weight rather than reach.

---

## Measured results, Decodo logged out, 2026-09-21

### URL shapes

| URL | Upstream | Body | Verdict |
|---|---|---|---|
| `instagram.com/explore/tags/<tag>/` | 200 | ~935 KB | **WORKS** |
| `instagram.com/p/<shortcode>/` | 200 | ~940 KB | **WORKS**, author+caption paired |
| `facebook.com/hashtag/<tag>` | 200 | ~1.4 MB | **WORKS** |
| `facebook.com/<page>` | 200 | ~1.3 MB | **WORKS** |
| `instagram.com/web/search/topsearch/?query=` | **401** | 42 B | needs auth, dropped |
| `facebook.com/search/pages?q=` | **404** | 48 B | needs auth, dropped |

Keyword search is walled on both platforms. Hashtag pages are not, and that is
where piracy lives anyway.

### Reliability and latency

Three serial Instagram hashtag fetches: 22.9s, 11.7s, 12.5s, all 200. Firing
six URLs at once produced one empty body, so **concurrency causes transient
empty responses, not blocks.** Cap it and retry.

Full two-stage scans measured at 65s and 90s.

### Bright Data comparison

Its own API settles the discovery question:

```
discover_by=hashtag  ->  400  "Incorrect discovery collector id. Available types: url"
discover_by=keyword  ->  400  "Incorrect discovery collector id. Available types: url"
hashtag page         ->  200  rows=0   "It is not a post URL"
```

**Bright Data cannot do discovery.** It takes profile, post and reel URLs only,
same as ScrapingDog. Only a general renderer like Decodo can fetch a hashtag
page, because arbitrary URLs are its whole product. See `../prototype-brightdata/`.

---

## Known limits

- **Generic title tags return fans, not pirates.** `#jawan` returned T-Series
  and meme accounts. Precision comes from the compound tags, which carry far
  less volume. Judge a scan by what it finds, not how much.
- **Facebook findings are unenriched.** There is no post-page equivalent, so
  they score on the page name alone and are flagged `unenriched`.
- **No follower counts.** Reach uses like counts from the post page.
- **No screenshots yet.** Evidence hashes cover the URL and caption, not
  stored bytes.
- **`MAX_POSTS` caps recall.** Stage 2 reads 8 posts by default out of the
  20-40 discovered. Raising it raises both recall and scan time, linearly.
