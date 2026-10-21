import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { registerDigestRoutes } from './digests.js';
import { feedsRoutes } from './feeds.js';
import { healthRoutes } from './health.js';
import { registerItemRoutes } from './items.js';
import { registerRunRoutes } from './runs.js';
import { registerStatsRoutes } from './stats.js';
import { registerAuthRoutes } from './auth.js';
import { registerSettingsRoutes } from './settings.js';

export async function registerRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  await app.register(healthRoutes);
  await feedsRoutes(app, deps);
  await registerRunRoutes(app, deps);
  await registerDigestRoutes(app, deps);
  await registerItemRoutes(app, deps);
  await registerStatsRoutes(app, deps);
  await registerAuthRoutes(app, deps);
  await registerSettingsRoutes(app, deps);
}
