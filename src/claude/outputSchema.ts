import { z } from 'zod';
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

// TODO: digestOutputSchema
export function validateOutput<T>(
  _kind: 'triage' | 'digest',
  _json: unknown,
  _ctx: { refs: Set<string>; allowedUrls: Set<string> },
): { ok: true; value: T } | { ok: false; problems: string[] } {
  throw new Error('not implemented');
}
