# Plan 008: Eliminate frontend XSS in scraped-content rendering

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open each file in "Current state" and confirm the highlight +
> `dangerouslySetInnerHTML` blocks match. Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED — changes how results render in 4 components; the highlight output must
  remain visually equivalent. No data-shape change.
- **Depends on**: none (008 should land before 021, which dedupes the helper)
- **Category**: security / frontend
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

Four result components build a raw HTML string from **attacker-controlled scraped content**
(dark-web/breach-forum/Telegram scrape output) and inject it via `dangerouslySetInnerHTML`, with
no escaping. The search query is also interpolated into `new RegExp((${query}))` (regex
injection + ReDoS). Any `<script>` / `<img onerror>` in scraped data executes in the analyst's
browser; combined with the JWT living in `localStorage` (Plan 009), that's one-shot session
theft. The fix: never inject HTML — highlight by splitting text and rendering React elements,
which escape automatically.

## Current state — identical vulnerable pattern in 4 files

- `Telegram-premium-2025/src/components/MessageBox/BreachForumsBox.jsx:31-57` (`highlightQueryInText`),
  rendered at `:136-141` via `dangerouslySetInnerHTML={{ __html: highlightQueryInText(contentPart, searchQuery) }}`.
- `.../DarwebForumsBox.jsx:17-39` + `:132-133`.
- `.../RansomewareBox.jsx:5-27` + `:106-107` (`__html: highlightQueryInText(item.description, searchQuery)`).
- `.../TelegramBox.jsx:61-83` + `:172-173` (`__html: highlightQueryInText(message.text, searchQuery)`).

The shared core (all four):
```js
const highlightedText = truncatedText.replace(
  new RegExp(`(${query})`, "gi"),
  `<span style="background-color: #00316B;">$1</span>`
);
return highlightedText;   // raw HTML string
```

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Lint | `cd Telegram-premium-2025 && npm run lint` | exit 0, 0 warnings |
| Build | `cd Telegram-premium-2025 && npm run build` | exit 0 |
| Confirm no innerHTML left | `cd Telegram-premium-2025 && grep -rn "dangerouslySetInnerHTML" src/components/MessageBox` | no matches |

## Scope
**In scope:**
- `Telegram-premium-2025/src/utils/highlight.jsx` (create — safe highlighter returning React nodes)
- The 4 MessageBox components (replace `dangerouslySetInnerHTML` with the safe component, remove their local `highlightQueryInText`)

**Out of scope:**
- The data-fetching / API URLs in these components (separate concern; note: encoding the query
  in the fetch URL is a follow-up, not this plan).
- The IOC components and the broader de-dup — that's Plan 021 (which builds on this safe helper).

## Steps

### Step 1: create a safe highlight helper
Create `src/utils/highlight.jsx`:
```jsx
import React from 'react';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Returns an array of React nodes; matches are wrapped in a highlight <span>.
// React escapes all text, so no HTML injection is possible.
export function HighlightedText({ text, query }) {
  if (!text) return 'No content available';
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={i} style={{ backgroundColor: '#00316B' }}>{part}</span>
      : part
  );
}
```
Preserve any truncation behavior the originals had (the "first 20 words / 10 words around the
match" logic) by truncating the **plain string** before passing it to `HighlightedText`.
**Verify**: file created; `npm run lint` → 0 warnings.

### Step 2: replace usage in all 4 components
In each MessageBox file, delete the local `highlightQueryInText` and replace the
`dangerouslySetInnerHTML` `<div>` with the same `<div>` rendering `<HighlightedText text={...} query={searchQuery} />`. Keep the existing truncation as a plain-string step feeding `text`.
**Verify (per file)**: that file no longer contains `dangerouslySetInnerHTML` or `new RegExp`.

### Step 3: confirm the vuln is gone repo-wide in MessageBox
**Verify**: `grep -rn "dangerouslySetInnerHTML\|new RegExp(\`(\${" src/components/MessageBox` → no matches. `npm run build` → exit 0.

## Test plan
(Uses Plan 006's frontend harness.) Create `src/utils/__tests__/highlight.test.jsx`:
- rendering `<HighlightedText text="<img src=x onerror=alert(1)>" query="img" />` produces **text
  content** containing the literal string and **no** `<img>` element (assert via Testing Library
  `container.querySelector('img')` is null).
- a normal match wraps the matched substring in a `<span>` with the highlight style.
- regex-special query like `a+` is treated literally (no throw, no over-match).
Verify: `npm test -- highlight` → all pass.

## Done criteria
- [ ] No `dangerouslySetInnerHTML` anywhere under `src/components/MessageBox`.
- [ ] Scraped content with embedded HTML renders as inert text (verified by the highlight test).
- [ ] Search query is escaped before any regex use.
- [ ] `npm run lint` (0 warnings) and `npm run build` exit 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- A MessageBox file's highlight/render block doesn't match the excerpt → STOP.
- A component relies on the HTML string for something beyond highlighting (e.g. injecting links) → STOP and report; don't silently drop behavior.

## Maintenance notes
- This is the canonical safe highlighter. Plan 021 will make the 4 components share it (and the
  IOC components), removing the remaining duplication.
- Reviewer: grep the whole frontend for other `dangerouslySetInnerHTML` uses (there are 4 today,
  all in MessageBox) and confirm none reappear.
