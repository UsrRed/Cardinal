import type { Config } from './config/index.js';
import type { Db } from './db/index.js';
import type { Repos } from './db/repos/index.js';
import type { SecretsStore } from './secrets/index.js';
import type { ClaudeRunner } from './claude/types.js';
import type { SafeFetch } from './net/safeFetch.js';
import type { NtfyNotifier } from './notify/ntfy.js';
import type { RunQueue } from './queue/index.js';
import type { RunEventBus } from './pipeline/runEvents.js';
import type { LoginConsole } from './console/loginConsole.js';
import type { SessionStore } from './auth/session.js';
import type { Clock } from './shared/clock.js';
import type { Logger } from './log/logger.js';

export interface AppDeps {
  config: Config;
  db: Db;
  repos: Repos;
  secrets: SecretsStore;
  runner: ClaudeRunner;
  fetch: SafeFetch;
  notifier: NtfyNotifier;
  queue: RunQueue;
  bus: RunEventBus;
  console: LoginConsole;
  sessions: SessionStore;
  sessionSecret: Buffer;
  clock: Clock;
  logger: Logger;
}

export function createDeps(_config: Config, _overrides?: Partial<AppDeps>): AppDeps {
  throw new Error('not implemented');
}
