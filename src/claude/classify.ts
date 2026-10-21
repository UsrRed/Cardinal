import type { ClaudeErrorKind } from './types.js';

export function classifyError(_o: { stdout: string; stderr: string; code: number | null }): ClaudeErrorKind {
  throw new Error('not implemented');
}
