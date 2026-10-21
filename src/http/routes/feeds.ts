import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../../deps.js';
import { resolveTarget } from '../../notify/ntfy.js';
import { feedInputSchema, feedPatchSchema, zodFields } from '../../shared/schemas.js';
import { AppError } from '../../shared/errors.js';
import type { FeedInput } from '../../shared/schemas.js';
import { testFeedUrl } from '../../sources/rss.js';

const testUrlSchema = z.object({
  url: z
    .string({ error: 'URL requise.' })
    .max(2048, { error: 'URL trop longue.' })
    .refine((u) => {
      try {
        return ['http:', 'https:'].includes(new URL(u).protocol);
      } catch {
        return false;
      }
    }, { error: 'URL http(s) invalide.' }),
});

const importBodySchema = z.object({ feeds: z.array(z.unknown(), { error: 'Liste de flux requise.' }).max(500, { error: 'Trop de flux.' }) });

function parse<T>(schema: z.ZodType<T, unknown>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new AppError('validation_error', 400, zodFields(r.error));
  return r.data;
}

export async function feedsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { feeds } = deps.repos;
  const now = () => deps.clock.now();
  const need = <T>(v: T | null): T => {
    if (!v) throw new AppError('not_found', 404);
    return v;
  };

  app.get('/api/feeds', async () => feeds.list());
  app.post('/api/feeds', async (req, reply) => {
    const input = parse(feedInputSchema, req.body);
    return reply.code(201).send(feeds.create(input, now()));
  });

  app.get('/api/feeds/export', async () => ({ version: 1, exportedAt: new Date(now()).toISOString(), feeds: feeds.exportAll() }));
  app.post('/api/feeds/import', async (req) => {
    const { feeds: entries } = parse(importBodySchema, req.body);
    const rejected: Array<{ index: number; fields: Record<string, string> }> = [];
    let created = 0;
    entries.forEach((e, index) => {
      const r = feedInputSchema.safeParse(e);
      if (!r.success) {
        rejected.push({ index, fields: zodFields(r.error) });
        return;
      }
      feeds.create({ ...(r.data as FeedInput), enabled: false }, now());
      created++;
    });
    return { created, rejected };
  });
  app.post('/api/feeds/test-url', async (req) => {
    const { url } = parse(testUrlSchema, req.body);
    return testFeedUrl(url, deps.fetch);
  });

  app.get<{ Params: { id: string } }>('/api/feeds/:id', async (req) => need(feeds.get(req.params.id)));
  app.put<{ Params: { id: string } }>('/api/feeds/:id', async (req) => {
    need(feeds.get(req.params.id));
    const patch = parse(feedPatchSchema, req.body);
    // Re-validate the merged feed so partial updates cannot produce invalid state.
    const merged = { ...feeds.get(req.params.id)!, ...patch };
    const full = feedInputSchema.safeParse(merged);
    if (!full.success) throw new AppError('validation_error', 400, zodFields(full.error));
    return need(feeds.update(req.params.id, patch as Partial<FeedInput>, now()));
  });
  app.delete<{ Params: { id: string } }>('/api/feeds/:id', async (req, reply) => {
    if (!feeds.delete(req.params.id)) throw new AppError('not_found', 404);
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/feeds/:id/duplicate', async (req, reply) =>
    reply.code(201).send(need(feeds.duplicate(req.params.id, now()))),
  );
  app.post<{ Params: { id: string } }>('/api/feeds/:id/pause', async (req) => need(feeds.setEnabled(req.params.id, false, now())));
  app.post<{ Params: { id: string } }>('/api/feeds/:id/resume', async (req) => need(feeds.setEnabled(req.params.id, true, now())));
  app.post<{ Params: { id: string } }>('/api/feeds/:id/run', async (req, reply) => {
    need(feeds.get(req.params.id));
    return reply.code(202).send(deps.queue.enqueue(req.params.id, 'manual'));
  });
  app.post<{ Params: { id: string } }>('/api/feeds/:id/test-notify', async (req) => {
    const feed = need(feeds.get(req.params.id));
    const target = resolveTarget(feed, deps.settings(), deps.secrets.get('ntfyToken'));
    if (!target) return { ok: false, error: 'not_configured' };
    return deps.notifier.sendTest(target);
  });
}

export const registerFeedRoutes = feedsRoutes;
