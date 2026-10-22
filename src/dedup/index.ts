import { createHash } from 'node:crypto';
import type { RawItem } from '../sources/types.js';
import type { SourceType } from '../shared/types.js';

export function normalizeUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url.trim();
  }
  u.hash = '';
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  for (const k of [...u.searchParams.keys()]) {
    if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
  }
  let s = u.toString(); // scheme and host already lowercased by URL
  if (s.endsWith('?')) s = s.slice(0, -1);
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

export function normalizeKey(item: Pick<RawItem, 'sourceKey' | 'keyKind'>): string {
  return item.keyKind === 'url' ? normalizeUrl(item.sourceKey) : item.sourceKey.trim().toUpperCase();
}

export function dedupKey(sourceType: SourceType, normalizedKey: string): string {
  return createHash('sha256').update(`${sourceType}:${normalizedKey}`).digest('hex');
}

export interface KeyedItem { item: RawItem; key: string }

/** Drops items already seen for the feed (and duplicates within the batch); returns items with their dedup key. */
export function filterUnseen(
  items: RawItem[],
  seenRepo: { filterUnseen(feedId: string, keys: string[]): Set<string> },
  feedId: string,
  sourceType: SourceType,
): KeyedItem[] {
  const keyed = items.map((item) => ({ item, key: dedupKey(sourceType, normalizeKey(item)) }));
  const unseen = seenRepo.filterUnseen(feedId, keyed.map((k) => k.key));
  const out: KeyedItem[] = [];
  const taken = new Set<string>();
  for (const k of keyed) {
    if (unseen.has(k.key) && !taken.has(k.key)) {
      taken.add(k.key);
      out.push(k);
    }
  }
  return out;
}
