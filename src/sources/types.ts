import type { SafeFetch } from '../net/safeFetch.js';
import type { SourceParams, SourceType } from '../shared/types.js';
import type { SlidingWindowLimiter } from './rateLimiter.js';

export interface RawItem {
  sourceKey: string;
  keyKind: 'url' | 'id';
  title: string;
  url: string | null;
  publishedAt?: string;
  content: string;
  meta: Record<string, unknown>;
}
export interface SourceContext {
  fetch: SafeFetch;
  now: number;
  freshnessDays: number;
  signal: AbortSignal;
  nvdApiKey: string | null;
  nvdLimiter: SlidingWindowLimiter;
  osvBaseUrl?: string;
  onSourceError(target: string, code: string): void;
}
export interface SourceConnector<P> {
  type: SourceType;
  fetch(params: P, ctx: SourceContext): Promise<RawItem[]>;
}
export type AnyConnector = SourceConnector<SourceParams>;
