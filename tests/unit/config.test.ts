import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/index.js';
import { createLogger, sanitizeLogMessage } from '../../src/log/logger.js';

const load = (env: Record<string, string>, inContainer = false) =>
  loadConfig(env as NodeJS.ProcessEnv, { inContainer });

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = load({});
    expect(c.port).toBe(8787);
    expect(c.host).toBe('127.0.0.1');
    expect(c.claudeRunner).toBe('cli');
    expect(c.defaultModel).toBe('sonnet');
  });
  it('rejects EXPOSE without password or with 11 chars', () => {
    expect(() => load({ PFLUX_EXPOSE: '1' })).toThrow(ConfigError);
    expect(() => load({ PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'a'.repeat(11) })).toThrow(ConfigError);
    const c = load({ PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'a'.repeat(12) });
    expect(c.host).toBe('0.0.0.0');
  });
  it('ignores PFLUX_HOST without expose outside container', () => {
    expect(load({ PFLUX_HOST: '0.0.0.0' }).host).toBe('127.0.0.1');
  });
  it('names the invalid variables', () => {
    try {
      load({ PFLUX_PORT: 'abc', PFLUX_CLAUDE_RUNNER: 'x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as ConfigError).message;
      expect(msg).toContain('PFLUX_PORT');
      expect(msg).toContain('PFLUX_CLAUDE_RUNNER');
    }
  });
  it('rejects short session secret and parses allowlist', () => {
    expect(() => load({ PFLUX_SESSION_SECRET: 'short' })).toThrow(/PFLUX_SESSION_SECRET/);
    const c = load({ PFLUX_SSRF_ALLOWLIST: '192.168.1.20:8080, 10.0.0.0/8, 127.0.0.1' });
    expect(c.ssrfAllowlist).toEqual([
      { kind: 'ip', ip: '192.168.1.20', port: 8080 },
      { kind: 'cidr', cidr: '10.0.0.0/8' },
      { kind: 'ip', ip: '127.0.0.1' },
    ]);
    expect(() => load({ PFLUX_SSRF_ALLOWLIST: 'nope' })).toThrow(/PFLUX_SSRF_ALLOWLIST/);
  });
});

describe('logger', () => {
  it('redacts sensitive fields', () => {
    let out = '';
    const dest = new Writable({ write(c, _e, cb) { out += c.toString(); cb(); } });
    const real = createLogger('info', dest);
    real.info({ req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1' } }, a: { password: 'hunter2' } }, 'x');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('Bearer abc');
  });
  it('sanitizeLogMessage strips provided secrets and truncates', () => {
    expect(sanitizeLogMessage('fail key=SECRET123 end', ['SECRET123'])).not.toContain('SECRET123');
    expect(sanitizeLogMessage('Authorization: Bearer abc.def')).not.toContain('abc.def');
    expect(sanitizeLogMessage('x'.repeat(2000)).length).toBeLessThan(600);
  });
});
