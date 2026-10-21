import { randomUUID } from 'node:crypto';
import type { Item, Page, Priority } from '../../shared/types.js';
import type { Db } from '../index.js';

export interface ItemsRepo {
  insertMany(rows: Omit<Item, 'id' | 'read' | 'createdAt'>[], now: number): Item[];
  stream(q: { feedId?: string; priority?: Priority; read?: boolean; page: number; pageSize: number }): Page<Item>;
  markRead(ids: string[], read: boolean): number;
  markAllRead(feedId?: string): number;
}

interface ItemRow {
  id: string; feed_id: string; digest_id: string; run_id: string; ref: string; title: string; url: string | null;
  priority: Priority; justification: string; summary: string; sources: string; published_at: number | null;
  read: number; created_at: number;
}

export function toItem(r: ItemRow): Item {
  return {
    id: r.id, feedId: r.feed_id, digestId: r.digest_id, runId: r.run_id, ref: r.ref, title: r.title, url: r.url,
    priority: r.priority, justification: r.justification, summary: r.summary, sources: JSON.parse(r.sources),
    publishedAt: r.published_at === null ? null : new Date(r.published_at).toISOString(), read: !!r.read,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export function createItemsRepo(db: Db): ItemsRepo {
  return {
    insertMany(rows, now) {
      const ins = db.prepare(
        `INSERT INTO items (id, feed_id, digest_id, run_id, ref, title, url, priority, justification, summary, sources, published_at, read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      );
      const ids = db.transaction(() =>
        rows.map((r) => {
          const id = randomUUID();
          ins.run(id, r.feedId, r.digestId, r.runId, r.ref, r.title, r.url, r.priority, r.justification, r.summary,
            JSON.stringify(r.sources), r.publishedAt === null ? null : Date.parse(r.publishedAt), now);
          return id;
        }),
      )();
      return ids.map((id) => toItem(db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow));
    },
    stream(q) {
      const conds: string[] = [];
      const args: unknown[] = [];
      if (q.feedId !== undefined) { conds.push('feed_id = ?'); args.push(q.feedId); }
      if (q.priority !== undefined) { conds.push('priority = ?'); args.push(q.priority); }
      if (q.read !== undefined) { conds.push('read = ?'); args.push(q.read ? 1 : 0); }
      const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM items ${w}`).get(...args) as { n: number }).n;
      const rows = db
        .prepare(`SELECT * FROM items ${w} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
        .all(...args, q.pageSize, (q.page - 1) * q.pageSize) as ItemRow[];
      return { items: rows.map(toItem), total, page: q.page, pageSize: q.pageSize };
    },
    markRead(ids, read) {
      const up = db.prepare('UPDATE items SET read = ? WHERE id = ?');
      return db.transaction(() => ids.reduce((n, id) => n + up.run(read ? 1 : 0, id).changes, 0))();
    },
    markAllRead(feedId) {
      return feedId === undefined
        ? db.prepare('UPDATE items SET read = 1 WHERE read = 0').run().changes
        : db.prepare('UPDATE items SET read = 1 WHERE read = 0 AND feed_id = ?').run(feedId).changes;
    },
  };
}
