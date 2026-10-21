import { describe, it, expect } from 'vitest';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { FakeClock } from '../../src/shared/clock.js';
import { loadSessionSecret, signCookie, verifyCookie, sessionCookie, isSecureRequest, SessionStore } from '../../src/auth/session.js';
import { verifyPassword } from '../../src/auth/password.js';
import { LoginRateLimiter } from '../../src/auth/rateLimit.js';
import { csrfToken, checkCsrf, originAllowed } from '../../src/auth/csrf.js';

describe('session', () => {
  it('rejects tampered cookies', () => {
    const s = Buffer.alloc(32, 1);
    const c = signCookie('abc', s);
    expect(verifyCookie(c, s)).toBe('abc');
    expect(verifyCookie('abd' + c.slice(3), s)).toBeNull();
    expect(verifyCookie(c, Buffer.alloc(32, 2))).toBeNull();
    expect(verifyCookie('nodot', s)).toBeNull();
  });
  it('creates session.key 0600 and reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-'));
    const cfg = loadConfig({ PFLUX_DATA_DIR: dir } as NodeJS.ProcessEnv);
    const k1 = loadSessionSecret(cfg);
    expect(statSync(join(dir, 'session.key')).mode & 0o777).toBe(0o600);
    expect(loadSessionSecret(cfg).equals(k1)).toBe(true);
  });
  it('uses env secret when >=32 bytes', () => {
    const cfg = loadConfig({ PFLUX_DATA_DIR: tmpdir(), PFLUX_SESSION_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv);
    expect(loadSessionSecret(cfg).toString()).toBe('x'.repeat(40));
  });
  it('Secure only over https or trusted proxy', () => {
    const s = Buffer.alloc(32, 1);
    const fwd = { headers: { 'x-forwarded-proto': 'https' }, protocol: 'http' };
    expect(isSecureRequest(fwd, true)).toBe(true);
    expect(isSecureRequest(fwd, false)).toBe(false);
    expect(sessionCookie('id', s, true)).toContain('; Secure');
    const c = sessionCookie('id', s, false);
    expect(c).not.toContain('Secure');
    expect(c).toContain('HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000');
  });
  it('expires sessions after 30 days', () => {
    const clock = new FakeClock(0);
    const st = new SessionStore(clock);
    const s = st.create(true);
    expect(st.get(s.id)).not.toBeNull();
    clock.advance(30 * 24 * 3600 * 1000);
    expect(st.get(s.id)).toBeNull();
  });
});

describe('password', () => {
  it('compares different lengths without throwing', () => {
    expect(verifyPassword('short', 'a-much-longer-password')).toBe(false);
    expect(verifyPassword('same-password-1', 'same-password-1')).toBe(true);
  });
});

describe('rate limiter', () => {
  it('blocks after 5 failures, unblocks after 15 min, delay grows', () => {
    const clock = new FakeClock(1000);
    const rl = new LoginRateLimiter(clock);
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const c = rl.check('1.1.1.1');
      expect(c.allowed).toBe(true);
      delays.push(c.delayMs);
      rl.fail('1.1.1.1');
    }
    expect(delays).toEqual([0, 250, 500, 1000, 2000]);
    const blocked = rl.check('1.1.1.1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
    expect(rl.check('2.2.2.2').allowed).toBe(true);
    clock.advance(15 * 60 * 1000);
    expect(rl.check('1.1.1.1').allowed).toBe(true);
  });
  it('reset clears failures', () => {
    const rl = new LoginRateLimiter(new FakeClock(0));
    rl.fail('a');
    rl.reset('a');
    expect(rl.check('a').delayMs).toBe(0);
  });
});

describe('csrf', () => {
  const s = Buffer.alloc(32, 7);
  it('validates token per session', () => {
    const t = csrfToken('sid', s);
    expect(checkCsrf(t, 'sid', s)).toBe(true);
    expect(checkCsrf(t, 'other', s)).toBe(false);
    expect(checkCsrf(undefined, 'sid', s)).toBe(false);
    expect(checkCsrf('x', 'sid', s)).toBe(false);
  });
  it('checks origin', () => {
    const base = { protocol: 'http', host: 'localhost:8787' };
    expect(originAllowed({ ...base, headers: { origin: 'https://evil.example' } }, null)).toBe(false);
    expect(originAllowed({ ...base, headers: { 'sec-fetch-site': 'cross-site' } }, null)).toBe(false);
    expect(originAllowed({ ...base, headers: { origin: 'http://localhost:8787' } }, null)).toBe(true);
    expect(originAllowed({ ...base, headers: {} }, null)).toBe(true);
    expect(originAllowed({ ...base, headers: { origin: 'https://flux.example.com' } }, 'https://flux.example.com')).toBe(true);
  });
});
