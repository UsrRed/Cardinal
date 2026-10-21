import type { PipelineDeps } from '../pipeline/index.js';
import type { Run } from '../shared/types.js';

export class RunQueue {
  constructor(_deps: PipelineDeps, _opts: { concurrency: () => number }) {}
  recover(): void {
    throw new Error('not implemented');
  }
  enqueue(_feedId: string, _trigger: Run['trigger']): Run {
    throw new Error('not implemented');
  }
  kick(): void {
    throw new Error('not implemented');
  }
  cancel(_runId: string): boolean {
    throw new Error('not implemented');
  }
  idle(): Promise<void> {
    throw new Error('not implemented');
  }
}
