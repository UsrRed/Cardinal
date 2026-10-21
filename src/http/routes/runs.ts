import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';

export async function runsRoutes(_app: FastifyInstance, _deps: AppDeps): Promise<void> {
  throw new Error('not implemented');
}
