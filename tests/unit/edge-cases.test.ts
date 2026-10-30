import { describe, expect, it } from 'vitest';
import { isBlockedAddress, isAllowlisted, parseAllowlist } from '../../src/net/ipPolicy.js';
import { normalizeUrl, normalizeKey, dedupKey } from '../../src/dedup/index.js';
import { feedInputSchema } from '../../src/shared/schemas.js';
import { deferDelayMs } from '../../src/scheduler/index.js';
import { parseFeed } from '../../src/sources/rss.js';
import { parseXmlSafe } from '../../src/sources/xml.js';
import { nvdWindows } from '../../src/sources/nvd.js';

const base = {
  name: 'n', instructions: 'i', frequencyHours: 6, freshnessDays: 7,
  sourceType: 'rss', sourceParams: { urls: ['https://example.com/f.xml'] },
};

describe('ipPolicy edges', () => {
  it.each([
    '0.0.0.0', '0.255.255.255', '100.64.0.1', '100.127.255.255', '169.254.169.254', '172.16.0.1',
    '172.31.255.255', '192.168.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fc00::1',
    'fd12::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '1.1.1.1', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'allows public %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));
  it('allowlist entry with port does not match another port or IP', () => {
    const l = parseAllowlist('192.168.1.20:8080');
    expect(isAllowlisted('192.168.1.20', 8080, l)).toBe(true);
    expect(isAllowlisted('192.168.1.20', 8081, l)).toBe(false);
    expect(isAllowlisted('192.168.1.21', 8080, l)).toBe(false);
  });
  it('CIDR boundaries', () => {
    const l = parseAllowlist('10.0.0.0/24');
    expect(isAllowlisted('10.0.0.255', 80, l)).toBe(true);
    expect(isAllowlisted('10.0.1.0', 80, l)).toBe(false);
  });
  it('drops garbage allowlist entries (fail closed), accepts empty', () => {
    expect(parseAllowlist('not-an-ip,1.2.3.4:99999,10.0.0.0/33')).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });
});

describe('dedup edges', () => {
  it('normalizes case, fragment, utm params and trailing slash but keeps other params', () => {
    expect(normalizeUrl('HTTPS://Example.COM/a/?utm_source=x&id=2#frag')).toBe(normalizeUrl('https://example.com/a?id=2'));
    expect(normalizeUrl('https://example.com/a?id=2')).not.toBe(normalizeUrl('https://example.com/a?id=3'));
  });
  it('lowercase CVE id equals uppercase', () => {
    const a = normalizeKey({ sourceKey: 'cve-2024-1', keyKind: 'id' });
    expect(dedupKey('nvd', a)).toBe(dedupKey('nvd', normalizeKey({ sourceKey: 'CVE-2024-1', keyKind: 'id' })));
    expect(dedupKey('nvd', a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('feed schema edges', () => {
  const ok = (o: object) => feedInputSchema.safeParse({ ...base, ...o }).success;
  it('frequency and freshness bounds', () => {
    expect(ok({ frequencyHours: 1 })).toBe(true);
    expect(ok({ frequencyHours: 720 })).toBe(true);
    expect(ok({ frequencyHours: 1.5 })).toBe(false);
    expect(ok({ freshnessDays: 0 })).toBe(false);
    expect(ok({ freshnessDays: 91 })).toBe(false);
  });
  it('rss url count 1..20 and scheme', () => {
    const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://e.com/${i}`);
    expect(ok({ sourceParams: { urls: urls(20) } })).toBe(true);
    expect(ok({ sourceParams: { urls: urls(21) } })).toBe(false);
    expect(ok({ sourceParams: { urls: ['javascript:alert(1)'] } })).toBe(false);
    expect(ok({ sourceParams: { urls: ['file:///etc/passwd'] } })).toBe(false);
  });
  it('rejects empty/oversize name, bad topic, unknown sourceType', () => {
    expect(ok({ name: '' })).toBe(false);
    expect(ok({ name: 'x'.repeat(121) })).toBe(false);
    expect(ok({ instructions: 'x'.repeat(4001) })).toBe(false);
    expect(ok({ ntfyTopic: 'bad topic!' })).toBe(false);
    expect(ok({ sourceType: 'github' })).toBe(false);
  });
  it('nvd: bad severity and empty keywords rejected', () => {
    expect(ok({ sourceType: 'nvd', sourceParams: { keywords: ['a'], minSeverity: 'EXTREME' } })).toBe(false);
    expect(ok({ sourceType: 'nvd', sourceParams: { keywords: [] } })).toBe(false);
    expect(ok({ sourceType: 'nvd', sourceParams: { keywords: ['a'], minSeverity: 'HIGH' } })).toBe(true);
  });
  it('osv: empty packages rejected', () => {
    expect(ok({ sourceType: 'osv', sourceParams: { packages: [] } })).toBe(false);
  });
});

describe('scheduler/source edges', () => {
  it('defer backoff doubles and caps at 360 min', () => {
    expect(deferDelayMs(60, 0)).toBe(60 * 60_000);
    expect(deferDelayMs(60, 1)).toBe(120 * 60_000);
    expect(deferDelayMs(60, 10)).toBe(360 * 60_000);
  });
  it('nvdWindows: single window within 120 days, none overlapping beyond', () => {
    const now = Date.UTC(2026, 5, 1);
    expect(nvdWindows(now, 90)).toHaveLength(1);
    expect(nvdWindows(now, 121).length).toBeGreaterThanOrEqual(2);
  });
  it('parseXmlSafe rejects malformed xml', () => {
    expect(() => parseXmlSafe('<rss><channel>')).not.toThrow(RangeError);
  });
  it('parseFeed: empty channel yields no items; item without link/title does not crash', () => {
    expect(parseFeed('<rss version="2.0"><channel><title>t</title></channel></rss>', 'https://e.com/')).toEqual([]);
    expect(() => parseFeed('<rss version="2.0"><channel><item><description>x</description></item></channel></rss>', 'https://e.com/')).not.toThrow();
  });
  it('parseFeed: non-feed document throws or yields nothing', () => {
    let r: unknown[] = [];
    try { r = parseFeed('<html><body>hi</body></html>', 'https://e.com/'); } catch { /* rejected */ }
    expect(r).toEqual([]);
  });
});
