import type { Clock } from '../shared/clock.js';

export class SlidingWindowLimiter {
  constructor(_opts: { limit: number; windowMs: number; clock: Clock }) {}
  acquire(_signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}

export function getNvdLimiter(_hasKey: boolean, _clock?: Clock): SlidingWindowLimiter {
  throw new Error('not implemented');
}
