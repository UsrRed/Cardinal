import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { csrfToken } from '../../auth/csrf.js';
import { verifyPassword } from '../../auth/password.js';
import { LoginRateLimiter } from '../../auth/rateLimit.js';
import { SESSION_COOKIE, isSecureRequest, sessionCookie } from '../../auth/session.js';
import type { AppDeps } from '../../deps.js';
import { AppError } from '../../shared/errors.js';

const loginSchema = z.object({ password: z.string().min(1).max(512) });

export async function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { config, sessions, sessionSecret, clock } = deps;
  const limiter = new LoginRateLimiter(clock);
  const mode = config.expose ? 'exposed' : 'local';
  const setCookie = (req: FastifyRequest, reply: FastifyReply, id: string) =>
    reply.header('Set-Cookie', sessionCookie(id, sessionSecret, isSecureRequest(req, config.trustProxy)));

  app.get('/api/csrf', async (req, reply) => {
    let s = req.session;
    if (!s) {
      if (config.expose) throw new AppError('unauthorized', 401);
      s = sessions.create(false);
      setCookie(req, reply, s.id);
    }
    return { token: csrfToken(s.id, sessionSecret), mode, authenticated: s.authenticated };
  });

  app.get('/api/auth/me', async (req) => ({
    authenticated: req.session?.authenticated ?? false,
    mode,
  }));

  app.post('/api/auth/login', async (req, reply) => {
    if (!config.expose || !config.password) throw new AppError('not_found', 404);
    const ip = req.ip;
    const gate = limiter.check(ip);
    if (!gate.allowed) {
      reply.header('Retry-After', String(gate.retryAfterS ?? 900));
      throw new AppError('rate_limited', 429);
    }
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success || !verifyPassword(parsed.data.password, config.password)) {
      limiter.fail(ip);
      if (gate.delayMs > 0) await new Promise((r) => setTimeout(r, gate.delayMs));
      throw new AppError('unauthorized', 401);
    }
    limiter.reset(ip);
    if (req.session) sessions.destroy(req.session.id);
    const s = sessions.create(true);
    setCookie(req, reply, s.id);
    return { ok: true, token: csrfToken(s.id, sessionSecret) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.session) sessions.destroy(req.session.id);
    reply.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return { ok: true };
  });
}
