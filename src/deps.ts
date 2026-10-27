import type { Config } from './config/index.js';
import type { Db } from './db/index.js';
import type { Repos } from './db/repos/index.js';
import type { ClaudeRunner } from './claude/types.js';
import type { SafeFetch } from './net/safeFetch.js';
import type { Clock } from './shared/clock.js';
import type { Logger } from './log/logger.js';
import type { Settings } from './shared/types.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, openDb } from './db/index.js';
import { seedIfEmpty } from './db/seed.js';
import { createFeedsRepo } from './db/repos/feeds.js';
import { createRunsRepo } from './db/repos/runs.js';
import { createDigestsRepo } from './db/repos/digests.js';
import { createItemsRepo } from './db/repos/items.js';
import { createSeenRepo } from './db/repos/seen.js';
import { createSettingsRepo } from './db/repos/settings.js';
import { createDailyRepo } from './db/repos/daily.js';
import { SecretsStore } from './secrets/index.js';
import { createSafeFetch } from './net/safeFetch.js';
import { CliClaudeRunner } from './claude/cliRunner.js';
import { FakeClaudeRunner } from './claude/fakeRunner.js';
import { NtfyNotifier } from './notify/ntfy.js';
import { RunEventBus } from './pipeline/runEvents.js';
import { RunQueue } from './queue/index.js';
import { DailyService } from './daily/index.js';
import { LoginConsole } from './console/loginConsole.js';
import { SessionStore, loadSessionSecret } from './auth/session.js';
import { systemClock } from './shared/clock.js';
import { createLogger } from './log/logger.js';
import { SECRET_NAMES } from './shared/schemas.js';

export interface AppDeps {
  config: Config;
  db: Db;
  repos: Repos;
  secrets: SecretsStore;
  runner: ClaudeRunner;
  fetch: SafeFetch;
  notifier: NtfyNotifier;
  queue: RunQueue;
  daily: DailyService;
  bus: RunEventBus;
  console: LoginConsole;
  sessions: SessionStore;
  sessionSecret: Buffer;
  clock: Clock;
  logger: Logger;
  /** Effective settings: stored values over config defaults, plus secret states. */
  settings: () => Settings;
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function createDeps(config: Config, overrides: Partial<AppDeps> = {}): AppDeps {
  const clock = overrides.clock ?? systemClock;
  const logger = overrides.logger ?? createLogger(config.logLevel);
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = overrides.db ?? openDb(join(config.dataDir, 'pflux.db'));
  migrate(db, MIGRATIONS_DIR);
  seedIfEmpty(db, config, clock);
  const repos: Repos = overrides.repos ?? {
    feeds: createFeedsRepo(db),
    runs: createRunsRepo(db),
    digests: createDigestsRepo(db),
    items: createItemsRepo(db),
    seen: createSeenRepo(db),
    settings: createSettingsRepo(db),
    daily: createDailyRepo(db),
  };
  const secrets =
    overrides.secrets ??
    new SecretsStore({
      dataDir: config.dataDir,
      env: { anthropicApiKey: config.anthropicApiKey, nvdApiKey: config.nvdApiKey, ntfyToken: config.ntfyToken },
    });
  const home = join(config.dataDir, 'claude-home');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const getApiKey = () => secrets.get('anthropicApiKey');
  const runner =
    overrides.runner ??
    (config.claudeRunner === 'fake'
      ? new FakeClaudeRunner()
      : new CliClaudeRunner({ bin: config.claudeBin, home, getApiKey, logger }));
  const fetch =
    overrides.fetch ??
    createSafeFetch({ allowlist: config.ssrfAllowlist, maxBytes: config.fetchMaxBytes, timeoutMs: config.fetchTimeoutMs });
  const notifier = overrides.notifier ?? new NtfyNotifier(fetch);
  const bus = overrides.bus ?? new RunEventBus();
  const settings =
    overrides.settings ??
    ((): Settings => {
      const stored = repos.settings.getAll();
      return {
        ntfyServer: stored.ntfyServer ?? 'https://ntfy.sh',
        ntfyTopic: stored.ntfyTopic ?? '',
        publicUrl: config.publicUrl ?? stored.publicUrl ?? '',
        timezone: stored.timezone ?? config.tz,
        maxConcurrentRuns: stored.maxConcurrentRuns ?? config.maxConcurrentRuns,
        retentionDays: stored.retentionDays ?? config.retentionDays,
        overriddenByEnv: config.publicUrl ? ['publicUrl'] : [],
        secrets: Object.fromEntries(SECRET_NAMES.map((n) => [n, secrets.state(n)])) as Settings['secrets'],
      };
    });
  const queue =
    overrides.queue ??
    new RunQueue(
      { db: repos, runner, fetch, notifier, secrets, settings, bus, clock, config, logger },
      { concurrency: () => settings().maxConcurrentRuns },
    );
  const daily =
    overrides.daily ??
    new DailyService({
      daily: repos.daily, runner, clock, logger, timezone: () => settings().timezone,
      model: config.defaultModel, budgetUsd: config.defaultBudgetUsd,
    });
  const sessionSecret = overrides.sessionSecret ?? loadSessionSecret(config);
  return {
    config, db, repos, secrets, runner, fetch, notifier, queue, daily, bus,
    console: overrides.console ?? new LoginConsole({ bin: config.claudeBin, home, getApiKey, clock }),
    sessions: overrides.sessions ?? new SessionStore(clock),
    sessionSecret, clock, logger, settings,
  };
}
