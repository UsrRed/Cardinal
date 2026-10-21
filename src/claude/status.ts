import type { ClaudeStatus } from '../shared/types.js';
import type { ClaudeRunner } from './types.js';

export function checkClaudeStatus(_runner: ClaudeRunner, _hasApiKey: boolean): Promise<ClaudeStatus> {
  throw new Error('not implemented');
}
