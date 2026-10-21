import type { Feed, LogLevel, Usage } from '../shared/types.js';
import type { ClaudeRunner } from './types.js';
import type { DigestOutput, TriageItem } from './outputSchema.js';
import type { PromptItem } from './prompt.js';

export interface EngineResult {
  status: 'ok' | 'budget_exceeded';
  triaged: TriageItem[];
  processedRefs: string[];
  digest: DigestOutput['digest'] | null;
  usage: Usage;
}

export function runTriageAndDigest(_o: {
  runner: ClaudeRunner;
  feed: Pick<Feed, 'name' | 'instructions' | 'model' | 'budgetUsd'>;
  items: PromptItem[];
  signal: AbortSignal;
  batchSize?: number;
  onLog(level: LogLevel, msg: string): void;
  onUsage(u: Usage): void;
}): Promise<EngineResult> {
  throw new Error('not implemented');
}
