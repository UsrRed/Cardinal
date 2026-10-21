import type { Db } from '../index.js';

/** Deletes finished runs queued before `olderThan` (ms) with their digests/items/logs. Never touches seen_items. */
export function purge(db: Db, olderThan: number): { runs: number; digests: number; items: number } {
  const where = "FROM runs WHERE queued_at < ? AND status NOT IN ('queued','running')";
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE run_id IN (SELECT id ${where})`).get(olderThan) as { n: number }).n;
  return db.transaction(() => {
    const digests = count('digests');
    const items = count('items');
    const runs = db.prepare(`DELETE ${where}`).run(olderThan).changes;
    return { runs, digests, items };
  })();
}
