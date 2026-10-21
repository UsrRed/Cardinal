import { createRequire } from 'node:module';
import { buildClaudeEnv } from '../claude/env.js';
import type { Clock } from '../shared/clock.js';

export interface ConsoleSession {
  write(d: string): void;
  resize(c: number, r: number): void;
  onData(fn: (d: string) => void): void;
  onExit(fn: (code: number) => void): void;
  onClose(fn: (reason: 'idle' | 'client' | 'error') => void): void;
  close(reason: 'idle' | 'client' | 'error'): void;
}

type SpawnPty = typeof import('node-pty').spawn;

const IDLE_MS = 10 * 60 * 1000;

function defaultSpawn(...args: Parameters<SpawnPty>): ReturnType<SpawnPty> {
  // Loaded lazily: the native module must not break app startup when unavailable.
  const pty = createRequire(import.meta.url)('node-pty') as typeof import('node-pty');
  return pty.spawn(...args);
}

export class LoginConsole {
  private active: { kill(): void } | null = null;

  constructor(
    private o: {
      bin: string;
      home: string;
      getApiKey(): string | null;
      clock: Clock;
      idleMs?: number;
      spawnPty?: SpawnPty;
    },
  ) {}

  open(cols: number, rows: number): ConsoleSession | null {
    if (this.active) return null;
    const { clock } = this.o;
    const spawn = this.o.spawnPty ?? defaultSpawn;
    const term = spawn(this.o.bin, ['/login'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: this.o.home,
      env: buildClaudeEnv({ home: this.o.home, apiKey: this.o.getApiKey() }),
    });
    let done = false;
    let timer: unknown;
    const dataFns: Array<(d: string) => void> = [];
    const exitFns: Array<(code: number) => void> = [];
    const closeFns: Array<(r: 'idle' | 'client' | 'error') => void> = [];

    const finish = () => {
      if (done) return false;
      done = true;
      clock.clearTimeout(timer);
      this.active = null;
      return true;
    };
    const arm = () => {
      clock.clearTimeout(timer);
      timer = clock.setTimeout(() => session.close('idle'), this.o.idleMs ?? IDLE_MS);
    };
    const kill = () => {
      try {
        term.kill();
      } catch {
        /* already dead */
      }
    };

    term.onData((d) => {
      if (done) return;
      arm();
      dataFns.forEach((f) => f(d));
    });
    term.onExit((e) => {
      if (!finish()) return;
      exitFns.forEach((f) => f(e.exitCode));
    });

    const session: ConsoleSession = {
      write: (d) => {
        if (done) return;
        arm();
        term.write(d);
      },
      resize: (c, r) => {
        if (done) return;
        try {
          term.resize(Math.max(1, Math.floor(c)), Math.max(1, Math.floor(r)));
        } catch {
          /* ignore */
        }
      },
      onData: (fn) => void dataFns.push(fn),
      onExit: (fn) => void exitFns.push(fn),
      onClose: (fn) => void closeFns.push(fn),
      close: (reason) => {
        if (!finish()) return;
        kill();
        closeFns.forEach((f) => f(reason));
      },
    };
    this.active = { kill };
    arm();
    return session;
  }
}
