import { SsrfError } from '../net/safeFetch.js';
import type { OsvParams } from '../shared/types.js';
import { htmlToText } from './htmlText.js';
import type { RawItem, SourceConnector } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const DEFAULT_BASE = 'https://api.osv.dev';

function iso(v: unknown): string | undefined {
  const t = Date.parse(str(v));
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function httpUrl(v: unknown): string | null {
  try {
    const u = new URL(str(v));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseOsv(json: unknown): RawItem {
  if (!isObj(json) || !str(json['id'])) throw new Error('parse_failed');
  const id = str(json['id']);
  const aliases = (Array.isArray(json['aliases']) ? json['aliases'] : []).filter((a): a is string => typeof a === 'string');
  const cve = aliases.find((a) => a.startsWith('CVE-'));
  const refs = (Array.isArray(json['references']) ? json['references'] : [])
    .map((r) => (isObj(r) ? httpUrl(r['url']) : null))
    .filter((u): u is string => !!u);
  const ds = isObj(json['database_specific']) ? str(json['database_specific']['severity']) : '';
  const sevEntry = (Array.isArray(json['severity']) ? json['severity'] : []).find(isObj);
  const severity = ds || (sevEntry ? str(sevEntry['score']) : '') || null;
  const summary = htmlToText(str(json['summary']), 500);
  const details = htmlToText(str(json['details']));
  const content = [summary, details, aliases.length ? `Aliases: ${aliases.join(', ')}` : '', ...refs.map((r) => `Ref: ${r}`)]
    .filter(Boolean)
    .join('\n');
  return {
    sourceKey: cve ?? id,
    keyKind: 'id',
    title: `${cve ? `${cve} / ` : ''}${id}${summary ? `: ${summary}` : ''}`.slice(0, 500),
    url: refs[0] ?? `https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
    publishedAt: iso(json['published']) ?? iso(json['modified']),
    content,
    meta: { osvId: id, aliases, references: refs, severity, modified: iso(json['modified']) ?? null },
  };
}

function errorCode(e: unknown): string {
  return e instanceof SsrfError && e.code === 'destination_blocked' ? 'destination_blocked' : 'fetch_failed';
}

export const osvConnector: SourceConnector<OsvParams> = {
  type: 'osv',
  async fetch(params, ctx) {
    const base = (ctx.osvBaseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    const cutoff = ctx.now - ctx.freshnessDays * 86_400_000;
    const seen = new Set<string>();
    const out: RawItem[] = [];
    for (const pkg of params.packages) {
      if (ctx.signal.aborted) break;
      let ids: string[];
      try {
        const res = await ctx.fetch(`${base}/v1/querybatch`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ queries: [{ package: { name: pkg.name, ecosystem: pkg.ecosystem } }] }),
          signal: ctx.signal,
        });
        if (res.status < 200 || res.status >= 300) throw new Error('fetch_failed');
        const j = res.json<{ results?: Array<{ vulns?: Array<{ id?: unknown }> }> }>();
        ids = (j.results?.[0]?.vulns ?? []).map((v) => str(v.id)).filter(Boolean);
      } catch (e) {
        ctx.onSourceError(pkg.name, errorCode(e));
        continue;
      }
      for (const id of ids) {
        if (seen.has(id) || ctx.signal.aborted) continue;
        seen.add(id);
        try {
          const res = await ctx.fetch(`${base}/v1/vulns/${encodeURIComponent(id)}`, { signal: ctx.signal });
          if (res.status < 200 || res.status >= 300) throw new Error('fetch_failed');
          const raw = res.json<unknown>();
          const item = parseOsv(raw);
          const last = Math.max(Date.parse(str(isObj(raw) ? raw['published'] : '')) || 0, Date.parse(str(isObj(raw) ? raw['modified'] : '')) || 0);
          if (last && last < cutoff) continue;
          out.push(item);
        } catch (e) {
          ctx.onSourceError(id, e instanceof Error && e.message === 'parse_failed' ? 'parse_failed' : errorCode(e));
        }
      }
    }
    return out;
  },
};
