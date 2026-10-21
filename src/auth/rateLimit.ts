import type { Clock } from '../shared/clock.js';

export class LoginRateLimiter {
  constructor(_clock: Clock) {}
  check(_ip: string): { allowed: boolean; delayMs: number; retryAfterS?: number } {
    throw new Error('not implemented');
  }
  fail(_ip: string): void {
    throw new Error('not implemented');
  }
  reset(_ip: string): void {
    throw new Error('not implemented');
  }
}
