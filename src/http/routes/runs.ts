import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { AppError } from '../../shared/errors.js';
import { pageParams } from './query.js';

export async function registerRunRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { runs } = deps.repos;
  const need = (id: string) => {
    const r = runs.get(id);
    if (!r) throw new AppError('not_found', 404);
    return r;
  };

  app.get('/api/runs', async (req) => {
    const q = req.query as Record<string, unknown>;
    const feedId = typeof q.feedId === 'string' && q.feedId ? q.feedId : undefined;
    return runs.list({ feedId, ...pageParams(q) });
  });
  app.get('/api/runs/:id', async (req) => need((req.params as { id: string }).id));
  app.get('/api/runs/:id/logs', async (req) => {
    const run = need((req.params as { id: string }).id);
    const after = Number((req.query as { after?: string }).after);
    return runs.logs(run.id, Number.isInteger(after) && after > 0 ? after : undefined);
  });
  app.post('/api/runs/:id/cancel', async (req) => {
    const run = need((req.params as { id: string }).id);
    if (!deps.queue.cancel(run.id)) throw new AppError('not_found', 404);
    return runs.get(run.id);
  });
}
