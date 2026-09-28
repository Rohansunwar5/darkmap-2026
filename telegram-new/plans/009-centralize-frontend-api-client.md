# Plan 009: Centralize the frontend API client & token handling

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm the token is still read via `localStorage.getItem('accessToken')`
> across many files (the premise). Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches every API call site; a missed site means an unauthenticated request.
  Mechanical but broad. Best done after 008 (XSS) so the token is less exposed meanwhile.
- **Depends on**: none (pairs with 008)
- **Category**: security / tech-debt / frontend
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

The JWT lives in `localStorage` and is hand-attached as a Bearer header in **~36 places** with
raw `axios`. There is no shared client/interceptor. Two costs: (1) any XSS exfiltrates the token
instantly; (2) the storage strategy is hard-coded across 36 sites, so moving to a safer scheme
(HttpOnly cookie) or adding refresh/401-handling is a 36-file change. Centralizing on one client
is the prerequisite for both improvements and removes a class of "forgot the header" bugs.

## Current state

- `Telegram-premium-2025/src/context/AuthContext.jsx:23,41` — `localStorage.getItem/setItem('accessToken')`.
- `Telegram-premium-2025/src/context/DecoyContext.jsx:7` — `Authorization: \`Bearer ${localStorage.getItem('accessToken')}\``.
- ~36 call sites read the token inline, e.g. `src/components/Hero.jsx:35`, `src/components/AI/AiContainer.jsx:65`,
  `src/components/Navbar.jsx:39`, `src/pages/Bookmarks.jsx:33`, `src/hooks/useNotifications.jsx:7`.
  Find them all: `grep -rn "localStorage.getItem('accessToken')" src`.
- No `axios.create()` / interceptor anywhere (`grep -rn "axios.create\|interceptors" src` → empty).
- Base URL comes from `import.meta.env.VITE_API_BASE_URL`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Find call sites | `cd Telegram-premium-2025 && grep -rn "localStorage.getItem('accessToken')" src` | the working list |
| Lint | `cd Telegram-premium-2025 && npm run lint` | exit 0, 0 warnings |
| Build | `cd Telegram-premium-2025 && npm run build` | exit 0 |

## Scope
**In scope:**
- `src/lib/apiClient.js` (create — the shared axios instance + interceptors)
- All files that currently build an axios call with a manual Authorization header (migrate them)

**Out of scope:**
- The backend cookie change (HttpOnly migration) — that's a larger, separate effort; this plan
  centralizes so that change becomes a one-file edit later. Document that as a follow-up.
- Changing what endpoints are called or their payloads.

## Steps

### Step 1: create the shared client
Create `src/lib/apiClient.js`:
```js
import axios from 'axios';
const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');   // single source of truth (swap for cookie later)
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('accessToken');
      // optional: redirect to login
    }
    return Promise.reject(err);
  }
);
export default apiClient;
```
**Verify**: `npm run lint` → 0 warnings.

### Step 2: migrate call sites in batches
For each file from the grep, replace `axios.get/post/...(url, { headers: { Authorization: ... }})`
with `apiClient.get/post/...(path, ...)` (drop the manual header; use the path relative to baseURL
or keep the full URL — both work). Do it in small batches and re-run lint/build between batches.
**Verify (per batch)**: `npm run build` → exit 0.

### Step 3: route auth context through the client
Update `AuthContext.jsx` and `DecoyContext.jsx` to use `apiClient`. The `login`/`verifyToken`
calls still `setItem`/`removeItem` the token (that's the one place storage is written).
**Verify**: `grep -rn "localStorage.getItem('accessToken')" src` → ideally only `apiClient.js`
(and the auth context write sites) remain; no raw `axios` + manual header pairs left.

## Test plan
(Uses Plan 006 harness.) `src/lib/__tests__/apiClient.test.js`:
- the request interceptor attaches `Authorization` when a token exists, and omits it when absent.
- a 401 response clears the stored token.
Verify: `npm test -- apiClient` → pass.

## Done criteria
- [ ] `src/lib/apiClient.js` exists with request + 401 interceptors.
- [ ] No component attaches the Bearer header manually (`grep -rn "Bearer \${localStorage" src` → no matches).
- [ ] `npm run lint` (0 warnings) and `npm run build` exit 0; apiClient test passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- A call site uses a *different* token key or a second auth scheme → STOP and report (don't assume one scheme).
- More than ~40 call sites or non-axios fetches appear → still migrate, but report the actual count.

## Maintenance notes
- Moving to HttpOnly cookies later = change only `apiClient.js` (drop the header, add `withCredentials: true`) plus the backend `Set-Cookie`. That's the payoff of this plan.
- Reviewer: confirm no `import axios` remains in components for authed calls.
