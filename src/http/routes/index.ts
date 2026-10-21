import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { feedsRoutes } from './feeds.js';
import { healthRoutes } from './health.js';

export async function registerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  await app.register(healthRoutes);
  await feedsRoutes(app, deps);
}
