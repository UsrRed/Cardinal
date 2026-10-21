import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { authPlugin } from './auth/plugin.js';
import type { AppDeps } from './deps.js';
import { registerErrorHandler } from './http/errors.js';
import { registerRoutes } from './http/routes/index.js';
import { registerStatic } from './http/static.js';

const WEB_DIR = fileURLToPath(new URL('./web', import.meta.url));

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: deps.logger as FastifyBaseLogger, trustProxy: deps.config.trustProxy });
  registerErrorHandler(app);
  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket);
  await authPlugin(app, deps);
  await registerRoutes(app, deps);
  await registerStatic(app, WEB_DIR);
  return app;
}
