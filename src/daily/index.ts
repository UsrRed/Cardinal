import type { DailyRepo, StoredTier } from '../db/repos/daily.js';
import type { Logger } from '../log/logger.js';
import type { Clock } from '../shared/clock.js';
import { dayBounds, periodDay, shiftDay } from '../shared/day.js';
import { AppError } from '../shared/errors.js';
import { ClaudeError, type ClaudeRunner } from '../claude/types.js';
import { validateDailyOutput, type DailyOutput } from '../claude/outputSchema.js';
import { buildCorrectionPrompt, buildDailyPrompt, type DailyPromptItem } from '../claude/prompt.js';

/** Items sent to Claude for one day (most important first). */
export const DAILY_MAX_ITEMS = 150;
const SUMMARY_MAX = 600;
/**
 * Local hour a summary day starts at: day D covers D 08:00 → D+1 08:00, so the
 * night is in it, and it is generated automatically at D+1 08:00.
 */
export const DAILY_START_HOUR = 8;
const PRIO_RANK = { high: 0, medium: 1, low: 2 } as const;
const TIER_LABEL = { high: 'À retenir', medium: 'À surveiller', low: 'En bref' } as const;
/** ntfy body cap for the daily summary (ntfy's own limit is 4 KiB). */
export const DAILY_NOTIFY_MAX = 3000;

/** What the automatic summary pushes to ntfy once it succeeds. */
export interface DailyNotice {
  day: string;
  title: string;
  body: string;
}

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
      /** Sends the automatic summary (ntfy); absent or rejecting → logged, never fails the summary. */
      notify?: (n: DailyNotice) => Promise<void>;
    },
  ) {}

  today(): string {
    return periodDay(this.o.clock.now(), this.o.timezone(), DAILY_START_HOUR);
  }

  counts(day: string): { total: number; high: number } {
    return this.o.daily.countBetween(...dayBounds(day, this.o.timezone(), DAILY_START_HOUR));
  }

  /** Starts generating `day` in the background; the row is `running` until it finishes. */
  start(day: string, opts: { notify?: boolean } = {}): void {
    if (this.running.has(day)) throw new AppError('daily_running', 409);
    const [from, to] = dayBounds(day, this.o.timezone(), DAILY_START_HOUR);
    const items = this.o.daily.itemsBetween(from, to, DAILY_MAX_ITEMS);
    if (!items.length) throw new AppError('no_items', 409);
    this.running.add(day);
    this.o.daily.begin(day, this.o.clock.now());
    void this.generate(day, items, !!opts.notify).finally(() => this.running.delete(day));
  }

  /** Scheduler hook: the period that just ended, once, from DAILY_START_HOUR local time. */
  tick(): void {
    const day = shiftDay(this.today(), -1);
    if (this.o.daily.get(day) || this.running.has(day)) return;
    try {
      this.start(day, { notify: true });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }

  private async generate(day: string, items: ReturnType<DailyRepo['itemsBetween']>, notify = false): Promise<void> {
    const { daily, runner, clock, logger } = this.o;
    const promptItems: DailyPromptItem[] = items.map((it, i) => ({
      ref: `i${i + 1}`, title: it.title, url: it.url, feedName: it.feedName, priority: it.priority,
      summary: it.summary.length > SUMMARY_MAX ? `${it.summary.slice(0, SUMMARY_MAX)}…` : it.summary,
    }));
    const idByRef = new Map(promptItems.map((p, i) => [p.ref, items[i]!.id]));
    const prompt = buildDailyPrompt({ day, startHour: DAILY_START_HOUR, items: promptItems });
    try {
      let current = prompt;
      let out: DailyOutput | null = null;
      for (let attempt = 0; attempt < 2 && !out; attempt++) {
        let problems: string[];
        try {
          const res = await runner.run({ prompt: current, model: this.o.model, signal: new AbortController().signal });
          const v = validateDailyOutput(res.json, new Set(idByRef.keys()));
          if (v.ok) { out = v.value; break; }
          problems = v.problems;
        } catch (e) {
          if (!(e instanceof ClaudeError) || e.kind !== 'invalid_output') throw e;
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
      daily.finish(day, { status: 'succeeded', title: out.title, overview: out.overview, tiers, itemCount: items.length }, clock.now());
      if (notify && this.o.notify) {
        const n = dailyNotice(day, out, items.filter((i) => i.priority === 'high').length, items.length);
        await this.o.notify(n).catch(() => logger.warn({ day }, 'daily summary notification failed'));
      }
    } catch (e) {
      const code = e instanceof ClaudeError ? e.kind : 'unknown';
      logger.warn({ day, code }, 'daily summary failed');
      daily.finish(day, { status: 'failed', errorCode: code, itemCount: items.length }, clock.now());
    }
  }
}

/** Plain-text ntfy message: overview, then the categories of each tier. */
export function dailyNotice(day: string, out: DailyOutput, highCount: number, itemCount: number): DailyNotice {
  const tiers = [...out.tiers]
    .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority])
    .filter((t) => t.categories.length)
    .map((t) => `${TIER_LABEL[t.priority]} : ${t.categories.map((c) => c.name).join(', ')}`);
  const head = `${itemCount} élément(s), ${highCount} prioritaire(s)`;
  const body = [out.overview.trim(), tiers.join('\n'), head].filter(Boolean).join('\n\n');
  return {
    day,
    title: `[Cardinal] Résumé du ${day} — ${out.title}`,
    body: body.length > DAILY_NOTIFY_MAX ? `${body.slice(0, DAILY_NOTIFY_MAX - 1)}…` : body,
  };
}
