export interface SchedulerLock {
  release(): void;
}

export function acquireLock(_dataDir: string, _o?: { isAlive?(pid: number): boolean }): SchedulerLock | null {
  throw new Error('not implemented');
}
