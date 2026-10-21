import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAllowlisted, isBlockedAddress, parseAllowlist } from '../../src/net/ipPolicy.js';
import { createSafeFetch, SsrfError } from '../../src/net/safeFetch.js';

describe('ipPolicy', () => {
  it.each([
    '127.0.0.1', '::1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1',
    'fc00::1', 'fd12::1', '169.254.169.254', 'fe80::1', '0.0.0.0', '224.0.0.1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:7f00:1',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700::1111', '172.32.0.1'])('allows %s', (ip) =>
    expect(isBlockedAddress(ip)).toBe(false));
  it('allowlist matching', () => {
    const l = parseAllowlist('127.0.0.1:8080, 10.0.0.5, 192.168.0.0/16, bogus');
    expect(l).toHaveLength(3);
    expect(isAllowlisted('127.0.0.1', 8080, l)).toBe(true);
    expect(isAllowlisted('127.0.0.1', 9, l)).toBe(false);
    expect(isAllowlisted('10.0.0.5', 1, l)).toBe(true);
    expect(isAllowlisted('192.168.4.4', 1, l)).toBe(true);
    expect(isAllowlisted('0.0.0.0', 1, parseAllowlist('0.0.0.0/0'))).toBe(false);
    expect(isAllowlisted('224.0.0.1', 1, parseAllowlist('224.0.0.0/4'))).toBe(false);
  });
});

describe('safeFetch', () => {
  let srv: http.Server;
  let port: number;
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      const u = req.url ?? '';
      if (u === '/ok') res.end('hello');
      else if (u === '/priv') { res.statusCode = 302; res.setHeader('location', 'http://10.0.0.1/x'); res.end(); }
      else if (u.startsWith('/loop')) { res.statusCode = 302; res.setHeader('location', '/loop' + Math.random()); res.end(); }
      else if (u === '/big') res.end(Buffer.alloc(5000, 1));
      else if (u === '/slow') setTimeout(() => res.end('late'), 2000);
      else res.end();
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    port = (srv.address() as AddressInfo).port;
  });
  afterAll(() => { srv.closeAllConnections(); srv.close(); });
  const mk = (o: Partial<Parameters<typeof createSafeFetch>[0]> = {}) =>
    createSafeFetch({ allowlist: parseAllowlist(`127.0.0.1:${port}`), maxBytes: 1000, timeoutMs: 500, ...o });

  it.each(['file:///etc/passwd', 'ftp://x/y', 'gopher://x/', 'data:text/plain,hi'])('rejects %s', async (u) => {
    await expect(mk()(u)).rejects.toMatchObject({ code: 'scheme_not_allowed' });
  });
  it('blocks loopback without allowlist, generic message', async () => {
    const e = await mk({ allowlist: [] })(`http://127.0.0.1:${port}/ok`).catch((x) => x);
    expect(e).toBeInstanceOf(SsrfError);
    expect(e.message).toBe('destination refusée par la politique réseau');
  });
  it.each([`127.0.0.1:%`, '127.0.0.1', '127.0.0.0/8'])('allows loopback with allowlist %s', async (a) => {
    const r = await mk({ allowlist: parseAllowlist(a.replace('%', String(port))) })(`http://127.0.0.1:${port}/ok`);
    expect(r.status).toBe(200);
    expect(r.text()).toBe('hello');
  });
  it('refuses redirect to private IP', async () => {
    await expect(mk()(`http://127.0.0.1:${port}/priv`)).rejects.toMatchObject({ code: 'destination_blocked' });
  });
  it('refuses >5 redirects', async () => {
    await expect(mk()(`http://127.0.0.1:${port}/loop`)).rejects.toMatchObject({ code: 'too_many_redirects' });
  });
  it('aborts oversize responses', async () => {
    await expect(mk()(`http://127.0.0.1:${port}/big`)).rejects.toMatchObject({ code: 'response_too_large' });
  });
  it('honors timeout', async () => {
    await expect(mk({ timeoutMs: 200 })(`http://127.0.0.1:${port}/slow`)).rejects.toMatchObject({ code: 'timeout' });
  });
  it('resolves DNS once and connects to that IP (rebinding)', async () => {
    let calls = 0;
    const resolver = async () => (++calls === 1 ? ['127.0.0.1'] : ['10.0.0.1']);
    const r = await mk({ resolver })(`http://rebind.example:${port}/ok`);
    expect(r.status).toBe(200);
    expect(calls).toBe(1);
  });
  it('blocks hostnames resolving to private IPs', async () => {
    await expect(mk({ allowlist: [], resolver: async () => ['192.168.0.9'] })('http://evil.example/')).rejects.toMatchObject({ code: 'destination_blocked' });
  });
});
