import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SafeFetch } from '../../src/net/safeFetch.js';
import { FakeClock } from '../../src/shared/clock.js';
import { nvdConnector, nvdWindows, parseNvdPage } from '../../src/sources/nvd.js';
import { getNvdLimiter, SlidingWindowLimiter } from '../../src/sources/rateLimiter.js';
import type { SourceContext } from '../../src/sources/types.js';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-01-20T00:00:00Z');
const DAY = 86_400_000;

const flush = () => new Promise((r) => setImmediate(r));

describe('SlidingWindowLimiter', () => {
  async function run(limit: number) {
    const clock = new FakeClock(0);
    const l = new SlidingWindowLimiter({ limit, windowMs: 30_000, clock });
    let done = 0;
    const ps = Array.from({ length: limit + 1 }, () => l.acquire().then(() => done++));
    await flush();
    expect(done).toBe(limit);
    clock.advance(29_999);
    await flush();
    expect(done).toBe(limit);
    clock.advance(1);
    await flush();
    expect(done).toBe(limit + 1);
    await Promise.all(ps);
  }
  it('no key: 6th waits for next window', () => run(5));
  it('with key: 51st waits', () => run(50));
  it('NVD limiter is a per-key singleton', () => {
    expect(getNvdLimiter(true)).toBe(getNvdLimiter(true));
    expect(getNvdLimiter(true)).not.toBe(getNvdLimiter(false));
  });
});

describe('nvd', () => {
  it('splits 200 days into 2 windows <=120d', () => {
    const w = nvdWindows(NOW, 200);
    expect(w).toHaveLength(2);
    for (const x of w) expect(Date.parse(x.end) - Date.parse(x.start)).toBeLessThanOrEqual(120 * DAY);
    expect(w[1]!.end).toBe(new Date(NOW).toISOString());
  });

  it('minSeverity HIGH drops MEDIUM (v3.1 and v4)', () => {
    const p1 = parseNvdPage(fx('nvd-page1.json'), 'HIGH');
    expect(p1.items.map((i) => i.sourceKey)).toEqual(['CVE-2026-1001']);
    expect(parseNvdPage(fx('nvd-page2.json'), 'HIGH').items).toHaveLength(0);
    expect(parseNvdPage(fx('nvd-page2.json')).items[0]!.sourceKey).toBe('CVE-2026-1003');
  });

  function ctx(apiKey: string | null, urls: string[], headers: Array<Record<string, string> | undefined>): SourceContext {
    const fetch: SafeFetch = async (url, req) => {
      urls.push(url);
      headers.push(req?.headers);
      const si = new URL(url).searchParams.get('startIndex');
      const body = fx(si === '0' ? 'nvd-page1.json' : 'nvd-page2.json');
      return { status: 200, headers: {}, url, body: Buffer.alloc(0), text: () => '', json: <T>() => body as T };
    };
    return {
      fetch, now: NOW, freshnessDays: 30, signal: new AbortController().signal, nvdApiKey: apiKey,
      nvdLimiter: new SlidingWindowLimiter({ limit: 50, windowMs: 30_000, clock: new FakeClock(0) }),
      onSourceError: () => undefined,
    };
  }

  it('paginates over totalResults and dedups; apiKey header only with key', async () => {
    const urls: string[] = [];
    const hs: Array<Record<string, string> | undefined> = [];
    const items = await nvdConnector.fetch({ keywords: ['foo'] }, ctx(null, urls, hs));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('keywordSearch=foo');
    expect(urls[1]).toContain('startIndex=2');
    expect(items.map((i) => i.sourceKey)).toEqual(['CVE-2026-1001', 'CVE-2026-1002', 'CVE-2026-1003']);
    expect(hs.every((h) => !h || !('apiKey' in h))).toBe(true);

    const hs2: Array<Record<string, string> | undefined> = [];
    await nvdConnector.fetch({ keywords: ['foo'] }, ctx('k', [], hs2));
    expect(hs2.every((h) => h?.apiKey === 'k')).toBe(true);
  });
});
