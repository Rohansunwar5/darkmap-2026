# Decoy Chatbot Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three improvements to the AI Decoy Chatbot — prompt restructure, media bug fix, and human-replication enhancements — in three independent phases.

**Architecture:** Phase 1 adds a hardcoded BASE_PROMPT assembled server-side so the user only supplies target context. Phase 2 fixes media display by detecting actual MIME types and adding per-kind frontend renderers. Phase 3 adds read receipts, time-of-day delays, typo+edit, ghost follow-up, style mirroring, and online presence to make the bot harder to detect.

**Tech Stack:** Node.js / TypeScript, GramJS, OpenAI API (gpt-4o-mini / gpt-4o), MongoDB/Mongoose, AWS S3, React/JSX, Tailwind CSS, Socket.IO

---

## PHASE 1 — Prompt Restructure

### Task 1.1: Add BASE_PROMPT and buildSystemPrompt to decoyAI.service.ts

**Files:**
- Modify: `telegram premium-server/src/services/decoyAI.service.ts`

- [ ] **Step 1.1.1 — Add BASE_PROMPT constant and buildSystemPrompt function above the class**

  Open `telegram premium-server/src/services/decoyAI.service.ts`.

  After the existing `STYLE_ADDENDUM` constant (line 21), add:

  ```ts
  export const BASE_PROMPT = `Act as an undercover cybercrime investigator posing as a wealthy anonymous buyer on encrypted forums. Your objective is to engage a hacker who claims to possess stolen corporate database information. Stay fully in character as a cautious but interested buyer. Use realistic conversational psychology: skepticism, curiosity, negotiation, trust-building, and subtle pressure.

  The investigator should:
  * Gradually build rapport without revealing law enforcement intentions.
  * Ask for non-sensitive "proof of access" such as blurred screenshots, timestamps, partial schema structures, or metadata.
  * Encourage the hacker to explain how current or exclusive the data is.
  * Act experienced in underground deals and suspicious of scams.
  * Push the hacker to provide more verifiable evidence voluntarily.
  * Attempt to make the hacker share operational details such as communication methods, crypto wallet/payment methods, escrow preferences, or delivery process.
  * Keep the tone realistic, tense, intelligent, and cinematic — like a cybercrime thriller.
  * Avoid glorifying hacking or giving actual technical intrusion instructions.
  * The conversation should feel authentic and psychologically strategic, with the investigator subtly steering the hacker into exposing themselves.

  Respond only as the undercover investigator during the roleplay.`;

  export function buildSystemPrompt(targetContext: string): string {
    const ctx = targetContext.trim();
    if (!ctx) return BASE_PROMPT;
    return `${BASE_PROMPT}\n\n--- TARGET CONTEXT ---\n${ctx}\n--- END CONTEXT ---`;
  }
  ```

- [ ] **Step 1.1.2 — Verify the file compiles**

  Run from `telegram premium-server/`:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 1.1.3 — Commit**

  ```bash
  git add "telegram premium-server/src/services/decoyAI.service.ts"
  git commit -m "feat(decoy): add BASE_PROMPT and buildSystemPrompt"
  ```

---

### Task 1.2: Add targetContext field to decoySession model

**Files:**
- Modify: `telegram premium-server/src/models/decoySession.model.ts`

- [ ] **Step 1.2.1 — Add targetContext to the Mongoose schema**

  In `decoySessionSchema`, after `systemPrompt`:

  ```ts
  targetContext: {
    type: String,
    default: '',
  },
  ```

- [ ] **Step 1.2.2 — Add targetContext to the IDecoySession interface**

  In `IDecoySession`, after `systemPrompt: string;`:

  ```ts
  targetContext: string;
  ```

- [ ] **Step 1.2.3 — Verify compile**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 1.2.4 — Commit**

  ```bash
  git add "telegram premium-server/src/models/decoySession.model.ts"
  git commit -m "feat(decoy): add targetContext to session schema"
  ```

---

### Task 1.3: Update repository ICreateDecoySessionParams

**Files:**
- Modify: `telegram premium-server/src/repository/decoySession.repository.ts`

- [ ] **Step 1.3.1 — Add targetContext to the create params interface**

  In `ICreateDecoySessionParams`, after `systemPrompt: string;`:

  ```ts
  targetContext?: string;
  ```

- [ ] **Step 1.3.2 — Verify compile**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 1.3.3 — Commit**

  ```bash
  git add "telegram premium-server/src/repository/decoySession.repository.ts"
  git commit -m "feat(decoy): pass targetContext through repository create"
  ```

---

### Task 1.4: Update controller to accept targetContext and assemble prompt

**Files:**
- Modify: `telegram premium-server/src/controllers/decoyBot.controller.ts`

- [ ] **Step 1.4.1 — Import buildSystemPrompt**

  At the top of the file, add:

  ```ts
  import { buildSystemPrompt } from '../services/decoyAI.service';
  ```

- [ ] **Step 1.4.2 — Update createSession to accept targetContext**

  Replace the destructure line:
  ```ts
  const { targetIdentifier, systemPrompt, targetName } = req.body;
  ```
  with:
  ```ts
  const { targetIdentifier, targetContext, targetName } = req.body;
  if (!targetContext || !targetContext.trim()) {
    throw new BadRequestError('targetContext is required');
  }
  const systemPrompt = buildSystemPrompt(targetContext.trim());
  ```

- [ ] **Step 1.4.3 — Pass targetContext to sessionRepo.create**

  In the `sessionRepo.create({...})` call, add:
  ```ts
  targetContext: targetContext.trim(),
  ```

- [ ] **Step 1.4.4 — Verify compile**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 1.4.5 — Commit**

  ```bash
  git add "telegram premium-server/src/controllers/decoyBot.controller.ts"
  git commit -m "feat(decoy): controller assembles systemPrompt from targetContext"
  ```

---

### Task 1.5: Update DecoyContext.jsx — rename field

**Files:**
- Modify: `Telegram-premium-2025/src/context/DecoyContext.jsx`

- [ ] **Step 1.5.1 — Rename systemPrompt to targetContext in createSession**

  Replace:
  ```js
  const createSession = useCallback(async ({ targetIdentifier, systemPrompt, targetName }) => {
    const res = await axios.post(BASE, { targetIdentifier, systemPrompt, targetName }, { headers: authHeader() });
  ```
  with:
  ```js
  const createSession = useCallback(async ({ targetIdentifier, targetContext, targetName }) => {
    const res = await axios.post(BASE, { targetIdentifier, targetContext, targetName }, { headers: authHeader() });
  ```

- [ ] **Step 1.5.2 — Commit**

  ```bash
  git add Telegram-premium-2025/src/context/DecoyContext.jsx
  git commit -m "feat(decoy): createSession sends targetContext instead of systemPrompt"
  ```

---

### Task 1.6: Update DecoyPage.jsx — replace form field

**Files:**
- Modify: `Telegram-premium-2025/src/pages/decoy/DecoyPage.jsx`

- [ ] **Step 1.6.1 — Update CreateSessionModal form state and validation**

  Replace the `useState` initialiser in `CreateSessionModal`:
  ```js
  const [form, setForm] = useState({ targetIdentifier: '', systemPrompt: '', targetName: '' });
  ```
  with:
  ```js
  const [form, setForm] = useState({ targetIdentifier: '', targetContext: '', targetName: '' });
  const [showPersona, setShowPersona] = useState(false);
  ```

- [ ] **Step 1.6.2 — Update handleSubmit validation**

  Replace:
  ```js
  if (!form.targetIdentifier.trim() || !form.systemPrompt.trim()) return;
  ```
  with:
  ```js
  if (!form.targetIdentifier.trim() || !form.targetContext.trim()) return;
  ```

  And in `onCreate(form)` — no change needed (the whole form object is spread).

- [ ] **Step 1.6.3 — Replace the systemPrompt textarea with targetContext textarea**

  Remove the existing `<div>` containing the "System Prompt *" label and textarea. Replace with:

  ```jsx
  {/* Collapsible base persona reveal */}
  <div>
    <button
      type="button"
      onClick={() => setShowPersona((v) => !v)}
      className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
    >
      {showPersona ? 'Hide base persona ▲' : 'Show base persona ▼'}
    </button>
    {showPersona && (
      <pre className="mt-2 text-xs text-gray-500 bg-gray-900 rounded-lg p-3 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto border border-gray-800">
        {`Act as an undercover cybercrime investigator posing as a wealthy anonymous buyer on encrypted forums...`}
      </pre>
    )}
  </div>

  {/* Target context input */}
  <div>
    <label className="block text-xs text-gray-400 mb-1">
      Target Context * <span className="text-gray-600">(max 1000 chars)</span>
    </label>
    <textarea
      value={form.targetContext}
      onChange={(e) => setForm((f) => ({ ...f, targetContext: e.target.value }))}
      placeholder={`Who is this target? What are you trying to get them to reveal?\n\nExample: "Target goes by 'ph4nt0m'. Claims to have Fortune 500 employee records from a March breach. Focus on getting proof screenshots and their preferred payment method."`}
      rows={5}
      maxLength={1000}
      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
      required
    />
    <div className="text-right text-xs text-gray-600 mt-1">{form.targetContext.length}/1000</div>
  </div>
  ```

- [ ] **Step 1.6.4 — Verify the frontend builds**

  From `Telegram-premium-2025/`:
  ```bash
  npm run build
  ```
  Expected: build completes with no errors.

- [ ] **Step 1.6.5 — Manual smoke test**

  Start the dev server (`npm run dev`). Open the Decoy Sessions page. Click "New Session". Verify:
  - The old "System Prompt" field is gone.
  - "Show base persona" toggle reveals the hardcoded prompt text.
  - "Target Context" textarea is required and has a character counter.
  - Submitting the form creates a session (check Network tab — request body should contain `targetContext`, not `systemPrompt`).
  - In MongoDB, the session document has both `targetContext` (user's text) and `systemPrompt` (assembled full prompt).

- [ ] **Step 1.6.6 — Commit**

  ```bash
  git add Telegram-premium-2025/src/pages/decoy/DecoyPage.jsx
  git commit -m "feat(decoy): replace systemPrompt field with targetContext in session form"
  ```

---

## PHASE 2 — Media Bug Fix

### Task 2.1: Add mediaKind + mediaMime to message schema

**Files:**
- Modify: `telegram premium-server/src/models/decoySession.model.ts`

- [ ] **Step 2.1.1 — Export MediaKind type**

  Before `messageSchema`, add:

  ```ts
  export type MediaKind = 'photo' | 'video' | 'audio' | 'sticker' | 'gif' | 'document' | 'unknown';
  ```

- [ ] **Step 2.1.2 — Add fields to messageSchema**

  Inside `messageSchema`, after `mediaUrl`:

  ```ts
  mediaKind: {
    type: String,
    default: null,
  },
  mediaMime: {
    type: String,
    default: null,
  },
  ```

- [ ] **Step 2.1.3 — Add fields to IDecoyMessage interface**

  ```ts
  export interface IDecoyMessage {
    role: 'ai' | 'target' | 'manual';
    content: string;
    mediaUrl?: string | null;
    mediaKind?: MediaKind | null;
    mediaMime?: string | null;
    timestamp: Date;
  }
  ```

- [ ] **Step 2.1.4 — Verify compile**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 2.1.5 — Commit**

  ```bash
  git add "telegram premium-server/src/models/decoySession.model.ts"
  git commit -m "feat(decoy): add mediaKind and mediaMime to message schema"
  ```

---

### Task 2.2: Add inferMedia helper and update _poll media loop

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 2.2.1 — Import MediaKind from the model**

  Update the import at the top:

  ```ts
  import { IDecoyMessage, MediaKind } from '../models/decoySession.model';
  ```

- [ ] **Step 2.2.2 — Add inferMedia helper function (outside the class)**

  After the `burstGap` function definition (around line 25), add:

  ```ts
  interface MediaInfo {
    mime: string;
    ext: string;
    kind: MediaKind;
  }

  function inferMedia(m: any): MediaInfo {
    const cls: string = m.media?.className ?? '';
    if (cls === 'MessageMediaPhoto') {
      return { mime: 'image/jpeg', ext: 'jpg', kind: 'photo' };
    }
    if (cls === 'MessageMediaDocument') {
      const mime: string = m.media?.document?.mimeType ?? 'application/octet-stream';
      const attrs: any[] = m.media?.document?.attributes ?? [];
      const isAnimated = attrs.some((a: any) => a.className === 'DocumentAttributeAnimated');

      if (mime === 'image/gif' || isAnimated) return { mime: 'image/gif', ext: 'gif', kind: 'gif' };
      if (mime === 'image/webp') return { mime: 'image/webp', ext: 'webp', kind: 'sticker' };
      if (mime.startsWith('video/')) {
        const sub = mime.split('/')[1] ?? 'mp4';
        const ext = sub === 'quicktime' ? 'mov' : sub;
        return { mime, ext, kind: 'video' };
      }
      if (mime.startsWith('audio/')) {
        const ext = mime.split('/')[1] ?? 'ogg';
        return { mime, ext, kind: 'audio' };
      }
      return { mime, ext: 'bin', kind: 'document' };
    }
    return { mime: 'application/octet-stream', ext: 'bin', kind: 'unknown' };
  }
  ```

- [ ] **Step 2.2.3 — Add pendingImageKinds Map to the class**

  In the class property block, after `private pendingImages`:

  ```ts
  private pendingImageKinds = new Map<string, MediaKind>();
  ```

- [ ] **Step 2.2.4 — Update the media download block in _poll**

  Replace the entire media download `for` loop in `_poll` (lines 289–305 in the original):

  ```ts
  const mediaBufMap = new Map<number, Buffer>();
  const mediaUrlMap = new Map<number, string>();
  const mediaKindMap = new Map<number, MediaKind>();
  const mediaMimeMap = new Map<number, string>();

  for (const m of incoming) {
    if (m.media) {
      try {
        const info = inferMedia(m);
        const buf = await (client as any).downloadMedia(m, {}) as Buffer | undefined;
        if (buf?.length) {
          mediaBufMap.set(m.id, buf);
          const s3Key = `decoy-media/${sessionId}/${m.id}.${info.ext}`;
          const url = await uploadBufferToS3(s3Key, buf, info.mime);
          mediaUrlMap.set(m.id, url);
          mediaKindMap.set(m.id, info.kind);
          mediaMimeMap.set(m.id, info.mime);
          logger.info(`[DecoyBot] media msg=${m.id} kind=${info.kind} mime=${info.mime} url=${url}`);
        }
      } catch (err: any) {
        logger.warn(`[DecoyBot] Media download failed msg=${m.id}: ${err.message}`);
      }
    }
  }
  ```

- [ ] **Step 2.2.5 — Update targetMessages to include mediaKind and mediaMime**

  Replace the `targetMessages` array construction:

  ```ts
  const targetMessages: IDecoyMessage[] = incoming.map((m: any) => ({
    role: 'target' as const,
    content: (typeof m.text === 'string' && m.text.trim()) ? m.text.trim() : '[Image]',
    mediaUrl: mediaUrlMap.get(m.id) ?? null,
    mediaKind: mediaKindMap.get(m.id) ?? null,
    mediaMime: mediaMimeMap.get(m.id) ?? null,
    timestamp: new Date((m.date as number) * 1000),
  }));
  ```

- [ ] **Step 2.2.6 — Update pendingImages to also track kind**

  Replace the `if (!this.pendingReplies.has(sessionId))` block's image capture:

  ```ts
  const firstImg = incoming.find((m: any) => mediaBufMap.has(m.id));
  if (firstImg) {
    this.pendingImages.set(sessionId, mediaBufMap.get(firstImg.id)!);
    this.pendingImageKinds.set(sessionId, mediaKindMap.get(firstImg.id) ?? 'photo');
  }
  ```

- [ ] **Step 2.2.7 — Clear pendingImageKinds in stopSession**

  In `stopSession`, after `this.pendingImages.delete(sessionId)`:

  ```ts
  this.pendingImageKinds.delete(sessionId);
  ```

- [ ] **Step 2.2.8 — Verify compile**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 2.2.9 — Commit**

  ```bash
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "feat(decoy): detect media MIME type, store kind on messages"
  ```

---

### Task 2.3: Update Vision API guard in _doReply

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 2.3.1 — Update _doReply to use imageKind and fix combinedInput**

  In `_doReply`, replace the image buffer retrieval and `combinedInput` build:

  ```ts
  const imageBuf = this.pendingImages.get(sessionId);
  const imageKind = this.pendingImageKinds.get(sessionId);
  this.pendingImages.delete(sessionId);
  this.pendingImageKinds.delete(sessionId);

  const combinedInput = pendingTarget
    .map((m) => {
      if (m.mediaUrl) {
        const k = m.mediaKind;
        if (k === 'video') return '[target sent a video]';
        if (k === 'audio') return '[target sent a voice message]';
        if (k === 'document') return '[target sent a file]';
        if (k === 'sticker') return '[target sent a sticker]';
        // photo, gif, or unknown — label for image-capable calls
        return m.content !== '[Image]' ? `${m.content} [image attached]` : '[Image]';
      }
      return m.content;
    })
    .filter(Boolean)
    .join('\n');

  if (!combinedInput) return;

  const stopTyping = this._startTypingLoop(client, entity);
  let parts: string[];
  try {
    const useVision = !!imageBuf && (imageKind === 'photo' || imageKind === 'gif' || !imageKind);
    if (useVision) {
      const caption = combinedInput !== '[Image]' ? combinedInput : undefined;
      parts = await this.decoyAI.generateReplyWithImage(
        snapshot.systemPrompt, history, imageBuf!.toString('base64'), caption
      );
    } else {
      parts = await this.decoyAI.generateReply(snapshot.systemPrompt, history, combinedInput);
    }
  } finally {
    stopTyping();
  }
  ```

- [ ] **Step 2.3.2 — Verify compile**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 2.3.3 — Commit**

  ```bash
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "fix(decoy): only call Vision API for photo/gif; describe other media types in text"
  ```

---

### Task 2.4: Fix S3 public read access

**Files:**
- No code change — AWS console / CLI step.

- [ ] **Step 2.4.1 — Apply bucket policy**

  In the AWS console (or via CLI), go to your S3 bucket (`telegram-channel-data` or whatever `S3_BUCKET_NAME` is set to). Add this bucket policy under Permissions → Bucket policy:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "PublicReadDecoyMedia",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/decoy-media/*"
      }
    ]
  }
  ```

  Replace `YOUR_BUCKET_NAME` with the actual bucket name.

  If Block Public Access is enabled at the bucket level: go to Permissions → Block Public Access, and uncheck "Block public access to buckets and objects granted through bucket policies". Keep the other three checkboxes on.

- [ ] **Step 2.4.2 — Verify**

  Upload any file to `decoy-media/test/test.jpg` and open `https://YOUR_BUCKET.s3.REGION.amazonaws.com/decoy-media/test/test.jpg` in a browser. Expected: file loads (200 OK), not 403.

---

### Task 2.5: Update ChatBubble to render per media kind

**Files:**
- Modify: `Telegram-premium-2025/src/pages/decoy/DecoyChat.jsx`

- [ ] **Step 2.5.1 — Replace ChatBubble media rendering**

  Replace the entire `ChatBubble` component with:

  ```jsx
  function MediaContent({ msg }) {
    const { mediaUrl, mediaKind } = msg;
    if (!mediaUrl) return null;

    if (!mediaKind || mediaKind === 'photo' || mediaKind === 'sticker' || mediaKind === 'gif') {
      return (
        <div className="mb-2">
          <img
            src={mediaUrl}
            alt="media"
            loading="lazy"
            className="w-full rounded-lg max-h-64 object-contain"
          />
        </div>
      );
    }
    if (mediaKind === 'video') {
      return (
        <div className="mb-2">
          <video src={mediaUrl} controls preload="metadata" className="w-full rounded-lg max-h-64" />
        </div>
      );
    }
    if (mediaKind === 'audio') {
      return (
        <div className="mb-2">
          <audio src={mediaUrl} controls className="w-full" />
        </div>
      );
    }
    return (
      <div className="mb-2">
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-primary-400 hover:underline"
        >
          📎 Attachment
        </a>
      </div>
    );
  }

  function ChatBubble({ msg }) {
    const isOutgoing = msg.role === 'ai' || msg.role === 'manual';
    const isManual = msg.role === 'manual';

    const bubbleStyle = isManual
      ? 'bg-indigo-600/30 border border-indigo-500/40 text-white rounded-br-none'
      : isOutgoing
      ? 'bg-primary-600/30 border border-primary-500/40 text-white rounded-br-none'
      : 'bg-gray-800 border border-gray-700 text-gray-200 rounded-bl-none';

    const label = isManual ? 'You (manual)' : isOutgoing ? 'Bot' : 'Target';

    return (
      <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-3`}>
        <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${bubbleStyle}`}>
          <div className="text-xs mb-1 opacity-50">{label}</div>
          <MediaContent msg={msg} />
          {msg.content && msg.content !== '[Image]' && (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          )}
          {!msg.mediaUrl && msg.content === '[Image]' && (
            <div className="whitespace-pre-wrap opacity-60 italic">[Image]</div>
          )}
          <div className="text-xs mt-1 opacity-40 text-right">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2.5.2 — Build and verify**

  ```bash
  npm run build
  ```

- [ ] **Step 2.5.3 — Manual smoke test**

  Start a test session. Have the target send: a photo, a video, a voice note (if possible). Verify:
  - Photo → `<img>` renders, no broken-image icon.
  - Video → `<video>` player visible with controls.
  - Voice note → `<audio>` player visible.
  - Old messages with `mediaKind: null` still render as `<img>` (fallback branch).

- [ ] **Step 2.5.4 — Commit**

  ```bash
  git add Telegram-premium-2025/src/pages/decoy/DecoyChat.jsx
  git commit -m "fix(decoy): render video/audio/document media in chat; use MediaContent component"
  ```

---

## PHASE 3 — Human Replication Improvements

### Task 3.1: Read receipts (T1a)

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 3.1.1 — Import ReadHistory Api**

  At the top of the file the `Api` is already imported from `'telegram'`. `Api.messages.ReadHistory` is available in GramJS — no new import needed.

- [ ] **Step 3.1.2 — Add _markRead helper method to the class**

  Add after `_clearInterval`:

  ```ts
  private _markRead(client: TelegramClient, entity: unknown, maxId: number): void {
    // Delay 3–20 s to simulate naturally reading the message
    const delay = 3000 + Math.random() * 17000;
    setTimeout(() => {
      (client as any).invoke(
        new Api.messages.ReadHistory({ peer: entity as any, maxId })
      ).catch(() => { /* cosmetic — ignore */ });
    }, delay);
  }
  ```

- [ ] **Step 3.1.3 — Call _markRead in _poll after emitting target messages**

  In `_poll`, after the `for (const msg of targetMessages)` emit loop, add:

  ```ts
  // Mark the target's messages as read with a natural delay
  this._markRead(client, entity, newWatermark);
  ```

- [ ] **Step 3.1.4 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "feat(decoy): mark target messages as read with natural delay (T1a)"
  ```

---

### Task 3.2: Time-of-day delay multiplier (T1b)

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 3.2.1 — Add applyTimeOfDayMultiplier function (outside the class)**

  After `inferMedia`, add:

  ```ts
  function applyTimeOfDayMultiplier(baseMs: number): number {
    const hour = new Date().getHours(); // server local time
    let factor = 1;
    if (hour >= 22 || hour < 6) {
      // Night: 15% chance of a very long "sleeping" gap (6–10×), otherwise 2–4×
      factor = Math.random() < 0.15 ? (6 + Math.random() * 4) : (2 + Math.random() * 2);
    } else if (hour >= 6 && hour < 9) {
      factor = 1.2 + Math.random() * 0.5; // morning catch-up: slightly slower
    } else if (hour >= 12 && hour < 14) {
      factor = 1.1 + Math.random() * 0.3; // lunch: mild slowdown
    }
    // Cap total at 10 minutes (600 s)
    return Math.min(baseMs * factor, 600_000);
  }
  ```

- [ ] **Step 3.2.2 — Apply multiplier in _poll delay calculation**

  In `_poll`, replace:

  ```ts
  const delayMs = this._computeAdaptiveDelay(
    [...(snapshot.messages as IDecoyMessage[]), ...targetMessages]
  );
  ```

  with:

  ```ts
  const delayMs = applyTimeOfDayMultiplier(
    this._computeAdaptiveDelay([...(snapshot.messages as IDecoyMessage[]), ...targetMessages])
  );
  ```

- [ ] **Step 3.2.3 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "feat(decoy): apply time-of-day multiplier to reply delay (T1b)"
  ```

---

### Task 3.3: Reply-to threading (T1c)

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 3.3.1 — Add lastTargetMsgIds Map to the class**

  In the class property block, after `pendingImageKinds`:

  ```ts
  private lastTargetMsgIds = new Map<string, number>();
  ```

- [ ] **Step 3.3.2 — Track last incoming target message ID in _poll**

  In `_poll`, after `this._markRead(...)`, add:

  ```ts
  // Track the last inbound Telegram message ID for reply-to threading
  const lastInbound = sorted.filter((m: any) => !m.out).pop();
  if (lastInbound) this.lastTargetMsgIds.set(sessionId, lastInbound.id);
  ```

- [ ] **Step 3.3.3 — Use reply-to when sending the first burst part in _doReply**

  In `_doReply`, in the `for` loop over `parts`, replace the first message send:

  ```ts
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await burstGap();
      const resume = this._startTypingLoop(client, entity);
      await typingDelay(parts[i]);
      resume();
      await (client as any).sendMessage(entity, { message: parts[i] });
    } else {
      await typingDelay(parts[i]);
      const replyToId = this.lastTargetMsgIds.get(sessionId);
      await (client as any).sendMessage(entity, {
        message: parts[i],
        ...(replyToId ? { replyTo: replyToId } : {}),
      });
    }
    aiMessages.push({ role: 'ai', content: parts[i], timestamp: new Date() });
  }
  ```

- [ ] **Step 3.3.4 — Clean up in stopSession**

  After `this.pendingImageKinds.delete(sessionId)`:

  ```ts
  this.lastTargetMsgIds.delete(sessionId);
  ```

- [ ] **Step 3.3.5 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "feat(decoy): thread first reply to last target message (T1c)"
  ```

---

### Task 3.4: Anti-pattern style cues (T1d)

**Files:**
- Modify: `telegram premium-server/src/services/decoyAI.service.ts`

- [ ] **Step 3.4.1 — Update STYLE_ADDENDUM**

  Replace the entire `STYLE_ADDENDUM` constant with:

  ```ts
  const STYLE_ADDENDUM = `

  TEXTING STYLE — follow these rules strictly:
  - Write exactly like a real person texting on their phone
  - Use lowercase most of the time; only capitalise when you'd genuinely emphasise
  - Keep each message short — 1 to 2 sentences max
  - If your reply naturally has more than one thought, split it into 2 or 3 separate messages using the exact separator: |||
  - Example of splitting: "yeah i saw that ||| honestly was surprised"
  - No formal sign-offs, no "Best," no "Regards"
  - Occasional filler words are fine: "yeah", "hmm", "lol", "haha", "wait"
  - Never sound like a chatbot or assistant — you are a real person
  - Do NOT always end your message with a question — real people don't do this every time
  - Do NOT always start with an acknowledgement word like "yeah", "ok", "hmm" — vary your openers
  - Use sentence fragments, ellipses, missing punctuation when natural
  - Avoid symmetric, balanced, or overly complete sentences — real chat is rough and unpolished
  - Never reply with more than 3 short lines; if you have more to say, cut it`;
  ```

- [ ] **Step 3.4.2 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyAI.service.ts"
  git commit -m "feat(decoy): add anti-pattern style rules to STYLE_ADDENDUM (T1d)"
  ```

---

### Task 3.5: Style mirroring (T2c)

**Files:**
- Modify: `telegram premium-server/src/services/decoyAI.service.ts`

- [ ] **Step 3.5.1 — Add buildMirroringHint function (before the class)**

  After `STYLE_ADDENDUM`, add:

  ```ts
  function buildMirroringHint(history: IDecoyMessage[]): string {
    const targetMsgs = history.filter((m) => m.role === 'target').slice(-10);
    if (targetMsgs.length < 3) return '';

    const avgLen = targetMsgs.reduce((s, m) => s + m.content.length, 0) / targetMsgs.length;
    const emojiCount = targetMsgs.filter((m) => /\p{Emoji}/u.test(m.content)).length;
    const usesCaps = targetMsgs.some((m) => /[A-Z]{2,}/.test(m.content));
    const usesEllipsis = targetMsgs.some((m) => m.content.includes('...') || m.content.includes('…'));

    const hints: string[] = [];
    if (avgLen < 30) hints.push('target writes very short messages — match their brevity exactly');
    else if (avgLen > 120) hints.push('target writes longer messages — you can be slightly more detailed');
    if (emojiCount > targetMsgs.length / 2) hints.push('target uses emojis — include 1–2 emojis occasionally');
    if (usesCaps) hints.push('target uses ALL CAPS for emphasis — you can mirror this');
    if (usesEllipsis) hints.push('target uses "..." — you can use it too');

    if (!hints.length) return '';
    return `\nSTYLE MIRROR — adapt specifically to this person: ${hints.join('; ')}.`;
  }
  ```

- [ ] **Step 3.5.2 — Inject mirroring hint in generateReply**

  In `generateReply`, replace:

  ```ts
  { role: 'system', content: systemPrompt + STYLE_ADDENDUM },
  ```

  with:

  ```ts
  { role: 'system', content: systemPrompt + STYLE_ADDENDUM + buildMirroringHint(trimmedHistory) },
  ```

- [ ] **Step 3.5.3 — Inject mirroring hint in generateReplyWithImage**

  Same change in `generateReplyWithImage`:

  ```ts
  { role: 'system', content: systemPrompt + STYLE_ADDENDUM + buildMirroringHint(trimmedHistory) },
  ```

- [ ] **Step 3.5.4 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyAI.service.ts"
  git commit -m "feat(decoy): style mirroring — adapt to target's message patterns (T2c)"
  ```

---

### Task 3.6: Typo + edit simulation (T2a)

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 3.6.1 — Add maybeMangle function (outside the class)**

  After `applyTimeOfDayMultiplier`:

  ```ts
  function maybeMangle(text: string): { mangled: string; original: string } | null {
    if (Math.random() > 0.125 || text.length < 8) return null;
    const words = text.split(' ');
    if (words.length < 2) return null;
    // Pick a word in the middle (not first/last)
    const idx = 1 + Math.floor(Math.random() * (words.length - 1));
    const word = words[idx];
    if (word.length < 3) return null;
    // Swap two adjacent characters
    const ci = Math.floor(Math.random() * (word.length - 1));
    const chars = word.split('');
    [chars[ci], chars[ci + 1]] = [chars[ci + 1], chars[ci]];
    words[idx] = chars.join('');
    return { mangled: words.join(' '), original: text };
  }
  ```

- [ ] **Step 3.6.2 — Use maybeMangle for the first burst part in _doReply**

  In `_doReply`, inside the `for` loop, replace the `i === 0` branch send:

  ```ts
  } else {
    await typingDelay(parts[i]);
    const replyToId = this.lastTargetMsgIds.get(sessionId);
    const sendOpts = replyToId ? { replyTo: replyToId } : {};
    const typo = maybeMangle(parts[i]);
    if (typo) {
      await (client as any).sendMessage(entity, { message: typo.mangled, ...sendOpts });
      aiMessages.push({ role: 'ai', content: typo.original, timestamp: new Date() });
      // Correct the typo after 2–5 s
      const fixDelay = 2000 + Math.random() * 3000;
      setTimeout(async () => {
        try {
          const sentMsgs: any[] = await (client as any).getMessages(entity, { limit: 1 });
          if (sentMsgs[0]) {
            await (client as any).invoke(
              new Api.messages.EditMessage({
                peer: entity as any,
                id: sentMsgs[0].id,
                message: typo.original,
              })
            );
          }
        } catch { /* cosmetic */ }
      }, fixDelay);
    } else {
      await (client as any).sendMessage(entity, { message: parts[i], ...sendOpts });
      aiMessages.push({ role: 'ai', content: parts[i], timestamp: new Date() });
    }
  }
  ```

  > Note: move the `aiMessages.push` out of the `if/else` if you find it's duplicated — the `typo` branch pushes the corrected `original` content so the DB records the intended text, not the mangled one.

- [ ] **Step 3.6.3 — Refactor the for loop to avoid aiMessages.push duplication**

  The full revised `for` loop should look like this (replace entire loop):

  ```ts
  const aiMessages: IDecoyMessage[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await burstGap();
      const resume = this._startTypingLoop(client, entity);
      await typingDelay(parts[i]);
      resume();
      await (client as any).sendMessage(entity, { message: parts[i] });
      aiMessages.push({ role: 'ai', content: parts[i], timestamp: new Date() });
    } else {
      await typingDelay(parts[i]);
      const replyToId = this.lastTargetMsgIds.get(sessionId);
      const sendOpts = replyToId ? { replyTo: replyToId } : {};
      const typo = maybeMangle(parts[i]);
      if (typo) {
        await (client as any).sendMessage(entity, { message: typo.mangled, ...sendOpts });
        const fixDelay = 2000 + Math.random() * 3000;
        setTimeout(async () => {
          try {
            const sentMsgs: any[] = await (client as any).getMessages(entity, { limit: 1 });
            if (sentMsgs[0]) {
              await (client as any).invoke(
                new Api.messages.EditMessage({
                  peer: entity as any,
                  id: sentMsgs[0].id,
                  message: typo.original,
                })
              );
            }
          } catch { /* cosmetic */ }
        }, fixDelay);
        aiMessages.push({ role: 'ai', content: typo.original, timestamp: new Date() });
      } else {
        await (client as any).sendMessage(entity, { message: parts[i], ...sendOpts });
        aiMessages.push({ role: 'ai', content: parts[i], timestamp: new Date() });
      }
    }
  }
  ```

- [ ] **Step 3.6.4 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "feat(decoy): typo + self-correction edit on ~1/8 first-burst messages (T2a)"
  ```

---

### Task 3.7: Ghost follow-up timer (T2b)

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`
- Modify: `telegram premium-server/src/services/decoyAI.service.ts`

- [ ] **Step 3.7.1 — Add generateFollowUp to DecoyAIService**

  In `decoyAI.service.ts`, add after `generateReplyWithImage`:

  ```ts
  async generateFollowUp(systemPrompt: string, history: IDecoyMessage[]): Promise<string[]> {
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt + STYLE_ADDENDUM },
      ...trimmedHistory.map((msg) => ({
        role: (msg.role === 'target' ? 'user' : 'assistant') as 'assistant' | 'user',
        content: msg.content,
      })),
      {
        role: 'user',
        content:
          '[The other person has not replied in several hours. Send a brief, natural follow-up as your character — not desperate, just checking in. 1 message only. Reply with only the message text.]',
      },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: config.OPENAI_DECOY_MODEL,
        messages,
        max_tokens: 80,
        temperature: 0.9,
      });
      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) throw new Error('Empty follow-up response');
      return splitParts(raw);
    } catch (err: any) {
      logger.error('[DecoyAI] Failed to generate follow-up:', err.message);
      throw err;
    }
  }
  ```

- [ ] **Step 3.7.2 — Add ghostFollowUpTimers Map to DecoyBotService**

  In the class property block:

  ```ts
  private ghostFollowUpTimers = new Map<string, ReturnType<typeof setTimeout>>();
  ```

- [ ] **Step 3.7.3 — Add _scheduleGhostFollowUp and _cancelGhostFollowUp helpers**

  Add after `_markRead`:

  ```ts
  private _scheduleGhostFollowUp(sessionId: string): void {
    const existing = this.ghostFollowUpTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const timer = setTimeout(async () => {
      this.ghostFollowUpTimers.delete(sessionId);
      try {
        const status = await this.sessionRepo.findStatus(sessionId);
        if (!status || status.status !== 'active') return;

        const snapshot = await this.sessionRepo.findForPolling(sessionId);
        if (!snapshot) return;

        const history = snapshot.messages as IDecoyMessage[];
        const lastMsg = history[history.length - 1];
        // Only follow up if we sent the last message (target hasn't replied)
        if (!lastMsg || lastMsg.role === 'target') return;

        const client = this.clients.get(sessionId);
        const entity = this.targetEntities.get(sessionId);
        if (!client || !entity) return;

        const parts = await this.decoyAI.generateFollowUp(snapshot.systemPrompt, history);
        const stopTyping = this._startTypingLoop(client, entity);
        const followUpMsgs: IDecoyMessage[] = [];
        try {
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) await burstGap();
            await typingDelay(parts[i]);
            await (client as any).sendMessage(entity, { message: parts[i] });
            followUpMsgs.push({ role: 'ai', content: parts[i], timestamp: new Date() });
          }
        } finally {
          stopTyping();
        }
        await this.sessionRepo.appendMessages(sessionId, followUpMsgs);
        for (const msg of followUpMsgs) emitToSession(sessionId, 'decoy:message', msg);

        // Schedule another follow-up in case they still don't reply
        this._scheduleGhostFollowUp(sessionId);
      } catch (err: any) {
        logger.error(`[DecoyBot] Ghost follow-up error session=${sessionId}:`, err.message);
      }
    }, FOUR_HOURS);

    this.ghostFollowUpTimers.set(sessionId, timer);
  }

  private _cancelGhostFollowUp(sessionId: string): void {
    const t = this.ghostFollowUpTimers.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.ghostFollowUpTimers.delete(sessionId);
    }
  }
  ```

- [ ] **Step 3.7.4 — Schedule follow-up after every AI reply in _doReply**

  At the very end of `_doReply`, after emitting `aiMessages`:

  ```ts
  this._scheduleGhostFollowUp(sessionId);
  ```

- [ ] **Step 3.7.5 — Cancel follow-up when target replies (in _poll)**

  In `_poll`, at the very start of the incoming-messages block (after `if (!incoming.length)`):

  ```ts
  // Target replied — cancel any pending ghost follow-up
  this._cancelGhostFollowUp(sessionId);
  ```

- [ ] **Step 3.7.6 — Clean up in stopSession**

  After `this.lastTargetMsgIds.delete(sessionId)`:

  ```ts
  this._cancelGhostFollowUp(sessionId);
  ```

- [ ] **Step 3.7.7 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyBot.service.ts" \
          "telegram premium-server/src/services/decoyAI.service.ts"
  git commit -m "feat(decoy): ghost follow-up after 4h silence (T2b)"
  ```

---

### Task 3.8: Online presence shaping (T2d)

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts`

- [ ] **Step 3.8.1 — Add onlinePresence Map to the class**

  ```ts
  private onlinePresence = new Map<string, ReturnType<typeof setTimeout>>();
  ```

- [ ] **Step 3.8.2 — Add _goOfflineSoon and _goOnlineNow helpers**

  Add after `_cancelGhostFollowUp`:

  ```ts
  private _goOnlineNow(client: TelegramClient): void {
    (client as any).invoke(new Api.account.UpdateStatus({ offline: false }))
      .catch(() => { /* cosmetic */ });
  }

  private _goOfflineSoon(client: TelegramClient, sessionId: string): void {
    const existing = this.onlinePresence.get(sessionId);
    if (existing) clearTimeout(existing);
    const delay = 30_000 + Math.random() * 60_000; // 30–90 s
    const timer = setTimeout(() => {
      this.onlinePresence.delete(sessionId);
      (client as any).invoke(new Api.account.UpdateStatus({ offline: true }))
        .catch(() => { /* cosmetic */ });
    }, delay);
    this.onlinePresence.set(sessionId, timer);
  }
  ```

- [ ] **Step 3.8.3 — Go online at the start of _doReply**

  At the very top of `_doReply`, before the status check, add:

  ```ts
  // Cancel any scheduled offline transition — we're about to actively reply
  const offlineTimer = this.onlinePresence.get(sessionId);
  if (offlineTimer) {
    clearTimeout(offlineTimer);
    this.onlinePresence.delete(sessionId);
  }
  const activeClient = this.clients.get(sessionId);
  if (activeClient) this._goOnlineNow(activeClient);
  ```

- [ ] **Step 3.8.4 — Go offline shortly after sending the last part in _doReply**

  At the very end of `_doReply`, after `this._scheduleGhostFollowUp(sessionId)`:

  ```ts
  this._goOfflineSoon(client, sessionId);
  ```

- [ ] **Step 3.8.5 — Clean up onlinePresence in stopSession**

  After `this._cancelGhostFollowUp(sessionId)`:

  ```ts
  const offlineTimer = this.onlinePresence.get(sessionId);
  if (offlineTimer) {
    clearTimeout(offlineTimer);
    this.onlinePresence.delete(sessionId);
  }
  ```

- [ ] **Step 3.8.6 — Verify compile and commit**

  ```bash
  npx tsc --noEmit
  git add "telegram premium-server/src/services/decoyBot.service.ts"
  git commit -m "feat(decoy): go online to reply, go offline 30–90s after sending (T2d)"
  ```

---

## End-to-End Verification Checklist (run after each phase)

### Phase 1
- [ ] Creating a session shows "Target Context" field, not "System Prompt"
- [ ] Submitting creates a DB document with `targetContext` + assembled `systemPrompt`
- [ ] Bot opens with the investigator persona voice (not generic)
- [ ] Old sessions still chat normally (systemPrompt is stored, no migration needed)

### Phase 2
- [ ] Target sends photo → appears as `<img>` in dashboard
- [ ] Target sends video → appears as `<video>` with controls
- [ ] Target sends voice note → appears as `<audio>` with controls
- [ ] Target sends file/document → appears as "📎 Attachment" link
- [ ] All media URLs resolve (not 403)
- [ ] AI still replies naturally when a photo is sent (Vision path)
- [ ] AI describes video/audio/doc type in its reply context

### Phase 3
- [ ] Target sees "✓✓" (read) on their messages within ~20 s of the message arriving
- [ ] Sending a test message late at night shows 2× longer delay on the bot dashboard
- [ ] First bot reply appears threaded (reply-to) under the target's last message
- [ ] After ~24 test sessions, roughly 1 in 8 first messages briefly shows a typo then edits to the correct text
- [ ] After pausing the bot and not resuming for a simulated 4-hour period (lower the constant temporarily for testing), bot sends a follow-up
- [ ] After bot sends a message, the decoy Telegram account goes "offline" within 1.5 minutes
