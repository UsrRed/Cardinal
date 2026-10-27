import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { isValidDay } from '../../shared/day.js';
import { AppError } from '../../shared/errors.js';
import type { DailyView } from '../../shared/types.js';

export async function registerDailyRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { daily } = deps.repos;
  const dayOf = (v: unknown, today: string): string => {
    if (v === undefined || v === '') return today;
    if (typeof v !== 'string' || !isValidDay(v)) throw new AppError('validation_error', 400, { day: 'Date invalide (AAAA-MM-JJ).' });
    return v;
  };
  const view = (day: string, today: string): DailyView => {
    const c = deps.daily.counts(day);
    return { day, today, itemCount: c.total, highCount: c.high, summary: daily.get(day), recent: daily.recent(14) };
  };

  app.get('/api/daily', async (req) => {
    const today = deps.daily.today();
    return view(dayOf((req.query as Record<string, unknown>).day, today), today);
  });
  app.post('/api/daily/:day/generate', async (req, reply) => {
    const today = deps.daily.today();
    const day = dayOf((req.params as { day: string }).day, today);
    if (day > today) throw new AppError('validation_error', 400, { day: 'Date future.' });
    deps.daily.start(day);
    return reply.code(202).send(view(day, today));
  });
}
