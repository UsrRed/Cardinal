import { randomUUID } from 'node:crypto';
import type { Feed, FeedSummary, RunStatus } from '../../shared/types.js';
import type { FeedInput } from '../../shared/schemas.js';
import type { Db } from '../index.js';

export interface FeedsRepo {
  list(): FeedSummary[];
  get(id: string): Feed | null;
  create(input: FeedInput, now: number): Feed;
  update(id: string, patch: Partial<FeedInput>, now: number): Feed | null;
  delete(id: string): boolean;
  duplicate(id: string, now: number): Feed | null;
  setEnabled(id: string, enabled: boolean, now: number): Feed | null;
  due(now: number): Feed[];
  setSchedule(id: string, s: { lastRunAt?: number; nextRunAt: number | null; deferCount?: number }): void;
  getDeferCount(id: string): number;
  exportAll(): FeedInput[];
}

interface Row {
  id: string; name: string; instructions: string; source_type: Feed['sourceType']; source_params: string;
  frequency_hours: number; freshness_days: number; enabled: number; notify: number; notify_threshold: Feed['notifyThreshold'];
  ntfy_server: string | null; ntfy_topic: string | null; model: string;
  created_at: number; updated_at: number; last_run_at: number | null; next_run_at: number | null;
}

const iso = (n: number | null): string | null => (n === null ? null : new Date(n).toISOString());

function toFeed(r: Row): Feed {
  return {
    id: r.id, name: r.name, instructions: r.instructions, sourceType: r.source_type,
    sourceParams: JSON.parse(r.source_params), frequencyHours: r.frequency_hours, freshnessDays: r.freshness_days,
    enabled: !!r.enabled, notify: !!r.notify, notifyThreshold: r.notify_threshold,
    ntfyServer: r.ntfy_server, ntfyTopic: r.ntfy_topic, model: r.model,
    createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, lastRunAt: iso(r.last_run_at), nextRunAt: iso(r.next_run_at),
  };
}

// A feed never scheduled (created or enabled without a run) has no next_run_at:
// it is due one period after its last run, or right away if it never ran.
const DUE_AT = 'COALESCE(next_run_at, last_run_at + frequency_hours * 3600000, 0)';

const COLS: Record<keyof FeedInput, string> = {
  name: 'name', instructions: 'instructions', sourceType: 'source_type', sourceParams: 'source_params',
  frequencyHours: 'frequency_hours', freshnessDays: 'freshness_days', enabled: 'enabled', notify: 'notify',
  notifyThreshold: 'notify_threshold', ntfyServer: 'ntfy_server', ntfyTopic: 'ntfy_topic', model: 'model',
};

function dbValue(k: keyof FeedInput, v: unknown): unknown {
  if (k === 'sourceParams') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export function createFeedsRepo(db: Db): FeedsRepo {
  const getRow = (id: string) => db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as Row | undefined;
  const get = (id: string): Feed | null => {
    const r = getRow(id);
    return r ? toFeed(r) : null;
  };
  const create = (input: FeedInput, now: number): Feed => {
    const id = randomUUID();
    const keys = Object.keys(COLS) as (keyof FeedInput)[];
    db.prepare(
      `INSERT INTO feeds (id, ${keys.map((k) => COLS[k]).join(', ')}, created_at, updated_at) VALUES (?, ${keys.map(() => '?').join(', ')}, ?, ?)`,
    ).run(id, ...keys.map((k) => dbValue(k, input[k])), now, now);
    return get(id)!;
  };
  return {
    list() {
      const rows = db.prepare(
        `SELECT f.*,
          (SELECT COUNT(*) FROM items i WHERE i.feed_id = f.id AND i.read = 0) AS unread,
          (SELECT status FROM runs r WHERE r.feed_id = f.id ORDER BY queued_at DESC, rowid DESC LIMIT 1) AS last_status,
          (SELECT id FROM runs r WHERE r.feed_id = f.id AND status IN ('queued','running') ORDER BY queued_at DESC LIMIT 1) AS active_run
         FROM feeds f ORDER BY f.created_at, f.rowid`,
      ).all() as (Row & { unread: number; last_status: RunStatus | null; active_run: string | null })[];
      return rows.map((r) => ({ ...toFeed(r), unreadCount: r.unread, lastRunStatus: r.last_status, activeRunId: r.active_run }));
    },
    get,
    create,
    update(id, patch, now) {
      if (!getRow(id)) return null;
      const keys = (Object.keys(patch) as (keyof FeedInput)[]).filter((k) => k in COLS && patch[k] !== undefined);
      db.prepare(`UPDATE feeds SET ${[...keys.map((k) => `${COLS[k]} = ?`), 'updated_at = ?'].join(', ')} WHERE id = ?`).run(
        ...keys.map((k) => dbValue(k, patch[k])), now, id,
      );
      return get(id);
    },
    delete(id) {
      return db.transaction(() => {
        db.prepare('DELETE FROM seen_items WHERE feed_id = ?').run(id);
        return db.prepare('DELETE FROM feeds WHERE id = ?').run(id).changes > 0;
      })();
    },
    duplicate(id, now) {
      const f = get(id);
      if (!f) return null;
      const { name, instructions, sourceType, sourceParams, frequencyHours, freshnessDays, notify, notifyThreshold, ntfyServer, ntfyTopic, model } = f;
      return create(
        { name: `Copie de ${name}`.slice(0, 120), instructions, sourceType, sourceParams, frequencyHours, freshnessDays, enabled: false, notify, notifyThreshold, ntfyServer, ntfyTopic, model } as FeedInput,
        now,
      );
    },
    setEnabled(id, enabled, now) {
      db.prepare('UPDATE feeds SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, now, id);
      return get(id);
    },
    due(now) {
      const rows = db.prepare(`SELECT * FROM feeds WHERE enabled = 1 AND ${DUE_AT} <= ? ORDER BY ${DUE_AT}`).all(now) as Row[];
      return rows.map(toFeed);
    },
    setSchedule(id, s) {
      db.prepare(
        'UPDATE feeds SET next_run_at = ?, last_run_at = COALESCE(?, last_run_at), defer_count = COALESCE(?, defer_count) WHERE id = ?',
      ).run(s.nextRunAt, s.lastRunAt ?? null, s.deferCount ?? null, id);
    },
    getDeferCount(id) {
      return (db.prepare('SELECT defer_count FROM feeds WHERE id = ?').get(id) as { defer_count: number } | undefined)?.defer_count ?? 0;
    },
    exportAll() {
      return (db.prepare('SELECT * FROM feeds ORDER BY created_at, rowid').all() as Row[]).map((r) => {
        const { id: _i, createdAt: _c, updatedAt: _u, lastRunAt: _l, nextRunAt: _n, ...rest } = toFeed(r);
        return rest;
      });
    },
  };
}
