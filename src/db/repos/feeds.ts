import type { Feed, FeedSummary } from '../../shared/types.js';
import type { FeedInput } from '../../shared/schemas.js';

export interface FeedsRepo {
  list(): FeedSummary[];
  get(id: string): Feed | null;
  create(input: FeedInput, now: number): Feed;
  update(id: string, patch: Partial<FeedInput>, now: number): Feed | null;
  delete(id: string): boolean;
  setEnabled(id: string, enabled: boolean, now: number): Feed | null;
  due(now: number): Feed[];
  setSchedule(id: string, s: { lastRunAt?: number; nextRunAt: number | null; deferCount?: number }): void;
  getDeferCount(id: string): number;
}
