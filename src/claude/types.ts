export interface RunRequest {
  prompt: string;
  model: string;
  signal: AbortSignal;
}
export interface RunResult {
  json: unknown;
}
export interface ClaudeRunner {
  run(req: RunRequest): Promise<RunResult>;
}
export type ClaudeErrorKind =
  | 'usage_limit'
  | 'unauthenticated'
  | 'overloaded'
  | 'invalid_output'
  | 'cancelled'
  | 'spawn_failed'
  | 'unknown';

export class ClaudeError extends Error {
  constructor(public kind: ClaudeErrorKind) {
    super(kind);
    this.name = 'ClaudeError';
  }
}

export const DEFERRABLE: ReadonlySet<ClaudeErrorKind> = new Set<ClaudeErrorKind>([
  'usage_limit',
  'unauthenticated',
  'overloaded',
]);
