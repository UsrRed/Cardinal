import type { Repos } from '../db/repos/index.js';
import type { ClaudeRunner } from '../claude/types.js';
import type { SafeFetch } from '../net/safeFetch.js';
import type { NtfyNotifier } from '../notify/ntfy.js';
import type { SecretsStore } from '../secrets/index.js';
import type { Settings, RunStatus } from '../shared/types.js';
import type { Clock } from '../shared/clock.js';
import type { Config } from '../config/index.js';
import type { Logger } from '../log/logger.js';
import type { RunEventBus } from './runEvents.js';

export interface PipelineDeps {
  db: Repos;
  runner: ClaudeRunner;
  fetch: SafeFetch;
  notifier: NtfyNotifier;
  secrets: SecretsStore;
  settings: () => Settings;
  bus: RunEventBus;
  clock: Clock;
  config: Config;
  logger: Logger;
}

export function executeRun(_runId: string, _deps: PipelineDeps, _signal: AbortSignal): Promise<RunStatus> {
  throw new Error('not implemented');
}
