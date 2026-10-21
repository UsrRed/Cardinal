import { closeSync, openSync, readFileSync, unlinkSync, writeSync, constants } from 'node:fs';
import { join } from 'node:path';

export interface SchedulerLock {
  release(): void;
}

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function acquireLock(dataDir: string, o: { isAlive?(pid: number): boolean } = {}): SchedulerLock | null {
  const file = join(dataDir, 'scheduler.lock');
  const isAlive = o.isAlive ?? defaultIsAlive;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      closeSync(fd);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          try {
            unlinkSync(file);
          } catch {
            /* already gone */
          }
        },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      let pid = NaN;
      try {
        pid = JSON.parse(readFileSync(file, 'utf8')).pid;
      } catch {
        /* unreadable: treat as stale */
      }
      if (Number.isInteger(pid) && isAlive(pid)) return null;
      try {
        unlinkSync(file);
      } catch {
        /* raced */
      }
    }
  }
  return null;
}
