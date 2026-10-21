import type { Logger } from '../log/logger.js';
import type { ClaudeRunner, RunRequest, RunResult } from './types.js';

export class CliClaudeRunner implements ClaudeRunner {
  constructor(_o: { bin: string; home: string; getApiKey(): string | null; logger: Logger }) {}
  run(_req: RunRequest): Promise<RunResult> {
    throw new Error('not implemented');
  }
}
