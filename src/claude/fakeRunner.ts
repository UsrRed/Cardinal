import type { ClaudeErrorKind, ClaudeRunner, RunRequest, RunResult } from './types.js';

export type FakeStep =
  | { kind: 'valid'; costUsd?: number }
  | { kind: 'raw'; text: string; costUsd?: number }
  | { kind: 'invalid_json' }
  | { kind: 'invented_url' }
  | { kind: 'unknown_ref' }
  | { kind: 'error'; error: ClaudeErrorKind }
  | { kind: 'delay'; ms: number };

export class FakeClaudeRunner implements ClaudeRunner {
  calls: RunRequest[] = [];
  constructor(_script?: FakeStep[]) {}
  run(_req: RunRequest): Promise<RunResult> {
    throw new Error('not implemented');
  }
}
