import type { RawItem } from '../sources/types.js';
import type { SourceType } from '../shared/types.js';

export function normalizeUrl(_url: string): string {
  throw new Error('not implemented');
}

export function normalizeKey(_item: Pick<RawItem, 'sourceKey' | 'keyKind'>): string {
  throw new Error('not implemented');
}

export function dedupKey(_sourceType: SourceType, _normalizedKey: string): string {
  throw new Error('not implemented');
}
