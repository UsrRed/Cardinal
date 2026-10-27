import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
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
  mcpToken: string | null;
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

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

function parseAllowEntry(raw: string): AllowEntry | null {
  const cidr = /^([0-9a-fA-F:.]+)\/(\d{1,3})$/.exec(raw);
  if (cidr) {
    const bits = Number(cidr[2]);
    const v6 = cidr[1]!.includes(':');
    if (isIP(cidr[1]!) === 0 || bits > (v6 ? 128 : 32)) return null;
    return { kind: 'cidr', cidr: raw };
  }
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(raw);
  const v6port = /^\[([0-9a-fA-F:.]+)\]:(\d{1,5})$/.exec(raw);
  const m = v4port ?? v6port;
  if (m) {
    const port = Number(m[2]);
    if (isIP(m[1]!) === 0 || port < 1 || port > 65535) return null;
    return { kind: 'ip', ip: m[1]!, port };
  }
  return isIP(raw) !== 0 ? { kind: 'ip', ip: raw } : null;
}

export function loadConfig(env: NodeJS.ProcessEnv, opts?: { inContainer?: boolean }): Config {
  const issues: string[] = [];
  const str = (name: string): string | undefined => {
    const v = env[name];
    return v === undefined || v.trim() === '' ? undefined : v.trim();
  };
  const int = (name: string, def: number, min: number, max: number): number => {
    const v = str(name);
    if (v === undefined) return def;
    const n = Number(v);
    if (!/^-?\d+$/.test(v) || n < min || n > max) {
      issues.push(`${name} doit être un entier entre ${min} et ${max}`);
      return def;
    }
    return n;
  };
  const num = (name: string, def: number, min: number, max: number): number => {
    const v = str(name);
    if (v === undefined) return def;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      issues.push(`${name} doit être un nombre entre ${min} et ${max}`);
      return def;
    }
    return n;
  };
  const bool = (name: string): boolean => {
    const v = str(name);
    if (v === undefined) return false;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
    issues.push(`${name} doit valoir 0 ou 1`);
    return false;
  };

  const port = int('PFLUX_PORT', 8787, 1, 65535);
  const expose = bool('PFLUX_EXPOSE');
  const trustProxy = bool('PFLUX_TRUST_PROXY');
  const password = str('PFLUX_PASSWORD') ?? null;
  if (expose && (password === null || password.length < 12)) {
    issues.push('PFLUX_PASSWORD (12 caractères minimum) est obligatoire avec PFLUX_EXPOSE=1');
  }

  let sessionSecret: Buffer | null = null;
  const rawSecret = env['PFLUX_SESSION_SECRET'];
  if (rawSecret !== undefined && rawSecret !== '') {
    sessionSecret = Buffer.from(rawSecret, 'utf8');
    if (sessionSecret.length < 32) {
      issues.push('PFLUX_SESSION_SECRET doit faire au moins 32 octets');
      sessionSecret = null;
    }
  }

  let publicUrl: string | null = null;
  const rawUrl = str('PFLUX_PUBLIC_URL');
  if (rawUrl !== undefined) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
      publicUrl = rawUrl.replace(/\/+$/, '');
    } catch {
      issues.push('PFLUX_PUBLIC_URL doit être une URL http(s) valide');
    }
  }

  const mcpToken = str('PFLUX_MCP_TOKEN') ?? null;
  if (mcpToken !== null && mcpToken.length < 32) {
    issues.push('PFLUX_MCP_TOKEN doit faire au moins 32 caractères');
  }

  const ssrfAllowlist: AllowEntry[] = [];
  for (const part of (str('PFLUX_SSRF_ALLOWLIST') ?? '').split(',')) {
    const raw = part.trim();
    if (!raw) continue;
    const entry = parseAllowEntry(raw);
    if (entry) ssrfAllowlist.push(entry);
    else issues.push(`PFLUX_SSRF_ALLOWLIST: entrée invalide « ${raw} »`);
  }

  const tz = str('PFLUX_TZ') ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    issues.push('PFLUX_TZ doit être un fuseau IANA valide');
  }

  const defaultModel = str('PFLUX_DEFAULT_MODEL') ?? 'sonnet';
  if (!/^[a-z0-9.-]{1,64}$/.test(defaultModel)) {
    issues.push('PFLUX_DEFAULT_MODEL est invalide');
  }

  const runner = str('PFLUX_CLAUDE_RUNNER') ?? 'cli';
  if (runner !== 'cli' && runner !== 'fake') issues.push('PFLUX_CLAUDE_RUNNER doit valoir cli ou fake');

  const level = str('PFLUX_LOG_LEVEL') ?? 'info';
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    issues.push(`PFLUX_LOG_LEVEL doit être l'un de: ${LOG_LEVELS.join(', ')}`);
  }

  const inContainer =
    opts?.inContainer ?? (bool('PFLUX_IN_CONTAINER') || existsSync('/.dockerenv'));
  const dataDir =
    str('PFLUX_DATA_DIR') ?? (env['NODE_ENV'] === 'production' ? '/data' : './data');

  const cfg: Config = {
    port,
    host: resolveListenHost(expose, str('PFLUX_HOST'), inContainer),
    expose,
    password,
    sessionSecret,
    trustProxy,
    publicUrl,
    dataDir,
    ssrfAllowlist,
    fetchMaxBytes: int('PFLUX_FETCH_MAX_BYTES', 5_242_880, 1, 1_073_741_824),
    fetchTimeoutMs: int('PFLUX_FETCH_TIMEOUT_MS', 15000, 100, 600_000),
    maxConcurrentRuns: int('PFLUX_MAX_CONCURRENT_RUNS', 1, 1, 8),
    schedulerTickS: int('PFLUX_SCHEDULER_TICK_S', 60, 1, 3600),
    deferMinutes: int('PFLUX_DEFER_MINUTES', 60, 1, 1440),
    retentionDays: int('PFLUX_RETENTION_DAYS', 0, 0, 36500),
    tz,
    defaultModel,
    defaultBudgetUsd: num('PFLUX_DEFAULT_BUDGET_USD', 1, 0.01, 50),
    anthropicApiKey: str('PFLUX_ANTHROPIC_API_KEY') ?? null,
    nvdApiKey: str('PFLUX_NVD_API_KEY') ?? null,
    ntfyToken: str('PFLUX_NTFY_TOKEN') ?? null,
    mcpToken,
    claudeBin:
      str('PFLUX_CLAUDE_BIN') ??
      fileURLToPath(new URL('../../node_modules/.bin/claude', import.meta.url)),
    claudeRunner: runner === 'fake' ? 'fake' : 'cli',
    logLevel: (LOG_LEVELS as readonly string[]).includes(level)
      ? (level as Config['logLevel'])
      : 'info',
    inContainer,
  };
  if (issues.length > 0) throw new ConfigError(issues);
  return cfg;
}

export function resolveListenHost(expose: boolean, rawHost: string | undefined, inContainer: boolean): string {
  if (expose) return rawHost ?? '0.0.0.0';
  if (inContainer) return rawHost ?? '127.0.0.1';
  return '127.0.0.1';
}
