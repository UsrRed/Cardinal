import type { FastifyInstance } from 'fastify';
import { AppError } from '../shared/errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof AppError) {
      const body: Record<string, unknown> = { error: err.code };
      if (err.fields) body.fields = err.fields;
      return reply.code(err.status).send(body);
    }
    const status = err.statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: status === 404 ? 'not_found' : 'bad_request' });
    }
    req.log.error({ err, requestId: req.id }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error', requestId: req.id });
  });
}
