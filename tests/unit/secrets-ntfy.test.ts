import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/net/safeFetch.js';
import { NtfyNotifier, resolveTarget } from '../../src/notify/ntfy.js';
import { SecretsStore } from '../../src/secrets/index.js';
import type { Feed, Item, Settings } from '../../src/shared/types.js';

describe('SecretsStore', () => {
  it('writes secrets.json 0600 and hides the value in state()', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sec-'));
    const s = new SecretsStore({ dataDir: dir, env: {} });
    s.set('ntfyToken', 'tk_secret');
    expect(statSync(join(dir, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(s.state('ntfyToken')).toEqual({ configured: true, source: 'ui' });
    expect(JSON.stringify(s.state('ntfyToken'))).not.toContain('tk_secret');
    s.clear('ntfyToken');
    expect(s.get('ntfyToken')).toBeNull();
    expect(readFileSync(join(dir, 'secrets.json'), 'utf8')).not.toContain('tk_secret');
  });
  it('env wins over ui', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sec-'));
    new SecretsStore({ dataDir: dir, env: {} }).set('nvdApiKey', 'ui');
    const s = new SecretsStore({ dataDir: dir, env: { nvdApiKey: 'env' } });
    expect(s.get('nvdApiKey')).toBe('env');
    expect(s.state('nvdApiKey').source).toBe('env');
  });
});

interface Req { headers: http.IncomingHttpHeaders; body: string; url?: string }
let srv: http.Server;
let base: string;
let reqs: Req[];
beforeAll(async () => {
  srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { reqs.push({ headers: req.headers, body, url: req.url }); res.end('ok'); });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());
beforeEach(() => { reqs = []; });

const allowed = () => new NtfyNotifier(createSafeFetch({ allowlist: [{ kind: 'cidr', cidr: '127.0.0.1/32' }], maxBytes: 1e6, timeoutMs: 3000 }));
const feed = { name: 'Veille', notifyThreshold: 'medium', ntfyServer: null, ntfyTopic: null } as Feed;
const item = (n: number, priority: Item['priority'] = 'high'): Item =>
  ({ id: `x${n}`, title: `Titre ${n}`, summary: 'r'.repeat(400), justification: 'j', priority }) as Item;
const decode = (h: string) => (h.startsWith('=?UTF-8?B?') ? Buffer.from(h.slice(10, -2), 'base64').toString() : h);

describe('NtfyNotifier', () => {
  it('sends expected headers and body', async () => {
    const t = { server: base, topic: 'alerts', token: 'tok' };
    const r = await allowed().notifyRun({ target: t, feed, items: [item(1)], digestId: 'd1', publicUrl: 'https://pf.example/' });
    expect(r).toEqual({ sent: 1, failed: 0 });
    const q = reqs[0]!;
    expect(q.url).toBe('/alerts');
    expect(decode(q.headers.title as string)).toBe('[Cardinal] Veille — Titre 1');
    expect(q.headers.priority).toBe('4');
    expect(q.headers.click).toBe('https://pf.example/digests/d1');
    expect(q.headers.authorization).toBe('Bearer tok');
    expect(q.body.length).toBe(300);
  });
  it('8 eligible items → 5 + 1 recap; no token, no Authorization; no click without public url', async () => {
    const items = Array.from({ length: 8 }, (_, i) => item(i));
    const r = await allowed().notifyRun({ target: { server: base, topic: 'a', token: null }, feed, items: [...items, item(9, 'low')], digestId: 'd', publicUrl: null });
    expect(r.sent).toBe(6);
    expect(reqs).toHaveLength(6);
    expect(reqs.every((q) => q.headers.authorization === undefined && q.headers.click === undefined)).toBe(true);
    expect(decode(reqs[5]!.headers.title as string)).toContain('3 autres éléments');
  });
  it('blocked destination yields generic error', async () => {
    const n = new NtfyNotifier(createSafeFetch({ allowlist: [], maxBytes: 1e6, timeoutMs: 3000 }));
    await expect(n.send({ server: base, topic: 'a', token: null }, { title: 't', body: 'b', priority: 3 })).rejects.toThrow('destination refusée par la politique réseau');
    expect(await n.sendTest({ server: base, topic: 'a', token: null })).toEqual({ ok: false, error: 'destination_blocked' });
  });
  it('empty topic → no request', async () => {
    const s = { ntfyServer: base, ntfyTopic: '' } as Settings;
    expect(resolveTarget(feed, s, null)).toBeNull();
    expect(await allowed().notifyRun({ target: null, feed, items: [item(1)], digestId: 'd', publicUrl: null })).toEqual({ sent: 0, failed: 0 });
    expect(await allowed().sendTest({ server: base, topic: '', token: null })).toEqual({ ok: false, error: 'not_configured' });
    expect(reqs).toHaveLength(0);
  });
  it('feed override beats global', () => {
    const s = { ntfyServer: 'https://a', ntfyTopic: 'g' } as Settings;
    expect(resolveTarget({ ...feed, ntfyServer: 'https://b', ntfyTopic: 'f' } as Feed, s, 't')).toEqual({ server: 'https://b', topic: 'f', token: 't' });
  });
});
