import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export function csrfToken(sessionId: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

export function checkCsrf(token: string | undefined, sessionId: string, secret: Buffer): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(csrfToken(sessionId, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

function h(headers: IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function originAllowed(
  req: { headers: IncomingHttpHeaders; protocol: string; host: string },
  publicUrl: string | null,
): boolean {
  const site = h(req.headers, 'sec-fetch-site');
  if (site === 'cross-site') return false;
  const origin = h(req.headers, 'origin');
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (publicUrl && o.origin === new URL(publicUrl).origin) return true;
  return o.host === req.host;
}
