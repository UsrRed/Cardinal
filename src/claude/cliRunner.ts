import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '../log/logger.js';
import { buildClaudeArgs } from './args.js';
import { classifyError } from './classify.js';
import { buildClaudeEnv } from './env.js';
import { parseStreamJson } from './streamJson.js';
import { ClaudeError, type ClaudeRunner, type RunRequest, type RunResult } from './types.js';

const KILL_GRACE_MS = 5000;

function parseJsonText(text: string): unknown {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return JSON.parse(fenced ? fenced[1]! : t);
}

export class CliClaudeRunner implements ClaudeRunner {
  constructor(private o: { bin: string; home: string; getApiKey(): string | null; logger: Logger }) {}

  async run(req: RunRequest): Promise<RunResult> {
    if (req.signal.aborted) throw new ClaudeError('cancelled');
    const cwd = mkdtempSync(join(tmpdir(), 'pflux-claude-cwd-'));
    const cfgDir = mkdtempSync(join(tmpdir(), 'pflux-claude-cfg-'));
    try {
      chmodSync(cwd, 0o700);
      chmodSync(cfgDir, 0o700);
      const mcp = join(cfgDir, 'mcp.json');
      writeFileSync(mcp, '{"mcpServers":{}}', { mode: 0o600 });
      const env = buildClaudeEnv({ home: this.o.home, apiKey: this.o.getApiKey() });
      return await this.exec(req, cwd, env, buildClaudeArgs(req.model, mcp));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(cfgDir, { recursive: true, force: true });
    }
  }

  private exec(req: RunRequest, cwd: string, env: Record<string, string>, args: string[]): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.o.bin, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let aborted = false;
      let killTimer: NodeJS.Timeout | undefined;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        req.signal.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => {
        aborted = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
        killTimer.unref();
      };
      req.signal.addEventListener('abort', onAbort, { once: true });
      child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
      child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
      child.on('error', (e) => {
        this.o.logger.warn({ err: e.message }, 'claude spawn failed');
        done(() => reject(new ClaudeError('spawn_failed')));
      });
      child.on('close', (code) => {
        done(() => {
          if (aborted) return reject(new ClaudeError('cancelled'));
          const p = parseStreamJson(stdout);
          if (code !== 0 || p.isError) {
            const kind = classifyError({ stdout: p.errorText ? `${p.errorText}\n${stdout}` : stdout, stderr, code });
            return reject(new ClaudeError(kind, p.usage));
          }
          if (p.text === null) return reject(new ClaudeError('invalid_output', p.usage));
          try {
            resolve({ json: parseJsonText(p.text), usage: p.usage });
          } catch {
            reject(new ClaudeError('invalid_output', p.usage));
          }
        });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(req.prompt);
    });
  }
}
