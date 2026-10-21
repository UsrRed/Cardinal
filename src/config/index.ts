import type { AllowEntry } from '../net/ipPolicy.js';

export interface Config {
  port: number;
  host: string;
  expose: boolean;
  password: string | null;
  sessionSecret: Buffer | null;
  trustProxy: boolean;
  publicUrl: string | null;
  dataDir: string;
  ssrfAllowlist: AllowEntry[];
  fetchMaxBytes: number;
  fetchTimeoutMs: number;
  maxConcurrentRuns: number;
  schedulerTickS: number;
  deferMinutes: number;
  retentionDays: number;
  tz: string;
  defaultModel: string;
  defaultBudgetUsd: number;
  anthropicApiKey: string | null;
  nvdApiKey: string | null;
  ntfyToken: string | null;
  claudeBin: string;
  claudeRunner: 'cli' | 'fake';
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  inContainer: boolean;
}

export class ConfigError extends Error {
  constructor(public issues: string[]) {
    super(issues.join('; '));
    this.name = 'ConfigError';
  }
}

export function loadConfig(_env: NodeJS.ProcessEnv, _opts?: { inContainer?: boolean }): Config {
  throw new Error('not implemented');
}

export function resolveListenHost(expose: boolean, rawHost: string | undefined, inContainer: boolean): string {
  if (expose) return rawHost ?? '0.0.0.0';
  if (inContainer) return rawHost ?? '127.0.0.1';
  return '127.0.0.1';
}
