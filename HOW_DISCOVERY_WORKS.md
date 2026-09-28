# How DarkMap Finds Things on Instagram and Facebook

**For:** product, business and operations teams
**Date:** 2026-09-21
**Status:** tested against real Instagram and Facebook on 2026-09-21. The numbers
in this document are measured, not estimated.

This explains, in plain language, how DarkMap will find pirated content and fake
accounts on Instagram and Facebook, what it can promise a customer, and what it
cannot. The technical version is in `DARKMAP_BRAND_PROTECTION_ARCHITECTURE.md`.

---

## 1. The problem in one paragraph

A film releases on Friday. By Sunday there are Instagram accounts posting
download links for it, Facebook pages sharing streaming mirrors, and fake
accounts pretending to be the studio. The studio's team needs to find all of
that quickly, prove it exists, and get it taken down. Today they do this by
hand, one search at a time. DarkMap does it for them.

---

## 2. What happens when someone searches

A customer types a title, a brand name, or a keyword. For example, `Obsession`.

**Step 1. We turn one word into many searches.**
Pirates do not write "Obsession" on its own. They write "Obsession full movie",
"Obsession HD download", and they tag their posts `#obsessionfullmovie`. So we
automatically expand the one word the customer typed into a list of hashtags and
phrases that pirates actually use.

This expansion list is the valuable part of the product. It is the same idea as
the six specially written search queries DarkMap already uses for Telegram,
which took years to tune.

**Step 2. We look at several places at once.**
We check Instagram hashtag pages and Facebook hashtag pages at the same time,
rather than one after another, so the customer waits once instead of six times.

**Step 3. We pull out the accounts.**
From each page we extract the account names, the captions, and the links.

**Step 4. We score each one and explain why.**
Every account gets a score out of 100, built from five things:

| What we check | Example |
|---|---|
| Does the name match the title? | `@obsession_hd_movie` matches strongly |
| Does the wording look harmful? | "full movie", "download", "link in bio" |
| How many people could see it? | follower count |
| Have we seen this account before? | it appeared in an earlier case |
| Do we have solid proof? | working link, screenshot, timestamp |

The customer always sees the reason behind a score, never just a number. That is
a deliberate product rule.

**Step 5. The team reviews, opens a case, and requests removal.**
A person always makes the final call. DarkMap prepares the evidence.

---

## 3. How we actually get the pages: Decodo

Instagram and Facebook block ordinary automated visits. If we asked for their
pages directly from our own server, we would be blocked within minutes.

**Decodo is a service that opens web pages on our behalf.** We give it a web
address, it opens that page properly the way a real browser would, and it sends
us back what the page contained.

Three things worth knowing about it:

- **We already pay for it.** It costs 19 US dollars a month and is already in
  use for DarkMap's Telegram searches. Adding Instagram and Facebook does not
  add a new supplier or a new contract.
- **It fetches live pages, not stored copies.** There is no old data sitting in
  a database somewhere. When we ask, it goes and looks, right then.
- **It does the difficult part.** Handling blocks, rotating addresses, and
  loading pages properly is their job, not ours. That is what we are paying for.

---

## 4. What works, tested on real pages

We tested this properly on 21 September 2026 against live Instagram and
Facebook. Results:

| What we tried | Works? | What we got back |
|---|---|---|
| Instagram hashtag pages | **Yes** | A full page, around 930 KB, containing 11 to 24 accounts per search |
| Facebook hashtag pages | **Yes** | A full page, around 1.4 MB |
| Reading a specific Instagram profile | **Yes** | Full profile, and we can tell a real account from one that does not exist |
| Reading a specific Facebook page | **Yes** | Full page |
| Instagram's own search box | **No** | Blocked. Requires being logged in |
| Facebook's own page search | **No** | Blocked. Requires being logged in |

**The headline: the two things that matter most both work, without logging in
to anything.** We can read hashtag pages, and we can read any specific account.

---

## 5. What does not work, and why it does not matter much

Instagram and Facebook both block their own internal search boxes to visitors
who are not logged in. So we cannot type a word into Instagram's search and read
the results.

**Why this matters less than it sounds:**

Those search boxes do one job, which is finding accounts by name. We can do the
same job a different way. Instagram account addresses are public, so we can
simply try likely names directly: `jawan_hd`, `jawan_official`, `jawan.movie`,
and so on, and keep the ones that turn out to be real. We tested this and it
works.

The trade-off is speed. The search box would answer in one go. Trying names one
at a time takes about 20 to 30 seconds each. So we do this in the background on
a schedule, not while a customer is waiting.

**What we are deliberately not doing:** using logged-in accounts to get past
those blocks. It would work, but it means creating fake Instagram and Facebook
accounts, keeping them logged in, and replacing them when the platforms ban
them, which they will. DarkMap already has this exact problem with Telegram,
where the logged-in sessions have stopped working and are currently blocking
part of the product. We are not signing up for a second version of that problem.

---

## 6. Three constraints we must be honest about

These are not temporary problems to be fixed later. They are properties of how
social media works, and the product plan should be written around them.

### Constraint 1: We look, they do not tell us

Instagram will never send us a message saying "someone just posted about your
film". No social platform offers that. The only way to know is to go and look.

**What this means in practice:**

- When a customer searches, they get what is live at that second. That part is
  genuinely current.
- When we monitor a title in the background, we find things as often as we go
  and check. If we check every hour, we are up to an hour behind.

**Checking more often costs more money, in a straight line.** Twice as often is
twice the cost. This is the single biggest lever on both our costs and what we
can promise.

**Say this:** "Live as of the moment you search."
**Never say this:** "You will be alerted the instant something appears."

### Constraint 2: We find a lot, not everything

Hashtag pages do not show every post. Instagram deliberately hides and delays
content it suspects breaks its rules, and pirated films break its rules. So some
posts show up late, some never show up, and private accounts never show up at
all.

This is why we check several places at once. Each one misses different things,
and together they cover far more than any one alone. But no combination gets to
100 percent, and we should never claim it does.

**Say this:** "We cover these platforms, refreshed this often."
**Never say this:** "We find everything."

### Constraint 3: Search engines are days behind

We also check Google for piracy websites. Google is useful, but it only knows
about pages it has already catalogued, which takes days. An Instagram account
created four hours ago is not in Google and may never be.

So Google is a useful net for older material. It is not how we find things
quickly. That is what the hashtag pages are for.

---

## 7. How long a search takes

Measured on real searches:

| Search | Time |
|---|---|
| "Jawan" | 23 seconds |
| "Obsession" | 39 seconds |
| "Kalki 2898 AD" | 56 seconds when one source needed retrying |

**Roughly 20 to 40 seconds.** These pages are very large, between 1 and 2 MB
each, and they take real time to load properly.

This is slower than we originally assumed, and it changes the design. Results
will appear on screen progressively as each source finishes, rather than the
customer staring at a loading spinner for 40 seconds. The fastest sources report
in a few seconds and the slower ones fill in behind them.

For comparison, DarkMap's existing Telegram search takes about 24 seconds, so
this is familiar territory rather than a new problem.

---

## 8. What it costs

| Item | Monthly |
|---|---|
| Decodo, for opening pages | 19 US dollars, already being paid |
| Everything else in the current setup | roughly 30 to 80 US dollars |
| **Instagram and Facebook discovery** | **no new supplier needed** |

The important point for planning: **discovery costs us almost nothing extra**,
because it reuses a service we already pay for. Costs grow later, when we add
detailed profile information and evidence screenshots for each finding, and when
customers ask us to check more often.

---

## 9. What we can honestly promise a customer

This is the wording that survives scrutiny.

**We can say:**

- "Search any title, brand or keyword and see what is live on Instagram and
  Facebook right now."
- "Every finding comes with a score and the reason behind it."
- "Every finding comes with saved proof, timestamped, for a takedown request."
- "Once a title is on your watchlist, we keep checking on a schedule you choose."
- "We will tell you exactly which platforms we cover and how fresh each one is."

**We must not say:**

- "Real-time alerts the moment content appears." We look on a schedule. Nothing
  pushes to us.
- "We find everything." We find a lot. The platforms hide some of it from
  everyone.
- "We monitor all of social media." Right now this is Instagram, Facebook,
  Telegram and websites.

The product plan already reached this conclusion independently. Its own guidance
says to use clear platform coverage and freshness labels instead of promising
real-time everywhere. That is exactly right, and this testing confirms it.

---

## 10. Where we are now

**Working, tested on real pages:**

- Turning one keyword into a full set of searches
- Finding accounts through Instagram hashtag pages
- Finding pages through Facebook hashtag pages
- Reading any specific Instagram or Facebook account
- Scoring with five components and showing the reasoning
- A working dashboard that displays all of it

**Still to build:**

- **Matching captions to the right account.** At the moment we reliably get the
  list of accounts and we reliably get the list of captions, but we do not
  always pair them up correctly. Until this is fixed the scores are not
  trustworthy, even though the discovery itself works. This is the next job.
- Saving screenshots as evidence
- Background monitoring on a schedule
- Cases and takedown tracking

**Decided and closed:**

- We use Decodo for finding things. No new supplier needed.
- We do not use logged-in accounts. Too fragile, and we have been burned already.
- Instagram and Facebook internal search stay out of scope. We have a workaround.

---

## 11. Try it yourself

There is a working prototype in the `prototype` folder. It runs on a laptop,
takes any search term, and shows real results from Instagram and Facebook.

Ask an engineer to start it and open the dashboard. Type any film title or brand
name. The dashboard shows which sources were checked, how long each one took,
how fresh each one is, and the reasoning behind every score.
