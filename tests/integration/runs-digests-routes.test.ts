import { afterEach, describe, expect, it } from 'vitest';
import { csrfToken } from '../../src/auth/csrf.js';
import { feedInputSchema } from '../../src/shared/schemas.js';
import { signCookie } from '../../src/auth/session.js';
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
  const call = (method: 'GET' | 'POST', url: string, payload?: unknown) => t.app.inject({ method, url, headers, payload: payload as object });
  const r = t.deps.repos;
  const feed = r.feeds.create(
    feedInputSchema.parse({ name: 'F', instructions: 'x', sourceType: 'rss', sourceParams: { urls: ['https://example.com/f.xml'] }, frequencyHours: 24, freshnessDays: 7, enabled: false }),
    1,
  );
  const row = (digestId: string, runId: string, ref: string, priority: 'high' | 'medium' | 'low', title = ref) => ({
    feedId: feed.id, digestId, runId, ref, title, url: `https://src.example/${ref}`, priority, justification: 'j', summary: 's', sources: [`https://src.example/${ref}`], publishedAt: null,
  });
  return { ...t, call, r, feed, row };
}

describe('runs/digests/items/stats routes', () => {
  it('exports digest as md and json with attachment, <script> inert', async () => {
    const { call, r, feed, row } = await make();
    const run = r.runs.create(feed.id, 'manual', 2);
    const d = r.digests.create({ feedId: feed.id, runId: run.id, title: 'T<script>alert(1)</script>', lede: 'l', sections: [{ heading: 'H', itemRefs: ['i1'], body: '<script>x</script>' }], partial: false }, 3);
    r.items.insertMany([row(d, run.id, 'i1', 'high')], 4);
    const md = await call('GET', `/api/digests/${d}/export.md`);
    expect(md.headers['content-disposition']).toMatch(/^attachment/);
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.body).toContain('https://src.example/i1');
    expect(md.body).toContain('<script>x</script>');
    const js = await call('GET', `/api/digests/${d}/export.json`);
    expect(js.headers['content-disposition']).toMatch(/^attachment/);
    const body = JSON.parse(js.body);
    expect(body.sections[0].body).toBe('<script>x</script>');
    expect(body.items[0].sources).toEqual(['https://src.example/i1']);
    expect((await call('GET', '/api/digests/nope/export.md')).statusCode).toBe(404);
  });

  it('filters items, markRead and read-all change unreadCount', async () => {
    const { call, r, feed, row } = await make();
    const run = r.runs.create(feed.id, 'manual', 2);
    const d = r.digests.create({ feedId: feed.id, runId: run.id, title: 't', lede: 'l', sections: [], partial: false }, 3);
    const items = r.items.insertMany([row(d, run.id, 'i1', 'high'), row(d, run.id, 'i2', 'low'), row(d, run.id, 'i3', 'high')], 4);
    const unread = async () => (r.feeds.list().find((f) => f.id === feed.id)!.unreadCount);
    const f = JSON.parse((await call('GET', '/api/items?priority=high&read=false')).body);
    expect(f.total).toBe(2);
    expect(await unread()).toBe(3);
    expect((await call('POST', `/api/items/${items[0]!.id}/read`, {})).statusCode).toBe(200);
    expect(await unread()).toBe(2);
    expect(JSON.parse((await call('GET', '/api/items?priority=high&read=false')).body).total).toBe(1);
    expect(JSON.parse((await call('GET', `/api/feeds/${feed.id}/items?read=true`)).body).total).toBe(1);
    const all = await call('POST', `/api/feeds/${feed.id}/items/read-all`);
    expect(JSON.parse(all.body).updated).toBe(2);
    expect(await unread()).toBe(0);
    expect((await call('GET', '/api/items?priority=bad')).statusCode).toBe(400);
    expect((await call('POST', '/api/items/nope/read', {})).statusCode).toBe(404);
  });

  it('paginates digests (page 2)', async () => {
    const { call, r, feed } = await make();
    for (let i = 0; i < 3; i++) {
      const run = r.runs.create(feed.id, 'manual', 10 + i);
      r.digests.create({ feedId: feed.id, runId: run.id, title: `d${i}`, lede: 'l', sections: [], partial: false }, 20 + i);
    }
    const p = JSON.parse((await call('GET', `/api/feeds/${feed.id}/digests?page=2&pageSize=2`)).body);
    expect(p).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(p.items).toHaveLength(1);
  });

  it('lists runs, cancels a queued run, 404 when not cancellable', async () => {
    const { call, r, feed } = await make();
    const run = r.runs.create(feed.id, 'manual', 5);
    expect(JSON.parse((await call('GET', `/api/runs?feedId=${feed.id}`)).body).total).toBe(1);
    const one = JSON.parse((await call('GET', `/api/runs/${run.id}`)).body);
    expect(one.steps).toHaveLength(5);
    r.runs.appendLog(run.id, 'info', 'fetch', 'hello', 6);
    expect(JSON.parse((await call('GET', `/api/runs/${run.id}/logs`)).body)).toHaveLength(1);
    const c = await call('POST', `/api/runs/${run.id}/cancel`);
    expect(JSON.parse(c.body).status).toBe('cancelled');
    expect((await call('POST', `/api/runs/${run.id}/cancel`)).statusCode).toBe(404);
    expect((await call('GET', '/api/runs/nope')).statusCode).toBe(404);
  });

  it('stats equal sum of runs', async () => {
    const { call, r, feed } = await make();
    const a = r.runs.create(feed.id, 'manual', 5), b = r.runs.create(feed.id, 'manual', 6);
    r.runs.addUsage(a.id, { inputTokens: 10, outputTokens: 2, costUsd: 0.1 });
    r.runs.addUsage(b.id, { inputTokens: 5, outputTokens: 3, costUsd: 0.2 });
    const s = JSON.parse((await call('GET', '/api/stats')).body);
    expect(s.runs).toBe(2);
    expect(s.totals.inputTokens).toBe(15);
    expect(s.totals.costUsd).toBeCloseTo(0.3);
    expect(s.byFeed.find((x: { feedId: string }) => x.feedId === feed.id).usage.outputTokens).toBe(5);
    expect(s.nav.feeds).toBeGreaterThanOrEqual(1);
  });
});
