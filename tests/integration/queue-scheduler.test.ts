import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, migrate } from '../../src/db/index.js';
import { createFeedsRepo } from '../../src/db/repos/feeds.js';
import { createRunsRepo } from '../../src/db/repos/runs.js';
import type { PipelineDeps } from '../../src/pipeline/index.js';
import { RunEventBus } from '../../src/pipeline/runEvents.js';
import { RunQueue } from '../../src/queue/index.js';
import { Scheduler } from '../../src/scheduler/index.js';
import { acquireLock } from '../../src/scheduler/lock.js';
import { FakeClock } from '../../src/shared/clock.js';
import { tmpDataDir } from '../helpers/tmpDataDir.js';

const NOW = Date.parse('2026-01-10T00:00:00Z');
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((c) => c()));
const logger = { error() {}, warn() {} } as never;

function setup(concurrency = 1, execute?: (id: string, d: PipelineDeps, s: AbortSignal) => Promise<never>) {
  const t = tmpDataDir();
  const db = openDb(join(t.dir, 't.db'));
  cleanups.push(() => { db.close(); t.cleanup(); });
  migrate(db, join(process.cwd(), 'migrations'));
  const feeds = createFeedsRepo(db);
  const runs = createRunsRepo(db);
  const clock = new FakeClock(NOW);
  const mk = (enabled = true) => feeds.create({
    name: 'F', instructions: 'x', sourceType: 'rss', sourceParams: { urls: ['http://x.test/rss'] },
    frequencyHours: 1, freshnessDays: 30, enabled, notify: false, notifyThreshold: 'low',
    ntfyServer: null, ntfyTopic: null, model: 'sonnet', budgetUsd: 0.5,
  }, NOW);
  const deps = { db: { feeds, runs }, bus: new RunEventBus(), clock, logger } as unknown as PipelineDeps;
  const queue = new RunQueue(deps, { concurrency: () => concurrency, execute: execute as never });
  return { feeds, runs, clock, mk, queue, deps };
}

const gate = () => { let open!: () => void; const p = new Promise<void>((r) => (open = r)); return { p, open }; };

describe('RunQueue', () => {
  it('concurrency 1 serializes, 2 runs together', async () => {
    for (const [conc, expected] of [[1, 1], [2, 2]] as const) {
      let cur = 0, peak = 0;
      const g = gate();
      const s = setup(conc, async (id, d) => {
        cur++; peak = Math.max(peak, cur);
        await g.p;
        cur--;
        d.db.runs.finish(id, 'succeeded', NOW);
        return 'succeeded' as never;
      });
      s.queue.enqueue(s.mk().id, 'manual');
      s.queue.enqueue(s.mk().id, 'manual');
      await new Promise((r) => setTimeout(r, 20));
      expect(peak).toBe(expected);
      g.open();
      await s.queue.idle();
      expect(s.runs.list({ page: 1, pageSize: 10 }).items.every((r) => r.status === 'succeeded')).toBe(true);
    }
  });

  it('rejects when a run is active, accepts forced run on paused feed', () => {
    const g = gate();
    const s = setup(1, () => g.p as never);
    const paused = s.mk(false);
    const r = s.queue.enqueue(paused.id, 'manual');
    expect(r.status).toBe('queued');
    expect(() => s.queue.enqueue(paused.id, 'manual')).toThrowError(expect.objectContaining({ status: 409 }));
    g.open();
  });

  it('cancels queued and running runs, propagating the signal', async () => {
    let sig: AbortSignal | undefined;
    const s = setup(1, (id, d, signal) => new Promise((resolve) => {
      sig = signal;
      signal.addEventListener('abort', () => { d.db.runs.finish(id, 'cancelled', NOW); resolve('cancelled' as never); });
    }));
    const a = s.queue.enqueue(s.mk().id, 'manual');
    const b = s.queue.enqueue(s.mk().id, 'manual');
    expect(s.queue.cancel(b.id)).toBe(true);
    expect(s.runs.get(b.id)!.status).toBe('cancelled');
    expect(s.queue.cancel(a.id)).toBe(true);
    await s.queue.idle();
    expect(sig!.aborted).toBe(true);
    expect(s.runs.get(a.id)!.status).toBe('cancelled');
    expect(s.queue.cancel(a.id)).toBe(false);
  });

  it('recover requeues running runs', async () => {
    const s = setup(1, async (id, d) => { d.db.runs.finish(id, 'succeeded', NOW); return 'succeeded' as never; });
    const run = s.runs.create(s.mk().id, 'manual', NOW);
    s.runs.markRunning(run.id, NOW);
    expect(s.runs.get(run.id)!.status).toBe('running');
    s.queue.recover();
    await s.queue.idle();
    expect(s.runs.get(run.id)!.status).toBe('succeeded');
  });
});

describe('Scheduler', () => {
  it('does not duplicate runs across ticks', () => {
    const g = gate();
    const s = setup(1, () => g.p as never);
    const f = s.mk();
    s.feeds.setSchedule(f.id, { nextRunAt: NOW });
    const sch = new Scheduler({ feeds: s.feeds, runs: s.runs, queue: s.queue, clock: s.clock, tickMs: 1000, logger });
    sch.tick();
    s.feeds.setSchedule(f.id, { nextRunAt: NOW });
    sch.tick();
    expect(s.runs.list({ feedId: f.id, page: 1, pageSize: 10 }).total).toBe(1);
    g.open();
  });

  it('catches up with a single run and reschedules from now', () => {
    const g = gate();
    const s = setup(1, () => g.p as never);
    const f = s.mk();
    s.feeds.setSchedule(f.id, { nextRunAt: NOW - 5 * 3_600_000 });
    const sch = new Scheduler({ feeds: s.feeds, runs: s.runs, queue: s.queue, clock: s.clock, tickMs: 1000, logger });
    sch.tick(); sch.tick();
    const list = s.runs.list({ feedId: f.id, page: 1, pageSize: 10 });
    expect(list.total).toBe(1);
    expect(list.items[0]!.trigger).toBe('catchup');
    expect(s.feeds.get(f.id)!.nextRunAt).toBe(new Date(NOW + 3_600_000).toISOString());
    g.open();
  });

  it('schedules a feed that was never scheduled', () => {
    const g = gate();
    const s = setup(1, () => g.p as never);
    const f = s.mk();
    const sch = new Scheduler({ feeds: s.feeds, runs: s.runs, queue: s.queue, clock: s.clock, tickMs: 1000, logger });
    sch.tick();
    expect(s.runs.list({ feedId: f.id, page: 1, pageSize: 10 }).total).toBe(1);
    expect(s.feeds.get(f.id)!.nextRunAt).toBe(new Date(NOW + 3_600_000).toISOString());
    g.open();
  });

  it('start/stop drives ticks via the clock', () => {
    const s = setup();
    let n = 0;
    const sch = new Scheduler({ feeds: s.feeds, runs: s.runs, queue: s.queue, clock: s.clock, tickMs: 1000, logger });
    const orig = sch.tick.bind(sch);
    sch.tick = () => { n++; orig(); };
    sch.start();
    s.clock.advance(2000);
    sch.stop();
    s.clock.advance(5000);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThan(5);
  });
});

describe('acquireLock', () => {
  it('is exclusive and reclaims dead PID locks', () => {
    const t = tmpDataDir();
    cleanups.push(t.cleanup);
    const l1 = acquireLock(t.dir)!;
    expect(l1).not.toBeNull();
    expect(acquireLock(t.dir)).toBeNull();
    l1.release();
    expect(acquireLock(t.dir)).not.toBeNull();
  });
  it('takes over a lock from a dead process', () => {
    const t = tmpDataDir();
    cleanups.push(t.cleanup);
    mkdirSync(t.dir, { recursive: true });
    writeFileSync(join(t.dir, 'scheduler.lock'), JSON.stringify({ pid: 999999, startedAt: 'x' }));
    expect(acquireLock(t.dir, { isAlive: () => false })).not.toBeNull();
  });
  it('takes over a stale lock carrying its own PID (container restart)', () => {
    const t = tmpDataDir();
    cleanups.push(t.cleanup);
    mkdirSync(t.dir, { recursive: true });
    writeFileSync(join(t.dir, 'scheduler.lock'), JSON.stringify({ pid: process.pid, startedAt: 'x' }));
    expect(acquireLock(t.dir, { isAlive: () => true })).not.toBeNull();
  });
});
