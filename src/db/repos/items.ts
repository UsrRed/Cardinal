import type { Item, Page, Priority } from '../../shared/types.js';

export interface ItemsRepo {
  insertMany(rows: Omit<Item, 'id' | 'read' | 'createdAt'>[], now: number): Item[];
  stream(q: { feedId?: string; priority?: Priority; read?: boolean; page: number; pageSize: number }): Page<Item>;
  markRead(ids: string[], read: boolean): number;
  markAllRead(feedId?: string): number;
}
