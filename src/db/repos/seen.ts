import type { Db } from '../index.js';
export interface SeenRepo {
  filterUnseen(feedId: string, keys: string[]): Set<string>;
  markSeen(feedId: string, keys: string[], now: number): void;
}

export function createSeenRepo(db: Db): SeenRepo {
  return {
    filterUnseen(feedId, keys) {
      const stmt = db.prepare('SELECT 1 FROM seen_items WHERE feed_id = ? AND dedup_key = ?');
      return new Set(keys.filter((k) => !stmt.get(feedId, k)));
    },
    markSeen(feedId, keys, now) {
      const ins = db.prepare('INSERT OR IGNORE INTO seen_items (feed_id, dedup_key, seen_at) VALUES (?, ?, ?)');
      db.transaction(() => {
        for (const k of keys) ins.run(feedId, k, now);
      })();
    },
  };
}
