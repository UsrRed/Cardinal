import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/net/safeFetch.js';
import { FakeClock } from '../../src/shared/clock.js';
import { parseFeed, rssConnector, testFeedUrl } from '../../src/sources/rss.js';
import type { SourceContext } from '../../src/sources/types.js';

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
let srv: http.Server;
let base: string;

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    const f = { '/rss': 'rss2.xml', '/atom': 'atom.xml', '/xxe': 'xxe.xml' }[req.url ?? ''];
    if (!f) { res.statusCode = 500; res.end('x'); return; }
    res.end(fx(f));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());

const safe = () => createSafeFetch({ allowlist: [{ kind: 'cidr', cidr: '127.0.0.1/32' }], maxBytes: 1e6, timeoutMs: 3000 });
function ctx(errors: string[], clock: FakeClock, freshnessDays = 30): SourceContext {
  return {
    fetch: safe(), now: clock.now(), freshnessDays, signal: new AbortController().signal,
    nvdApiKey: null, nvdLimiter: null as never, onSourceError: (t, c) => errors.push(`${t}:${c}`),
  };
}

describe('rss', () => {
  it('parses RSS 2.0 and Atom', () => {
    const r = parseFeed(fx('rss2.xml'), 'https://example.com/feed');
    expect(r[0]).toMatchObject({ title: 'First post', url: 'https://example.com/a', publishedAt: '2026-01-05T10:00:00.000Z', content: 'Hello world' });
    expect(r[1]!.url).toBe('https://example.com/old');
    const a = parseFeed(fx('atom.xml'), 'https://example.com/feed');
    expect(a[0]).toMatchObject({ title: 'Atom entry', url: 'https://example.com/atom1', publishedAt: '2026-01-06T12:00:00.000Z', content: 'Atom body' });
  });

  it('connector: failing URL does not block others; freshness applied', async () => {
    const errors: string[] = [];
    const clock = new FakeClock(Date.parse('2026-01-10T00:00:00Z'));
    const items = await rssConnector.fetch({ urls: [`${base}/bad`, `${base}/rss`, `${base}/atom`] }, ctx(errors, clock));
    expect(items.map((i) => i.title)).toEqual(['First post', 'Atom entry']);
    expect(errors).toEqual([`${base}/bad:fetch_failed`]);
  });

  it('malicious XML is reported, not thrown', async () => {
    const errors: string[] = [];
    const items = await rssConnector.fetch({ urls: [`${base}/xxe`] }, ctx(errors, new FakeClock(Date.parse('2026-01-10T00:00:00Z'))));
    expect(items).toEqual([]);
    expect(errors).toEqual([`${base}/xxe:parse_failed`]);
  });

  it('testFeedUrl', async () => {
    const f = safe();
    expect(await testFeedUrl(`${base}/rss`, f)).toEqual({ ok: true, count: 2 });
    expect(await testFeedUrl(`${base}/bad`, f)).toEqual({ ok: false, error: 'fetch_failed' });
    expect(await testFeedUrl(`${base}/xxe`, f)).toEqual({ ok: false, error: 'parse_failed' });
  });
});
