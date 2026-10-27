import type { DailyItemRef, DailyStatus, DailySummary, Priority, Usage } from '../../shared/types.js';
import type { Db } from '../index.js';

/** Tiers as stored: categories reference item ids, resolved at read time (items may have been purged). */
export interface StoredTier {
  priority: Priority;
  categories: { name: string; body: string; itemIds: string[] }[];
}

export interface DayItem extends DailyItemRef {
  summary: string;
}

export interface DailyRepo {
  get(day: string): DailySummary | null;
  /** Creates or resets the row for `day` as running. */
  begin(day: string, now: number): void;
  finish(day: string, r: {
    status: Exclude<DailyStatus, 'running'>; title?: string; overview?: string; tiers?: StoredTier[];
    itemCount: number; usage: Usage; errorCode?: string | null;
  }, now: number): void;
  /** Marks rows left running by a previous process as failed. */
  failRunning(now: number): number;
  recent(limit: number): Array<{ day: string; status: DailyStatus; itemCount: number }>;
  /** Kept items created in [start, end), most important first. */
  itemsBetween(start: number, end: number, limit: number): DayItem[];
  countBetween(start: number, end: number): { total: number; high: number };
}

interface Row {
  day: string; status: DailyStatus; title: string; overview: string; tiers: string; item_count: number;
  input_tokens: number; output_tokens: number; cost_usd: number; error_code: string | null;
  started_at: number; finished_at: number | null;
}
interface ItemRow {
  id: string; feed_id: string; feed_name: string; digest_id: string; title: string; url: string | null;
  priority: Priority; summary: string;
}

const ITEM_SEL = `SELECT i.id, i.feed_id, f.name AS feed_name, i.digest_id, i.title, i.url, i.priority, i.summary
  FROM items i JOIN feeds f ON f.id = i.feed_id`;
const PRIO_ORDER = `CASE i.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

const toRef = (r: ItemRow): DayItem => ({
  id: r.id, feedId: r.feed_id, feedName: r.feed_name, digestId: r.digest_id, title: r.title, url: r.url,
  priority: r.priority, summary: r.summary,
});

export function createDailyRepo(db: Db): DailyRepo {
  const resolve = (ids: string[]): Map<string, DailyItemRef> => {
    const out = new Map<string, DailyItemRef>();
    if (!ids.length) return out;
    const one = db.prepare(`${ITEM_SEL} WHERE i.id = ?`);
    for (const id of ids) {
      const r = one.get(id) as ItemRow | undefined;
      if (r) { const { summary: _s, ...ref } = toRef(r); out.set(id, ref); }
    }
    return out;
  };
  return {
    get(day) {
      const r = db.prepare('SELECT * FROM daily_summaries WHERE day = ?').get(day) as Row | undefined;
      if (!r) return null;
      const stored = JSON.parse(r.tiers) as StoredTier[];
      const refs = resolve([...new Set(stored.flatMap((t) => t.categories.flatMap((c) => c.itemIds)))]);
      return {
        day: r.day, status: r.status, title: r.title, overview: r.overview, itemCount: r.item_count,
        tiers: stored.map((t) => ({
          priority: t.priority,
          categories: t.categories.map((c) => ({
            name: c.name, body: c.body,
            items: c.itemIds.map((id) => refs.get(id)).filter((x): x is DailyItemRef => !!x),
          })),
        })),
        usage: { inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd },
        errorCode: r.error_code,
        startedAt: new Date(r.started_at).toISOString(),
        finishedAt: r.finished_at === null ? null : new Date(r.finished_at).toISOString(),
      };
    },
    begin(day, now) {
      db.prepare(
        `INSERT INTO daily_summaries (day, status, started_at) VALUES (?, 'running', ?)
         ON CONFLICT(day) DO UPDATE SET status = 'running', error_code = NULL, started_at = excluded.started_at, finished_at = NULL`,
      ).run(day, now);
    },
    finish(day, f, now) {
      const keep = f.status === 'failed';
      db.prepare(
        `UPDATE daily_summaries SET status = ?, error_code = ?, item_count = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?,
           finished_at = ?${keep ? '' : ', title = ?, overview = ?, tiers = ?'} WHERE day = ?`,
      ).run(
        f.status, f.errorCode ?? null, f.itemCount, f.usage.inputTokens, f.usage.outputTokens, f.usage.costUsd, now,
        ...(keep ? [] : [f.title ?? '', f.overview ?? '', JSON.stringify(f.tiers ?? [])]),
        day,
      );
    },
    failRunning(now) {
      return db.prepare(`UPDATE daily_summaries SET status = 'failed', error_code = 'interrupted', finished_at = ? WHERE status = 'running'`)
        .run(now).changes;
    },
    recent(limit) {
      return (db.prepare('SELECT day, status, item_count FROM daily_summaries ORDER BY day DESC LIMIT ?').all(limit) as
        { day: string; status: DailyStatus; item_count: number }[]).map((r) => ({ day: r.day, status: r.status, itemCount: r.item_count }));
    },
    itemsBetween(start, end, limit) {
      return (db.prepare(`${ITEM_SEL} WHERE i.created_at >= ? AND i.created_at < ? ORDER BY ${PRIO_ORDER}, i.created_at DESC, i.rowid DESC LIMIT ?`)
        .all(start, end, limit) as ItemRow[]).map(toRef);
    },
    countBetween(start, end) {
      const r = db.prepare(`SELECT COUNT(*) AS total, SUM(priority = 'high') AS high FROM items WHERE created_at >= ? AND created_at < ?`)
        .get(start, end) as { total: number; high: number | null };
      return { total: r.total, high: r.high ?? 0 };
    },
  };
}
