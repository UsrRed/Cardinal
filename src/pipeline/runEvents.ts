import type { RunLog, RunStatus, RunStep, StepState } from '../shared/types.js';

export type RunEvent =
  | { type: 'run.status'; runId: string; feedId: string; status: RunStatus; errorCode: string | null }
  | { type: 'run.step'; runId: string; step: RunStep; state: StepState; detail: string | null }
  | { type: 'run.log'; runId: string; log: RunLog };

export class RunEventBus {
  private listeners = new Set<(e: RunEvent) => void>();
  emit(e: RunEvent): void {
    for (const fn of this.listeners) fn(e);
  }
  on(fn: (e: RunEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
