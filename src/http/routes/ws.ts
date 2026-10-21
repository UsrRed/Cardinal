import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';

export async function wsRoutes(_app: FastifyInstance, _deps: AppDeps): Promise<void> {
  throw new Error('not implemented');
}
