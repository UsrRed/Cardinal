import { afterEach, describe, expect, it } from 'vitest';
import { csrfToken } from '../../src/auth/csrf.js';
import { signCookie } from '../../src/auth/session.js';
import { feedInputSchema } from '../../src/shared/schemas.js';
import { localDay } from '../../src/shared/day.js';
import { buildTestApp } from '../helpers/buildTestApp.js';

let closer: (() => Promise<void>) | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
});

async function make() {
  const t = await buildTestApp();
  closer = t.close;
  const s = t.deps.sessions.create(false);
  const headers = { cookie: `pflux_session=${signCookie(s.id, t.deps.sessionSecret)}`, 'x-csrf-token': csrfToken(s.id, t.deps.sessionSecret) };
  const call = (method: 'GET' | 'POST', url: string) => t.app.inject({ method, url, headers, payload: method === 'POST' ? {} : undefined });
  const r = t.deps.repos;
  const feed = r.feeds.create(
    feedInputSchema.parse({ name: 'Veille', instructions: 'x', sourceType: 'rss', sourceParams: { urls: ['https://example.com/f.xml'] }, frequencyHours: 24, freshnessDays: 7, enabled: false }),
    1,
  );
  return { ...t, call, r, feed };
}

const waitDone = async (get: () => Promise<{ summary: { status: string } | null }>) => {
  for (let i = 0; i < 50; i++) {
    const v = await get();
    if (v.summary && v.summary.status !== 'running') return v;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('timeout');
};

describe('daily summary routes', () => {
  it('generates a summary of the day with resolved item links', async () => {
    const { call, r, feed, deps } = await make();
    const now = Date.now();
    const run = r.runs.create(feed.id, 'manual', now);
    const d = r.digests.create({ feedId: feed.id, runId: run.id, title: 't', lede: 'l', sections: [], partial: false }, now);
    r.items.insertMany(['i1', 'i2'].map((ref, i) => ({
      feedId: feed.id, digestId: d, runId: run.id, ref, title: `Titre ${ref}`, url: `https://src.example/${ref}`,
      priority: i === 0 ? 'high' as const : 'low' as const, justification: 'j', summary: 's', sources: [], publishedAt: null,
    })), now);
    const today = localDay(now, deps.settings().timezone);

    const empty = JSON.parse((await call('GET', '/api/daily')).body);
    expect(empty).toMatchObject({ day: today, today, itemCount: 2, highCount: 1, summary: null });

    const gen = await call('POST', `/api/daily/${today}/generate`);
    expect(gen.statusCode).toBe(202);
    const v = await waitDone(async () => JSON.parse((await call('GET', `/api/daily?day=${today}`)).body));
    expect(v.summary).toMatchObject({ status: 'succeeded', title: 'Résumé de test', itemCount: 2 });
    const items = (v.summary as unknown as { tiers: { categories: { items: { url: string; feedName: string }[] }[] }[] }).tiers[0]!.categories[0]!.items;
    expect(items.map((i) => i.url).sort()).toEqual(['https://src.example/i1', 'https://src.example/i2']);
    expect(items[0]!.feedName).toBe('Veille');
  });

  it('rejects bad days, future days and empty days', async () => {
    const { call } = await make();
    expect((await call('GET', '/api/daily?day=2026-13-01')).statusCode).toBe(400);
    expect((await call('POST', '/api/daily/2999-01-01/generate')).statusCode).toBe(400);
    const r = await call('POST', '/api/daily/2020-01-01/generate');
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('no_items');
  });
});
