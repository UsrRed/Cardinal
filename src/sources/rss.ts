import { SsrfError, type SafeFetch } from '../net/safeFetch.js';
import type { RssParams } from '../shared/types.js';
import { htmlToText } from './htmlText.js';
import type { RawItem, SourceConnector } from './types.js';
import { XmlRejectedError, parseXmlSafe } from './xml.js';

type Node = Record<string, unknown>;

const arr = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

const XML_ENT: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'" };

// The parser leaves entities undecoded (safety); decode the XML-level ones once, ampersand last.
function unescapeXml(s: string): string {
  return s
    .replace(/&(lt|gt|quot|apos);/g, (_, e: string) => XML_ENT[e]!)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (m, n: string) => {
      const cp = n[0]!.toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    })
    .replace(/&amp;/g, '&');
}

function text(v: unknown): string {
  if (typeof v === 'string') return unescapeXml(v);
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const t = (v as Node)['#text'];
    if (typeof t === 'string' || typeof t === 'number') return unescapeXml(String(t));
  }
  return '';
}

function resolveUrl(raw: string, base: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function toIso(raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  const t = Date.parse(raw.trim());
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function atomLink(links: unknown[]): string {
  const objs = links.filter((l): l is Node => !!l && typeof l === 'object');
  const pick = objs.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? objs[0];
  return pick ? text(pick['@_href']) : '';
}

export function parseFeed(xml: string, baseUrl: string): RawItem[] {
  const doc = parseXmlSafe(xml) as Node;
  const out: RawItem[] = [];
  const rss = doc['rss'] as Node | undefined;
  const channel = (rss?.['channel'] ?? (doc['rdf:RDF'] as Node | undefined)) as Node | undefined;
  const feed = doc['feed'] as Node | undefined;
  if (!channel && !feed) throw new XmlRejectedError('xml_invalid');

  const push = (title: string, link: string, id: string, date: string, html: string) => {
    const url = resolveUrl(link, baseUrl);
    const key = url ?? (id.trim() ? id.trim() : null);
    if (!key) return;
    const content = htmlToText(html);
    out.push({
      sourceKey: key,
      keyKind: url ? 'url' : 'id',
      title: htmlToText(title, 500) || key,
      url,
      publishedAt: toIso(date),
      content,
      meta: {},
    });
  };

  if (channel) {
    for (const e of arr(channel['item'])) {
      const it = e as Node;
      push(
        text(it['title']),
        text(it['link']),
        text(it['guid']),
        text(it['pubDate']) || text(it['dc:date']),
        text(it['content:encoded']) || text(it['description']),
      );
    }
  } else if (feed) {
    for (const e of arr(feed['entry'])) {
      const it = e as Node;
      push(
        text(it['title']),
        atomLink(arr(it['link'])),
        text(it['id']),
        text(it['published']) || text(it['updated']),
        text(it['content']) || text(it['summary']),
      );
    }
  }
  return out;
}

export const parseRss = parseFeed;

export const rssConnector: SourceConnector<RssParams> = {
  type: 'rss',
  async fetch(params, ctx) {
    const cutoff = ctx.now - ctx.freshnessDays * 86_400_000;
    const all: RawItem[] = [];
    for (const url of params.urls) {
      if (ctx.signal.aborted) break;
      try {
        const res = await ctx.fetch(url, { signal: ctx.signal });
        if (res.status < 200 || res.status >= 300) throw new Error('fetch_failed');
        const items = parseFeed(res.text(), res.url || url);
        for (const it of items) {
          if (it.publishedAt && Date.parse(it.publishedAt) < cutoff) continue;
          all.push(it);
        }
      } catch (e) {
        ctx.onSourceError(url, errorCode(e));
      }
    }
    return all;
  },
};

function errorCode(e: unknown): string {
  if (e instanceof SsrfError) return e.code === 'destination_blocked' ? 'destination_blocked' : 'fetch_failed';
  if (e instanceof XmlRejectedError) return 'parse_failed';
  return 'fetch_failed';
}

export async function testFeedUrl(
  url: string,
  fetch: SafeFetch,
): Promise<{ ok: true; count: number } | { ok: false; error: 'fetch_failed' | 'parse_failed' | 'destination_blocked' }> {
  try {
    const res = await fetch(url);
    if (res.status < 200 || res.status >= 300) return { ok: false, error: 'fetch_failed' };
    return { ok: true, count: parseFeed(res.text(), res.url || url).length };
  } catch (e) {
    const c = errorCode(e);
    return { ok: false, error: c as 'fetch_failed' | 'parse_failed' | 'destination_blocked' };
  }
}
