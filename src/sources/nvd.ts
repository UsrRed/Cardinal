import { SsrfError } from '../net/safeFetch.js';
import type { NvdParams, NvdSeverity } from '../shared/types.js';
import { htmlToText } from './htmlText.js';
import type { RawItem, SourceConnector } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DAY = 86_400_000;
const SLICE_DAYS = 120;
const PAGE_SIZE = 2000;
const BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const RANK: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

function scoreSeverity(score: number): string {
  return score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';
}

function bestCvss(metrics: unknown): { score: number; severity: string; version: string } | null {
  if (!isObj(metrics)) return null;
  let best: { score: number; severity: string; version: string } | null = null;
  for (const [key, version] of [['cvssMetricV40', '4.0'], ['cvssMetricV31', '3.1']] as const) {
    for (const m of arr(metrics[key])) {
      const d = isObj(m) && isObj(m['cvssData']) ? m['cvssData'] : null;
      if (!d || typeof d['baseScore'] !== 'number') continue;
      const severity = str(d['baseSeverity']).toUpperCase() || scoreSeverity(d['baseScore']);
      if (!best || (RANK[severity] ?? 0) > (RANK[best.severity] ?? 0)) best = { score: d['baseScore'], severity, version };
    }
  }
  return best;
}

function iso(v: unknown): string | undefined {
  const s = str(v);
  const t = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export function parseNvdPage(
  json: unknown,
  minSeverity?: NvdSeverity,
): { items: RawItem[]; totalResults: number; startIndex: number; resultsPerPage: number } {
  if (!isObj(json) || !Array.isArray(json['vulnerabilities'])) throw new Error('parse_failed');
  const items: RawItem[] = [];
  for (const v of json['vulnerabilities']) {
    const cve = isObj(v) && isObj(v['cve']) ? v['cve'] : null;
    const id = cve ? str(cve['id']) : '';
    if (!cve || !id) continue;
    const cvss = bestCvss(cve['metrics']);
    if (minSeverity && cvss && (RANK[cvss.severity] ?? 0) < RANK[minSeverity]!) continue;
    const descs = arr(cve['descriptions']).filter(isObj);
    const desc = str((descs.find((d) => d['lang'] === 'en') ?? descs[0])?.['value']);
    const refs = arr(cve['references'])
      .map((r) => (isObj(r) ? str(r['url']) : ''))
      .filter((u) => /^https?:\/\//i.test(u));
    const text = htmlToText(desc);
    items.push({
      sourceKey: id,
      keyKind: 'id',
      title: `${id}${text ? `: ${text}` : ''}`.slice(0, 200),
      url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`,
      publishedAt: iso(cve['published']),
      content: [text, cvss ? `CVSS ${cvss.version}: ${cvss.score} (${cvss.severity})` : '', ...refs.slice(0, 10).map((r) => `Ref: ${r}`)]
        .filter(Boolean)
        .join('\n')
        .slice(0, 8000),
      meta: { severity: cvss?.severity ?? null, cvss: cvss?.score ?? null, cvssVersion: cvss?.version ?? null, references: refs },
    });
  }
  const num = (k: string, d: number) => (typeof json[k] === 'number' ? (json[k] as number) : d);
  return { items, totalResults: num('totalResults', items.length), startIndex: num('startIndex', 0), resultsPerPage: num('resultsPerPage', items.length) };
}

export function nvdWindows(now: number, freshnessDays: number): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  let s = now - freshnessDays * DAY;
  while (s < now) {
    const e = Math.min(s + SLICE_DAYS * DAY, now);
    out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() });
    s = e;
  }
  return out;
}

function errorCode(e: unknown): string {
  if (e instanceof SsrfError && e.code === 'destination_blocked') return 'destination_blocked';
  return e instanceof Error && e.message === 'parse_failed' ? 'parse_failed' : 'fetch_failed';
}

export const nvdConnector: SourceConnector<NvdParams> = {
  type: 'nvd',
  async fetch(params, ctx) {
    const seen = new Set<string>();
    const out: RawItem[] = [];
    const headers: Record<string, string> = ctx.nvdApiKey ? { apiKey: ctx.nvdApiKey } : {};
    for (const keyword of params.keywords) {
      for (const w of nvdWindows(ctx.now, ctx.freshnessDays)) {
        let startIndex = 0;
        while (!ctx.signal.aborted) {
          const qs = new URLSearchParams({
            keywordSearch: keyword,
            pubStartDate: w.start,
            pubEndDate: w.end,
            startIndex: String(startIndex),
            resultsPerPage: String(PAGE_SIZE),
          });
          let page: ReturnType<typeof parseNvdPage>;
          try {
            await ctx.nvdLimiter.acquire(ctx.signal);
            const res = await ctx.fetch(`${BASE}?${qs}`, { headers, signal: ctx.signal });
            if (res.status < 200 || res.status >= 300) throw new Error('fetch_failed');
            page = parseNvdPage(res.json<unknown>(), params.minSeverity);
          } catch (e) {
            if (ctx.signal.aborted) return out;
            ctx.onSourceError(keyword, errorCode(e));
            break;
          }
          for (const it of page.items) {
            if (!seen.has(it.sourceKey)) {
              seen.add(it.sourceKey);
              out.push(it);
            }
          }
          const next = page.startIndex + page.resultsPerPage;
          if (page.resultsPerPage <= 0 || next >= page.totalResults) break;
          startIndex = next;
        }
      }
    }
    return out;
  },
};
