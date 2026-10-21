import { z } from 'zod';
import { normalizeUrl } from '../dedup/index.js';
import type { DigestSection, Priority } from '../shared/types.js';

export interface TriageItem {
  ref: string;
  keep: boolean;
  priority: Priority;
  justification: string;
  summary: string;
  sources: string[];
}
export interface TriageOutput {
  items: TriageItem[];
}
export interface DigestOutput {
  items: TriageItem[];
  digest: { title: string; lede: string; sections: DigestSection[] };
}

export const triageOutputSchema: z.ZodType<TriageOutput> = z.object({
  items: z.array(
    z.object({
      ref: z.string(),
      keep: z.boolean(),
      priority: z.enum(['high', 'medium', 'low']),
      justification: z.string().max(200),
      summary: z.string().max(800),
      sources: z.array(z.string().url()),
    }),
  ),
});

const itemSchema = z.object({
  ref: z.string(),
  keep: z.boolean(),
  priority: z.enum(['high', 'medium', 'low']),
  justification: z.string().max(200),
  summary: z.string().max(800),
  sources: z.array(z.string().url()),
});

export const digestOutputSchema: z.ZodType<DigestOutput> = z.object({
  items: z.array(itemSchema),
  digest: z.object({
    title: z.string().max(200),
    lede: z.string().max(1000),
    sections: z
      .array(z.object({ heading: z.string(), itemRefs: z.array(z.string()), body: z.string().max(4000) }))
      .min(1)
      .max(20),
  }),
});

export function validateOutput<T>(
  kind: 'triage' | 'digest',
  json: unknown,
  ctx: { refs: Set<string>; allowedUrls: Set<string> },
): { ok: true; value: T } | { ok: false; problems: string[] } {
  const parsed = (kind === 'triage' ? triageOutputSchema : digestOutputSchema).safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 10).map((i) => `schéma: ${i.path.join('.') || '(racine)'}: ${i.message}`),
    };
  }
  const value = parsed.data;
  const problems: string[] = [];
  const allowed = new Set([...ctx.allowedUrls].map(safeNormalize));
  const seen = new Set<string>();
  const kept = new Set<string>();
  for (const it of value.items) {
    if (!ctx.refs.has(it.ref)) problems.push(`ref inconnue: ${it.ref}`);
    else if (seen.has(it.ref)) problems.push(`ref dupliquée: ${it.ref}`);
    seen.add(it.ref);
    if (it.keep) kept.add(it.ref);
    for (const u of it.sources) {
      if (!allowed.has(safeNormalize(u))) problems.push(`URL absente des entrées (${it.ref}): ${u}`);
    }
  }
  if (kind === 'digest') {
    const dv = value as DigestOutput;
    for (const s of dv.digest.sections) {
      for (const r of s.itemRefs) {
        if (!kept.has(r)) problems.push(`itemRef inconnu ou non retenu: ${r}`);
      }
    }
  }
  if (problems.length) return { ok: false, problems: problems.slice(0, 20) };
  return { ok: true, value: value as T };
}

function safeNormalize(u: string): string {
  try {
    return normalizeUrl(u);
  } catch {
    return u;
  }
}
