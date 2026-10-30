import type { Feed, LogLevel } from '../shared/types.js';
import { ClaudeError, type ClaudeRunner } from './types.js';
import { validateOutput, type DigestOutput, type TriageItem, type TriageOutput } from './outputSchema.js';
import { buildCorrectionPrompt, buildDigestPrompt, buildTriagePrompt, type PromptItem } from './prompt.js';

export interface EngineResult {
  triaged: TriageItem[];
  processedRefs: string[];
  digest: DigestOutput['digest'] | null;
}

const DEFAULT_BATCH = 40;

/** Triage (batched when > batchSize) then digest. */
export async function runTriageAndDigest(o: {
  runner: ClaudeRunner;
  feed: Pick<Feed, 'name' | 'instructions' | 'model'>;
  items: PromptItem[];
  signal: AbortSignal;
  batchSize?: number;
  onLog(level: LogLevel, msg: string): void;
}): Promise<EngineResult> {
  const { runner, feed, signal } = o;
  const batchSize = o.batchSize ?? DEFAULT_BATCH;

  async function call<T>(kind: 'triage' | 'digest', prompt: string, batch: PromptItem[]): Promise<T> {
    const refs = new Set(batch.map((i) => i.ref));
    const allowedUrls = new Set(batch.flatMap((i) => [...(i.url ? [i.url] : []), ...i.sources]));
    let current = prompt;
    for (let attempt = 0; attempt < 2; attempt++) {
      let problems: string[];
      try {
        const res = await runner.run({ prompt: current, model: feed.model, signal });
        const v = validateOutput<T>(kind, res.json, { refs, allowedUrls });
        if (v.ok) return v.value;
        problems = v.problems;
      } catch (e) {
        if (e instanceof ClaudeError && e.kind === 'invalid_output') {
          problems = ['la sortie n\'est pas un JSON valide'];
        } else throw e;
      }
      o.onLog('warn', `Sortie ${kind} rejetée (${problems.length} problème(s))${attempt === 0 ? ', nouvelle tentative' : ''}`);
      current = buildCorrectionPrompt(prompt, problems);
    }
    throw new ClaudeError('invalid_output');
  }

  const common = { feedName: feed.name, instructions: feed.instructions };

  if (o.items.length <= batchSize) {
    const out = await call<DigestOutput>(
      'digest',
      buildDigestPrompt({ ...common, items: o.items, withTriage: true }),
      o.items,
    );
    return { triaged: out.items, processedRefs: out.items.map((i) => i.ref), digest: out.digest };
  }

  const triaged: TriageItem[] = [];
  const processed: string[] = [];
  for (let i = 0; i < o.items.length; i += batchSize) {
    const batch = o.items.slice(i, i + batchSize);
    const out = await call<TriageOutput>('triage', buildTriagePrompt({ ...common, items: batch }), batch);
    triaged.push(...out.items);
    processed.push(...out.items.map((t) => t.ref));
  }

  const keptRefs = new Set(triaged.filter((t) => t.keep).map((t) => t.ref));
  const kept = o.items.filter((i) => keptRefs.has(i.ref));
  if (!kept.length) return { triaged, processedRefs: processed, digest: null };
  const out = await call<DigestOutput>(
    'digest',
    buildDigestPrompt({ ...common, items: kept, withTriage: false }),
    kept,
  );
  const byRef = new Map(out.items.map((t) => [t.ref, t]));
  return {
    triaged: triaged.map((t) => byRef.get(t.ref) ?? t),
    processedRefs: processed,
    digest: out.digest,
  };
}
