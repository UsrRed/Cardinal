import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { healthRoutes } from './health.js';

export async function registerRoutes(app: FastifyInstance, _deps: AppDeps): Promise<void> {
  await app.register(healthRoutes);
}
