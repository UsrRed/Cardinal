export type SourceType = 'rss' | 'osv' | 'nvd';
export type Priority = 'high' | 'medium' | 'low';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'deferred' | 'cancelled';
export type RunStep = 'fetch' | 'dedup' | 'triage' | 'digest' | 'notify';
export type StepState = 'todo' | 'running' | 'done' | 'error' | 'skipped';
export type LogLevel = 'info' | 'warn' | 'error';
export type OsvEcosystem = 'PyPI' | 'npm' | 'Go' | 'crates.io' | 'Maven' | 'NuGet' | 'RubyGems' | 'Packagist';
export type NvdSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RssParams = { urls: string[] };
export type OsvParams = { packages: { name: string; ecosystem: OsvEcosystem }[] };
export type NvdParams = { keywords: string[]; minSeverity?: NvdSeverity };
export type SourceParams = RssParams | OsvParams | NvdParams;

export interface Feed {
  id: string;
  name: string;
  instructions: string;
  sourceType: SourceType;
  sourceParams: SourceParams;
  frequencyHours: number;
  freshnessDays: number;
  enabled: boolean;
  notify: boolean;
  notifyThreshold: Priority;
  ntfyServer: string | null;
  ntfyTopic: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}
export interface FeedSummary extends Feed {
  unreadCount: number;
  lastRunStatus: RunStatus | null;
  activeRunId: string | null;
}

export interface RunStepInfo {
  step: RunStep;
  state: StepState;
  detail: string | null;
}
export interface Run {
  id: string;
  feedId: string;
  feedName: string;
  status: RunStatus;
  trigger: 'schedule' | 'manual' | 'catchup';
  steps: RunStepInfo[];
  fetchedCount: number;
  newCount: number;
  keptCount: number;
  notifiedCount: number;
  noNews: boolean;
  digestId: string | null;
  errorCode: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
export interface RunLog {
  id: number;
  runId: string;
  ts: string;
  level: LogLevel;
  step: RunStep | null;
  message: string;
}

export interface DigestSection {
  heading: string;
  itemRefs: string[];
  body: string;
}
export interface Digest {
  id: string;
  feedId: string;
  feedName: string;
  runId: string;
  title: string;
  lede: string;
  sections: DigestSection[];
  createdAt: string;
  items: Item[];
}
export interface DigestSummary {
  id: string;
  feedId: string;
  feedName: string;
  title: string;
  lede: string;
  itemCount: number;
  highCount: number;
  createdAt: string;
}

export interface Item {
  id: string;
  feedId: string;
  digestId: string;
  runId: string;
  ref: string;
  title: string;
  url: string | null;
  priority: Priority;
  justification: string;
  summary: string;
  sources: string[];
  publishedAt: string | null;
  read: boolean;
  createdAt: string;
}

export type DailyStatus = 'running' | 'succeeded' | 'failed';
export interface DailyItemRef {
  id: string;
  feedId: string;
  feedName: string;
  digestId: string;
  title: string;
  url: string | null;
  priority: Priority;
}
export interface DailyCategory {
  name: string;
  body: string;
  items: DailyItemRef[];
}
export interface DailyTier {
  priority: Priority;
  categories: DailyCategory[];
}
export interface DailySummary {
  day: string;
  status: DailyStatus;
  title: string;
  overview: string;
  tiers: DailyTier[];
  itemCount: number;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
}
/** GET /api/daily: one local day (settings timezone) and its summary, if any. */
export interface DailyView {
  day: string;
  today: string;
  itemCount: number;
  highCount: number;
  summary: DailySummary | null;
  recent: Array<{ day: string; status: DailyStatus; itemCount: number }>;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SecretState {
  configured: boolean;
  source: 'env' | 'ui' | null;
}
export interface Settings {
  ntfyServer: string;
  ntfyTopic: string;
  publicUrl: string;
  timezone: string;
  maxConcurrentRuns: number;
  retentionDays: number;
  overriddenByEnv: Array<keyof Omit<Settings, 'overriddenByEnv' | 'secrets'>>;
  secrets: { anthropicApiKey: SecretState; nvdApiKey: SecretState; ntfyToken: SecretState };
}
export type ClaudeAuthState = 'connected' | 'api_key' | 'not_connected' | 'unknown';
export interface ClaudeStatus {
  state: ClaudeAuthState;
  checkedAt: string | null;
  cliVersion: string | null;
}
