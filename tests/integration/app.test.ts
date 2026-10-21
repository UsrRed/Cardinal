import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { csrfToken } from '../../src/auth/csrf.js';
import { signCookie } from '../../src/auth/session.js';
import { buildTestApp } from '../helpers/buildTestApp.js';

let closer: (() => Promise<void>) | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
});

async function make(env: Record<string, string> = {}) {
  const t = await buildTestApp(env);
  closer = t.close;
  t.app.get('/api/boom', async () => {
    throw new Error('secret detail sk-ant-xyz');
  });
  t.app.post('/api/echo', async () => ({ ok: true }));
  return t;
}

describe('app skeleton', () => {
  it('exits non-zero when exposed without password', () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      env: { ...process.env, PFLUX_EXPOSE: '1', PFLUX_PASSWORD: '' },
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('configuration invalide');
  });

  it('guards access in exposed mode', async () => {
    const { app } = await make({ PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'correct-horse-battery' });
    expect((await app.inject('/api/feeds')).statusCode).toBe(401);
    const page = await app.inject('/');
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe('/login');
    const h = await app.inject('/healthz');
    expect(h.json()).toEqual({ ok: true });
  });

  it('enforces CSRF and origin on mutations', async () => {
    const { app, deps } = await make();
    expect((await app.inject({ method: 'POST', url: '/api/echo' })).statusCode).toBe(403);
    const s = deps.sessions.create(false);
    const cookie = `pflux_session=${signCookie(s.id, deps.sessionSecret)}`;
    const token = csrfToken(s.id, deps.sessionSecret);
    const ok = await app.inject({ method: 'POST', url: '/api/echo', headers: { cookie, 'x-csrf-token': token } });
    expect(ok.statusCode).toBe(200);
    const foreign = await app.inject({
      method: 'POST', url: '/api/echo', headers: { cookie, 'x-csrf-token': token, origin: 'https://evil.example' },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('hides internal error details', async () => {
    const { app } = await make();
    const r = await app.inject('/api/boom');
    expect(r.statusCode).toBe(500);
    const body = r.json();
    expect(Object.keys(body).sort()).toEqual(['error', 'requestId']);
    expect(body.error).toBe('internal_error');
    expect(r.body).not.toContain('secret');
  });

  it('sets security headers', async () => {
    const { app } = await make();
    const r = await app.inject('/api/boom');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['cache-control']).toBe('no-store');
  });
});
