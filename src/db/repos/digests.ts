import { randomUUID } from 'node:crypto';
import type { Digest, DigestSection, DigestSummary, Page } from '../../shared/types.js';
import type { Db } from '../index.js';
import { toItem } from './items.js';

export interface DigestsRepo {
  create(
    d: { feedId: string; runId: string; title: string; lede: string; sections: DigestSection[] },
    now: number,
  ): string;
  get(id: string): Digest | null;
  listByFeed(feedId: string | null, page: number, pageSize: number): Page<DigestSummary>;
}

export function createDigestsRepo(db: Db): DigestsRepo {
  const iso = (n: number) => new Date(n).toISOString();
  return {
    create(d, now) {
      const id = randomUUID();
      db.prepare('INSERT INTO digests (id, feed_id, run_id, title, lede, sections, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, d.feedId, d.runId, d.title, d.lede, JSON.stringify(d.sections), now);
      return id;
    },
    get(id) {
      const r = db
        .prepare('SELECT d.*, f.name AS feed_name FROM digests d JOIN feeds f ON f.id = d.feed_id WHERE d.id = ?')
        .get(id) as (Record<string, any> & { feed_name: string }) | undefined;
      if (!r) return null;
      const items = (db.prepare('SELECT * FROM items WHERE digest_id = ? ORDER BY rowid').all(id) as Parameters<typeof toItem>[0][]).map(toItem);
      return {
        id: r.id, feedId: r.feed_id, feedName: r.feed_name, runId: r.run_id, title: r.title, lede: r.lede,
        sections: JSON.parse(r.sections), createdAt: iso(r.created_at), items,
      };
    },
    listByFeed(feedId, page, pageSize) {
      const w = feedId === null ? '' : 'WHERE d.feed_id = ?';
      const args = feedId === null ? [] : [feedId];
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM digests d ${w}`).get(...args) as { n: number }).n;
      const rows = db
        .prepare(
          `SELECT d.*, f.name AS feed_name,
            (SELECT COUNT(*) FROM items i WHERE i.digest_id = d.id) AS item_count,
            (SELECT COUNT(*) FROM items i WHERE i.digest_id = d.id AND i.priority = 'high') AS high_count
           FROM digests d JOIN feeds f ON f.id = d.feed_id ${w}
           ORDER BY d.created_at DESC, d.rowid DESC LIMIT ? OFFSET ?`,
        )
        .all(...args, pageSize, (page - 1) * pageSize) as any[];
      return {
        items: rows.map((r) => ({
          id: r.id, feedId: r.feed_id, feedName: r.feed_name, title: r.title, lede: r.lede, itemCount: r.item_count,
          highCount: r.high_count, createdAt: iso(r.created_at),
        })),
        total, page, pageSize,
      };
    },
  };
}
