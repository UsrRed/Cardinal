import type { IncomingHttpHeaders } from 'node:http';

export function csrfToken(_sessionId: string, _secret: Buffer): string {
  throw new Error('not implemented');
}

export function originAllowed(
  _req: { headers: IncomingHttpHeaders; protocol: string; host: string },
  _publicUrl: string | null,
): boolean {
  throw new Error('not implemented');
}
