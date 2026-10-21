import type { Usage } from '../shared/types.js';
import { ClaudeError, type ClaudeErrorKind, type ClaudeRunner, type RunRequest, type RunResult } from './types.js';

export type FakeStep =
  | { kind: 'valid'; costUsd?: number }
  | { kind: 'raw'; text: string; costUsd?: number }
  | { kind: 'invalid_json' }
  | { kind: 'invented_url' }
  | { kind: 'unknown_ref' }
  | { kind: 'error'; error: ClaudeErrorKind }
  | { kind: 'delay'; ms: number };

const DATA_RE = /<<<DATA id=([^>\s]+)>>>\n([\s\S]*?)\n?<<<END DATA>>>/g;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function usageOf(costUsd = 0.001): Usage {
  return { inputTokens: 100, outputTokens: 50, costUsd };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ClaudeError('cancelled'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ClaudeError('cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Deterministic valid output built from the DATA blocks of the prompt. */
function autoOutput(prompt: string, mutate?: 'invented_url' | 'unknown_ref'): unknown {
  const blocks: { ref: string; body: string }[] = [];
  for (const m of prompt.matchAll(DATA_RE)) {
    if (m[1] !== 'instructions' && /^i\d+$/.test(m[1]!)) blocks.push({ ref: m[1]!, body: m[2]! });
  }
  const items = blocks.map((b, idx) => ({
    ref: b.ref,
    keep: true,
    priority: idx === 0 ? 'high' : 'medium',
    justification: `Pertinent pour ${b.ref}`,
    summary: `Résumé de ${b.ref}`,
    sources: [...new Set(b.body.match(URL_RE) ?? [])].slice(0, 3),
  }));
  if (mutate === 'invented_url' && items[0]) items[0].sources = ['https://invented.example.invalid/x'];
  if (mutate === 'unknown_ref' && items[0]) items[0].ref = 'i9999';
  return {
    items,
    digest: {
      title: 'Digest de test',
      lede: 'Synthèse déterministe.',
      sections: items.length ? [{ heading: 'À lire', itemRefs: items.map((i) => i.ref), body: 'Éléments retenus.' }] : [],
    },
  };
}

export class FakeClaudeRunner implements ClaudeRunner {
  calls: RunRequest[] = [];
  private script: FakeStep[];
  constructor(script?: FakeStep[]) {
    this.script = script ? [...script] : [];
  }

  async run(req: RunRequest): Promise<RunResult> {
    this.calls.push(req);
    if (req.signal.aborted) throw new ClaudeError('cancelled');
    let step = this.script.shift();
    while (step?.kind === 'delay') {
      await sleep(step.ms, req.signal);
      step = this.script.shift();
    }
    if (!step) return { json: autoOutput(req.prompt), usage: usageOf() };
    switch (step.kind) {
      case 'valid':
        return { json: autoOutput(req.prompt), usage: usageOf(step.costUsd) };
      case 'raw':
        try {
          return { json: JSON.parse(step.text), usage: usageOf(step.costUsd) };
        } catch {
          throw new ClaudeError('invalid_output', usageOf(step.costUsd));
        }
      case 'invalid_json':
        throw new ClaudeError('invalid_output', usageOf());
      case 'invented_url':
      case 'unknown_ref':
        return { json: autoOutput(req.prompt, step.kind), usage: usageOf() };
      case 'error':
        throw new ClaudeError(step.error);
    }
  }
}
