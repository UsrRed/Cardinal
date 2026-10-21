import type { GlobalStats, LogLevel, Page, Run, RunLog, RunStatus, RunStep, StepState, Usage } from '../../shared/types.js';

export interface RunsRepo {
  create(feedId: string, trigger: Run['trigger'], now: number): Run;
  get(id: string): Run | null;
  list(q: { feedId?: string; page: number; pageSize: number }): Page<Run>;
  activeForFeed(feedId: string): Run | null;
  nextQueued(): Run | null;
  countRunning(): number;
  markRunning(id: string, now: number): boolean;
  setStep(id: string, step: RunStep, state: StepState, detail?: string): void;
  setCounts(id: string, c: Partial<Pick<Run, 'fetchedCount' | 'newCount' | 'keptCount' | 'notifiedCount' | 'noNews'>>): void;
  addUsage(id: string, u: Usage): void;
  finish(
    id: string,
    status: Exclude<RunStatus, 'queued' | 'running'>,
    now: number,
    extra?: { errorCode?: string; digestId?: string },
  ): void;
  requeueRunning(): number;
  appendLog(id: string, level: LogLevel, step: RunStep | null, message: string, now: number): RunLog;
  logs(id: string, afterId?: number): RunLog[];
  usageByFeed(): GlobalStats;
}
