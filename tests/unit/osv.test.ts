import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../src/net/safeFetch.js';
import { osvConnector, parseOsv } from '../../src/sources/osv.js';
import type { SourceContext } from '../../src/sources/types.js';

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-01-20T00:00:00Z');
let srv: http.Server;
let base: string;

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/v1/querybatch') {
        const name = JSON.parse(body).queries[0].package.name;
        if (name === 'broken') { res.statusCode = 500; res.end('x'); return; }
        res.end(fx('osv-batch.json'));
      } else if (req.url === '/v1/vulns/GHSA-aaaa-bbbb-cccc') res.end(fx('osv-vuln.json'));
      else if (req.url === '/v1/vulns/GHSA-old0-old0-old0')
        res.end(JSON.stringify({ id: 'GHSA-old0-old0-old0', published: '2020-01-01T00:00:00Z', modified: '2020-01-01T00:00:00Z' }));
      else { res.statusCode = 404; res.end('x'); }
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());

function ctx(errors: string[], freshnessDays = 30): SourceContext {
  return {
    fetch: createSafeFetch({ allowlist: [{ kind: 'cidr', cidr: '127.0.0.1/32' }], maxBytes: 1e6, timeoutMs: 3000 }),
    now: NOW, freshnessDays, signal: new AbortController().signal, nvdApiKey: null, nvdLimiter: null as never,
    osvBaseUrl: base, onSourceError: (t, c) => errors.push(`${t}:${c}`),
  };
}

describe('osv', () => {
  it('parses fixture with id, CVE alias, reference and severity', () => {
    const r = parseOsv(JSON.parse(fx('osv-vuln.json')));
    expect(r.sourceKey).toBe('CVE-2026-1234');
    expect(r.meta['osvId']).toBe('GHSA-aaaa-bbbb-cccc');
    expect(r.url).toBe('https://github.com/advisories/GHSA-aaaa-bbbb-cccc');
    expect(r.content).toContain('https://example.com/fix');
    expect(r.meta['severity']).toBe('HIGH');
    expect(r.publishedAt).toBe('2026-01-09T10:00:00.000Z');
  });

  it('fetches via local server, skips stale vulns, isolates package failures', async () => {
    const errors: string[] = [];
    const items = await osvConnector.fetch(
      { packages: [{ name: 'broken', ecosystem: 'npm' }, { name: 'foo', ecosystem: 'npm' }] },
      ctx(errors),
    );
    expect(items.map((i) => i.meta['osvId'])).toEqual(['GHSA-aaaa-bbbb-cccc']);
    expect(errors).toEqual(['broken:fetch_failed']);
  });
});
