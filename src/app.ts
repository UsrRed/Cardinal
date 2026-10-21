import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { AppDeps } from './deps.js';
import { healthRoutes } from './http/routes/health.js';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: deps.logger as FastifyBaseLogger, trustProxy: deps.config.trustProxy });
  await app.register(healthRoutes);
  return app;
}
