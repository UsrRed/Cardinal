import type { Repos } from '../db/repos/index.js';
import { ClaudeError, DEFERRABLE, type ClaudeRunner } from '../claude/types.js';
import { runTriageAndDigest } from '../claude/engine.js';
import type { PromptItem } from '../claude/prompt.js';
import type { SafeFetch } from '../net/safeFetch.js';
import { NtfyNotifier, resolveTarget } from '../notify/ntfy.js';
import type { SecretsStore } from '../secrets/index.js';
import type { Settings, RunStatus, RunStep, StepState, LogLevel, Feed } from '../shared/types.js';
import type { Clock } from '../shared/clock.js';
import type { Config } from '../config/index.js';
import { sanitizeLogMessage, type Logger } from '../log/logger.js';
import { getConnector } from '../sources/index.js';
import { getNvdLimiter } from '../sources/rateLimiter.js';
import { filterUnseen } from '../dedup/index.js';
import { deferDelayMs } from '../scheduler/index.js';
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

type Final = Exclude<RunStatus, 'queued' | 'running'>;

class StepFailure extends Error {
  constructor(public code: string, public status: Final = 'failed') {
    super(code);
  }
}

const MAX_URLS_PER_ITEM = 10;

function referencesOf(meta: Record<string, unknown>): string[] {
  const refs = meta.references;
  if (!Array.isArray(refs)) return [];
  return refs.filter((r): r is string => typeof r === 'string' && /^https?:\/\//.test(r)).slice(0, MAX_URLS_PER_ITEM);
}

export async function executeRun(runId: string, deps: PipelineDeps, signal: AbortSignal): Promise<RunStatus> {
  const { db, bus, clock } = deps;
  const run = db.runs.get(runId);
  if (!run) throw new Error('run_not_found');
  const feedId = run.feedId;
  const secretValues = () =>
    (['anthropicApiKey', 'nvdApiKey', 'ntfyToken'] as const).map((n) => deps.secrets.get(n)).filter((s): s is string => !!s);

  const log = (level: LogLevel, step: RunStep | null, msg: string) => {
    const entry = db.runs.appendLog(runId, level, step, sanitizeLogMessage(msg, secretValues()), clock.now());
    bus.emit({ type: 'run.log', runId, log: entry });
  };
  const step = (s: RunStep, state: StepState, detail?: string) => {
    db.runs.setStep(runId, s, state, detail);
    bus.emit({ type: 'run.step', runId, step: s, state, detail: detail ?? null });
  };
  const finish = (status: Final, errorCode?: string, digestId?: string): Final => {
    db.runs.finish(runId, status, clock.now(), { errorCode, digestId });
    bus.emit({ type: 'run.status', runId, feedId, status, errorCode: errorCode ?? null });
    return status;
  };

  if (run.status === 'queued') {
    if (!db.runs.markRunning(runId, clock.now())) throw new Error('run_not_startable');
  }
  bus.emit({ type: 'run.status', runId, feedId, status: 'running', errorCode: null });

  const feed = db.feeds.get(feedId);
  if (!feed) return finish('failed', 'internal_error');

  const setLastRun = (nextRunAt?: number | null, deferCount?: number) => {
    const cur = db.feeds.get(feedId);
    db.feeds.setSchedule(feedId, {
      lastRunAt: clock.now(),
      nextRunAt: nextRunAt === undefined ? (cur?.nextRunAt ? Date.parse(cur.nextRunAt) : null) : nextRunAt,
      deferCount,
    });
  };

  let current: RunStep = 'fetch';
  try {
    if (signal.aborted) throw new StepFailure('cancelled', 'cancelled');

    // fetch
    step('fetch', 'running');
    const errors: string[] = [];
    const nvdApiKey = deps.secrets.get('nvdApiKey');
    const raw = await getConnector(feed.sourceType).fetch(feed.sourceParams, {
      fetch: deps.fetch,
      now: clock.now(),
      freshnessDays: feed.freshnessDays,
      signal,
      nvdApiKey,
      nvdLimiter: getNvdLimiter(!!nvdApiKey, clock),
      onSourceError: (target, code) => {
        errors.push(code);
        log('warn', 'fetch', `Source en erreur (${target}): ${code}`);
      },
    });
    if (signal.aborted) throw new StepFailure('cancelled', 'cancelled');
    if (!raw.length && errors.length) {
      step('fetch', 'error', 'fetch_failed');
      throw new StepFailure('fetch_failed');
    }
    db.runs.setCounts(runId, { fetchedCount: raw.length });
    step('fetch', 'done', `${raw.length} éléments`);

    // dedup
    current = 'dedup';
    step('dedup', 'running');
    const fresh = filterUnseen(raw, db.seen, feedId, feed.sourceType);
    db.runs.setCounts(runId, { newCount: fresh.length });
    step('dedup', 'done', `${fresh.length} nouveaux`);

    if (!fresh.length) {
      db.runs.setCounts(runId, { noNews: true, keptCount: 0, notifiedCount: 0 });
      for (const s of ['triage', 'digest', 'notify'] as const) step(s, 'skipped');
      log('info', null, 'Aucune nouveauté');
      setLastRun(undefined, 0);
      return finish('succeeded');
    }

    // triage + digest
    current = 'triage';
    step('triage', 'running');
    const prompts: PromptItem[] = fresh.map((f, i) => ({
      ref: `i${i + 1}`,
      title: f.item.title,
      url: f.item.url,
      publishedAt: f.item.publishedAt,
      content: f.item.content,
      sources: [...new Set([...(f.item.url ? [f.item.url] : []), ...referencesOf(f.item.meta)])],
    }));
    const byRef = new Map(prompts.map((p, i) => [p.ref, fresh[i]!]));
    const result = await runTriageAndDigest({
      runner: deps.runner,
      feed,
      items: prompts,
      signal,
      onLog: (l, m) => log(l, 'triage', m),
    });

    const processedKeys = result.processedRefs.map((r) => byRef.get(r)?.key).filter((k): k is string => !!k);
    db.seen.markSeen(feedId, processedKeys, clock.now());
    const kept = result.triaged.filter((t) => t.keep && byRef.has(t.ref));
    db.runs.setCounts(runId, { keptCount: kept.length });
    step('triage', 'done', `${result.triaged.length} évalués, ${kept.length} retenus`);

    let digestId: string | undefined;
    let items: ReturnType<Repos['items']['insertMany']> = [];
    const d = result.digest;
    if (kept.length && d) {
      current = 'digest';
      step('digest', 'running');
      digestId = db.digests.create(
        { feedId, runId, title: d.title, lede: d.lede, sections: d.sections },
        clock.now(),
      );
      items = db.items.insertMany(
        kept.map((t) => {
          const src = byRef.get(t.ref)!.item;
          return {
            feedId,
            digestId: digestId!,
            runId,
            ref: t.ref,
            title: src.title,
            url: src.url,
            priority: t.priority,
            justification: t.justification,
            summary: t.summary,
            sources: t.sources,
            publishedAt: src.publishedAt ?? null,
          };
        }),
        clock.now(),
      );
      step('digest', 'done');
    } else {
      step('digest', 'skipped');
    }

    // notify
    current = 'notify';
    if (!feed.notify || !items.length) {
      step('notify', 'skipped');
    } else {
      step('notify', 'running');
      const target = resolveTarget(feed, deps.settings(), deps.secrets.get('ntfyToken'));
      try {
        const res = await deps.notifier.notifyRun({
          target,
          feed: feed as Feed,
          items,
          digestId: digestId!,
          publicUrl: deps.settings().publicUrl || deps.config.publicUrl,
        });
        db.runs.setCounts(runId, { notifiedCount: res.sent });
        if (res.failed > 0) {
          log('error', 'notify', `Échec de ${res.failed} notification(s) ntfy`);
          step('notify', 'error', 'ntfy_failed');
        } else step('notify', 'done', `${res.sent} envoyées`);
      } catch {
        log('error', 'notify', 'Échec de la notification ntfy');
        step('notify', 'error', 'ntfy_failed');
      }
    }

    setLastRun(undefined, 0);
    return finish('succeeded', undefined, digestId);
  } catch (e) {
    return handleError(e);
  }

  function handleError(e: unknown): Final {
    if (signal.aborted || (e instanceof ClaudeError && e.kind === 'cancelled') || (e instanceof StepFailure && e.status === 'cancelled')) {
      step(current, 'error', 'cancelled');
      log('info', null, 'Run annulé');
      setLastRun();
      return finish('cancelled', 'cancelled');
    }
    if (e instanceof ClaudeError && DEFERRABLE.has(e.kind)) {
      const code = `claude_${e.kind}`;
      const n = db.feeds.getDeferCount(feedId);
      const next = clock.now() + deferDelayMs(deps.config.deferMinutes, n);
      step(current, 'error', code);
      log('warn', current, `Run différé (${code})`);
      setLastRun(next, n + 1);
      return finish('deferred', code);
    }
    let code = 'internal_error';
    if (e instanceof StepFailure) code = e.code;
    else if (e instanceof ClaudeError) code = e.kind === 'invalid_output' ? 'claude_invalid_output' : 'claude_failed';
    if (!(e instanceof StepFailure)) step(current, 'error', code);
    log('error', current, `Run en échec (${code})`);
    deps.logger.error({ runId, code }, 'run failed');
    setLastRun();
    return finish('failed', code);
  }
}
