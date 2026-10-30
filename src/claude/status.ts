import type { ClaudeStatus } from '../shared/types.js';
import { ClaudeError, type ClaudeRunner } from './types.js';

/** Minimal tool-less call to find out whether the CLI can reach the model. */
export async function checkClaudeStatus(runner: ClaudeRunner, hasApiKey: boolean): Promise<ClaudeStatus> {
  const checkedAt = new Date().toISOString();
  const mk = (state: ClaudeStatus['state']): ClaudeStatus => ({ state, checkedAt, cliVersion: null });
  try {
    await runner.run({
      prompt: 'Réponds uniquement par {"ok":true}',
      model: 'haiku',
      signal: AbortSignal.timeout(30_000),
    });
    return mk(hasApiKey ? 'api_key' : 'connected');
  } catch (e) {
    if (e instanceof ClaudeError) {
      if (e.kind === 'unauthenticated') return mk('not_connected');
      // the model answered (or is merely busy/limited): credentials work
      if (e.kind === 'invalid_output') return mk(hasApiKey ? 'api_key' : 'connected');
    }
    return mk('unknown');
  }
}
