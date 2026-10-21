import type { Clock } from '../shared/clock.js';

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export class LoginRateLimiter {
  private entries = new Map<string, { fails: number; first: number }>();
  constructor(private clock: Clock) {}

  private current(ip: string) {
    const e = this.entries.get(ip);
    if (e && this.clock.now() - e.first >= WINDOW_MS) {
      this.entries.delete(ip);
      return undefined;
    }
    return e;
  }

  check(ip: string): { allowed: boolean; delayMs: number; retryAfterS?: number } {
    const e = this.current(ip);
    if (!e) return { allowed: true, delayMs: 0 };
    if (e.fails >= MAX_FAILS) {
      const retryAfterS = Math.max(1, Math.ceil((e.first + WINDOW_MS - this.clock.now()) / 1000));
      return { allowed: false, delayMs: 0, retryAfterS };
    }
    return { allowed: true, delayMs: Math.min(4000, 250 * 2 ** (e.fails - 1)) };
  }

  fail(ip: string): void {
    const e = this.current(ip);
    if (e) e.fails++;
    else this.entries.set(ip, { fails: 1, first: this.clock.now() });
  }

  reset(ip: string): void {
    this.entries.delete(ip);
  }
}
