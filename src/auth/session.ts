import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';
import type { Config } from '../config/index.js';
import { systemClock, type Clock } from '../shared/clock.js';

export interface Session {
  id: string;
  authenticated: boolean;
  createdAt: number;
}

export const SESSION_COOKIE = 'pflux_session';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export function loadSessionSecret(cfg: Config): Buffer {
  if (cfg.sessionSecret && cfg.sessionSecret.length >= 32) return cfg.sessionSecret;
  const file = join(cfg.dataDir, 'session.key');
  if (existsSync(file)) {
    const buf = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
    if (buf.length >= 32) return buf;
  }
  mkdirSync(cfg.dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString('hex'), { mode: 0o600 });
  chmodSync(file, 0o600);
  return key;
}

function mac(value: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signCookie(value: string, secret: Buffer): string {
  return `${value}.${mac(value, secret)}`;
}

export function verifyCookie(signed: string, secret: Buffer): string | null {
  const i = signed.lastIndexOf('.');
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(signed.slice(i + 1));
  const b = Buffer.from(mac(value, secret));
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  constructor(private clock: Clock = systemClock) {}
  create(authenticated: boolean): Session {
    const s: Session = { id: randomBytes(24).toString('base64url'), authenticated, createdAt: this.clock.now() };
    this.sessions.set(s.id, s);
    return s;
  }
  get(id: string): Session | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    if (this.clock.now() - s.createdAt >= SESSION_TTL_MS) {
      this.sessions.delete(id);
      return null;
    }
    return s;
  }
  destroy(id: string): void {
    this.sessions.delete(id);
  }
}

export function isSecureRequest(
  req: { headers: IncomingHttpHeaders; protocol: string },
  trustProxy: boolean,
): boolean {
  if (req.protocol === 'https') return true;
  if (!trustProxy) return false;
  const xf = req.headers['x-forwarded-proto'];
  const first = (Array.isArray(xf) ? xf[0] : xf)?.split(',')[0]?.trim().toLowerCase();
  return first === 'https';
}

export function sessionCookie(sessionId: string, secret: Buffer, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${signCookie(sessionId, secret)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_MS / 1000}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionIdFromCookieHeader(header: string | undefined, secret: Buffer): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return verifyCookie(v.join('='), secret);
  }
  return null;
}
