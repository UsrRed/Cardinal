import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { csrfToken } from '../../src/auth/csrf.js';
import { signCookie } from '../../src/auth/session.js';
import { buildTestApp } from '../helpers/buildTestApp.js';

let closer: (() => Promise<void>) | null = null;
let srv: Server | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
  srv?.close();
  srv = null;
});

async function make(env: Record<string, string> = {}) {
  const t = await buildTestApp(env);
  closer = t.close;
  const s = t.deps.sessions.create(false);
  const headers = { cookie: `pflux_session=${signCookie(s.id, t.deps.sessionSecret)}`, 'x-csrf-token': csrfToken(s.id, t.deps.sessionSecret) };
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    t.app.inject({ method, url, headers, payload: payload as object });
  return { ...t, call };
}

const valid = (over: Record<string, unknown> = {}) => ({
  name: 'F', instructions: 'x', sourceType: 'rss', sourceParams: { urls: ['https://example.com/feed.xml'] },
  frequencyHours: 24, freshnessDays: 7, ...over,
});

describe('feed routes', () => {
  it('validates with per-field messages', async () => {
    const { call } = await make();
    const bad = [
      [valid({ frequencyHours: 0 }), 'frequencyHours'],
      [valid({ sourceParams: { urls: [] } }), 'sourceParams.urls'],
      [valid({ sourceType: 'osv', sourceParams: { packages: [{ name: 'a', ecosystem: 'Nope' }] } }), 'sourceParams.packages.0.ecosystem'],
      [valid({ sourceParams: { urls: ['ftp://x.org/a'] } }), 'sourceParams.urls.0'],
    ] as const;
    for (const [body, field] of bad) {
      const r = await call('POST', '/api/feeds', body);
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toBe('validation_error');
      expect(typeof r.json().fields[field]).toBe('string');
    }
  });

  it('exports without ids and imports with rejects', async () => {
    const { call, deps } = await make();
    await call('POST', '/api/feeds', valid());
    const ex = (await call('GET', '/api/feeds/export')).json();
    expect(ex.version).toBe(1);
    expect(JSON.stringify(ex)).not.toMatch(/"id"|apiKey|token/i);
    const before = deps.repos.feeds.list().length;
    const r = await call('POST', '/api/feeds/import', { feeds: [valid({ name: 'A' }), valid({ name: 'B' }), valid({ frequencyHours: 9999 })] });
    expect(r.json().created).toBe(2);
    expect(r.json().rejected).toHaveLength(1);
    expect(r.json().rejected[0].index).toBe(2);
    const list = deps.repos.feeds.list();
    expect(list).toHaveLength(before + 2);
    expect(list.filter((f) => ['A', 'B'].includes(f.name)).every((f) => !f.enabled)).toBe(true);
  });

  it('duplicates, updates and deletes', async () => {
    const { call } = await make();
    const f = (await call('POST', '/api/feeds', valid({ name: 'Orig' }))).json();
    const d = (await call('POST', `/api/feeds/${f.id}/duplicate`)).json();
    expect(d.name).toBe('Copie de Orig');
    expect(d.enabled).toBe(false);
    const u = await call('PUT', `/api/feeds/${f.id}`, { name: 'New' });
    expect(u.json().name).toBe('New');
    expect((await call('PUT', `/api/feeds/${f.id}`, { frequencyHours: 0 })).statusCode).toBe(400);
    expect((await call('DELETE', `/api/feeds/${f.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/feeds/${f.id}`)).statusCode).toBe(404);
  });

  it('runs: 409 on second, accepted when paused', async () => {
    const { call, deps } = await make();
    const f = (await call('POST', '/api/feeds', valid())).json();
    // keep the run queued so it stays active
    deps.queue.kick = () => {};
    expect((await call('POST', `/api/feeds/${f.id}/run`)).statusCode).toBe(202);
    expect((await call('POST', `/api/feeds/${f.id}/run`)).statusCode).toBe(409);
    const g = (await call('POST', '/api/feeds', valid())).json();
    await call('POST', `/api/feeds/${g.id}/pause`);
    expect((await call('POST', `/api/feeds/${g.id}/run`)).statusCode).toBe(202);
  });

  it('test-url: allowlisted local ok, private blocked', async () => {
    srv = createServer((_q, res) => {
      res.setHeader('content-type', 'application/rss+xml');
      res.end('<rss version="2.0"><channel><title>t</title><item><title>a</title><link>http://x.org/a</link></item></channel></rss>');
    });
    await new Promise<void>((r) => srv!.listen(0, '127.0.0.1', r));
    const port = (srv.address() as AddressInfo).port;
    const ok = await make({ PFLUX_SSRF_ALLOWLIST: `127.0.0.1` });
    const r = await ok.call('POST', '/api/feeds/test-url', { url: `http://127.0.0.1:${port}/f.xml` });
    expect(r.json()).toEqual({ ok: true, count: 1 });
    await closer?.();
    const blocked = await make();
    const b = await blocked.call('POST', '/api/feeds/test-url', { url: `http://127.0.0.1:${port}/f.xml` });
    expect(b.json()).toEqual({ ok: false, error: 'destination_blocked' });
    expect((await blocked.call('POST', '/api/feeds/test-url', { url: 'ftp://x' })).statusCode).toBe(400);
  });

  it('test-notify reports not_configured', async () => {
    const { call } = await make();
    const f = (await call('POST', '/api/feeds', valid())).json();
    expect((await call('POST', `/api/feeds/${f.id}/test-notify`)).json()).toEqual({ ok: false, error: 'not_configured' });
  });
});
