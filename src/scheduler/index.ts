import type { FeedsRepo } from '../db/repos/feeds.js';
import type { RunsRepo } from '../db/repos/runs.js';
import type { RunQueue } from '../queue/index.js';
import type { Clock } from '../shared/clock.js';
import type { Logger } from '../log/logger.js';

export class Scheduler {
  constructor(_o: {
    feeds: FeedsRepo;
    runs: RunsRepo;
    queue: RunQueue;
    clock: Clock;
    tickMs: number;
    logger: Logger;
  }) {}
  tick(): void {
    throw new Error('not implemented');
  }
  start(): void {
    throw new Error('not implemented');
  }
  stop(): void {
    throw new Error('not implemented');
  }
}

export function deferDelayMs(deferMinutes: number, deferCount: number): number {
  return Math.min(deferMinutes * 2 ** deferCount, 360) * 60_000;
}
