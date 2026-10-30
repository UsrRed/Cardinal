import { randomUUID } from 'node:crypto';
import type { LogLevel, Page, Run, RunLog, RunStatus, RunStep, StepState } from '../../shared/types.js';
import type { Db } from '../index.js';

export interface RunsRepo {
  create(feedId: string, trigger: Run['trigger'], now: number): Run;
  get(id: string): Run | null;
  list(q: { feedId?: string; page: number; pageSize: number }): Page<Run>;
  activeForFeed(feedId: string): Run | null;
  nextQueued(): Run | null;
  countRunning(): number;
  markRunning(id: string, now: number): boolean;
  setStep(id: string, step: RunStep, state: StepState, detail?: string): void;
  setCounts(id: string, c: Partial<Pick<Run, 'fetchedCount' | 'newCount' | 'keptCount' | 'notifiedCount' | 'noNews'>>): void;
  finish(
    id: string,
    status: Exclude<RunStatus, 'queued' | 'running'>,
    now: number,
    extra?: { errorCode?: string; digestId?: string },
  ): void;
  requeueRunning(): number;
  appendLog(id: string, level: LogLevel, step: RunStep | null, message: string, now: number): RunLog;
  logs(id: string, afterId?: number): RunLog[];
}

const STEPS: RunStep[] = ['fetch', 'dedup', 'triage', 'digest', 'notify'];
const iso = (n: number | null): string | null => (n === null ? null : new Date(n).toISOString());

export function createRunsRepo(db: Db): RunsRepo {
  const SEL = 'SELECT r.*, f.name AS feed_name FROM runs r JOIN feeds f ON f.id = r.feed_id';
  const toRun = (r: any): Run => ({
    id: r.id, feedId: r.feed_id, feedName: r.feed_name, status: r.status, trigger: r.trigger, steps: JSON.parse(r.steps),
    fetchedCount: r.fetched_count, newCount: r.new_count, keptCount: r.kept_count, notifiedCount: r.notified_count,
    noNews: !!r.no_news, digestId: r.digest_id, errorCode: r.error_code,
    queuedAt: iso(r.queued_at)!, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at),
  });
  const get = (id: string): Run | null => {
    const r = db.prepare(`${SEL} WHERE r.id = ?`).get(id);
    return r ? toRun(r) : null;
  };
  return {
    create(feedId, trigger, now) {
      const id = randomUUID();
      const steps = STEPS.map((step) => ({ step, state: 'todo', detail: null }));
      db.prepare("INSERT INTO runs (id, feed_id, status, trigger, steps, queued_at) VALUES (?, ?, 'queued', ?, ?, ?)")
        .run(id, feedId, trigger, JSON.stringify(steps), now);
      return get(id)!;
    },
    get,
    list(q) {
      const w = q.feedId === undefined ? '' : 'WHERE r.feed_id = ?';
      const args = q.feedId === undefined ? [] : [q.feedId];
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM runs r ${w}`).get(...args) as { n: number }).n;
      const rows = db.prepare(`${SEL} ${w} ORDER BY r.queued_at DESC, r.rowid DESC LIMIT ? OFFSET ?`)
        .all(...args, q.pageSize, (q.page - 1) * q.pageSize);
      return { items: rows.map(toRun), total, page: q.page, pageSize: q.pageSize };
    },
    activeForFeed(feedId) {
      const r = db.prepare(`${SEL} WHERE r.feed_id = ? AND r.status IN ('queued','running') ORDER BY r.queued_at DESC LIMIT 1`).get(feedId);
      return r ? toRun(r) : null;
    },
    nextQueued() {
      const r = db.prepare(`${SEL} WHERE r.status = 'queued' ORDER BY r.queued_at, r.rowid LIMIT 1`).get();
      return r ? toRun(r) : null;
    },
    countRunning() {
      return (db.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'running'").get() as { n: number }).n;
    },
    markRunning(id, now) {
      return db.prepare("UPDATE runs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'").run(now, id).changes > 0;
    },
    setStep(id, step, state, detail) {
      db.transaction(() => {
        const row = db.prepare('SELECT steps FROM runs WHERE id = ?').get(id) as { steps: string } | undefined;
        if (!row) return;
        const steps = (JSON.parse(row.steps) as Run['steps']).map((s) =>
          s.step === step ? { step, state, detail: detail === undefined ? null : detail.slice(0, 200) } : s,
        );
        db.prepare('UPDATE runs SET steps = ? WHERE id = ?').run(JSON.stringify(steps), id);
      })();
    },
    setCounts(id, c) {
      const map = { fetchedCount: 'fetched_count', newCount: 'new_count', keptCount: 'kept_count', notifiedCount: 'notified_count', noNews: 'no_news' } as const;
      const keys = (Object.keys(c) as (keyof typeof map)[]).filter((k) => k in map && c[k] !== undefined);
      if (!keys.length) return;
      db.prepare(`UPDATE runs SET ${keys.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`)
        .run(...keys.map((k) => (typeof c[k] === 'boolean' ? (c[k] ? 1 : 0) : c[k])), id);
    },
    finish(id, status, now, extra) {
      db.prepare('UPDATE runs SET status = ?, finished_at = ?, error_code = ?, digest_id = COALESCE(?, digest_id) WHERE id = ?')
        .run(status, now, extra?.errorCode ?? null, extra?.digestId ?? null, id);
    },
    requeueRunning() {
      return db.prepare("UPDATE runs SET status = 'queued', started_at = NULL WHERE status = 'running'").run().changes;
    },
    appendLog(id, level, step, message, now) {
      const info = db.prepare('INSERT INTO run_logs (run_id, ts, level, step, message) VALUES (?, ?, ?, ?, ?)').run(id, now, level, step, message);
      return { id: Number(info.lastInsertRowid), runId: id, ts: iso(now)!, level, step, message };
    },
    logs(id, afterId = 0) {
      return (db.prepare('SELECT * FROM run_logs WHERE run_id = ? AND id > ? ORDER BY id').all(id, afterId) as any[]).map((r) => ({
        id: r.id, runId: r.run_id, ts: iso(r.ts)!, level: r.level, step: r.step, message: r.message,
      }));
    },
  };
}
