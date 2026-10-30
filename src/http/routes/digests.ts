import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../../deps.js';
import { AppError } from '../../shared/errors.js';
import type { Digest } from '../../shared/types.js';
import { pageParams } from './query.js';

function slug(s: string): string {
  return s.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'digest';
}

export function digestToMarkdown(d: Digest): string {
  const byRef = new Map(d.items.map((i) => [i.ref, i]));
  const out = [`# ${d.title}`, '', `*${d.feedName} — ${d.createdAt}*`, '', d.lede, ''];
  for (const s of d.sections) {
    out.push(`## ${s.heading}`, '', s.body, '');
    for (const ref of s.itemRefs) {
      const it = byRef.get(ref);
      if (it) out.push(`- [${it.title}](${it.url ?? ''}) (${it.priority})`);
    }
    if (s.itemRefs.length) out.push('');
  }
  out.push('## Éléments', '');
  for (const it of d.items) {
    out.push(`### ${it.title} (${it.priority})`, '', it.summary, '', `Justification : ${it.justification}`, '');
    if (it.url) out.push(`URL : ${it.url}`);
    for (const s of it.sources) out.push(`Source : ${s}`);
    out.push('');
  }
  return out.join('\n');
}

export async function registerDigestRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { digests, feeds } = deps.repos;
  const need = (id: string): Digest => {
    const d = digests.get(id);
    if (!d) throw new AppError('not_found', 404);
    return d;
  };

  app.get('/api/feeds/:id/digests', async (req) => {
    const feedId = (req.params as { id: string }).id;
    if (!feeds.get(feedId)) throw new AppError('not_found', 404);
    const { page, pageSize } = pageParams(req.query as Record<string, unknown>);
    return digests.listByFeed(feedId, page, pageSize);
  });
  app.get('/api/digests/:id', async (req) => need((req.params as { id: string }).id));
  app.get('/api/digests/:id/export.md', async (req, reply) => {
    const d = need((req.params as { id: string }).id);
    return reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="${slug(d.title)}.md"`)
      .header('x-content-type-options', 'nosniff')
      .send(digestToMarkdown(d));
  });
  app.get('/api/digests/:id/export.json', async (req, reply) => {
    const d = need((req.params as { id: string }).id);
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="${slug(d.title)}.json"`)
      .header('x-content-type-options', 'nosniff')
      .send(JSON.stringify(d, null, 2));
  });
}
