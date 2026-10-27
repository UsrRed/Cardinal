# INTERFACES — Cardinal

> Contrats figés. Toute modification : mettre à jour ce fichier dans le même commit + note dans `docs/PROGRESS.md`. Dates : ISO 8601 UTC (`string`) dans l'API, `number` (ms epoch) en interne/DB.

## 1. Types partagés — `src/shared/types.ts`

```ts
export type SourceType = 'rss' | 'osv' | 'nvd';
export type Priority = 'high' | 'medium' | 'low';
export type RunStatus = 'queued'|'running'|'succeeded'|'failed'|'deferred'|'cancelled'|'budget_exceeded';
export type RunStep = 'fetch'|'dedup'|'triage'|'digest'|'notify';
export type StepState = 'todo'|'running'|'done'|'error'|'skipped';
export type LogLevel = 'info'|'warn'|'error';
export type OsvEcosystem = 'PyPI'|'npm'|'Go'|'crates.io'|'Maven'|'NuGet'|'RubyGems'|'Packagist';
export type NvdSeverity = 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';

export type RssParams = { urls: string[] };                                   // 1..20, http(s)
export type OsvParams = { packages: { name: string; ecosystem: OsvEcosystem }[] }; // 1..50
export type NvdParams = { keywords: string[]; minSeverity?: NvdSeverity };    // 1..20 mots-clés
export type SourceParams = RssParams | OsvParams | NvdParams;

export interface Feed {
  id: string;                       // uuid v4
  name: string;                     // 1..120
  instructions: string;             // 1..4000
  sourceType: SourceType;
  sourceParams: SourceParams;
  frequencyHours: number;           // int 1..720
  freshnessDays: number;            // int 1..90
  enabled: boolean;
  notify: boolean;
  notifyThreshold: Priority;
  ntfyServer: string | null;        // http(s) URL
  ntfyTopic: string | null;         // ^[A-Za-z0-9_-]{1,64}$
  model: string;                    // défaut config.defaultModel ('sonnet'), ^[a-z0-9.\-]{1,64}$
  budgetUsd: number;                // 0.01..50, défaut 0.50
  createdAt: string; updatedAt: string;
  lastRunAt: string | null; nextRunAt: string | null;
}
export interface FeedSummary extends Feed {
  unreadCount: number;
  lastRunStatus: RunStatus | null;
  activeRunId: string | null;       // run queued|running
}

export interface Usage { inputTokens: number; outputTokens: number; costUsd: number }

export interface RunStepInfo { step: RunStep; state: StepState; detail: string | null } // detail ≤ 200
export interface Run {
  id: string; feedId: string; feedName: string;
  status: RunStatus;
  trigger: 'schedule' | 'manual' | 'catchup';
  steps: RunStepInfo[];             // toujours 5 entrées dans l'ordre RunStep
  usage: Usage;
  fetchedCount: number; newCount: number; keptCount: number; notifiedCount: number;
  noNews: boolean;
  digestId: string | null;
  errorCode: string | null;         // code générique (cf. §9), jamais un message brut
  queuedAt: string; startedAt: string | null; finishedAt: string | null;
}
export interface RunLog { id: number; runId: string; ts: string; level: LogLevel; step: RunStep | null; message: string }

export interface DigestSection { heading: string; itemRefs: string[]; body: string }
export interface Digest {
  id: string; feedId: string; feedName: string; runId: string;
  title: string; lede: string; sections: DigestSection[];
  partial: boolean;                 // true si budget_exceeded
  createdAt: string;
  items: Item[];                    // éléments retenus du digest
}
export interface DigestSummary { id: string; feedId: string; feedName: string; title: string; lede: string; itemCount: number; highCount: number; partial: boolean; createdAt: string }

export interface Item {
  id: string; feedId: string; digestId: string; runId: string;
  ref: string;                      // "i1".."iN" dans le run
  title: string; url: string | null;
  priority: Priority; justification: string; summary: string; sources: string[];
  publishedAt: string | null; read: boolean; createdAt: string;
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export interface SecretState { configured: boolean; source: 'env' | 'ui' | null }
export interface Settings {
  ntfyServer: string;               // défaut 'https://ntfy.sh'
  ntfyTopic: string;                // '' = désactivé
  publicUrl: string;                // '' = aucun lien Click
  timezone: string;                 // IANA, défaut PFLUX_TZ ou 'UTC'
  maxConcurrentRuns: number;        // 1..8
  retentionDays: number;            // 0 = tout conserver
  overriddenByEnv: Array<keyof Omit<Settings,'overriddenByEnv'|'secrets'>>;
  secrets: { anthropicApiKey: SecretState; nvdApiKey: SecretState; ntfyToken: SecretState };
}
export type ClaudeAuthState = 'connected' | 'api_key' | 'not_connected' | 'unknown';
export interface ClaudeStatus { state: ClaudeAuthState; checkedAt: string | null; cliVersion: string | null }
export interface GlobalStats { totals: Usage; runs: number; byFeed: Array<{ feedId: string; name: string; usage: Usage; runs: number }> }
```

## 2. Schémas zod partagés — `src/shared/schemas.ts`

```ts
export const feedInputSchema: z.ZodType<FeedInput>;   // discriminatedUnion('sourceType', rss|osv|nvd) + champs communs
export type FeedInput = Omit<Feed,'id'|'createdAt'|'updatedAt'|'lastRunAt'|'nextRunAt'>; // model/budgetUsd/notify… optionnels avec défauts
export const feedPatchSchema;          // partial(feedInput) ; si sourceType présent, sourceParams requis
export const feedExportSchema;         // { version: 1, exportedAt, feeds: FeedInput[] } (sans id, sans secrets)
export const settingsPatchSchema;      // partial(Settings sans overriddenByEnv/secrets) ; timezone validé via Intl.supportedValuesOf('timeZone')
export const secretPutSchema;          // { value: string (1..512) }
export const SECRET_NAMES = ['anthropicApiKey','nvdApiKey','ntfyToken'] as const;
export type SecretName = typeof SECRET_NAMES[number];
```
Erreur de validation → `400 { error: "validation_error", fields: { "<path.dot>": "<message FR>" } }`.

## 3. Config — `src/config/index.ts`

```ts
export interface Config {
  port: number;                 // PFLUX_PORT, défaut 8787
  host: string;                 // effectif (cf. resolveListenHost)
  expose: boolean;              // PFLUX_EXPOSE=1
  password: string | null;      // requis ≥12 si expose
  sessionSecret: Buffer | null; // PFLUX_SESSION_SECRET (≥32 octets UTF-8), sinon session.key
  trustProxy: boolean;          // PFLUX_TRUST_PROXY=1
  publicUrl: string | null;     // PFLUX_PUBLIC_URL (http(s), sans slash final)
  dataDir: string;              // PFLUX_DATA_DIR, défaut '/data' (NODE_ENV!=='production' → './data')
  ssrfAllowlist: AllowEntry[];  // PFLUX_SSRF_ALLOWLIST
  fetchMaxBytes: number;        // défaut 5_242_880
  fetchTimeoutMs: number;       // défaut 15000
  maxConcurrentRuns: number;    // défaut 1 (1..8)
  schedulerTickS: number;       // défaut 60 (1..3600)
  deferMinutes: number;         // défaut 60
  retentionDays: number;        // défaut 0
  tz: string;                   // PFLUX_TZ, défaut 'UTC'
  defaultModel: string;         // défaut 'sonnet'
  defaultBudgetUsd: number;     // défaut 1
  anthropicApiKey: string | null; nvdApiKey: string | null; ntfyToken: string | null;
  mcpToken: string | null;      // PFLUX_MCP_TOKEN (≥32 car.) ; null → /mcp absent (404)
  claudeBin: string;            // PFLUX_CLAUDE_BIN, défaut <root>/node_modules/.bin/claude
  claudeRunner: 'cli' | 'fake'; // défaut 'cli'
  logLevel: 'fatal'|'error'|'warn'|'info'|'debug'|'trace'; // défaut 'info'
  inContainer: boolean;         // PFLUX_IN_CONTAINER=1 ou /.dockerenv
}
export class ConfigError extends Error { issues: string[] }
export function loadConfig(env: NodeJS.ProcessEnv, opts?: { inContainer?: boolean }): Config; // throw ConfigError
export function resolveListenHost(expose: boolean, rawHost: string | undefined, inContainer: boolean): string;
// expose → rawHost ?? '0.0.0.0' ; inContainer → rawHost ?? '127.0.0.1' ; sinon '127.0.0.1'
```
`src/index.ts` : `ConfigError` → `console.error("Cardinal: configuration invalide: …")`, `process.exit(1)`.

## 4. Base — `src/db`

```ts
export type Db = import('better-sqlite3').Database;
export function openDb(file: string): Db;              // WAL, foreign_keys
export function migrate(db: Db, dir: string): void;    // applique migrations/NNN_*.sql non appliquées, en transaction
export function seedIfEmpty(db: Db, cfg: Config, clock: Clock): void; // 3 flux exemple enabled=false

interface FeedsRepo {
  list(): FeedSummary[]; get(id: string): Feed | null;
  create(input: FeedInput, now: number): Feed; update(id: string, patch: Partial<FeedInput>, now: number): Feed | null;
  delete(id: string): boolean; setEnabled(id: string, enabled: boolean, now: number): Feed | null;
  due(now: number): Feed[];                               // enabled && nextRunAt ≤ now
  setSchedule(id: string, s: { lastRunAt?: number; nextRunAt: number | null; deferCount?: number }): void;
  getDeferCount(id: string): number;
  duplicate(id: string, now: number): Feed | null;        // 'Copie de …', enabled=false
  exportAll(): FeedInput[];                               // sans id
}
// delete(id) supprime aussi les seen_items du flux. Factories: createFeedsRepo(db), createSettingsRepo(db).
interface RunsRepo {
  create(feedId: string, trigger: Run['trigger'], now: number): Run;
  get(id: string): Run | null; list(q: { feedId?: string; page: number; pageSize: number }): Page<Run>;
  activeForFeed(feedId: string): Run | null;              // queued|running
  nextQueued(): Run | null; countRunning(): number;
  markRunning(id: string, now: number): boolean;          // queued→running (atomique)
  setStep(id: string, step: RunStep, state: StepState, detail?: string): void;
  setCounts(id: string, c: Partial<Pick<Run,'fetchedCount'|'newCount'|'keptCount'|'notifiedCount'|'noNews'>>): void;
  addUsage(id: string, u: Usage): void;
  finish(id: string, status: Exclude<RunStatus,'queued'|'running'>, now: number, extra?: { errorCode?: string; digestId?: string }): void;
  requeueRunning(): number;                               // au démarrage
  appendLog(id: string, level: LogLevel, step: RunStep | null, message: string, now: number): RunLog;
  logs(id: string, afterId?: number): RunLog[];
  usageByFeed(): GlobalStats;
}
interface DigestsRepo {
  create(d: { feedId: string; runId: string; title: string; lede: string; sections: DigestSection[]; partial: boolean }, now: number): string;
  get(id: string): Digest | null; listByFeed(feedId: string | null, page: number, pageSize: number): Page<DigestSummary>;
}
interface ItemsRepo {
  insertMany(rows: Omit<Item,'id'|'read'|'createdAt'>[], now: number): Item[];
  stream(q: { feedId?: string; priority?: Priority; read?: boolean; page: number; pageSize: number }): Page<Item>; // createdAt DESC
  markRead(ids: string[], read: boolean): number; markAllRead(feedId?: string, priority?: Priority): number;
}
interface SeenRepo {
  filterUnseen(feedId: string, keys: string[]): Set<string>;
  markSeen(feedId: string, keys: string[], now: number): void; // INSERT OR IGNORE
}
interface SettingsRepo { getAll(): Partial<Settings>; set(patch: Partial<Settings>): void }
export function purge(db: Db, olderThan: number): { runs: number; digests: number; items: number }; // ne touche jamais seen_items
```

## 5. Réseau — `src/net`

```ts
export type AllowEntry = { kind: 'ip'; ip: string; port?: number } | { kind: 'cidr'; cidr: string };
export function parseAllowlist(raw: string | undefined): AllowEntry[];       // throw si entrée invalide
export function isBlockedAddress(ip: string): boolean;                        // loopback, RFC1918, 100.64/10, fc00::/7, 169.254/16, fe80::/10, 0/8, multicast(224/4, ff00::/8), 255.255.255.255, ::, IPv4-mapped de ces plages
export function isAllowlisted(ip: string, port: number, list: AllowEntry[]): boolean;

export type Resolver = (hostname: string) => Promise<string[]>;
export interface SafeFetchOptions { resolver?: Resolver; allowlist: AllowEntry[]; maxBytes: number; timeoutMs: number; maxRedirects?: number /*5*/; userAgent?: string /* 'Cardinal/<ver>' */ }
export interface SafeRequest { method?: 'GET'|'POST'; headers?: Record<string,string>; body?: string | Buffer; signal?: AbortSignal }
export interface SafeResponse { status: number; headers: Record<string,string>; url: string; body: Buffer; text(): string; json<T>(): T }
export type SafeFetch = (url: string, req?: SafeRequest) => Promise<SafeResponse>;
export function createSafeFetch(opts: SafeFetchOptions): SafeFetch;

export type SsrfErrorCode = 'scheme_not_allowed'|'destination_blocked'|'dns_failed'|'too_many_redirects'|'response_too_large'|'timeout'|'network_error';
export class SsrfError extends Error { code: SsrfErrorCode }  // message public FR: 'destination refusée par la politique réseau' pour destination_blocked
```
Règles : une cible bloquée n'est permise que si `isAllowlisted(ip, port)` ; la connexion utilise l'IP validée (option `lookup` figée), `Host`/SNI = hostname d'origine ; redirections 301/302/303/307/308 suivies manuellement et revalidées ; HTTP ≥ 400 renvoyé tel quel (`status`) — à l'appelant de décider.

## 6. Sources — `src/sources`

```ts
export interface RawItem { sourceKey: string /* URL ou id CVE/OSV */; keyKind: 'url' | 'id'; title: string; url: string | null; publishedAt?: string; content: string /* ≤ 8000 */; meta: Record<string, unknown> /* ex: severity, cvss, aliases, references[], ecosystem */ }
export interface SourceContext {
  fetch: SafeFetch; now: number; freshnessDays: number; signal: AbortSignal;
  nvdApiKey: string | null; nvdLimiter: SlidingWindowLimiter;
  onSourceError(target: string, code: string): void;   // journalisé, n'interrompt pas
}
export interface SourceConnector<P> { type: SourceType; fetch(params: P, ctx: SourceContext): Promise<RawItem[]> }
export function getConnector(t: SourceType): SourceConnector<SourceParams>;

export function parseXmlSafe(xml: string): unknown;           // throw XmlRejectedError si <!DOCTYPE ou <!ENTITY
export function parseFeed(xml: string, baseUrl: string): RawItem[]; // RSS 2.0 / Atom 1.0
export function testFeedUrl(url: string, fetch: SafeFetch): Promise<{ ok: true; count: number } | { ok: false; error: 'fetch_failed'|'parse_failed'|'destination_blocked' }>;
export function htmlToText(html: string, max?: number /*8000*/): string;
export function parseOsvVuln(json: unknown): RawItem;          // sourceKey = alias CVE si présent sinon id OSV ; meta.references
export function parseNvdPage(json: unknown, minSeverity?: NvdSeverity): { items: RawItem[]; totalResults: number; startIndex: number; resultsPerPage: number };
export function nvdWindows(now: number, freshnessDays: number): Array<{ start: string; end: string }>; // tranches ≤ 120 j

export class SlidingWindowLimiter { constructor(opts: { limit: number; windowMs: number; clock: Clock }); acquire(signal?: AbortSignal): Promise<void> }
export function getNvdLimiter(hasKey: boolean, clock?: Clock): SlidingWindowLimiter; // singleton process: 5/30s sans clé, 50/30s avec
```
Endpoints : OSV `POST https://api.osv.dev/v1/querybatch` `{queries:[{package:{name,ecosystem}}]}` puis `GET https://api.osv.dev/v1/vulns/{id}` ; NVD `GET https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=…&pubStartDate=…&pubEndDate=…&startIndex=…&resultsPerPage=2000`, header `apiKey` si clé.

## 7. Dédup — `src/dedup/index.ts`

```ts
export function normalizeUrl(url: string): string;  // schéma+hôte minuscules, sans fragment, sans utm_*, sans slash final
export function normalizeKey(item: Pick<RawItem,'sourceKey'|'keyKind'>): string; // url → normalizeUrl ; id → toUpperCase()
export function dedupKey(sourceType: SourceType, normalizedKey: string): string;  // sha256 hex de `${sourceType}:${normalizedKey}`
export function filterUnseen(items: RawItem[], seenRepo: Pick<SeenRepo,"filterUnseen">, feedId: string, sourceType: SourceType): { item: RawItem; key: string }[]; // écarte déjà-vus et doublons du lot
```

## 8. Claude — `src/claude`

```ts
export interface RunRequest { prompt: string; model: string; budgetUsd: number; signal: AbortSignal }
export interface RunResult { json: unknown; usage: Usage }     // json = JSON.parse du texte final (ou lève ClaudeError 'invalid_output')
export interface ClaudeRunner { run(req: RunRequest): Promise<RunResult> }
export type ClaudeErrorKind = 'usage_limit'|'unauthenticated'|'overloaded'|'invalid_output'|'cancelled'|'spawn_failed'|'unknown';
export class ClaudeError extends Error { kind: ClaudeErrorKind; usage?: Usage }
export const DEFERRABLE: ReadonlySet<ClaudeErrorKind>;          // usage_limit, unauthenticated, overloaded

export function buildClaudeEnv(o: { home: string; apiKey: string | null; lang?: string }): Record<string,string>;
// = { HOME, PATH:'/usr/local/bin:/usr/bin:/bin', LANG:'C.UTF-8', DISABLE_TELEMETRY:'1', DISABLE_ERROR_REPORTING:'1',
//     CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1', DISABLE_AUTOUPDATER:'1', ANTHROPIC_API_KEY? } — rien d'autre
export function buildClaudeArgs(model: string, mcpConfigPath: string): string[];
// ['-p','--output-format','stream-json','--verbose','--model',model,'--strict-mcp-config','--mcp-config',mcpConfigPath,
//  '--tools','','--disallowedTools','*']   (constante testée)
export class CliClaudeRunner implements ClaudeRunner { constructor(o: { bin: string; home: string; getApiKey(): string | null; logger: Logger }) }
// spawn sans shell, cwd = mkdtemp(0700) vide (+ mcp.json '{"mcpServers":{}}' 0600 dans un mkdtemp distinct), prompt sur stdin,
// signal → child.kill('SIGTERM') puis SIGKILL après 5 s, suppression des répertoires en finally.
export class FakeClaudeRunner implements ClaudeRunner {
  constructor(script?: FakeStep[]);
  calls: RunRequest[];
}
export type FakeStep = { kind: 'valid'; costUsd?: number } | { kind: 'raw'; text: string; costUsd?: number }
  | { kind: 'invalid_json' } | { kind: 'invented_url' } | { kind: 'unknown_ref' } | { kind: 'error'; error: ClaudeErrorKind } | { kind: 'delay'; ms: number };
// sans script : génère depuis le prompt une sortie valide (keep=true, premier item 'high', sources = URL d'entrée) — utilisé par l'e2e.

export function parseStreamJson(stdout: string): { text: string | null; usage: Usage; isError: boolean; errorText: string | null };
// usage depuis l'événement {type:'result', total_cost_usd, usage:{input_tokens, output_tokens}}
export function classifyError(o: { stdout: string; stderr: string; code: number | null }): ClaudeErrorKind;

export const SYSTEM_HEADER: string;      // consigne fixe anti-injection + format JSON strict
export function escapeDelimiters(s: string): string;  // neutralise '<<<' / '>>>' (→ '‹‹‹' / '›››')
export interface PromptItem { ref: string; title: string; url: string | null; publishedAt?: string; content: string; sources: string[] /* URL autorisées */ }
export function buildTriagePrompt(o: { feedName: string; instructions: string; items: PromptItem[] }): string;
export function buildDigestPrompt(o: { feedName: string; instructions: string; items: PromptItem[]; withTriage: boolean }): string;
export function buildCorrectionPrompt(original: string, problems: string[]): string;
// Bloc de données: `<<<DATA id=${ref}>>>\n…\n<<<END DATA>>>` ; consigne utilisateur également dans un bloc DATA id=instructions.

export const triageOutputSchema: z.ZodType<TriageOutput>;
export interface TriageItem { ref: string; keep: boolean; priority: Priority; justification: string /*≤200*/; summary: string /*≤800*/; sources: string[] /* url */ }
export interface TriageOutput { items: TriageItem[] }
export interface DigestOutput { items: TriageItem[]; digest: { title: string /*≤200*/; lede: string /*≤1000*/; sections: DigestSection[] /*1..20, body ≤4000*/ } }
export const digestOutputSchema: z.ZodType<DigestOutput>;
export function validateOutput<T>(kind: 'triage'|'digest', json: unknown, ctx: { refs: Set<string>; allowedUrls: Set<string> /* normalisées */ }): { ok: true; value: T } | { ok: false; problems: string[] };
// rejette: schéma, ref inconnue/dupliquée, URL citée ∉ allowedUrls, itemRefs de section inconnus ou non keep.

export interface EngineResult {
  status: 'ok' | 'budget_exceeded';
  triaged: TriageItem[];            // items effectivement traités
  processedRefs: string[];          // à marquer vus
  digest: DigestOutput['digest'] | null;
  usage: Usage;
}
export function runTriageAndDigest(o: { runner: ClaudeRunner; feed: Pick<Feed,'name'|'instructions'|'model'|'budgetUsd'>; items: PromptItem[]; signal: AbortSignal; batchSize?: number /*40*/; onLog(level: LogLevel, msg: string): void; onUsage(u: Usage): void }): Promise<EngineResult>;
// lève ClaudeError (kind déférable, 'invalid_output' après 1 retry, 'cancelled', …)
export function checkClaudeStatus(runner: ClaudeRunner, hasApiKey: boolean): Promise<ClaudeStatus>; // prompt minimal, budget 0.05
```

## 9. Pipeline, file, ordonnanceur

```ts
// src/pipeline/runEvents.ts
export type RunEvent =
  | { type: 'run.status'; runId: string; feedId: string; status: RunStatus; errorCode: string | null }
  | { type: 'run.step'; runId: string; step: RunStep; state: StepState; detail: string | null }
  | { type: 'run.log'; runId: string; log: RunLog }
  | { type: 'run.usage'; runId: string; usage: Usage };
export class RunEventBus { emit(e: RunEvent): void; on(fn: (e: RunEvent) => void): () => void }

// src/pipeline/index.ts
export interface PipelineDeps { db: Repos; runner: ClaudeRunner; fetch: SafeFetch; notifier: NtfyNotifier; secrets: SecretsStore; settings: () => Settings; bus: RunEventBus; clock: Clock; config: Config; logger: Logger }
export function executeRun(runId: string, deps: PipelineDeps, signal: AbortSignal): Promise<RunStatus>;

// src/queue/index.ts
export class RunQueue {
  constructor(deps: PipelineDeps, opts: { concurrency: () => number });
  recover(): void;                                   // running → queued, puis kick
  enqueue(feedId: string, trigger: Run['trigger']): Run; // throw AppError('run_already_active', 409) si actif
  kick(): void;
  cancel(runId: string): boolean;                    // queued → cancelled ; running → abort (tue claude) → cancelled
  idle(): Promise<void>;                             // pour tests
}

// src/scheduler/lock.ts
export interface SchedulerLock { release(): void }
export function acquireLock(dataDir: string, o?: { isAlive?(pid: number): boolean }): SchedulerLock | null;
// open(O_CREAT|O_EXCL, 0o600) ; si existe et PID mort (process.kill(pid,0) ESRCH) → supprimé puis réessai ; sinon null

// src/scheduler/index.ts
export class Scheduler {
  constructor(o: { feeds: FeedsRepo; runs: RunsRepo; queue: RunQueue; clock: Clock; tickMs: number; logger: Logger });
  tick(): void;     // pour chaque due(now) sans run actif: enqueue (trigger 'catchup' si now - nextRunAt ≥ frequency, sinon 'schedule'), nextRunAt = now + frequency
  start(): void; stop(): void;
}
export function deferDelayMs(deferMinutes: number, deferCount: number): number; // min(deferMinutes·2^n, 360) min
```
Codes d'erreur de run (`Run.errorCode`) : `fetch_failed`, `claude_invalid_output`, `claude_failed`, `claude_usage_limit`, `claude_unauthenticated`, `claude_overloaded`, `budget_exceeded`, `cancelled`, `internal_error`.

## 10. Notifications — `src/notify/ntfy.ts`

```ts
export interface NtfyTarget { server: string; topic: string; token: string | null }
export interface NtfyMessage { title: string; body: string /*≤300*/; priority: 1|2|3|4|5; click?: string }
export class NtfyNotifier {
  constructor(fetch: SafeFetch);
  send(t: NtfyTarget, m: NtfyMessage): Promise<void>;     // POST `${server}/${topic}`, headers Title, Priority, Click?, Authorization: Bearer?, body texte UTF-8
  sendTest(t: NtfyTarget): Promise<{ ok: true } | { ok: false; error: 'destination_blocked' | 'send_failed' | 'not_configured' }>;
  notifyRun(o: { target: NtfyTarget | null; feed: Feed; items: Item[]; digestId: string; publicUrl: string | null }): Promise<{ sent: number; failed: number }>;
}
export const PRIORITY_MAP: Record<Priority, 2|3|4>;          // high 4, medium 3, low 2
export function resolveTarget(feed: Feed, settings: Settings, token: string | null): NtfyTarget | null; // surcharge flux > global ; topic vide → null
```
Titre : `[Cardinal] <flux> — <titre élément>` ; au-delà de 5 : 1 récap `[Cardinal] <flux> — N autres éléments`.

## 11. Secrets — `src/secrets/index.ts`

```ts
export class SecretsStore {
  constructor(o: { dataDir: string; env: Partial<Record<SecretName, string | null>> });
  get(name: SecretName): string | null;                 // env > ui
  state(name: SecretName): SecretState;
  set(name: SecretName, value: string): void;           // écrit secrets.json 0600 atomique (mkdtemp→write→chmod→rename)
  clear(name: SecretName): void;
}
```
Format `secrets.json` : `{ "version": 1, "anthropicApiKey"?: string, "nvdApiKey"?: string, "ntfyToken"?: string }`.

## 12. Auth — `src/auth`

```ts
export function loadSessionSecret(cfg: Config): Buffer;   // env ou <data>/session.key (0600, randomBytes(32))
export interface Session { id: string; authenticated: boolean; createdAt: number }
export function signCookie(value: string, secret: Buffer): string;   // `${value}.${base64url(hmacSha256)}`
export function verifyCookie(signed: string, secret: Buffer): string | null;
export class SessionStore { constructor(clock?: Clock); create(authenticated: boolean): Session; get(id: string): Session | null; destroy(id: string): void } // mémoire, TTL 30 j
export function verifyPassword(input: string, expected: string): boolean; // timingSafeEqual(sha256(a), sha256(b))
export class LoginRateLimiter { constructor(clock: Clock); check(ip: string): { allowed: boolean; delayMs: number; retryAfterS?: number }; fail(ip: string): void; reset(ip: string): void }
// 5 échecs / 15 min / IP → 429 ; délai progressif avant réponse d'échec : 250 ms · 2^(échecs-1), max 4 s
export function csrfToken(sessionId: string, secret: Buffer): string;   // HMAC('csrf:'+id)
export function checkCsrf(token: string | undefined, sessionId: string, secret: Buffer): boolean;
// session.ts helpers: SESSION_COOKIE, isSecureRequest(req, trustProxy), sessionCookie(id, secret, secure), sessionIdFromCookieHeader(header, secret)
export function originAllowed(req: { headers: IncomingHttpHeaders; protocol: string; host: string }, publicUrl: string | null): boolean;
```
Cookie : `pflux_session` ; attributs `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` + `Secure` si HTTPS (ou `X-Forwarded-Proto: https` avec `trustProxy`).

## 13. API HTTP

Toutes les réponses JSON. Mutations : en-tête `X-CSRF-Token` requis. Erreurs : `{ error: <code>, requestId?: string, fields?: Record<string,string> }` ; codes : `validation_error`(400), `unauthorized`(401), `csrf_failed`(403), `forbidden_origin`(403), `not_found`(404), `run_already_active`(409), `rate_limited`(429), `destination_blocked`(422), `internal_error`(500).

| Méthode | Route | Corps / query | Réponse |
|---|---|---|---|
| GET | `/healthz` | — | `{ok:true}` |
| GET | `/api/csrf` | — | `{token, mode:'local'\|'exposed', authenticated}` (crée session anonyme en local) |
| POST | `/api/auth/login` | `{password}` | `{ok:true, token}` + cookie ; 401/429 |
| POST | `/api/auth/logout` | — | `{ok:true}` |
| GET | `/api/feeds` | — | `FeedSummary[]` |
| POST | `/api/feeds` | `FeedInput` | `201 Feed` |
| GET/PUT/DELETE | `/api/feeds/:id` | PUT: `feedPatch` | `Feed` / `Feed` / `204` |
| POST | `/api/feeds/:id/duplicate` | — | `201 Feed` (« Copie de … », enabled=false) |
| POST | `/api/feeds/:id/pause` · `/resume` | — | `Feed` (resume : nextRunAt = now si null) |
| POST | `/api/feeds/:id/run` | — | `202 Run` ; 409 si actif |
| POST | `/api/feeds/test-url` | `{url}` | `{ok:true,count}` \| `{ok:false,error}` |
| POST | `/api/feeds/:id/test-notify` | — | `{ok:true}` \| `{ok:false,error}` |
| GET | `/api/feeds/export` | — | `feedExport` (attachment `cardinal-feeds.json`) |
| POST | `/api/feeds/import` | `feedExport` | `{created:number, rejected:[{index, name?, fields}]}` |
| GET | `/api/runs` | `?feedId&page&pageSize` | `Page<Run>` |
| GET | `/api/runs/:id` | — | `{run: Run, logs: RunLog[]}` |
| POST | `/api/runs/:id/cancel` | — | `{ok:true}` ; 409 si terminé |
| GET | `/api/digests` | `?feedId&page&pageSize` | `Page<DigestSummary>` |
| GET | `/api/digests/:id` | — | `Digest` |
| GET | `/api/digests/:id/export.md` · `.json` | — | `text/markdown` / `application/json`, `Content-Disposition: attachment; filename="digest-<id>.md|json"` |
| GET | `/api/items` | `?feedId&priority&read=true\|false&page&pageSize` | `Page<Item>` |
| POST | `/api/items/:id/read` | `{read?:boolean}` (défaut true) | `{ok:true}` |
| POST | `/api/items/read-all` | `{feedId?, priority?}` | `{updated}` |
| GET | `/api/settings` | — | `Settings` |
| PATCH | `/api/settings` | `settingsPatch` | `Settings` |
| PUT/DELETE | `/api/settings/secrets/:name` | PUT: `{value}` | `SecretState` (jamais la valeur) |
| POST | `/api/settings/test-notify` | — | `{ok:true}` \| `{ok:false,error}` |
| GET | `/api/claude/status` | — | `ClaudeStatus` |
| POST | `/api/claude/check` | — | `ClaudeStatus` |
| GET | `/api/stats` | — | `GlobalStats` |

Pagination : `page` ≥ 1 (défaut 1), `pageSize` 1..100 (défaut 20).

### MCP — `POST /mcp`

Hors `/api/*` : ni session ni CSRF. `Authorization: Bearer <PFLUX_MCP_TOKEN>` sinon 401 ; non configuré → 404 ; `Origin` étranger → 403 ; `GET`/`DELETE` → 405. JSON-RPC 2.0 (message seul ou lot), réponses `application/json` uniquement, notifications → 202. Méthodes : `initialize` (versions 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05), `ping`, `tools/list`, `tools/call`. Outils (`src/mcp/tools.ts`) : `list_feeds`, `get_feed {id}`, `test_feed_url {url}`, `create_feed {FeedInput sans ntfyServer/ntfyTopic ; model/budgetUsd par défaut = config}`, `update_feed {id, …feedPatch}`, `set_feed_enabled {id, enabled}`, `run_feed {id}`. Résultat : JSON en `content[0].text` ; `AppError` → `isError:true`, texte `code` ou `code: {fields}`.

## 14. WebSocket

Upgrade soumis à la garde d'accès (401 sans session en exposé) et à `originAllowed` (403).

- `GET /api/ws/runs?runId=<id>` (runId optionnel : tous les runs) — serveur → client : `RunEvent` JSON ; à la connexion avec runId : `{type:'run.snapshot', run: Run, logs: RunLog[]}`. Client → serveur : rien.
- `GET /api/ws/console` — une seule console active (sinon close `4409`). Client → serveur : `{type:'input', data:string}` | `{type:'resize', cols:number, rows:number}`. Serveur → client : `{type:'output', data:string}` | `{type:'exit', code:number}` | `{type:'closed', reason:'idle'|'replaced'|'error'}`. Inactivité 10 min → kill pty + close `4408`.

```ts
// src/console/loginConsole.ts
export class LoginConsole {
  constructor(o: { bin: string; home: string; getApiKey(): string | null; clock: Clock; idleMs?: number /*600000*/; spawnPty?: typeof import('node-pty').spawn });
  open(cols: number, rows: number): ConsoleSession | null;   // null si déjà ouverte
}
export interface ConsoleSession { write(d: string): void; resize(c: number, r: number): void; onData(fn: (d: string) => void): void; onExit(fn: (code: number) => void): void; onClose(fn: (reason: 'idle'|'client'|'error') => void): void; close(reason: 'idle'|'client'|'error'): void }
```

## 15. Divers

```ts
// src/shared/clock.ts
export interface Clock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void }
export const systemClock: Clock;
export class FakeClock implements Clock { constructor(start?: number); advance(ms: number): void }
// src/shared/errors.ts
export class AppError extends Error { constructor(public code: string, public status: number, public fields?: Record<string,string>) }
// src/app.ts
export function buildApp(deps: AppDeps): Promise<FastifyInstance>;
// src/deps.ts
export interface AppDeps { config: Config; db: Db; repos: Repos; secrets: SecretsStore; runner: ClaudeRunner; fetch: SafeFetch; notifier: NtfyNotifier; queue: RunQueue; bus: RunEventBus; console: LoginConsole; sessions: SessionStore; sessionSecret: Buffer; clock: Clock; logger: Logger; settings: () => Settings }
export function createDeps(config: Config, overrides?: Partial<AppDeps>): AppDeps;
```

### Export Markdown d'un digest
```
# <title>
_<feedName> — <date dans le fuseau configuré>_

<lede>

## <section.heading>
<section.body>

### [HIGH] <item.title>
<summary>
> <justification>
- <source url>
```

### Fichier lock `scheduler.lock`
`{"pid":1234,"startedAt":"2026-10-22T10:00:00.000Z"}` (0600).

### Fichier d'export de flux
`{"version":1,"exportedAt":"…","feeds":[FeedInput sans id, sans ntfy token, sans dates]}`
