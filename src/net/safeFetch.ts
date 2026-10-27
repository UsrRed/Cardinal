import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { isAllowlisted, isBlockedAddress, type AllowEntry } from './ipPolicy.js';

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

const defaultResolver: Resolver = async (host) =>
  (await dns.lookup(host, { all: true })).map((a) => a.address);

export function createSafeFetch(opts: SafeFetchOptions): SafeFetch {
  const resolver = opts.resolver ?? defaultResolver;
  const maxRedirects = opts.maxRedirects ?? 5;

  async function pickAddress(u: URL): Promise<string> {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    let addrs: string[];
    if (isIP(host)) addrs = [host];
    else {
      try {
        addrs = await resolver(host);
      } catch {
        throw new SsrfError('dns_failed');
      }
    }
    if (addrs.length === 0) throw new SsrfError('dns_failed');
    for (const a of addrs) {
      if (isBlockedAddress(a) && !isAllowlisted(a, port, opts.allowlist)) throw new SsrfError('destination_blocked');
    }
    return addrs[0]!;
  }

  function once(u: URL, ip: string, req: SafeRequest, method: string, signal: AbortSignal) {
    return new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
      const mod = u.protocol === 'https:' ? https : http;
      const family = isIP(ip);
      const r = mod.request(
        u,
        {
          method,
          headers: { 'user-agent': opts.userAgent ?? 'cardinal', ...(req.headers ?? {}) },
          signal,
          // Pinned lookup: connect on the already validated IP; Host/SNI/cert keep the hostname.
          lookup: ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) =>
            o?.all ? cb(null, [{ address: ip, family }]) : cb(null, ip, family)) as never,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > opts.maxBytes) {
              reject(new SsrfError('response_too_large'));
              r.destroy();
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => {
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
            resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
          });
          res.on('error', () => reject(new SsrfError(signal.aborted ? 'timeout' : 'network_error')));
        },
      );
      r.on('error', () => reject(new SsrfError(signal.aborted ? 'timeout' : 'network_error')));
      if (req.body !== undefined) r.write(req.body);
      r.end();
    });
  }

  return async (url, req = {}) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs);
    const onAbort = () => ctl.abort();
    req.signal?.addEventListener('abort', onAbort);
    try {
      let current = new URL(url);
      let method = req.method ?? 'GET';
      let body = req.body;
      for (let hop = 0; ; hop++) {
        if (current.protocol !== 'http:' && current.protocol !== 'https:') throw new SsrfError('scheme_not_allowed');
        const ip = await pickAddress(current);
        const res = await once(current, ip, { ...req, body }, method, ctl.signal);
        const loc = res.headers['location'];
        if ([301, 302, 303, 307, 308].includes(res.status) && loc) {
          if (hop >= maxRedirects) throw new SsrfError('too_many_redirects');
          current = new URL(loc, current);
          if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
            method = 'GET';
            body = undefined;
          }
          continue;
        }
        const buf = res.body;
        return {
          status: res.status,
          headers: res.headers,
          url: current.toString(),
          body: buf,
          text: () => buf.toString('utf8'),
          json: <T>() => JSON.parse(buf.toString('utf8')) as T,
        };
      }
    } catch (e) {
      if (e instanceof SsrfError) throw e;
      throw new SsrfError(ctl.signal.aborted ? 'timeout' : 'network_error');
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
    }
  };
}
