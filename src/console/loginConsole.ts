import type { Clock } from '../shared/clock.js';

export interface ConsoleSession {
  write(d: string): void;
  resize(c: number, r: number): void;
  onData(fn: (d: string) => void): void;
  onExit(fn: (code: number) => void): void;
  close(reason: 'idle' | 'client' | 'error'): void;
}

export class LoginConsole {
  constructor(_o: {
    bin: string;
    home: string;
    getApiKey(): string | null;
    clock: Clock;
    idleMs?: number;
    spawnPty?: (...args: unknown[]) => unknown;
  }) {}
  open(_cols: number, _rows: number): ConsoleSession | null {
    throw new Error('not implemented');
  }
}
