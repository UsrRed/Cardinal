import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/buildTestApp.js';

let closer: (() => Promise<void>) | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
});

async function local(env: Record<string, string> = {}) {
  const t = await buildTestApp(env);
  closer = t.close;
  const r = await t.app.inject({ method: 'GET', url: '/api/csrf' });
  const cookie = String(r.headers['set-cookie']).split(';')[0]!;
  const { token } = r.json();
  const call = (method: 'GET' | 'PUT' | 'PATCH' | 'DELETE' | 'POST', url: string, payload?: object) =>
    t.app.inject({ method, url, headers: { cookie, 'x-csrf-token': token }, payload });
  return { ...t, call, token, cookie };
}

describe('settings routes', () => {
  it('stores secrets without echoing them, file 0600', async () => {
    const { call, dir, deps } = await local();
    const put = await call('PUT', '/api/settings/secrets/anthropicApiKey', { value: 'sk-secret-123' });
    expect(put.json()).toEqual({ configured: true, source: 'ui' });
    const get = await call('GET', '/api/settings');
    expect(get.json().secrets.anthropicApiKey).toEqual({ configured: true, source: 'ui' });
    expect(get.body).not.toContain('sk-secret-123');
    expect(statSync(join(dir, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(deps.repos.settings.getAll())).not.toContain('sk-secret-123');
    expect((await call('DELETE', '/api/settings/secrets/anthropicApiKey')).json().configured).toBe(false);
    expect((await call('PUT', '/api/settings/secrets/bogus', { value: 'x' })).statusCode).toBe(404);
    expect(readFileSync(join(dir, 'secrets.json'), 'utf8')).not.toContain('sk-secret-123');
  });

  it('env secret wins over UI', async () => {
    const { call, deps } = await local({ PFLUX_NVD_API_KEY: 'envkey' });
    const put = await call('PUT', '/api/settings/secrets/nvdApiKey', { value: 'uikey' });
    expect(put.json()).toEqual({ configured: true, source: 'env' });
    expect(deps.secrets.get('nvdApiKey')).toBe('envkey');
  });

  it('validates timezone and persists patch', async () => {
    const { call } = await local();
    expect((await call('PATCH', '/api/settings', { timezone: 'Mars/Base' })).statusCode).toBe(400);
    const ok = await call('PATCH', '/api/settings', { timezone: 'Europe/Paris', retentionDays: 30 });
    expect(ok.json()).toMatchObject({ timezone: 'Europe/Paris', retentionDays: 30 });
  });

  it('reports claude status and ntfy not configured', async () => {
    const { call } = await local();
    expect((await call('GET', '/api/claude/status')).json().state).toBe('unknown');
    expect((await call('POST', '/api/claude/recheck')).json().checkedAt).not.toBeNull();
    expect((await call('POST', '/api/settings/test-ntfy')).json()).toEqual({ ok: false, error: 'not_configured' });
  });
});

describe('auth routes', () => {
  it('local csrf token accepted on mutation; mutation without it refused', async () => {
    const { app, call, cookie } = await local();
    expect((await call('PATCH', '/api/settings', { retentionDays: 1 })).statusCode).toBe(200);
    const r = await app.inject({ method: 'PATCH', url: '/api/settings', headers: { cookie }, payload: { retentionDays: 2 } });
    expect(r.statusCode).toBe(403);
  });

  it('rate-limits logins, sets cookie, logout invalidates', async () => {
    const t = await buildTestApp({ PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'correct-horse-battery' });
    closer = t.close;
    const login = (password: string) =>
      t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password } });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await login('wrong')).statusCode);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await login('correct-horse-battery')).statusCode).toBe(429);
  }, 30_000);

  it('good password gives HttpOnly Lax cookie; logout invalidates session', async () => {
    const t = await buildTestApp({ PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'correct-horse-battery' });
    closer = t.close;
    const r = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'correct-horse-battery' } });
    expect(r.statusCode).toBe(200);
    const sc = String(r.headers['set-cookie']);
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
    const cookie = sc.split(';')[0]!;
    const headers = { cookie, 'x-csrf-token': r.json().token };
    expect((await t.app.inject({ method: 'GET', url: '/api/auth/me', headers })).json().authenticated).toBe(true);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers })).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode).toBe(401);
  });
});
