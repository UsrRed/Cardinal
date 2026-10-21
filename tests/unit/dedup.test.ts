import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dedupKey, filterUnseen, normalizeKey, normalizeUrl } from '../../src/dedup/index.js';
import { htmlToText } from '../../src/sources/htmlText.js';
import { parseXmlSafe, XmlRejectedError } from '../../src/sources/xml.js';

describe('xml', () => {
  for (const f of ['xxe.xml', 'billion-laughs.xml']) {
    it(`rejects ${f}`, () => {
      expect(() => parseXmlSafe(readFileSync(`tests/fixtures/${f}`, 'utf8'))).toThrow(XmlRejectedError);
    });
  }
  it('parses plain xml', () => {
    expect(parseXmlSafe('<a><b>x</b></a>')).toEqual({ a: { b: 'x' } });
  });
});

describe('dedup', () => {
  it('normalizes equivalent urls to the same key', () => {
    const vs = [
      'https://Example.com/a/b',
      'HTTPS://EXAMPLE.COM/a/b/',
      'https://example.com/a/b#frag',
      'https://example.com/a/b?utm_source=x&utm_medium=y',
    ];
    const keys = vs.map((u) => dedupKey('rss', normalizeKey({ sourceKey: u, keyKind: 'url' })));
    expect(new Set(keys).size).toBe(1);
    expect(normalizeUrl('https://e.com/p?id=1&utm_x=2')).toBe('https://e.com/p?id=1');
  });
  it('uppercases ids and separates source types', () => {
    const k = (id: string, t: 'osv' | 'nvd') => dedupKey(t, normalizeKey({ sourceKey: id, keyKind: 'id' }));
    expect(k('cve-2024-1', 'nvd')).toBe(k('CVE-2024-1', 'nvd'));
    expect(k('CVE-2024-1', 'nvd')).not.toBe(k('CVE-2024-1', 'osv'));
  });
  it('filterUnseen drops seen and in-batch duplicates', () => {
    const mk = (u: string) => ({ sourceKey: u, keyKind: 'url' as const, title: 't', url: u, content: '', meta: {} });
    const seenKey = dedupKey('rss', 'https://a.com/1');
    const repo = { filterUnseen: (_f: string, keys: string[]) => new Set(keys.filter((k) => k !== seenKey)) };
    const out = filterUnseen([mk('https://a.com/1/'), mk('https://a.com/2'), mk('https://A.com/2#x')], repo, 'f', 'rss');
    expect(out.map((o) => o.item.sourceKey)).toEqual(['https://a.com/2']);
  });
});

describe('htmlToText', () => {
  it('strips tags and scripts', () => {
    const t = htmlToText('<p>Hi &amp; bye</p><script>alert(1)</script><style>a{}</style><b>x</b>');
    expect(t).not.toMatch(/[<>]|alert|a\{/);
    expect(t).toContain('Hi & bye');
  });
  it('truncates to 8000', () => {
    expect(htmlToText('<p>' + 'a'.repeat(20000) + '</p>').length).toBe(8000);
    expect(htmlToText('abcdef', 3)).toBe('abc');
  });
});
