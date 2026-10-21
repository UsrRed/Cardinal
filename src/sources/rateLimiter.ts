import { systemClock, type Clock } from '../shared/clock.js';

export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly clock: Clock;
  private tail: Promise<void> = Promise.resolve();

  constructor(opts: { limit: number; windowMs: number; clock: Clock }) {
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.clock = opts.clock;
  }

  acquire(signal?: AbortSignal): Promise<void> {
    const run = this.tail.then(() => this.take(signal));
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async take(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new Error('aborted');
      const now = this.clock.now();
      while (this.stamps.length && this.stamps[0]! <= now - this.windowMs) this.stamps.shift();
      if (this.stamps.length < this.limit) {
        this.stamps.push(now);
        return;
      }
      const wait = this.stamps[0]! + this.windowMs - now;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          this.clock.clearTimeout(h);
          reject(new Error('aborted'));
        };
        const h = this.clock.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, wait);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
}

const nvdLimiters = new Map<boolean, SlidingWindowLimiter>();

export function getNvdLimiter(hasKey: boolean, clock: Clock = systemClock): SlidingWindowLimiter {
  let l = nvdLimiters.get(hasKey);
  if (!l) {
    l = new SlidingWindowLimiter({ limit: hasKey ? 50 : 5, windowMs: 30_000, clock });
    nvdLimiters.set(hasKey, l);
  }
  return l;
}
