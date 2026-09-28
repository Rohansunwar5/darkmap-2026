import { describe, it, expect } from 'vitest';
import { hasUnansweredTarget } from '../decoyBot.service';
import { IDecoyMessage } from '../../models/decoySession.model';

const msg = (role: IDecoyMessage['role'], content = 'x'): IDecoyMessage =>
  ({ role, content, timestamp: new Date() } as IDecoyMessage);

describe('hasUnansweredTarget', () => {
  it('is false when we sent the last message (target is silent)', () => {
    // This is the case where a proactive nudge SHOULD fire.
    expect(hasUnansweredTarget([msg('target'), msg('ai')])).toBe(false);
  });

  it('is true when the target replied after our last message', () => {
    expect(hasUnansweredTarget([msg('ai'), msg('target')])).toBe(true);
  });

  it('ignores directive lines between our reply and now', () => {
    // A queued Nudge/Objective directive is operator-only, not a target reply.
    expect(hasUnansweredTarget([msg('ai'), msg('directive')])).toBe(false);
  });

  it('is true when the target opened and we never replied', () => {
    expect(hasUnansweredTarget([msg('target')])).toBe(true);
  });

  it('is false for an empty history', () => {
    expect(hasUnansweredTarget([])).toBe(false);
  });
});
