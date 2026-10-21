import type { Db } from '../index.js';

export function purge(_db: Db, _olderThan: number): { runs: number; digests: number; items: number } {
  throw new Error('not implemented');
}
