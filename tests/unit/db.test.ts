import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { openDb, migrate, type Db } from '../../src/db/index.js';
import { createFeedsRepo } from '../../src/db/repos/feeds.js';
import { createSettingsRepo } from '../../src/db/repos/settings.js';
import { seedIfEmpty } from '../../src/db/seed.js';
import { loadConfig } from '../../src/config/index.js';
import { FakeClock } from '../../src/shared/clock.js';
import { tmpDataDir } from '../helpers/tmpDataDir.js';

const MIG = join(process.cwd(), 'migrations');
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((c) => c()));

function setup(): Db {
  const t = tmpDataDir();
  const db = openDb(join(t.dir, 'test.db'));
  cleanups.push(() => { db.close(); t.cleanup(); });
  migrate(db, MIG);
  return db;
}
const cfg = () => loadConfig({ PFLUX_DATA_DIR: '/tmp/x' } as NodeJS.ProcessEnv);

describe('db', () => {
  it('migrate is idempotent', () => {
    const db = setup();
    migrate(db, MIG);
    const ids = db.prepare('SELECT id FROM schema_migrations').all();
    expect(ids).toEqual([{ id: '001' }, { id: '002' }, { id: '003' }]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('seeds 3 disabled feeds once', () => {
    const db = setup();
    const clock = new FakeClock(1000);
    seedIfEmpty(db, cfg(), clock);
    seedIfEmpty(db, cfg(), clock);
    const feeds = createFeedsRepo(db).list();
    expect(feeds).toHaveLength(3);
    expect(feeds.every((f) => !f.enabled)).toBe(true);
    expect(feeds.map((f) => f.sourceType).sort()).toEqual(['nvd', 'osv', 'rss']);
  });

  it('duplicate, delete, due, export, settings', () => {
    const db = setup();
    seedIfEmpty(db, cfg(), new FakeClock(1000));
    const repo = createFeedsRepo(db);
    const src = repo.list()[0]!;
    repo.setEnabled(src.id, true, 2000);
    const dup = repo.duplicate(src.id, 3000)!;
    expect(dup.name).toBe(`Copie de ${src.name}`);
    expect(dup.enabled).toBe(false);
    repo.setSchedule(src.id, { nextRunAt: 5000 });
    expect(repo.due(4999)).toHaveLength(0);
    expect(repo.due(5000).map((f) => f.id)).toEqual([src.id]);
    repo.setSchedule(src.id, { nextRunAt: null });
    expect(repo.due(2000).map((f) => f.id)).toEqual([src.id]);
    repo.setSchedule(src.id, { nextRunAt: null, lastRunAt: 10_000 });
    expect(repo.due(10_000 + src.frequencyHours * 3_600_000 - 1)).toHaveLength(0);
    expect(repo.due(10_000 + src.frequencyHours * 3_600_000).map((f) => f.id)).toEqual([src.id]);
    expect(repo.exportAll()[0]).not.toHaveProperty('id');
    db.prepare('INSERT INTO seen_items (feed_id, dedup_key, seen_at) VALUES (?, ?, ?)').run(src.id, 'k', 1);
    expect(repo.delete(src.id)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM seen_items').get()).toEqual({ n: 0 });
    const s = createSettingsRepo(db);
    s.set({ ntfyTopic: 'abc', retentionDays: 3 });
    s.set({ retentionDays: 5 });
    expect(s.getAll()).toEqual({ ntfyTopic: 'abc', retentionDays: 5 });
  });
});
