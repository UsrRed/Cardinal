import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { csrfToken } from '../../src/auth/csrf.js';
import { signCookie, SESSION_COOKIE } from '../../src/auth/session.js';
import { buildTestApp } from '../helpers/buildTestApp.js';

let closer: (() => Promise<void>) | null = null;
const servers: http.Server[] = [];
afterEach(async () => {
  await closer?.();
  closer = null;
  servers.splice(0).forEach((s) => s.close());
});

const PASSWORD = 'correct horse battery';
const EXPOSED = { PFLUX_EXPOSE: '1', PFLUX_PASSWORD: PASSWORD };

async function make(env: Record<string, string> = {}) {
  const t = await buildTestApp(env);
  closer = t.close;
  const s = t.deps.sessions.create(Boolean(env.PFLUX_EXPOSE));
  const auth = {
    cookie: `${SESSION_COOKIE}=${signCookie(s.id, t.deps.sessionSecret)}`,
    'x-csrf-token': csrfToken(s.id, t.deps.sessionSecret),
  };
  return { ...t, auth, sid: s.id };
}

const MUTATIONS: Array<['POST' | 'PUT' | 'PATCH' | 'DELETE', string, object?]> = [
  ['POST', '/api/feeds', {}],
  ['POST', '/api/feeds/import', {}],
  ['PATCH', '/api/feeds/x', {}],
  ['DELETE', '/api/feeds/x'],
  ['POST', '/api/feeds/x/run', {}],
  ['POST', '/api/runs/x/cancel', {}],
  ['POST', '/api/items/x/read', {}],
  ['PATCH', '/api/settings', {}],
  ['PUT', '/api/settings/secrets/nvdApiKey', { value: 'v' }],
  ['DELETE', '/api/settings/secrets/nvdApiKey'],
  ['POST', '/api/claude/check', {}],
];

describe('exposed mode without session', () => {
  it('rejects API, export, page and WS', async () => {
    const { app, deps } = await make(EXPOSED);
    const gets = ['/api/feeds', '/api/feeds/export', '/api/runs', '/api/runs/x/logs', '/api/digests/1', '/api/digests/1/export.md', '/api/digests/1/export.json', '/api/items', '/api/settings', '/api/claude/status'];
    for (const url of gets) {
      const r = await app.inject({ method: 'GET', url });
      expect([401, 302], url).toContain(r.statusCode);
    }
    const page = await app.inject({ method: 'GET', url: '/digests/1' });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe('/login');
    for (const [method, url, payload] of MUTATIONS) {
      const r = await app.inject({ method, url, payload });
      expect([401, 302], url).toContain(r.statusCode);
    }
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    for (const p of ['runs', 'console']) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws/${p}`);
      const status = await new Promise<number>((res) => {
        ws.on('unexpected-response', (_q: unknown, r: { statusCode: number }) => res(r.statusCode));
        ws.on('open', () => res(101));
        ws.on('error', () => res(0));
      });
      expect(status, p).toBe(401);
    }
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    void deps;
  });
});

describe.each([
  ['exposed', EXPOSED],
  ['local', {}],
])('CSRF and Origin (%s)', (_name, env) => {
  it('mutations without token → 403, bad Origin → 403', async () => {
    const { app, auth } = await make(env);
    const cookieOnly = { cookie: auth.cookie };
    for (const [method, url, payload] of MUTATIONS) {
      const r = await app.inject({ method, url, payload, headers: cookieOnly });
      expect(r.statusCode, `${method} ${url}`).toBe(403);
      const o = await app.inject({ method, url, payload, headers: { ...auth, origin: 'http://evil.example' } });
      expect(o.statusCode, `${method} ${url} origin`).toBe(403);
    }
  });
});

describe('errors are generic', () => {
  it('no stack or exception message in error responses', async () => {
    const { app, auth } = await make();
    const reqs: Array<[string, string, unknown?]> = [
      ['GET', '/api/digests/nope'],
      ['GET', '/api/feeds/nope'],
      ['POST', '/api/feeds', { name: 5 }],
      ['PATCH', '/api/settings', { timezone: 'Nope/Zone' }],
      ['PUT', '/api/settings/secrets/bogus', { value: 'x' }],
      ['POST', '/api/feeds/import', 'not json{'],
      ['GET', '/api/items?priority=bad'],
    ];
    for (const [method, url, payload] of reqs) {
      const r = await app.inject({ method: method as 'GET', url, headers: auth, payload: payload as object });
      expect(r.statusCode, url).toBeGreaterThanOrEqual(400);
      expect(r.body, url).not.toMatch(/\bat \S+ \(|node_modules|\.ts:\d+|Error:|stack/i);
    }
  });
});

describe('end to end via inject', () => {
  it('creates an rss feed, runs it, reads digest with source links', async () => {
    const srv = http.createServer((_q, res) => {
      res.setHeader('content-type', 'application/rss+xml');
      res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>Post</title><link>https://example.com/p0</link><pubDate>${new Date().toUTCString()}</pubDate><description>Body</description></item></channel></rss>`);
    });
    servers.push(srv);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as AddressInfo).port;
    const { app, auth } = await make({ PFLUX_SSRF_ALLOWLIST: `127.0.0.1:${port}` });
    const created = await app.inject({
      method: 'POST', url: '/api/feeds', headers: auth,
      payload: { name: 'E2E', instructions: 'x', sourceType: 'rss', sourceParams: { urls: [`http://127.0.0.1:${port}/rss`] }, frequencyHours: 24, freshnessDays: 7 },
    });
    expect(created.statusCode).toBe(201);
    const feed = JSON.parse(created.body);
    const run = await app.inject({ method: 'POST', url: `/api/feeds/${feed.id}/run`, headers: auth, payload: {} });
    expect(run.statusCode).toBeLessThan(300);
    const runId = JSON.parse(run.body).id as string;
    let status = '';
    for (let i = 0; i < 150 && !['succeeded', 'failed'].includes(status); i++) {
      await new Promise((r) => setTimeout(r, 40));
      status = JSON.parse((await app.inject({ method: 'GET', url: `/api/runs/${runId}`, headers: auth })).body).run.status;
    }
    expect(status).toBe('succeeded');
    const done = JSON.parse((await app.inject({ method: 'GET', url: `/api/runs/${runId}`, headers: auth })).body).run;
    const d = await app.inject({ method: 'GET', url: `/api/digests/${done.digestId}`, headers: auth });
    expect(d.statusCode).toBe(200);
    const digest = JSON.parse(d.body);
    expect(digest.items.length).toBeGreaterThan(0);
    expect(digest.items[0].sources).toContain('https://example.com/p0');
  });
});
