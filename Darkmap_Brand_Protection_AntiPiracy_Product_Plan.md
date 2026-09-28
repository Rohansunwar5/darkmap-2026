# Darkmap Brand Protection AntiPiracy
Product Plan
This document explains what we are building, what it should do, and how a customer will use it. It is
written for product, design, engineering, operations, and business teams.
What we are building
Darkmap will help companies find and act on harmful use of their name, products, and content online. This
includes fake social accounts, pirated shows and movies, scam links, counterfeit sellers, and harmful or misleading
posts.
What good looks like

## 1. The goal
The goal is simple: give a brand or OTT team one place to watch the internet, investigate threats, save proof,
request removals, and confirm whether the problem is gone.
Who this helps
We want to achieve In simple terms
Detect Impersonations and scams early Show new and important risks quickly, especially around big

releases or active scams.

Defensible Analysis Give Brands - post, account, link, reason, and related activity in one

place.

Network visibility Related accounts, URLs, channels, posts, and actors are shown as a

connected entity graph.

Operational closure - Takedown A takedown request can be prepared, tracked, and verified with a

recorded outcome.

Customer team What they need from Darkmap
OTT and studio teams Find leaked or pirated movies, episodes, clips, live events, and the

links that spread them.

Brand protection teams Find fake accounts, fake support pages, false offers, and misuse of

brand names or logos.

Fraud and trust teams Find scam links, fake giveaways, payment scams, and accounts

pretending to help customers.

Legal and operations teams See reliable proof, make a report, track the request, and show what

happened.

## 2. What is included
• A customer can add their brand name, content titles, official websites, official social accounts, logos, keywords,
and common name variations.
• Darkmap checks supported platforms and public websites for possible detection.
• Darkmap groups the information, gives each finding a priority, and sends it to a review queue.
• An analyst can investigate a finding, open a case, collect proof, and track a removal request.
• Managers can see results in a dashboard format as number of threats found, threat score, time to act, removals,
and repeat offenders.

## 3. Platforms we will Monitor & watch
Each platform works differently. The data we can collect depends on the platform rules and the access we have.
The product must clearly show this to the customer.
Platform Main focus What we look at
Telegram Already available and expanded into the

new product

Public channels, messages, usernames,
forwarded posts, files, media links, and
references to other channels or websites.

Instagram Fake accounts and brand or content

promotion

Profiles, handles, bios, Posts, reels,
captions, hashtags, mentions, tags, public
comments when available, and bio links.

Facebook Pages, public posts, and scam or seller

activity

Pages, public posts, videos, public group
information where allowed, comments
where available, links, and public contact
details.

Reddit Discussions, links, sellers, and support

scams

Subreddits, posts, comments, authors, post
labels, shared links, and media references.

Websites and URLs Piracy sites, fake markets, phishing sites,

and mirrors

Domains, web pages, redirects, page text,
download or stream buttons, public contact
and payment details, and screenshots.

## 4. What data we should collect
Information we collect from every source

## 5. What Darkmap should find

Darkmap should not only search for exact words. It should also look for spelling mistakes, short forms, other
languages, common misspellings, and lookalike account names.
Type of information Examples Why we need it
Who posted it Account name, handle, page name, source
link, first time seen, last time seen

To find repeat accounts and show where the
risk came from.

What was posted

Post text, caption, image/video reference,
date, language, likes or views when
available

To understand the problem and decide how
serious it is.

Links and connections Mentioned accounts, hashtags, replies,

forwards, shared links, parent post To see how content and scams spread.

Money or contact clues Public phone, email, price, payment link,

offer, support call to action

To spot fraud, counterfeits, and fake
support.
Proof details When collected, saved copy or screenshot,

file hash, source status To show that the evidence is reliable.

Problem Examples of signs What Darkmap should do
Fake account or impersonation

A handle close to the real brand, copied
logo, copied bio, fake customer support,
link to WhatsApp or a fake website

Show the account, the real account it looks
like, and why it looks suspicious.

Piracy

A show or movie title near a release date,
words like download or watch free, file
names, streaming links, shared copies

Show the content title, the source, related
links, and how the content is spreading.

Fraud or phishing

Fake discount, urgent warning, account
recovery message, payment request, fake
support page

Mark as high priority when customer harm
is likely and keep the link and page proof.

Counterfeit or unauthorized sale

Very low price, seller contact, brand logo,
copied product photos, repeated sales
language

Group similar sellers or listings and prepare
proof for a report.

Brand or content misuse Unauthorized clip, leaked asset, false
endorsement, harmful use of the brand

Show the content and send it to the right
team for review.

## 6. How the system decides what is important - AI ANALYSIS
Every possible problem gets a simple risk score from 0 to 100. The score helps the team decide what to review
first. It does not replace a person making the final decision.

How we use AI
• Read text and identify brands, titles, scam language, and content-related words.
• Read text inside images and videos, and compare logos or images with official assets.
• Turn audio in reels or videos into text where possible.
• Check links, redirects, lookalike domains, and the words on a web page.
• Always show the reason for a score. An analyst must be able to see the matching text, image, link, or rule.

## 7. From finding to removal
What proof a case should contain
Score part Simple question it answers
Match strength How closely does this account, post, or website match the brand or

protected title?

Chance it is harmful Do the words, links, images, or video look like piracy, a scam, a

fake account, or a fake product?

Possible impact Could many people see it? Is it linked to a new release, money loss,

or a high-risk customer journey?

Repeat or network risk Has this account, domain, payment detail, or link appeared in

earlier cases?

Quality of proof Do we have a working link, capture time, screenshot, and enough

detail to take action?

Proof item What to save
The source Platform, direct link, source ID when available, and when Darkmap

saw it.

The content Relevant text, screenshots, images, video frames, transcript, or link

preview.

Why it matters Brand or title matched, type of problem, territory or rights details,

and analyst explanation.

Proof it has not changed Capture time, hash where useful, saved copy, and collection

method.

Action history Who reviewed it, who approved it, where the report was sent,

replies, and final result.

Removal request status

For the first release, people should prepare and approve removals. Darkmap can make the proof packet and track
the work. Direct reporting integrations can be added later where the platform supports them.

How we link activity across platforms
Darkmap should connect items only when there is a clear reason. For example, an Instagram profile may link to a
website; that website may promote a Telegram channel; and the same payment detail may appear on another page.
The product should show the connection and the reason for it. It must never claim that two accounts belong to the
same real person without strong evidence and a human review.
Status Meaning
Draft The team is collecting proof and preparing the request.
Waiting for approval A manager or legal reviewer needs to approve it.
Submitted The request has been sent or a manual filing has been recorded.
In review The platform, host, or internal team is looking at it.
Removed check needed The platform says it acted, or the link is no longer working.

Darkmap must check.

Closed The result has been checked and recorded.

Possible link Example
Same link or domain A Reddit post, Instagram bio, and Telegram message all share the

same site.

Same public contact or payment detail Two fake support accounts use the same public number or payment

address.

Same media or logo Two posts use the same video, image, or copied logo.
Direct platform link A post forwards a message, replies to it, tags an account, or sends

users to another channel.

## 8. Customer workflow

## 9. First release and later releases

What to build first
• Start with public and reliable platforms.Real-time search dashboard
• For each new platform, first collect the account, public content, links, and visible connections.
• Keep people in control of reports and removals until the workflow is proven.
Step What the customer does What Darkmap does
1 Add the brand or content

Add official names, accounts, websites,
logos, titles, release dates, territories, and
common variations.

Creates a watchlist.

2 Choose monitoring Select the platforms and the types of risk to

watch for.

Starts checking supported sources based on
the watchlist.

3 Receive findings Open the review queue. Shows new findings with source, reason,
risk level, and similar activity.

4 Investigate

Check the post, account, link, and related
activity; add a note or mark it as not
relevant.

Keeps a full history and shows connected
items.

5 Open a case Group related findings and choose an

owner, priority, and deadline. Creates one place for evidence and actions.

6 Ask for removal Prepare, approve, and submit the report; or

record a manual report. Stores the request and sends reminders.

7 Check result Recheck the link, post, or account after

action.

Records whether it is removed, still live, or
has moved elsewhere.

8 Review results Look at reports and repeat risks. Shows response time, removals, common
sources, and repeat networks.

Stage What we should build

First release

Real-time search dashboard, source monitoring - Instagram,
Facebook, reddit. Website, Ai analysis, simple scoring, basic image/
text/link checks, cases, evidence export, manual takedown tracking,
and report generation.

Next release

Monitoring framework (monitors 24/7), Better logo and
video checks, more language support, automatic rechecks, stronger
duplicate grouping, network view

Later release

Watermark or fingerprint partners, stronger network patterns,
approved automated submissions, and more source coverage where
allowed.

• Measure how many alerts are real problems and how long it takes to close them before adding more
automation.
## 10. Product rules we must follow

## 11. Main records we need to store
Rule What it means for the product
Show fresh & latest information Show when each source was last checked and flag when monitoring

is delayed.

Keep a full history Record what Darkmap found, why it scored it, who changed it, and

what action was taken.

Protect customer data Keep data secure, collect only what is needed, and follow the

customer retention policy.

Explain the result Never show a score or relationship without a clear reason.

Record What it is
Brand or content watchlist Names, titles, official accounts, websites, logos, rights, territories,

and keywords to protect.

Monitoring rule What to check, where to check it, and how important it is.
Source item A post, account, comment, channel, page, website, or link found on

a platform.

Linked item A connection between accounts, posts, domains, links, or other

items, plus the reason for the connection.
Alert A possible problem that needs review.
Evidence Saved proof from the source.
Case A group of related alerts and proof owned by a team member.
Removal request The record of the report, response, and verification.
History record A permanent log of system and user actions.

## 12. How we will know it is working

Before we launch
• Document what data we can collect from every platform and how often it will be updated.
• Test the full workflow with one impersonation example and one fake account example.
• Set up a simple dashboard for alert quality, response time, source health, and removals.

Key decisions to make now - Business
Measure What it tells us
Useful alert rate How many reviewed alerts were real problems.
Time to review How quickly the team looks at a new finding.
Time to action How quickly a real alert becomes a submitted request for removal
Removal rate How many submitted requests are confirmed as removed.
Repeat risk rate How often known networks come back or move to a new place.
Source health Whether each platform is being checked on time.

Decision Suggested starting point
First customers Start with OTT/media and consumer brands, then expand to

financial services.

What we promise Use clear platform coverage and freshness labels instead of

promising real-time everywhere.

How much we automate Automate finding, grouping, proof collection, and rechecks first.

Keep final removal submission human approved.

How long we keep evidence Let each customer set a retention period and support legal hold

when needed.

When we say items are connected Show possible connections separately until there
