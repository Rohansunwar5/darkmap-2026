# Notification System — Design Spec

**Date:** 2026-06-05
**Status:** Approved; partially implemented (backend emit path landed — see §10 Status)
**Scope:** Add a full notification system on top of the existing Socket.IO real-time pipeline in `telegram premium-server` (backend) and `Telegram-premium-2025` (React frontend).

> **Revision 2026-06-05:** Updated §5.4/§5.6 to reflect the in-memory `sessionId → userId` map used in the polling loop (an improvement over the originally-specced per-message DB lookup), locked the socket event name, and added §10 Implementation Status.

---

## 1. Goal

The product owner wants users to be visibly notified of activity on their decoy sessions — new messages and related events — so the dashboard feels alive and app-like even though it runs entirely on the web.

The raw real-time signal already exists: Telegram messages are polled in the decoy loop and emitted as `decoy:message` socket events to per-session rooms, with an `unseenCount` tracked server-side. This project surfaces that signal as a **proper notification layer**: a persisted feed, a bell with an unread badge, in-app toasts, and OS desktop notifications.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Reach | In-app (toasts + bell + badges) **plus** OS desktop notifications via the `Notification` API while the tab is open or backgrounded. **No** Service Worker / Web Push (site-closed delivery) in this phase. |
| Triggers | New incoming Telegram message; session status change; AI/objective events. System/account alerts are **out of scope**. |
| Persistence | Persisted feed in MongoDB with read/unread state; history survives reloads and is visible across devices. |
| Delivery scope | A per-user socket room `user:<userId>`, joined automatically on connect, so the bell works globally regardless of which session is open. |
| Retention | Cap at **latest 50 notifications per user** (trim on insert). No time-based TTL. |

## 3. Architecture

The notification layer is **additive and decoupled** from the existing live-chat flow. The existing `decoy:message` emit to the session room stays untouched — it still drives the live chat panel. Notifications are a parallel signal.

```
decoyBot.service (event occurs)
  → notificationService.create(userId, { type, title, body, sessionId })
      → persist to Notification collection (unread)  +  trim to latest 50
      → emitToUser(userId, 'notification:new', payload)
          → client (useNotifications) → feed + badge + toast + OS notification
```

`notificationService.create` is the single choke point. Every notify-worthy event calls it. It both persists and emits.

**Socket event name:** the canonical event is **`notification:new`**. The first implementation pass shipped `decoy:notification`; this must be renamed to `notification:new` so the frontend `useNotifications` hook and the backend agree on one name.

## 4. Data model

New collection `notifications` (`models/notification.model.ts`), following existing mongoose conventions:

```ts
{
  userId:    ObjectId (ref 'User', required, indexed)   // owner
  type:      'message' | 'status' | 'objective'
  title:     string (required)                          // e.g. "New message from Alex"
  body:      string (required)                          // short preview / status reason
  sessionId: ObjectId (ref 'DecoySession', default null) // deep-link target
  read:      boolean (default false)
  createdAt / updatedAt                                  // { timestamps: true }
}
```

Indexes:
- `{ userId: 1, read: 1 }` — unread-count query
- `{ userId: 1, createdAt: -1 }` — feed listing

Body rules:
- Short preview, not full content (full message already lives in the session).
- Media-only messages → `body` like `"📷 Photo"`, `"🎥 Video"`, etc.
- Truncate text previews (e.g. 120 chars).

## 5. Backend components

### 5.1 `models/notification.model.ts` *(new)*
The schema above, plus exported `INotification` interface.

### 5.2 `repository/notification.repository.ts` *(new)*
Data access only:
- `create(doc)` — insert, then trim to latest 50 for that user (delete older).
- `listForUser(userId, limit = 50)` — newest first.
- `unreadCount(userId)`.
- `markRead(userId, ids: string[])` — only the caller's rows.
- `markAllRead(userId)`.

### 5.3 `services/notification.service.ts` *(new)*
The choke point:
- `create(userId, { type, title, body, sessionId? })` → persist via repo, then `emitToUser(userId, 'notification:new', payload)`. Wrapped so a failure is logged and swallowed (never throws to caller).
- `list(userId)`, `unreadCount(userId)`, `markRead(userId, ids)`, `markAllRead(userId)` → thin pass-throughs for the controller.

### 5.4 `socket/index.ts` + `socket/emitter.ts` *(changed — landed)*
- In `onConnection`, auto-join `user:<_id>` using `socket.data.user._id` (from JWT — never client-supplied). ✅ landed.
- Add `emitToUser(userId, event, payload)` alongside the existing `emitToSession`, in **both** files (worker `index.ts` and master `emitter.ts`), mirroring the existing dual direct + Redis delivery path. ✅ landed.

> **Multi-process note:** `emitToUser` fans out via the Redis emitter so any worker holding the client socket delivers the event. The session→user resolution (§5.6), however, lives in-process. This is correct **only because the decoy polling loop runs in the master process** (see `emitter.ts` header: "Phase 2 — decoy bot polling loop runs in master"). If polling ever moves to a worker, the in-memory map (§5.6) must move with it or be replaced by a shared lookup.

### 5.5 `controllers/notification.controller.ts` + `routes/notification.route.ts` *(new)*
REST for the initial feed (sockets only deliver live ones):
- `GET /v1/notifications` → `{ notifications, unreadCount }`.
- `PATCH /v1/notifications/read` → body `{ ids?: string[], all?: boolean }`; marks read.

Behind existing `require-auth` middleware; mounted in `routes/v1.route.ts`.

### 5.6 Resolving `userId` in the polling loop + call sites

**Session → user resolution (in-memory map — landed):** The decoy polling loop is a hot path, so rather than a per-message DB lookup we cache `sessionId → userId` in an in-memory `sessionUsers` Map on `DecoyBotService`, alongside the existing `sessionAccounts` map:
- **Populate** in `startSession` (`this.sessionUsers.set(sessionId, session.userId.toString())`). ✅ landed.
- **Evict** in the stop/cleanup path (`this.sessionUsers.delete(sessionId)`). ✅ landed.
- **Read** at the notify call site (`this.sessionUsers.get(sessionId)`); skip notifying if absent (logged).

> **Correctness requirements for the map (must hold):**
> 1. **Resume-on-restart must repopulate the map.** The session-resume path on server start must route through `startSession` (or otherwise call `sessionUsers.set`). Otherwise resumed sessions emit no notification until next touched. **Verify this path.**
> 2. **Polling stays in the map-holding process** (see §5.4 multi-process note).

**Call sites (edits to existing business logic):** Each already has `sessionId` in scope; resolve `userId` via the map above:
- New target message → `decoyBot.service.ts` (~L461, after `incrementUnseenCount`) → `type:'message'`. ✅ emit landed (currently emit-only; persistence via §5.3 still TODO).
- Status change → `decoyBot.service.ts` (~L270, `setStatus`) → `type:'status'`. ❌ TODO.
- Objective met → wherever `decoy:objective` is emitted → `type:'objective'`. ❌ TODO.

Each call site wraps `notificationService.create(...)` so it cannot break the core flow.

> **Badge-count drift:** the landed emit sends a computed `unseenCount = (snapshot.unseenCount ?? 0) + targetMessages.length` over the socket, while a page reload reads the authoritative DB value. These must not diverge across poll cycles. Preferred fix: emit only *after* `incrementUnseenCount` and send the value the DB now holds (or re-read it), so socket and reload always agree.

## 6. Frontend components

Template: `hooks/useDecoySocket.jsx`.

### 6.1 `hooks/useNotifications.jsx` *(new)*
The brain. On mount:
- `GET /v1/notifications` for initial feed + unread count.
- One always-on socket (separate from per-session sockets), joins the user room (server-side), listens for `notification:new`.
- On live notification: prepend to feed, bump unread, fire toast, fire OS `Notification` (only when tab is blurred + permission granted).
- On reconnect: re-fetch feed so nothing is missed during a gap.
- Exposes `{ notifications, unreadCount, markAllRead, requestPermission }`.

### 6.2 `components/NotificationBell.jsx` *(new)*
In `Navbar.jsx`:
- Bell icon + unread badge.
- Dropdown feed (last 50): title, body, relative time; unread highlighted.
- Click item → navigate to its `sessionId`, mark read.
- "Mark all read"; opening the dropdown marks all read.

### 6.3 OS desktop notifications
- Subtle one-time prompt to enable; calls `Notification.requestPermission()`.
- Fire `new Notification(title, { body })` only when tab is **blurred** + permission granted. Click focuses tab + deep-links.
- Denied/dismissed/unsupported → silent fallback to in-app only; never re-nag (store the decision).

## 7. Error handling

Guiding rule: **notifications must never break the core flow.**

- `notificationService.create` failures are logged and swallowed at every call site.
- `emitToUser` with no connected client no-ops into Redis (like `emitToSession`); the persisted row is the safety net (seen on next load via REST).
- Trim-to-50 failure is non-fatal; logged.
- Frontend socket drop → Socket.IO auto-reconnect, then re-fetch feed.
- OS permission denied/unsupported → silent in-app fallback.
- Auth: user room derived from JWT `_id` server-side; a client cannot subscribe to another user's notifications, nor read/mutate others' rows.

## 8. Testing

- **Backend unit:** `notification.repository` (create + trim-to-50 keeps newest; mark-read; unread-count) and `notification.service` (create persists then emits; emit failure swallowed + logged). Mock the socket emitter.
- **Backend integration:** REST endpoints with auth — list returns only the caller's rows; mark-read flips state; another user cannot read/mutate.
- **Manual / e2e smoke:** trigger a real target message; confirm row persisted, `notification:new` received, badge increments, toast shows, OS notification fires when tab blurred, click deep-links and marks read. Handed to the user for personal verification before being considered done.

## 9. Out of scope (YAGNI)

- Web Push / Service Worker (notifications when the site is fully closed).
- System/account alerts (low credits, account logout, payments).
- Email/SMS notification channels.
- Per-type user preferences / mute settings.

## 10. Implementation status (as of 2026-06-05)

### Landed ✅
- Per-user socket room `user:<_id>`, auto-joined on connect from JWT (`socket/index.ts`).
- `emitToUser(userId, event, payload)` with dual direct + Redis path (`socket/emitter.ts`).
- In-memory `sessionUsers` (`sessionId → userId`) map populated/evicted in `startSession`/cleanup (`decoyBot.service.ts`).
- New-message emit to the user room (`decoyBot.service.ts` ~L461), carrying `{ sessionId, unseenCount, lastMessage, timestamp }`.
- `unseenCount` added to the polling snapshot projection (`decoySession.repository.ts`).

### Remaining ❌
- **Persistence layer** — `models/notification.model.ts`, `repository/notification.repository.ts` (incl. trim-to-50), `services/notification.service.ts`. Current emit is **emit-only**, so no feed / no unread-after-reload / no cross-device.
- **REST API** — `GET /v1/notifications`, `PATCH /v1/notifications/read` + controller + route mount.
- **`status` and `objective` triggers** — only `message` is wired.
- **Frontend** — `hooks/useNotifications.jsx`, `components/NotificationBell.jsx`, navbar integration, toast, OS desktop `Notification`.
- **Event-name rename** — `decoy:notification` → `notification:new`.

### To verify ⚠️
- Resume-on-restart path repopulates `sessionUsers` (else resumed sessions go silent).
- Decoy polling runs only in the master process that holds the map.
- Badge-count drift between socket-emitted `unseenCount` and DB value on reload (§5.6).
