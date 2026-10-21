import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { openDb, migrate, type Db } from '../../src/db/index.js';
import { createFeedsRepo } from '../../src/db/repos/feeds.js';
import { createRunsRepo } from '../../src/db/repos/runs.js';
import { createDigestsRepo } from '../../src/db/repos/digests.js';
import { createItemsRepo } from '../../src/db/repos/items.js';
import { createSeenRepo } from '../../src/db/repos/seen.js';
import { purge } from '../../src/db/repos/retention.js';
import { tmpDataDir } from '../helpers/tmpDataDir.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((c) => c()));

function setup() {
  const t = tmpDataDir();
  const db: Db = openDb(join(t.dir, 't.db'));
  cleanups.push(() => { db.close(); t.cleanup(); });
  migrate(db, join(process.cwd(), 'migrations'));
  const feeds = createFeedsRepo(db);
  const mk = (name: string) =>
    feeds.create({
      name, instructions: 'x', sourceType: 'rss', sourceParams: { urls: ['https://a.example/f'] }, frequencyHours: 1,
      freshnessDays: 7, enabled: false, notify: false, notifyThreshold: 'high', ntfyServer: null, ntfyTopic: null,
      model: 'sonnet', budgetUsd: 0.5,
    }, 1);
  return { db, feeds, mk, runs: createRunsRepo(db), digests: createDigestsRepo(db), items: createItemsRepo(db), seen: createSeenRepo(db) };
}

const itemRow = (feedId: string, digestId: string, runId: string, ref: string, priority: 'high' | 'medium' | 'low') => ({
  feedId, digestId, runId, ref, title: ref, url: null, priority, justification: 'j', summary: 's', sources: ['a'], publishedAt: null,
});

describe('repos', () => {
  it('seen: markSeen then filterUnseen, no duplicates', () => {
    const { mk, seen, db } = setup();
    const f = mk('a');
    seen.markSeen(f.id, ['k1', 'k2'], 1);
    seen.markSeen(f.id, ['k1'], 2);
    expect(seen.filterUnseen(f.id, ['k1', 'k2', 'k3'])).toEqual(new Set(['k3']));
    expect((db.prepare('SELECT COUNT(*) n FROM seen_items').get() as { n: number }).n).toBe(2);
  });

  it('requeueRunning', () => {
    const { mk, runs } = setup();
    const f = mk('a');
    const r = runs.create(f.id, 'manual', 1);
    expect(r.steps).toHaveLength(5);
    runs.markRunning(r.id, 2);
    expect(runs.countRunning()).toBe(1);
    expect(runs.requeueRunning()).toBe(1);
    expect(runs.get(r.id)!.status).toBe('queued');
    expect(runs.activeForFeed(f.id)?.id).toBe(r.id);
  });

  it('purge keeps seen_items', () => {
    const { mk, runs, digests, items, seen, db } = setup();
    const f = mk('a');
    const old = runs.create(f.id, 'manual', 10);
    const fresh = runs.create(f.id, 'manual', 1000);
    runs.finish(old.id, 'succeeded', 11);
    runs.finish(fresh.id, 'succeeded', 1001);
    const d = digests.create({ feedId: f.id, runId: old.id, title: 't', lede: 'l', sections: [], partial: false }, 12);
    items.insertMany([itemRow(f.id, d, old.id, 'i1', 'high')], 12);
    seen.markSeen(f.id, ['k'], 12);
    expect(purge(db, 500)).toEqual({ runs: 1, digests: 1, items: 1 });
    expect(runs.get(old.id)).toBeNull();
    expect(runs.get(fresh.id)).not.toBeNull();
    expect(seen.filterUnseen(f.id, ['k']).size).toBe(0);
  });

  it('usage per feed and global', () => {
    const { mk, runs } = setup();
    const a = mk('a'), b = mk('b');
    const r1 = runs.create(a.id, 'manual', 1), r2 = runs.create(a.id, 'manual', 2), r3 = runs.create(b.id, 'manual', 3);
    runs.addUsage(r1.id, { inputTokens: 10, outputTokens: 5, costUsd: 0.1 });
    runs.addUsage(r2.id, { inputTokens: 20, outputTokens: 5, costUsd: 0.2 });
    runs.addUsage(r3.id, { inputTokens: 1, outputTokens: 1, costUsd: 0.05 });
    const s = runs.usageByFeed();
    expect(s.runs).toBe(3);
    expect(s.byFeed.find((x) => x.feedId === a.id)).toMatchObject({ runs: 2, usage: { inputTokens: 30, outputTokens: 10 } });
    expect(s.totals.inputTokens).toBe(31);
    expect(s.totals.costUsd).toBeCloseTo(0.35);
  });

  it('items stream filters and orders newest first; logs and digest', () => {
    const { mk, runs, digests, items } = setup();
    const f = mk('a');
    const r = runs.create(f.id, 'manual', 1);
    const d = digests.create({ feedId: f.id, runId: r.id, title: 't', lede: 'l', sections: [{ heading: 'h', itemRefs: ['i1'], body: 'b' }], partial: false }, 5);
    const i1 = items.insertMany([itemRow(f.id, d, r.id, 'i1', 'high')], 10)[0]!;
    items.insertMany([itemRow(f.id, d, r.id, 'i2', 'low')], 20);
    items.insertMany([itemRow(f.id, d, r.id, 'i3', 'high')], 30);
    expect(items.stream({ feedId: f.id, page: 1, pageSize: 10 }).items.map((i) => i.ref)).toEqual(['i3', 'i2', 'i1']);
    expect(items.stream({ priority: 'high', page: 1, pageSize: 10 }).items.map((i) => i.ref)).toEqual(['i3', 'i1']);
    expect(items.markRead([i1.id], true)).toBe(1);
    expect(items.stream({ read: false, page: 1, pageSize: 10 }).total).toBe(2);
    expect(items.stream({ read: true, page: 1, pageSize: 10 }).items.map((i) => i.ref)).toEqual(['i1']);
    expect(items.markAllRead(f.id)).toBe(2);
    expect(digests.get(d)!.items).toHaveLength(3);
    expect(digests.listByFeed(f.id, 1, 10).items[0]).toMatchObject({ itemCount: 3, highCount: 2 });
    const l = runs.appendLog(r.id, 'info', 'fetch', 'hi', 5);
    expect(runs.logs(r.id, l.id)).toEqual([]);
    expect(runs.logs(r.id)).toHaveLength(1);
  });
});
