import type { AllowEntry } from './ipPolicy.js';

export type Resolver = (hostname: string) => Promise<string[]>;
export interface SafeFetchOptions {
  resolver?: Resolver;
  allowlist: AllowEntry[];
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  userAgent?: string;
}
export interface SafeRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | Buffer;
  signal?: AbortSignal;
}
export interface SafeResponse {
  status: number;
  headers: Record<string, string>;
  url: string;
  body: Buffer;
  text(): string;
  json<T>(): T;
}
export type SafeFetch = (url: string, req?: SafeRequest) => Promise<SafeResponse>;

export type SsrfErrorCode =
  | 'scheme_not_allowed'
  | 'destination_blocked'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'response_too_large'
  | 'timeout'
  | 'network_error';

export class SsrfError extends Error {
  constructor(public code: SsrfErrorCode) {
    super(code === 'destination_blocked' ? 'destination refusée par la politique réseau' : code);
    this.name = 'SsrfError';
  }
}

export function createSafeFetch(_opts: SafeFetchOptions): SafeFetch {
  throw new Error('not implemented');
}
