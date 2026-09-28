# Decoy AI — Operator Steering ("Briefing") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator monitoring a decoy conversation two live steering levers — a persistent *standing objective* and a transient *one-shot nudge* — that the AI weaves into its own next reply, with the nudge winning on conflict.

**Architecture:** Two new session fields (`standingObjective`, `pendingNudge`) drive a steering block appended as a trailing system message in the AI calls. The bot's reply loop reads them from a fresh DB snapshot and clears the nudge after it fires. Three new HTTP endpoints (pure DB writes) set/clear them and log an operator-only `directive` transcript entry over Socket.IO. The live frontend (`GenericDecoyPage` + `ChatArea` + `IntelligencePanel`) wires its existing-but-stubbed "Brief" control to the nudge endpoint and adds an objective panel.

**Tech Stack:** Backend — Node/TypeScript, Express, Mongoose, OpenAI SDK, Socket.IO (Redis emitter), GramJS. Frontend — React (Vite, JSX), axios, socket.io-client, Tailwind.

**Verification model:** This repo has **no test framework**. Each task is verified with the TypeScript compiler / ESLint / Vite build plus concrete manual runtime checks. `buildSteeringBlock` and the directive filter are written as exported pure functions so they are unit-testable if a harness is added later.

**Commit policy:** Per the user's instruction, **do NOT commit per task.** Each task ends with a verification step only. A single commit per repo happens at the very end (Task 12). Note there are two separate git repos: `telegram premium-server` (backend) and `Telegram-premium-2025` (frontend); the working root `c:\telegram-new` is not a repo.

**Path note:** The backend directory name contains a space: `telegram premium-server`. Quote it in every shell command.

---

## PHASE 1 — BACKEND

### Task 1: Add steering fields + `directive` message role to the session model

**Files:**
- Modify: `telegram premium-server/src/models/decoySession.model.ts`

- [ ] **Step 1: Add `directive` to the message role enum**

In `messageSchema`, change the `role` field enum:

```ts
    role: {
      type: String,
      enum: ['ai', 'target', 'manual', 'directive'],
      required: true,
    },
```

- [ ] **Step 2: Add the two steering fields to `decoySessionSchema`**

Insert these two fields immediately after the `targetContext` field block (before `status`):

```ts
    // Operator steering — persists across turns until changed/cleared.
    standingObjective: {
      type: String,
      default: '',
    },
    // Operator steering — consumed by the next AI reply, then cleared.
    pendingNudge: {
      type: String,
      default: '',
    },
```

- [ ] **Step 3: Update the `IDecoyMessage` role union**

```ts
export interface IDecoyMessage {
  role: 'ai' | 'target' | 'manual' | 'directive';
  content: string;
  mediaUrl?: string | null;
  mediaKind?: MediaKind | null;
  mediaMime?: string | null;
  timestamp: Date;
}
```

- [ ] **Step 4: Add the two fields to the `IDecoySession` interface**

Add after `targetContext: string;`:

```ts
  standingObjective: string;
  pendingNudge: string;
```

- [ ] **Step 5: Verify it compiles**

Run: `cd "telegram premium-server" && npx tsc --noEmit`
Expected: no errors (or only pre-existing errors unrelated to these files — there should be none in this file).

---

### Task 2: Repository — expose steering in the polling snapshot + add mutators

**Files:**
- Modify: `telegram premium-server/src/repository/decoySession.repository.ts`

- [ ] **Step 1: Add the fields to `IPollingSnapshot`**

```ts
export interface IPollingSnapshot {
  _id: string;
  status: 'active' | 'paused' | 'stopped';
  systemPrompt: string;
  lastProcessedMsgId: number;
  messages: IDecoyMessage[];
  standingObjective: string;
  pendingNudge: string;
}
```

- [ ] **Step 2: Include the fields in the `findForPolling` projection**

```ts
  async findForPolling(sessionId: string): Promise<IPollingSnapshot | null> {
    return DecoySessionModel.findById(
      sessionId,
      {
        status: 1,
        systemPrompt: 1,
        lastProcessedMsgId: 1,
        standingObjective: 1,
        pendingNudge: 1,
        messages: { $slice: -50 },
      }
    ).lean<IPollingSnapshot>();
  }
```

- [ ] **Step 3: Add four mutator methods**

Insert before the closing brace of the `DecoySessionRepository` class:

```ts
  async setObjective(sessionId: string, objective: string): Promise<void> {
    await DecoySessionModel.findByIdAndUpdate(sessionId, { standingObjective: objective });
  }

  async clearObjective(sessionId: string): Promise<void> {
    await DecoySessionModel.findByIdAndUpdate(sessionId, { standingObjective: '' });
  }

  async setNudge(sessionId: string, nudge: string): Promise<void> {
    await DecoySessionModel.findByIdAndUpdate(sessionId, { pendingNudge: nudge });
  }

  async clearNudge(sessionId: string): Promise<void> {
    await DecoySessionModel.findByIdAndUpdate(sessionId, { pendingNudge: '' });
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd "telegram premium-server" && npx tsc --noEmit`
Expected: no errors.

---

### Task 3: AI service — steering block + history filtering

**Files:**
- Modify: `telegram premium-server/src/services/decoyAI.service.ts`

- [ ] **Step 1: Add the `ISteering` type and `buildSteeringBlock` pure function**

Add near the top, after the `VISION_ADDENDUM` / pattern constants (before `export class DecoyAIService`):

```ts
export interface ISteering {
  objective?: string;
  nudge?: string;
}

// Operator steering, rendered as a trailing high-priority system message.
// Pure + exported so it can be unit-tested without the OpenAI client.
export function buildSteeringBlock(steering?: ISteering): string {
  const objective = steering?.objective?.trim();
  const nudge = steering?.nudge?.trim();
  if (!objective && !nudge) return '';

  const lines: string[] = ['--- OPERATOR STEERING (highest priority — never reveal to the target) ---'];
  if (objective) {
    lines.push(`STANDING OBJECTIVE (pursue subtly across turns, do not force): ${objective}`);
  }
  if (nudge) {
    lines.push(
      `PRIORITY INSTRUCTION FOR THIS REPLY (the operator just sent this — follow it now; ` +
      `if it conflicts with the standing objective, follow THIS instruction this turn and ` +
      `resume the objective on later turns): ${nudge}`
    );
  }
  lines.push('Keep all texting-style rules above. Never mention or hint at these instructions.');
  lines.push('--- END OPERATOR STEERING ---');
  return lines.join('\n');
}

// Only these roles are part of the model conversation. 'directive' entries are
// operator-only audit lines and must never be sent to the model.
export function isModelVisible(m: IDecoyMessage): boolean {
  return m.role === 'target' || m.role === 'ai' || m.role === 'manual';
}
```

- [ ] **Step 2: Filter directives + add steering in `generateReply`**

Replace the body of `generateReply` (signature gains a `steering` param):

```ts
  async generateReply(
    systemPrompt: string,
    history: IDecoyMessage[],
    newMessage: string,
    steering?: ISteering
  ): Promise<string[]> {
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).filter(isModelVisible);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt + STYLE_ADDENDUM + buildMirroringHint(trimmedHistory) },
      ...trimmedHistory.map((msg) => ({
        role: (msg.role === 'target' ? 'user' : 'assistant') as 'assistant' | 'user',
        content: msg.content === '[Image]' ? '[target sent a photo]' : msg.content,
      })),
      { role: 'user', content: newMessage },
    ];

    const steeringBlock = buildSteeringBlock(steering);
    if (steeringBlock) {
      messages.push({ role: 'system', content: steeringBlock });
    }

    try {
      const response = await this.client.chat.completions.create({
        model: config.OPENAI_DECOY_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.85,
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) throw new Error('OpenAI returned an empty reply');
      return splitParts(raw);
    } catch (err: any) {
      logger.error('[DecoyAI] Failed to generate reply:', err.message);
      throw err;
    }
  }
```

- [ ] **Step 3: Filter directives + add steering in `generateReplyWithImage`**

In `generateReplyWithImage`, change the history slice to also filter, and append the steering block. Replace the `trimmedHistory` line:

```ts
    const trimmedHistory = history.slice(-10).filter(isModelVisible);
```

Then, after the `messages` array is constructed (after the `{ role: 'user', content: userContent }` entry), add the `steering` param to the signature and append the block. New signature:

```ts
  async generateReplyWithImage(
    systemPrompt: string,
    history: IDecoyMessage[],
    imageBase64: string,
    caption?: string,
    steering?: ISteering
  ): Promise<string[]> {
```

Immediately before the `try {` block:

```ts
    const steeringBlock = buildSteeringBlock(steering);
    if (steeringBlock) {
      messages.push({ role: 'system', content: steeringBlock });
    }
```

- [ ] **Step 4: Filter directives + add objective in `generateFollowUp`**

New signature and body changes for `generateFollowUp`:

```ts
  async generateFollowUp(
    systemPrompt: string,
    history: IDecoyMessage[],
    steering?: ISteering
  ): Promise<string[]> {
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).filter(isModelVisible);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt + STYLE_ADDENDUM },
      ...trimmedHistory.map((msg) => ({
        role: (msg.role === 'target' ? 'user' : 'assistant') as 'assistant' | 'user',
        content: msg.content === '[Image]' ? '[target sent a photo]' : msg.content,
      })),
      {
        role: 'user',
        content:
          '[The other person has not replied in several hours. Send a brief, natural follow-up as your character — not desperate, just checking in. 1 message only. Reply with only the message text.]',
      },
    ];

    const steeringBlock = buildSteeringBlock(steering);
    if (steeringBlock) {
      messages.push({ role: 'system', content: steeringBlock });
    }

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

(Note: `generateOpener` is intentionally left unchanged. The opener fires at session creation, before any objective/nudge can exist, so threading steering there would be dead code.)

- [ ] **Step 5: Verify it compiles**

Run: `cd "telegram premium-server" && npx tsc --noEmit`
Expected: no errors.

---

### Task 4: Bot service — pass steering into replies and clear the nudge after it fires

**Files:**
- Modify: `telegram premium-server/src/services/decoyBot.service.ts` (`_doReply`, and the ghost follow-up call)

- [ ] **Step 1: Read steering from the snapshot in `_doReply`**

In `_doReply`, after `const history = snapshot.messages as IDecoyMessage[];`, add:

```ts
    const steering = {
      objective: snapshot.standingObjective || '',
      nudge: snapshot.pendingNudge || '',
    };
```

- [ ] **Step 2: Pass `steering` to both AI reply calls**

In the `useVision` branch, change the call to:

```ts
        parts = await this.decoyAI.generateReplyWithImage(
          snapshot.systemPrompt, historyForVision, imageBase64, visionCaption, steering
        );
```

In the `else` branch:

```ts
        parts = await this.decoyAI.generateReply(snapshot.systemPrompt, history, combinedInput, steering);
```

- [ ] **Step 3: Clear the nudge after the reply is sent**

In `_doReply`, immediately after the existing `await this.sessionRepo.appendMessages(sessionId, aiMessages);` (the one that saves the AI's reply), add:

```ts
    if (steering.nudge) {
      await this.sessionRepo.clearNudge(sessionId);
    }
```

(The objective is intentionally left in place — only the one-shot nudge is consumed. If the AI call threw earlier, this line is never reached, so the nudge survives for the retry.)

- [ ] **Step 4: Pass the objective to the ghost follow-up**

In `_scheduleGhostFollowUp`, change the follow-up call to forward the objective (the snapshot is already fetched as `snapshot` in that closure):

```ts
        const parts = await this.decoyAI.generateFollowUp(snapshot.systemPrompt, history, {
          objective: snapshot.standingObjective || '',
        });
```

- [ ] **Step 5: Verify it compiles**

Run: `cd "telegram premium-server" && npx tsc --noEmit`
Expected: no errors.

---

### Task 5: Validators for the steering endpoints

**Files:**
- Modify: `telegram premium-server/src/middlewares/validators/decoyBot.validator.ts`

- [ ] **Step 1: Add two validators**

Append to the file (reusing the existing `isMongoId` / `isMaxRequired` helpers — no new imports needed):

```ts
export const setObjectiveValidator = [
  isMongoId('id'),
  isMaxRequired({ key: 'objective', limit: 500 }),
  ...validateRequest,
];

export const setNudgeValidator = [
  isMongoId('id'),
  isMaxRequired({ key: 'nudge', limit: 500 }),
  ...validateRequest,
];
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "telegram premium-server" && npx tsc --noEmit`
Expected: no errors.

---

### Task 6: Controller handlers + routes for steering

**Files:**
- Modify: `telegram premium-server/src/controllers/decoyBot.controller.ts`
- Modify: `telegram premium-server/src/routes/decoyBot.route.ts`

- [ ] **Step 1: Import `IDecoyMessage` in the controller**

Change the existing model import line (currently the controller imports `buildSystemPrompt` from the AI service) by adding, near the other imports at the top:

```ts
import { IDecoyMessage } from '../models/decoySession.model';
```

- [ ] **Step 2: Add the three handlers**

Append to `telegram premium-server/src/controllers/decoyBot.controller.ts`:

```ts
export const setObjective = async (req: Request, res: Response, next: NextFunction) => {
  const { _id: userId } = req.user;
  const { id } = req.params;
  const { objective } = req.body;

  const session = await sessionRepo.findById(id);
  if (!session) throw new NotFoundError('Session not found');
  if (session.userId.toString() !== userId.toString()) throw new ForbiddenError('Access denied');
  if (session.status === 'stopped') throw new BadRequestError('Cannot steer a stopped session');

  const text = (objective as string).trim();
  await sessionRepo.setObjective(id, text);

  const entry: IDecoyMessage = { role: 'directive', content: `Objective set: ${text}`, timestamp: new Date() };
  await sessionRepo.appendMessages(id, [entry]);
  emitToSession(id, 'decoy:message', entry);
  emitToSession(id, 'decoy:objective', { sessionId: id, objective: text });

  next({ objective: text, statusCode: 200, msg: 'Objective set' });
};

export const clearObjective = async (req: Request, res: Response, next: NextFunction) => {
  const { _id: userId } = req.user;
  const { id } = req.params;

  const session = await sessionRepo.findById(id);
  if (!session) throw new NotFoundError('Session not found');
  if (session.userId.toString() !== userId.toString()) throw new ForbiddenError('Access denied');
  if (session.status === 'stopped') throw new BadRequestError('Cannot steer a stopped session');

  await sessionRepo.clearObjective(id);

  const entry: IDecoyMessage = { role: 'directive', content: 'Objective cleared', timestamp: new Date() };
  await sessionRepo.appendMessages(id, [entry]);
  emitToSession(id, 'decoy:message', entry);
  emitToSession(id, 'decoy:objective', { sessionId: id, objective: '' });

  next({ objective: '', statusCode: 200, msg: 'Objective cleared' });
};

export const sendNudge = async (req: Request, res: Response, next: NextFunction) => {
  const { _id: userId } = req.user;
  const { id } = req.params;
  const { nudge } = req.body;

  const session = await sessionRepo.findById(id);
  if (!session) throw new NotFoundError('Session not found');
  if (session.userId.toString() !== userId.toString()) throw new ForbiddenError('Access denied');
  if (session.status === 'stopped') throw new BadRequestError('Cannot steer a stopped session');

  const text = (nudge as string).trim();
  await sessionRepo.setNudge(id, text);

  const entry: IDecoyMessage = { role: 'directive', content: `Nudge: ${text}`, timestamp: new Date() };
  await sessionRepo.appendMessages(id, [entry]);
  emitToSession(id, 'decoy:message', entry);

  next({ nudge: text, statusCode: 200, msg: 'Nudge queued' });
};
```

- [ ] **Step 3: Register the routes**

In `telegram premium-server/src/routes/decoyBot.route.ts`, add the new handlers/validators to the imports and register routes. Add to the controller import list: `setObjective, clearObjective, sendNudge`. Add to the validator import list: `setObjectiveValidator, setNudgeValidator`. Then add these routes (place them before the `decoyBotRouter.delete('/:id', ...)` line):

```ts
decoyBotRouter.put('/:id/objective', isLoggedIn, setObjectiveValidator, asyncHandler(setObjective));
decoyBotRouter.delete('/:id/objective', isLoggedIn, sessionIdParamValidator, asyncHandler(clearObjective));
decoyBotRouter.post('/:id/nudge', isLoggedIn, setNudgeValidator, asyncHandler(sendNudge));
```

- [ ] **Step 4: Verify it compiles + lints**

Run: `cd "telegram premium-server" && npx tsc --noEmit && npm run lint:fix`
Expected: no type errors; lint passes (auto-fixes formatting).

- [ ] **Step 5: Manual runtime check (backend end-to-end)**

Start the backend (`cd "telegram premium-server" && npm run dev`) with an active decoy session (note its `<SESSION_ID>` and a valid `<TOKEN>`). Run:

```bash
# Set objective
curl -X PUT "http://localhost:<PORT>/ai-chatbot/<SESSION_ID>/objective" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"objective":"get their USDT wallet address"}'

# Queue a one-shot nudge
curl -X POST "http://localhost:<PORT>/ai-chatbot/<SESSION_ID>/nudge" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"nudge":"act convinced by what he just said"}'
```

Expected:
- Both return `200` with the echoed value.
- In MongoDB, the session has `standingObjective` set and `pendingNudge` set, and two new `directive` messages appended.
- When the bot next replies (have the target send a message, or watch an active chat), the reply reflects the nudge, and afterward `pendingNudge` is back to `''` while `standingObjective` is unchanged. Check the server log line `Reply scheduled in …s` then confirm the nudge cleared.
- `DELETE /ai-chatbot/<SESSION_ID>/objective` returns 200 and empties `standingObjective`.

---

## PHASE 2 — FRONTEND (`Telegram-premium-2025`)

### Task 7: DecoyContext — add objective/nudge API methods

**Files:**
- Modify: `Telegram-premium-2025/src/context/DecoyContext.jsx`

- [ ] **Step 1: Add three methods (mirroring `manualSend`)**

Insert after the `manualSend` `useCallback` block:

```jsx
  const setObjective = useCallback(async (sessionId, objective) => {
    const res = await axios.put(
      `${BASE}/${sessionId}/objective`,
      { objective },
      { headers: authHeader() }
    );
    return res.data.data?.objective ?? objective;
  }, []);

  const clearObjective = useCallback(async (sessionId) => {
    await axios.delete(`${BASE}/${sessionId}/objective`, { headers: authHeader() });
  }, []);

  const sendNudge = useCallback(async (sessionId, nudge) => {
    const res = await axios.post(
      `${BASE}/${sessionId}/nudge`,
      { nudge },
      { headers: authHeader() }
    );
    return res.data.data?.nudge ?? nudge;
  }, []);
```

- [ ] **Step 2: Expose them in the provider value**

Add `setObjective`, `clearObjective`, `sendNudge` to the object passed to `DecoyContext.Provider value={{ ... }}`.

- [ ] **Step 3: Verify it builds**

Run: `cd Telegram-premium-2025 && npm run lint`
Expected: no errors for this file.

---

### Task 8: Socket hook — handle the `decoy:objective` event

**Files:**
- Modify: `Telegram-premium-2025/src/hooks/useDecoySocket.jsx`

- [ ] **Step 1: Accept and ref an `onObjective` callback**

Change the signature and add the ref (mirroring the existing callbacks):

```jsx
export function useDecoySocket({ sessionIds = [], onMessage, onStatus, onUnseenReset, onObjective }) {
  const socketRefs = useRef({});
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);
  const onUnseenResetRef = useRef(onUnseenReset);
  const onObjectiveRef = useRef(onObjective);
  onMessageRef.current = onMessage;
  onStatusRef.current = onStatus;
  onUnseenResetRef.current = onUnseenReset;
  onObjectiveRef.current = onObjective;
```

- [ ] **Step 2: Subscribe to the event**

Inside the `sessionIds.forEach` block, after the `decoy:unseen_reset` listener, add:

```jsx
      socket.on('decoy:objective', (payload) => {
        onObjectiveRef.current?.({ ...payload, sessionId: id });
      });
```

- [ ] **Step 3: Verify it builds**

Run: `cd Telegram-premium-2025 && npm run lint`
Expected: no errors for this file.

---

### Task 9: GenericDecoyPage — wire nudge, objective, and directive rendering

**Files:**
- Modify: `Telegram-premium-2025/src/pages/decoy/GenericDecoyPage.jsx`

- [ ] **Step 1: Map the `directive` role in `mapBackendMsg`**

At the very top of `mapBackendMsg` (right after the `if (!msg) return null;` line), add:

```jsx
  if (msg.role === 'directive') {
    return {
      id: msg._id || `${Date.now()}-${index}`,
      sender: 'system',
      role: 'directive',
      text: msg.content || '',
      time: (() => {
        try {
          const d = new Date(msg.timestamp || Date.now());
          return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
      })(),
      timestamp: msg.timestamp || Date.now(),
    };
  }
```

- [ ] **Step 2: Seed `objective` onto each target in `mapSessionToTarget`**

In the returned object of `mapSessionToTarget`, add:

```jsx
    objective: session.standingObjective || '',
```

- [ ] **Step 3: Pull the new context methods**

In the `useDecoy()` destructure at the top of `GenericDecoyPage`, add `setObjective, clearObjective, sendNudge`:

```jsx
  const {
    fetchSessions,
    fetchMessages,
    pauseSession,
    resumeSession,
    manualSend,
    createSession,
    markSessionRead,
    deleteSession,
    setObjective,
    clearObjective,
    sendNudge,
  } = useDecoy();
```

- [ ] **Step 4: Handle `decoy:objective` in the socket hook usage**

In the `useDecoySocket({ ... })` call, add an `onObjective` handler alongside the existing ones:

```jsx
    onObjective: (payload) => {
      const msgSessionId = payload.sessionId || activeTargetId;
      setTargets((prev) =>
        prev.map((t) => (t.id === msgSessionId ? { ...t, objective: payload.objective ?? '' } : t))
      );
    },
```

- [ ] **Step 5: Replace the stubbed `handleSendBrief` with a real nudge call**

Replace the existing `handleSendBrief` function body:

```jsx
  const handleSendBrief = async (text) => {
    if (!activeTarget) return;
    const trimmed = text.trim();
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, briefActive: false } : t))
    );
    if (!trimmed) return;
    try {
      await sendNudge(activeTargetId, trimmed);
      toast.success('Nudge sent — applies to the next reply.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to send nudge.');
    }
  };
```

(The `directive` log entry is rendered when the socket echoes `decoy:message`; no optimistic insert needed.)

- [ ] **Step 6: Add objective set/clear handlers**

Add these two functions next to `handleSendBrief`:

```jsx
  const handleSetObjective = async (text) => {
    if (!activeTarget) return;
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, objective: trimmed } : t))
    );
    try {
      await setObjective(activeTargetId, trimmed);
      toast.success('Objective set.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to set objective.');
    }
  };

  const handleClearObjective = async () => {
    if (!activeTarget) return;
    setTargets((prev) =>
      prev.map((t) => (t.id === activeTargetId ? { ...t, objective: '' } : t))
    );
    try {
      await clearObjective(activeTargetId);
      toast.success('Objective cleared.');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to clear objective.');
    }
  };
```

- [ ] **Step 7: Pass objective props to `IntelligencePanel`**

In the `<IntelligencePanel ... />` JSX, add these props:

```jsx
              objective={activeTarget.objective || ''}
              onSetObjective={handleSetObjective}
              onClearObjective={handleClearObjective}
```

- [ ] **Step 8: Verify it builds**

Run: `cd Telegram-premium-2025 && npm run lint && npm run build`
Expected: build succeeds.

---

### Task 10: ChatArea — render `directive` entries as centered system chips

**Files:**
- Modify: `Telegram-premium-2025/src/components/decoy/ChatArea.jsx`

- [ ] **Step 1: Add a directive branch in the PREMIUM messages map**

Inside the premium `messages.map((msg, idx) => { ... })` (the one starting near line 317), right after `const showDateSep = ...;` and before the `return (`, add an early return for directives:

```jsx
              if (msg.role === 'directive') {
                return (
                  <React.Fragment key={msg.id}>
                    {showDateSep && <DateSeparator label={currentLabel} />}
                    <div className="self-center my-1 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider text-[#FBBF24] bg-[#FBBF24]/10 border border-[#FBBF24]/30 select-none">
                      ⚙ {msg.text}
                    </div>
                  </React.Fragment>
                );
              }
```

- [ ] **Step 2: Add the same branch in the STANDARD messages map**

Inside the standard-mode `messages.map((msg, idx) => { ... })` (starting near line 626), add the identical early-return block right after `const showDateSep = ...;`.

- [ ] **Step 3: Verify it builds**

Run: `cd Telegram-premium-2025 && npm run lint && npm run build`
Expected: build succeeds.

---

### Task 11: IntelligencePanel — Standing Objective section

**Files:**
- Modify: `Telegram-premium-2025/src/components/decoy/IntelligencePanel.jsx`

- [ ] **Step 1: Accept the new props + local state**

Add `objective`, `onSetObjective`, `onClearObjective` to the destructured props. After the existing `const [briefing, setBriefing] = useState(behavior || "");` line, add:

```jsx
  const [objectiveDraft, setObjectiveDraft] = useState(objective || "");
  useEffect(() => {
    setObjectiveDraft(objective || "");
  }, [objective]);
```

- [ ] **Step 2: Add the Standing Objective block in the PREMIUM layout**

In the premium return, immediately after the closing `</div>` of the `{/* TARGET BRIEFING (EDITABLE TEXTAREA) */}` block (before `{/* QUICK ACTIONS ROW */}`), insert:

```jsx
          {/* STANDING OBJECTIVE (operator steering) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[8.5px] font-bold text-gray-500 tracking-widest uppercase">Standing Objective</h4>
              {objective ? (
                <button
                  type="button"
                  onClick={() => { if (onClearObjective) onClearObjective(); }}
                  className="text-[8px] font-bold uppercase tracking-wider text-[#F472B6] hover:text-white transition-colors"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="relative">
              <textarea
                value={objectiveDraft}
                onChange={e => setObjectiveDraft(e.target.value)}
                placeholder="e.g. get their USDT wallet address"
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-lg px-3 py-2 text-xs leading-relaxed font-sans focus:outline-none transition-all duration-200"
                style={{
                  background:   "#020B10",
                  border:       "1px solid rgba(245,158,11,0.40)",
                  borderLeft:   "2.5px solid #FBBF24",
                  borderRadius: "0.5rem",
                  color:        "#E5E7EB",
                  caretColor:   "#FBBF24",
                  boxShadow:    "inset 0 1px 4px rgba(0,0,0,0.3)",
                  minHeight:    "34px",
                }}
                onBlur={() => {
                  const trimmed = objectiveDraft.trim();
                  if (trimmed && trimmed !== (objective || "") && onSetObjective) onSetObjective(trimmed);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = objectiveDraft.trim();
                  if (trimmed && onSetObjective) onSetObjective(trimmed);
                }}
                className="absolute right-2.5 bottom-2 text-[#FBBF24] hover:text-white transition-colors"
                title="Set objective"
              >
                <svg className="w-3.5 h-3.5 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
            {objective ? (
              <span className="text-[8px] text-[#FBBF24]/80 font-semibold tracking-wide">Active — shaping every reply</span>
            ) : (
              <span className="text-[8px] text-gray-600 font-semibold tracking-wide">No standing objective set</span>
            )}
          </div>
```

- [ ] **Step 3: Add `propTypes`**

Add to `IntelligencePanel.propTypes`:

```jsx
  objective: PropTypes.string,
  onSetObjective: PropTypes.func,
  onClearObjective: PropTypes.func,
```

- [ ] **Step 4: Verify it builds**

Run: `cd Telegram-premium-2025 && npm run lint && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual UI check (full feature)**

Start backend (`npm run dev` in `telegram premium-server`) and frontend (`npm run dev` in `Telegram-premium-2025`). Open `/generic/decoy` with an active session and:
1. In the right Intelligence Panel, type a Standing Objective and blur/submit → toast "Objective set", and a ⚙ `Objective set: …` chip appears centered in the chat feed.
2. Click the **Brief** button in the chat composer, type a nudge, send → toast "Nudge sent…", a ⚙ `Nudge: …` chip appears.
3. Have the target send a message (or use a test conversation). Confirm the next AI reply reflects the nudge, and that a *second* nudge is required for the next turn (one-shot cleared).
4. Click **Clear** on the objective → ⚙ `Objective cleared` chip appears; subsequent replies no longer pursue it.
5. Confirm directive chips are NOT sent to the target (check the actual Telegram chat) and do not appear as target/AI bubbles.

---

## PHASE 3 — COMMIT

### Task 12: Single commit per repo

- [ ] **Step 1: Confirm everything verifies**

Run: `cd "telegram premium-server" && npx tsc --noEmit && npm run lint:fix`
Run: `cd Telegram-premium-2025 && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 2: Commit the backend repo**

```bash
cd "telegram premium-server"
git add src/models/decoySession.model.ts src/repository/decoySession.repository.ts src/services/decoyAI.service.ts src/services/decoyBot.service.ts src/middlewares/validators/decoyBot.validator.ts src/controllers/decoyBot.controller.ts src/routes/decoyBot.route.ts
git commit -m "feat(decoy): operator steering — standing objective + one-shot nudge"
```

- [ ] **Step 3: Commit the frontend repo**

```bash
cd Telegram-premium-2025
git add src/context/DecoyContext.jsx src/hooks/useDecoySocket.jsx src/pages/decoy/GenericDecoyPage.jsx src/components/decoy/ChatArea.jsx src/components/decoy/IntelligencePanel.jsx
git commit -m "feat(decoy): operator steering UI — objective panel + nudge wiring + directive log"
```

(Confirm with the user before running these — commits are deferred to the very end per their instruction.)

---

## Self-Review

**Spec coverage:**
- Two-slot model (objective + nudge) → Tasks 1, 3, 6, 9, 11. ✓
- Conflict-rule framing (nudge wins on conflict) → `buildSteeringBlock` prompt text, Task 3. ✓
- Nudge modifies only the next natural reply, no proactive send → Task 4 reads from snapshot, clears after send; no new send path. ✓
- Directive transcript entries, operator-only, filtered from model context → role enum (Task 1), `isModelVisible` filter (Task 3), directive emit (Task 6), rendering (Tasks 9, 10). ✓
- Endpoints as pure DB writes (work in worker mode) → Task 6 uses repo + emitter only, no bot-service/IPC. ✓
- Frontend objective panel always visible with clear affordance → Task 11. ✓
- Out-of-scope items (proactive send, nudge queue, multiple objectives) → not implemented. ✓

**Deviations from spec (intentional):** `generateOpener` is not threaded with steering (opener precedes any objective/nudge). `PUT`/`DELETE` used for objective vs. the repo's all-`POST` convention — cleaner REST, flagged with the user.

**Placeholder scan:** none — every code step contains complete code; `<SESSION_ID>`/`<TOKEN>`/`<PORT>` in Task 6/11 are runtime values the operator supplies, not code placeholders.

**Type consistency:** `ISteering`/`buildSteeringBlock`/`isModelVisible` defined in Task 3 and used in Task 4; repo methods `setObjective`/`clearObjective`/`setNudge`/`clearNudge` defined in Task 2 and used in Tasks 4, 6; context methods `setObjective`/`clearObjective`/`sendNudge` defined in Task 7 and used in Task 9; `onObjective` defined in Task 8 and used in Task 9; `objective`/`onSetObjective`/`onClearObjective` props defined in Task 11 and passed in Task 9. Consistent. ✓
