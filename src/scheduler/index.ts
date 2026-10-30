import type { FeedsRepo } from '../db/repos/feeds.js';
import type { RunsRepo } from '../db/repos/runs.js';
import type { RunQueue } from '../queue/index.js';
import type { Clock } from '../shared/clock.js';
import type { Logger } from '../log/logger.js';

export class Scheduler {
  private timer: unknown = null;
  private running = false;

  constructor(
    private o: {
      feeds: FeedsRepo;
      runs: RunsRepo;
      queue: RunQueue;
      clock: Clock;
      tickMs: number;
      logger: Logger;
    },
  ) {}

  tick(): void {
    const { feeds, runs, queue, clock, logger } = this.o;
    const now = clock.now();
    for (const feed of feeds.due(now)) {
      if (runs.activeForFeed(feed.id)) continue;
      const freq = feed.frequencyHours * 3_600_000;
      const due = feed.nextRunAt ? Date.parse(feed.nextRunAt) : feed.lastRunAt ? Date.parse(feed.lastRunAt) + freq : now;
      const trigger = now - due >= freq ? 'catchup' : 'schedule';
      try {
        queue.enqueue(feed.id, trigger);
        feeds.setSchedule(feed.id, { nextRunAt: now + freq });
      } catch (e) {
        logger.warn({ feedId: feed.id, err: (e as Error).message }, 'scheduler enqueue failed');
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      try {
        this.tick();
      } catch (e) {
        this.o.logger.error({ err: (e as Error).message }, 'scheduler tick failed');
      }
      this.timer = this.o.clock.setTimeout(loop, this.o.tickMs);
    };
    loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.o.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}

export function deferDelayMs(deferMinutes: number, deferCount: number): number {
  return Math.min(deferMinutes * 2 ** deferCount, 360) * 60_000;
}
