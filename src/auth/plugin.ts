import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDeps } from '../deps.js';
import { checkCsrf, originAllowed } from './csrf.js';
import { sessionIdFromCookieHeader, type Session } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
  }
}

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'";
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `/mcp` has its own Bearer auth (see http/routes/mcp.ts), never the session. */
function isPublic(path: string): boolean {
  return path === '/mcp' || path === '/login' || path === '/api/auth/login' || path === '/healthz' || path.startsWith('/assets/');
}

/** Registered directly on the root instance (not encapsulated) so hooks cover every route. */
export async function authPlugin(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { config, sessions, sessionSecret } = deps;
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const isApi = path.startsWith('/api/');
    reply.header('Content-Security-Policy', CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    if (isApi) reply.header('Cache-Control', 'no-store');

    const sid = sessionIdFromCookieHeader(req.headers.cookie, sessionSecret);
    req.session = sid ? sessions.get(sid) : null;

    if (config.expose && !isPublic(path) && !req.session?.authenticated) {
      if (isApi) return reply.code(401).send({ error: 'unauthorized' });
      return reply.redirect('/login', 302);
    }

    if (isApi && MUTATING.has(req.method)) {
      if (!originAllowed(req, config.publicUrl)) return reply.code(403).send({ error: 'forbidden_origin' });
      if (path === '/api/auth/login') return;
      const token = req.headers['x-csrf-token'];
      const t = Array.isArray(token) ? token[0] : token;
      if (!req.session || !checkCsrf(t, req.session.id, sessionSecret)) {
        return reply.code(403).send({ error: 'csrf_failed' });
      }
    }
  });
}
