import type { DailyRepo, StoredTier } from '../db/repos/daily.js';
import type { Logger } from '../log/logger.js';
import type { Clock } from '../shared/clock.js';
import { dayBounds, localDay, localHour, shiftDay } from '../shared/day.js';
import { AppError } from '../shared/errors.js';
import type { Usage } from '../shared/types.js';
import { ClaudeError, type ClaudeRunner } from '../claude/types.js';
import { validateDailyOutput, type DailyOutput } from '../claude/outputSchema.js';
import { buildCorrectionPrompt, buildDailyPrompt, type DailyPromptItem } from '../claude/prompt.js';

/** Items sent to Claude for one day (most important first). */
export const DAILY_MAX_ITEMS = 150;
const SUMMARY_MAX = 600;
/** Local hour after which yesterday's summary is generated automatically. */
export const DAILY_AUTO_HOUR = 6;
const PRIO_RANK = { high: 0, medium: 1, low: 2 } as const;

export class DailyService {
  private running = new Set<string>();

  constructor(
    private o: {
      daily: DailyRepo;
      runner: ClaudeRunner;
      clock: Clock;
      logger: Logger;
      timezone: () => string;
      model: string;
      budgetUsd: number;
    },
  ) {}

  today(): string {
    return localDay(this.o.clock.now(), this.o.timezone());
  }

  counts(day: string): { total: number; high: number } {
    return this.o.daily.countBetween(...dayBounds(day, this.o.timezone()));
  }

  /** Starts generating `day` in the background; the row is `running` until it finishes. */
  start(day: string): void {
    if (this.running.has(day)) throw new AppError('daily_running', 409);
    const [from, to] = dayBounds(day, this.o.timezone());
    const items = this.o.daily.itemsBetween(from, to, DAILY_MAX_ITEMS);
    if (!items.length) throw new AppError('no_items', 409);
    this.running.add(day);
    this.o.daily.begin(day, this.o.clock.now());
    void this.generate(day, items).finally(() => this.running.delete(day));
  }

  /** Scheduler hook: yesterday's summary, once, after DAILY_AUTO_HOUR local time. */
  tick(): void {
    const now = this.o.clock.now();
    const tz = this.o.timezone();
    if (localHour(now, tz) < DAILY_AUTO_HOUR) return;
    const day = shiftDay(localDay(now, tz), -1);
    if (this.o.daily.get(day) || this.running.has(day)) return;
    try {
      this.start(day);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }

  private async generate(day: string, items: ReturnType<DailyRepo['itemsBetween']>): Promise<void> {
    const { daily, runner, clock, logger } = this.o;
    const usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const promptItems: DailyPromptItem[] = items.map((it, i) => ({
      ref: `i${i + 1}`, title: it.title, url: it.url, feedName: it.feedName, priority: it.priority,
      summary: it.summary.length > SUMMARY_MAX ? `${it.summary.slice(0, SUMMARY_MAX)}…` : it.summary,
    }));
    const idByRef = new Map(promptItems.map((p, i) => [p.ref, items[i]!.id]));
    const prompt = buildDailyPrompt({ day, items: promptItems });
    try {
      let current = prompt;
      let out: DailyOutput | null = null;
      for (let attempt = 0; attempt < 2 && !out; attempt++) {
        let problems: string[];
        try {
          const res = await runner.run({
            prompt: current, model: this.o.model,
            budgetUsd: Math.max(this.o.budgetUsd - usage.costUsd, 0.01), signal: new AbortController().signal,
          });
          addUsage(usage, res.usage);
          const v = validateDailyOutput(res.json, new Set(idByRef.keys()));
          if (v.ok) { out = v.value; break; }
          problems = v.problems;
        } catch (e) {
          if (!(e instanceof ClaudeError) || e.kind !== 'invalid_output') throw e;
          addUsage(usage, e.usage);
          problems = ['la sortie n\'est pas un JSON valide'];
        }
        current = buildCorrectionPrompt(prompt, problems);
      }
      if (!out) throw new ClaudeError('invalid_output');
      const tiers: StoredTier[] = [...out.tiers]
        .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority])
        .map((t) => ({
          priority: t.priority,
          categories: t.categories.map((c) => ({ name: c.name, body: c.body, itemIds: c.itemRefs.map((r) => idByRef.get(r)!) })),
        }));
      daily.finish(day, { status: 'succeeded', title: out.title, overview: out.overview, tiers, itemCount: items.length, usage }, clock.now());
    } catch (e) {
      const code = e instanceof ClaudeError ? e.kind : 'unknown';
      if (e instanceof ClaudeError) addUsage(usage, e.usage);
      logger.warn({ day, code }, 'daily summary failed');
      daily.finish(day, { status: 'failed', errorCode: code, itemCount: items.length, usage }, clock.now());
    }
  }
}

function addUsage(acc: Usage, u?: Usage): void {
  if (!u) return;
  acc.inputTokens += u.inputTokens;
  acc.outputTokens += u.outputTokens;
  acc.costUsd += u.costUsd;
}
