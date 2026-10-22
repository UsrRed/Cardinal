import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { AppError } from '../../shared/errors.js';
import type { Priority } from '../../shared/types.js';
import { pageParams } from './query.js';

function filters(q: Record<string, unknown>): { priority?: Priority; read?: boolean } {
  const out: { priority?: Priority; read?: boolean } = {};
  if (q.priority !== undefined && q.priority !== '') {
    if (q.priority !== 'high' && q.priority !== 'medium' && q.priority !== 'low') throw new AppError('validation_error', 400, { priority: 'Priorité invalide.' });
    out.priority = q.priority;
  }
  if (q.read !== undefined && q.read !== '') {
    if (q.read !== 'true' && q.read !== 'false') throw new AppError('validation_error', 400, { read: 'Valeur invalide.' });
    out.read = q.read === 'true';
  }
  return out;
}

export async function registerItemRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { items, feeds } = deps.repos;

  app.get('/api/items', async (req) => {
    const q = req.query as Record<string, unknown>;
    return items.stream({ ...filters(q), ...pageParams(q) });
  });
  app.get('/api/feeds/:id/items', async (req) => {
    const q = req.query as Record<string, unknown>;
    const feedId = (req.params as { id: string }).id;
    if (!feeds.get(feedId)) throw new AppError('not_found', 404);
    return items.stream({ feedId, ...filters(q), ...pageParams(q) });
  });
  app.post('/api/items/:id/read', async (req) => {
    const body = (req.body ?? {}) as { read?: unknown };
    if (body.read !== undefined && typeof body.read !== 'boolean') throw new AppError('validation_error', 400, { read: 'Booléen requis.' });
    const id = (req.params as { id: string }).id;
    if (items.markRead([id], body.read ?? true) === 0) throw new AppError('not_found', 404);
    return { ok: true };
  });
  app.post('/api/items/read-all', async (req) => {
    const body = (req.body ?? {}) as { feedId?: unknown; priority?: unknown };
    const { priority } = filters({ priority: body.priority });
    if (body.feedId !== undefined && (typeof body.feedId !== 'string' || !feeds.get(body.feedId))) throw new AppError('not_found', 404);
    return { updated: items.markAllRead(body.feedId as string | undefined, priority) };
  });
  app.post('/api/feeds/:id/items/read-all', async (req) => {
    const feedId = (req.params as { id: string }).id;
    if (!feeds.get(feedId)) throw new AppError('not_found', 404);
    return { updated: items.markAllRead(feedId) };
  });
}
