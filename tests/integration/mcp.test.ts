import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/buildTestApp.js';

const TOKEN = 't'.repeat(40);
let closer: (() => Promise<void>) | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
});

async function make(env: Record<string, string> = { PFLUX_MCP_TOKEN: TOKEN }) {
  const t = await buildTestApp(env);
  closer = t.close;
  let n = 0;
  const rpc = (method: string, params?: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
    t.app.inject({ method: 'POST', url: '/mcp', headers, payload: { jsonrpc: '2.0', id: ++n, method, params } });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await rpc('tools/call', { name, arguments: args });
    const res = r.json().result as { content: { text: string }[]; isError?: boolean };
    return { isError: !!res.isError, text: res.content[0]!.text, data: res.isError ? null : JSON.parse(res.content[0]!.text) };
  };
  return { ...t, rpc, call };
}

const rss = {
  name: 'Blog', instructions: 'Sécurité seulement', sourceType: 'rss',
  sourceParams: { urls: ['https://example.com/feed.xml'] }, frequencyHours: 24, freshnessDays: 7,
};

describe('mcp endpoint', () => {
  it('is absent without PFLUX_MCP_TOKEN', async () => {
    const { rpc } = await make({});
    expect((await rpc('ping')).statusCode).toBe(404);
  });

  it('requires the bearer token, even in exposed mode, and never the session', async () => {
    const { rpc } = await make({ PFLUX_MCP_TOKEN: TOKEN, PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'p'.repeat(12) });
    expect((await rpc('ping', undefined, {})).statusCode).toBe(401);
    expect((await rpc('ping', undefined, { authorization: 'Bearer nope' })).statusCode).toBe(401);
    expect((await rpc('ping')).json()).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
    const cross = await rpc('ping', undefined, { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example' });
    expect(cross.statusCode).toBe(403);
  });

  it('negotiates initialize, acks notifications, lists tools', async () => {
    const { app, rpc } = await make();
    const init = (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } })).json();
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.capabilities.tools).toBeDefined();
    const note = await app.inject({
      method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${TOKEN}` },
      payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
    });
    expect(note.statusCode).toBe(202);
    const names = (await rpc('tools/list')).json().result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(['list_feeds', 'get_feed', 'test_feed_url', 'create_feed', 'update_feed', 'set_feed_enabled', 'run_feed']);
    expect((await rpc('nope')).json().error.code).toBe(-32601);
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405);
  });

  it('creates, updates, pauses and validates feeds', async () => {
    const { call, deps } = await make();
    const created = await call('create_feed', { ...rss, ntfyServer: 'http://10.0.0.1' });
    expect(created.isError).toBe(false);
    expect(created.data.model).toBe(deps.config.defaultModel);
    expect(created.data.ntfyServer).toBeNull();
    expect(created.data.enabled).toBe(true);
    const id = created.data.id as string;

    const bad = await call('create_feed', { ...rss, sourceParams: { urls: [] } });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('sourceParams.urls');

    expect((await call('update_feed', { id, frequencyHours: 6 })).data.frequencyHours).toBe(6);
    expect((await call('update_feed', { id, sourceType: 'nvd' })).isError).toBe(true);
    expect((await call('set_feed_enabled', { id, enabled: false })).data.enabled).toBe(false);
    expect((await call('get_feed', { id: 'missing' })).text).toBe('not_found');
    const list = (await call('list_feeds')).data as { id: string }[];
    expect(list.some((f) => f.id === id)).toBe(true);
  });
});
