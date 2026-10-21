import { executeRun, type PipelineDeps } from '../pipeline/index.js';
import type { Run, RunStatus } from '../shared/types.js';
import { AppError } from '../shared/errors.js';

type Execute = (runId: string, deps: PipelineDeps, signal: AbortSignal) => Promise<RunStatus>;

export class RunQueue {
  private active = new Map<string, { ctrl: AbortController; done: Promise<void> }>();

  constructor(
    private deps: PipelineDeps,
    private opts: { concurrency: () => number; execute?: Execute },
  ) {}

  recover(): void {
    this.deps.db.runs.requeueRunning();
    this.kick();
  }

  enqueue(feedId: string, trigger: Run['trigger']): Run {
    const { runs, feeds } = this.deps.db;
    if (!feeds.get(feedId)) throw new AppError('feed_not_found', 404);
    if (runs.activeForFeed(feedId)) throw new AppError('run_already_active', 409);
    const run = runs.create(feedId, trigger, this.deps.clock.now());
    this.deps.bus.emit({ type: 'run.status', runId: run.id, feedId, status: 'queued', errorCode: null });
    this.kick();
    return run;
  }

  kick(): void {
    const { runs } = this.deps.db;
    const execute = this.opts.execute ?? executeRun;
    while (this.active.size < Math.max(1, this.opts.concurrency())) {
      const next = runs.nextQueued();
      if (!next) return;
      if (!runs.markRunning(next.id, this.deps.clock.now())) return;
      const ctrl = new AbortController();
      const done = (async () => {
        try {
          await execute(next.id, this.deps, ctrl.signal);
        } catch (e) {
          this.deps.logger.error({ runId: next.id, err: (e as Error).message }, 'run crashed');
          const cur = runs.get(next.id);
          if (cur && (cur.status === 'running' || cur.status === 'queued')) {
            runs.finish(next.id, 'failed', this.deps.clock.now(), { errorCode: 'internal_error' });
            this.deps.bus.emit({ type: 'run.status', runId: next.id, feedId: next.feedId, status: 'failed', errorCode: 'internal_error' });
          }
        } finally {
          this.active.delete(next.id);
          this.kick();
        }
      })();
      this.active.set(next.id, { ctrl, done });
    }
  }

  cancel(runId: string): boolean {
    const a = this.active.get(runId);
    if (a) {
      a.ctrl.abort();
      return true;
    }
    const run = this.deps.db.runs.get(runId);
    if (!run || run.status !== 'queued') return false;
    this.deps.db.runs.finish(runId, 'cancelled', this.deps.clock.now(), { errorCode: 'cancelled' });
    this.deps.bus.emit({ type: 'run.status', runId, feedId: run.feedId, status: 'cancelled', errorCode: 'cancelled' });
    return true;
  }

  async idle(): Promise<void> {
    while (this.active.size) await Promise.all([...this.active.values()].map((a) => a.done));
  }
}
