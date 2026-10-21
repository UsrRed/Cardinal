import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export async function registerStatic(app: FastifyInstance, webDir: string): Promise<void> {
  const hasWeb = existsSync(join(webDir, 'index.html'));
  if (hasWeb) await app.register(fastifyStatic, { root: webDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const isPage = req.method === 'GET' && !path.startsWith('/api/') && path !== '/healthz';
    if (isPage && hasWeb && !/\.[a-z0-9]+$/i.test(path)) {
      return reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });
}
