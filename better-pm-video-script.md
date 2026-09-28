# DarkMap 0→1 — Founding PM video pack (Better / Operate)

**Deliverable for:** Rohan, to speak directly to camera (Loom, ~5 min) for Better's Founding PM application.
**Every number below is traced to a file.** Unverifiable claims are marked `[VERIFY]` and kept out of the script body.

---

## 1. Read this before you record — three factual corrections

**a) The cost story is $242 → ~$20, not $300 → $40.**
- `HANDOVER.md:13` — "~$217/month … 106 searches in the last 30 days … $2.05 per search"
- `writeups/channel-discovery-replatform.html` §1 — **$242** / 30 days, from AWS Cost Explorer; §6 target `< $40`, **actual ~$20**
- The gap is itself a good story: $217 was the cost *in one region*. The true all-region figure was $242, because a forgotten load balancer in a second region had been billing $25.25/month since Aug 2024. $217 + $25.25 = $242.
- **Say: "about $240 a month down to about $20."** "$40" was your written target; you beat it. Don't say $300→$40 — your own PRD contradicts it.

**b) The latency trade was 3s → ~12s, not "3–4 extra seconds."**
`channel-discovery-replatform.html` §6: median warm ~3s → ~12s, p95 12.8s. You made it ~4× slower on paper. **This is a stronger story told honestly**, because the reason it was acceptable is documented: the fleet idle-shut-down to zero and nothing restarted it, so the real comparison was 12s versus *no result at all*. Understating it to 3–4s throws away your best line.

**c) "Supports entire cybersecurity teams / heavy concurrency" contradicts your own measurements.**
The PRD records **3.5 searches/day**, and lists "behaviour above ~10 concurrent users is modelled, not measured" as an open risk. If you claim departmental-scale load and a PM probes it, the numbers don't back you.
**The defensible claim:** the architecture went from something that broke after 4 requests from one machine to something that absorbs a team's concurrent use — and the reason you cut cost is precisely that you *measured* real usage instead of trusting the original volume assumption. Capability, not traffic. That reads as more senior, not less.

### Claims I could not verify anywhere in the files

| Claim | Status |
|---|---|
| Kidnapping case / retrieval | **KEEP OUT — decided.** It is real (Gujarat Police), but there is no public reporting on it, so a viewer cannot verify it and you would be disclosing casework that is not yours to disclose. The generic "contributed to a live investigation" line covers it and is safe. |
| Defence/security departments in **multiple states** | **RESOLVED — name the units instead.** Confirmed users: Ahmedabad Cybercrime Branch, Gujarat Police, Delhi Crime Branch. Three named units across two jurisdictions is stronger and more checkable than the abstract "multiple states" claim, so the script names them and drops the abstraction. |
| Number of users / organisations | **`[VERIFY]`** — not recorded in any file. |
| Search volume — if they ask directly | The real figures are **106 searches / 30 days** and **3.5/day** (above). The script no longer says them out loud, because the absolute number makes the product sound unused. **If asked, give the number and the frame in the same breath:** "About three a day. It's a specialist tool — a handful of police cyber units running deliberate searches against live cases, not a consumer product. Low volume, high stakes. My point wasn't that usage was disappointing, it's that the architecture had been sized for a completely different shape of product and nobody had re-checked." Never hide the number; the reframe only works if you volunteer it. |
| `captcha_bypass_case_study.html` | Doesn't exist under that name. The case study is **`Iac/blog.md`** ("The Wall That Moved Every Time You Hit It"). Same content. |
| Brand-protection / anti-piracy product | **CUT FROM THE SCRIPT — decided.** Future work, not built. Removed from the body and from the timeline so there is nothing to probe. Keep `DARKMAP_BRAND_PROTECTION_ARCHITECTURE.md` in your back pocket for the interview if they ask "what would you build next" — it is a real artefact, just not part of the 5 minutes. |
| Resume says Darkmap Apr–Oct 2024, but the writeups are dated Sept 2026 | Minor inconsistency someone may notice. Have an answer ready ("founding stretch full-time, still the person who owns these decisions"). |

---

## 2. The script — say this

> **Runtime: 783 words. About 4:45 at a normal pitch pace (165-175 wpm), 5:10 if you speak slowly.**
> Measured from the word count, not estimated. Six beats instead of seven — the old "Sizing it"
> section is now one sentence at the end of beat two.
>
> **Calibrate before you commit:** record the Hook once and time it. It is 102 words.
> 33 seconds means you are at ~185 wpm and the whole thing lands near 4:13.
> 37 seconds means ~165 wpm, so ~4:45. 41 seconds means ~150 wpm and you land at ~5:13 —
> in that case drop the two `[DROP IF OVER]` lines, which takes 24 words off and brings you
> back under 5:00.
>
> This is the floor. Cutting further means losing a whole beat, not trimming words.
> Section 2c lists everything already held back.

Read it aloud three or four times before recording. Not to memorise it, just so the phrasing sits in your mouth. The short sentences and fragments are deliberate: that's how people talk, and they give you places to breathe.

`[brackets]` are notes to you, not words to say. Record it in six takes and stitch them — one unbroken five-minute attempt is what makes people read.

---

### Hook

Hi, I'm Rohan.

DarkMap is a cyber threat intelligence platform that law enforcement teams use. You give it a term, and you get back the Telegram channels most likely to be trading stolen data about it. Ranked, with the reason why. Channels that are technically public, and almost impossible to find.

When I started, it was a search box with a scraper behind it. And it fell over after four requests.

The interesting part isn't that I fixed the scraper. It's that over two years my job changed — from building what I was handed, to deciding what this needed to become.

---

### The zero-to-one problem

The spec was one sentence. Officers search during live investigations, so results come back in under five seconds. Non-negotiable.

I built it. Worked locally. In production it returned four clean responses, and then every request after that was a CAPTCHA. We were being fingerprinted by IP.

`[pause, then signpost]`

Three ways to fix it. The one I picked wasn't the obvious one.

CAPTCHA solvers: fifteen to thirty seconds per challenge. Fails the one requirement we couldn't move.

Fingerprint spoofing: it means impersonating a browser to deceive the target system. For a law enforcement customer, that's legal ambiguity I wasn't willing to introduce. Rejected on compliance, not capability.

Or infrastructure-level IP rotation: containers each booting with a fresh address, a load balancer rotating across them. No third party, no impersonation.

I wrote all three up and took them to the product owner. Thirty-nine seconds, down to three.

And the reframe is the part I'd put on a résumé. The CAPTCHA was never the problem — the single IP address was. It looked like a scraping bug; it was an infrastructure design question.

Though it cost us a fleet I now had to run and pay for. Eighteen containers, because one search fires twelve requests, and a single IP survives about fifteen.

---

### From search to intelligence

Around here the question changed, and I nearly missed it. We'd got very good at "can we retrieve this fast." But the real question was what matters, why, and then acting on it. More data was never the product.

So — an AI layer that re-ranks channels and explains the score.

And then the piece I'm proudest of. AI decoys — an undercover persona holding a real conversation on Telegram with someone selling stolen data. That isn't a chatbot, it's almost entirely constraints: be indistinguishable from a person, don't get the account banned, keep the operator in control. A human in the loop isn't a safety feature here. It's the requirement.

That's the shift. From collecting intelligence, to generating it.

---

### Real-world impact

It's in real use by law enforcement — the Ahmedabad Cybercrime Branch, Gujarat Police, the Delhi Crime Branch. And it placed second out of more than five hundred cybersecurity startups at Kanad SHIELD 2026.

It also contributed to a live investigation. `[slow down]` And I'll be careful there — I'm not going to tell you software solved a case. Investigators did. What I can say is our intelligence was part of real casework, where zero security incidents was a requirement, not a goal.

---

### The $240 to $20 decision

This is the decision I'd point to if you only had time for one. Partly because I got the first read on it wrong.

That fleet was costing about two hundred and forty dollars a month. Two dollars and five cents per search, for a text box.

The tempting conclusion is that someone over-engineered it. That's wrong — and getting that right mattered, because it changed what I was allowed to remove. The CAPTCHA constraint was real; I'd measured it. What had gone stale was the volume assumption: it was sized for thousands of searches a day, and this is a specialist tool. A few police units, live cases. Low volume, high stakes.

`[DROP IF OVER]` So: separate the constraint from the assumption. Honour the first, drop the second.

And then the finding that flipped it. The fleet scaled itself to zero after thirty minutes idle, and nothing ever restarted it. At that volume, cold was the normal state. So the honest comparison was never three seconds versus twelve. It was twelve seconds versus nothing.

Twelve seconds that always works is a better product than three seconds that needs someone to remember to boot a fleet.

---

### Close

What I'm proud of isn't the scraper, or the AI feature, or the cost number.

Early on I was optimising for raw search speed. Later, for how much value an investigator gets per dollar. I noticed the target had moved.

My title said engineering. But the work was deciding what to build, why, which trade-off was worth making — and killing my own good ideas when I measured them.

That's what I want to bring into a founding product role.

## 2b. Delivery: how to not sound like you're reading

**Six habits, in priority order.**

1. **Signpost before you list.** "There were three options, let me take them in order." Every time you're about to enumerate. It's the cheapest thing you can do that reads as senior, and it gives the listener a map.
2. **Close on what it cost, not what it won.** Every section above has a "close on the cost" line for this reason. "I chose C. What that cost us was operational surface." A candidate who only reports wins sounds like they're selling; one who reports the price sounds like they were there.
3. **Name the thing you got wrong, early and without drama.** You have three genuinely good ones: the first read on the cost problem, the moat you found by accident, and two of your own optimisations you killed. Say "I got that wrong initially" in a normal voice and move on. Don't apologise, don't dwell.
4. **Hedge precisely where you're actually unsure.** "Behaviour above ten concurrent users is modelled, not measured." That exact register — naming the limit of your own evidence — is the most senior-sounding thing in this whole pack, and it's free because it's true.
5. **Be concrete where you'd normally be abstract.** Not "investigators need speed." Say "an officer running a search in the middle of a live operation." Not "it improved reliability." Say "request five came back 403, and every one after it."
6. **Use "I decided" for decisions and "we" for execution.** Be deliberate about the switch. You weren't the founder and you weren't the only engineer — own the decisions specifically and let the rest be the team's.

**Mechanics for the take**

- Say it standing up. You'll hear what sounds like a research paper the moment it leaves your mouth.
- Record section by section. Seven takes of 40 seconds, stitched, beats one attempt at five minutes every time.
- Go slightly bigger on energy than feels natural. If it feels like a little extra it usually looks about right; if it feels normal it tends to read flat.
- Glance at the beats between sections, not during one. Reading and talking are different modes and the camera catches the switch.
- One idea per slide. At this pace nothing denser gets read.

**References**

- [Great PM Interview Answers Include Tradeoffs. Here's How.](https://www.tryexponent.com/blog/the-key-to-a-successful-pm-interview-answer-tradeoffs) — Exponent. Source for signposting structure up front, naming opportunity cost, and closing on the trade-off.
- [30+ Technical Product Manager Interview Questions](https://www.tryexponent.com/blog/technical-product-manager-interview-questions) — Exponent. The register technical PM answers are expected to hit.
- [52 Real Product Manager Interview Questions](https://www.tryexponent.com/blog/top-product-manager-interview-questions) — Exponent.
- [How To Answer Prioritization And Trade Off Questions](https://www.palarino.com/how-to-answer-prioritization-and-trade-off-questions-in-pm-interviews/) — Palarino Partners.
- [Unscripted Video Mastery: Record Engaging Talks Without Memorising Scripts](https://talkforimpact.substack.com/p/unscripted-video-mastery-how-to-record) — source for the beats-not-scripts approach and why memorised answers read as performance.
- [Teleprompter Guide: Natural On-Camera Delivery](https://gvmled.com/teleprompter-guide-natural-on-camera-delivery/) — practise speaking rather than reading; energy calibration.

---

## 2c. Held back for the live interview

Cut to make five minutes. All of it is real and all of it is good material. Keep it for follow-up questions and for the written application.

| Held back | Use it when they ask |
|---|---|
| **Coverage check before the cutover.** Thirteen out of thirteen on the channels an analyst actually acts on, against a baseline captured before touching anything. "A diff, not an opinion." | *"How did you know it was safe to cut over?"* This is the single best thing you had to leave out. Have it ready. |
| **Two of my own optimisations, killed.** Caching repeat searches was free and saved 12s, but results sort by recency and this is threat intelligence, so a cached hit is stale by construction. Moving AI ranking off the critical path looked like a clean 6s win, until I read what the client does with the response: it immediately fetches message history for the ranked top ten, so unranked means it fetches the wrong ten and visibly reshuffles. | *"Tell me about killing your own idea."* Your strongest answer to that question. |
| **The accepted regression, logged as such.** Made the warm path 4x slower, wrote it down as "regressed, accepted" because the warm path was rare. Then attacked variance rather than the median: a 10-20s spread down to 12.6-14.2s, for about 40 cents a month. | Any probe on the latency hit. |
| **The forgotten load balancer.** $25.25/month in a second region, billing 13 months, invisible because every cost review had only looked in one region. | *"What surprised you?"* Also good for the written application. |
| **The moat I found by accident.** Those six search queries run against a *curated* search engine restricted to a few Telegram directory sites. That configuration — not the infrastructure — was the real asset, and it decided every migration option I evaluated: anything that renders our engine preserves the results, anything that queries Google generally does not. A general web-search API reproduced only 33 of 72 channels. | *"What was the product's actual moat?"* or *"How did you evaluate vendors?"* Cut for time; it's a top-three answer. |
| **AI ranking is assistance, not a replacement.** The score always shows its reason so the analyst can overrule it. | *"How do you think about AI in a high-stakes workflow?"* The decoy paragraph makes this point in the video; this is the fuller version. |
| **Isolated service for keyword search**, with its own deploy-and-teardown pipeline, so a heavy custom search couldn't throttle the searches investigators depended on. | *"How do you protect existing users when shipping something new?"* |
| **Payment-screenshot bait**, with the same evidence discipline. | Only if they're clearly interested in the decoy work. |
| **Rollback was two environment variables and no deploy.** | *"How did you de-risk the migration?"* |
| **Search volume: 106 in 30 days, ~3.5/day.** Deliberately not said out loud — the raw number makes the product sound unused. | If asked directly, give the number *and* the frame in one breath: "About three a day. Specialist tool, handful of police cyber units, live cases. Low volume, high stakes. My point wasn't that usage disappointed me, it's that the architecture had been sized for a different shape of product entirely." Never dodge it. |

---

## 3. Timeline of the product evolution

| Phase | What it was | The decision that moved it |
|---|---|---|
| **Prototype** | Local scraper against a curated Google search engine. Sub-5s spec, non-negotiable. | Built it; died in production after 4 requests — IP fingerprinting. |
| **The fix** | ECS + ALB IP-rotation fleet, Docker, Node.js. **39s → 3s.** | Rejected CAPTCHA solvers (too slow) and fingerprint spoofing (compliance). Chose infrastructure. |
| **Scale** | 6 services / 18 tasks / 18 public IPs, each behind its own ALB. Measured 12 requests per search, 10–15 requests per IP. | Sized from measurement, not intuition. |
| **Isolation** | Dedicated service + deploy/teardown automation for dynamic keyword search. | Don't let a new heavy workload destabilise what users depend on. |
| **Intelligence** | AI ranking layer (0–100 relevance, re-sorts, reason shown). | Ranked and explained beats more results. |
| **Engagement** | AI Telegram decoys: persona, memory, human timing, operator steering, payment-screenshot bait. | Move from collecting intelligence to generating it. |
| **Economics** | Fleet deleted. **$242 → ~$20/mo.** 3s → 12s accepted; variance cut 10–20s → 12.6–14.2s. | The optimisation target had changed. Verified coverage 13/13 before cutting over. |

---

## 4. The seven strongest PM decisions

1. **Rejected the two obvious CAPTCHA fixes on product grounds, not technical ones.** Solvers failed the latency requirement; fingerprint spoofing failed compliance for a law-enforcement customer. Three options written up and taken to the product owner. *(`Iac/blog.md` §04)*
2. **Re-framed a scraping bug as an infrastructure design problem.** "The CAPTCHA was never the problem, the single IP was." 39s → 3s, with zero third-party dependencies added.
3. **Separated the real constraint from the stale assumption.** CAPTCHA limit: real, honoured. Traffic estimate: two years old, dropped. Conflating them either paralyses you or breaks the product.
4. **Made the trade on verified coverage, not on latency.** Captured a baseline of live results first; rejected a 1.5s API that returned 33 of 72 channels, and a $119/mo vendor that was 2s faster for six times the price. Chose 13/13 on the channels analysts act on.
5. **Killed two of my own optimisations.** Caching (stale by construction in threat intelligence) and async AI ranking (traced the client and found it fetches the ranked top ten immediately).
6. **Accepted a 4× latency regression in writing, with the reason.** Logged as "Regressed — accepted" against a warm path that was rare, then attacked *variance* instead: 10–20s spread → 12.6–14.2s via hedged duplicate requests, for about $0.40/month.
7. **Designed the decoy around operator control, not autonomy.** Two-slot steering, manual takeover, directives logged as audit entries and excluded from the model's context. In this domain, human-in-the-loop is the product requirement.

---

## 5. Strongest numbers to say out loud

| Number | Meaning | Source |
|---|---|---|
| **39s → 3s** | 90% latency cut, no third-party dependency | `Iac/blog.md` §07 |
| **$242 → ~$20/mo** | ~92% infra cost cut; written target was <$40 | `channel-discovery-replatform.html` §6 |
| **$2.05 → <$0.01** | Cost per search | ibid. |
| **13 / 13** | Security-relevant channel coverage preserved | ibid. R2 |
| **12 requests/search · 10–15 per IP** | Why the fleet existed; measured, not assumed | ibid. §1 |
| **6 services, 18 tasks, 7 ALBs, 2 regions — deleted** | Scope of the simplification | `two-dollars-a-search.html` |
| **30+ → 2 components to operate** | Operational surface | PRD §6 |
| **10–20s → 12.6–14.2s** | Variance treated as the real requirement | PRD §5 |
| **$25.25/mo × 13 months** | The load balancer every single-region cost review missed | ibid. |
| **2nd of 500+, Kanad SHIELD 2026** | External validation | your LinkedIn post |
| **Zero security incidents** | Non-negotiable in this context | `Iac/blog.md` §07 |

Avoid "thousands of users" and "departmental concurrency." Say **"built to absorb a team's concurrent use"** — that's what the architecture does, and what you can defend.

---

## 6. What to show on screen

| Time | Show |
|---|---|
| 0:00–0:37 | The live product — type a term, get ranked channels. Ten seconds, no narration over it. |
| 0:37–1:52 | The production log pattern from `Iac/blog.md`: requests 1–4 `200 OK`, request 5 onward `403`. One slide. Then your three-option table (A / B / C with the reason each was rejected) — hold it up for the whole 40 seconds you spend on the options. **It is the single most PM-looking artefact you have.** |
| 1:52–2:36 | The ranked-results UI with reasons. Then a real decoy conversation — **blur the target and any identifiers** — and the operator panel showing the standing objective / one-shot nudge. Your most memorable 40 seconds; don't narrate it over a static diagram. |
| 2:36–3:05 | The Kanad SHIELD photo (name the three units out loud; no slide needed). Then your face, no slide, for the "software didn't solve the case, investigators did" line. |
| 3:05–4:15 | The before/after cost table from the PRD (line items → totals). Then the four-row user-experience table: warm 3s→12s, **cold: returns nothing → 12s**, ten concurrent users: degrades → absorbed. That table *is* the argument. |
| 4:15–4:44 | Your face. No slide. |

The request-flow diagram (client → ALB → three ECS tasks with different IPs → target) no longer has a section of its own — the fleet is now one sentence. Either drop the slide, or put it behind the last line of beat two and let it sit there silently.

Two production notes. Put the PRD itself on screen for two seconds at 4:00 — a real PRD with a decision log and an accepted regression does more for you than saying "I think like a PM." And keep every slide to one idea; at this pace, anything denser won't get read.

---

## 7. Why this reads as founding-PM evidence

A founding PM on an early product is hired for four things, and this story is a worked example of each.

**Finding the real problem.** Twice. A CAPTCHA that was actually an IP-identity problem. And a cost problem that was actually a stale-assumption problem — with the reframe explicitly noted as mattering "because it changed what I was allowed to remove."

**Deciding under real constraints, with the reasoning on the record.** Three options, two rejected on product grounds — latency and compliance — before engineering entered it. Written up, taken to the product owner. And the retrospective's own lesson is that you should have written the decision log *sooner*. That's a PM's instinct, not an engineer's.

**Knowing when the objective has changed.** Early: speed, because that was the differentiator. Later: value per dollar, once AI ranking and decoy engagement had become the product. Most engineers keep optimising the original metric. Recognising that the metric itself expired is the job.

**Measuring instead of believing yourself.** Five confident answers killed by measurement, four of them your own. Two of your own optimisations rejected after tracing the consumer. A migration decided by a diff nobody had thought to run. For Better's Operate product — early, SRE and DevOps workflows, hypothesis to PMF — this is the most relevant thing in the whole story: you already know these customers, you've been the on-call engineer, and you have a documented habit of letting a measurement overrule your own confident answer.

One thing to be explicit about, because they will ask: you didn't have the title, you weren't the founder, and you weren't the only engineer. You were the engineer who took ownership of the decisions. Say that plainly once, and let the story carry it.
