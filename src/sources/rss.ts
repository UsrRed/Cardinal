import type { SafeFetch } from '../net/safeFetch.js';
import type { RawItem } from './types.js';

export function parseFeed(_xml: string, _baseUrl: string): RawItem[] {
  throw new Error('not implemented');
}

export function testFeedUrl(
  _url: string,
  _fetch: SafeFetch,
): Promise<{ ok: true; count: number } | { ok: false; error: 'fetch_failed' | 'parse_failed' | 'destination_blocked' }> {
  throw new Error('not implemented');
}
