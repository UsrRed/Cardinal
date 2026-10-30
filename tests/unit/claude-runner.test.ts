/* eslint-disable @typescript-eslint/no-explicit-any */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyError } from '../../src/claude/classify.js';
import { CliClaudeRunner } from '../../src/claude/cliRunner.js';
import { FakeClaudeRunner } from '../../src/claude/fakeRunner.js';
import { parseStreamJson } from '../../src/claude/streamJson.js';
import { ClaudeError } from '../../src/claude/types.js';
import { createLogger } from '../../src/log/logger.js';

let dir: string;
let bin: string;
const fixture = resolve('tests/fixtures/claude/fake-claude.mjs');

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pflux-t10-'));
  bin = join(dir, 'claude');
  writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`);
  chmodSync(bin, 0o755);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runner(key: string | null = null) {
  return new CliClaudeRunner({ bin, home: dir, getApiKey: () => key, logger: createLogger('fatal') });
}
const req = (prompt: string, signal = new AbortController().signal) => ({ prompt, model: 'sonnet', signal });

describe('CliClaudeRunner', () => {
  it('rebuilds env, passes argv, prompt on stdin, private cwd removed', async () => {
    process.env.AWS_SECRET = 'x';
    process.env.GITHUB_TOKEN = 'y';
    const dump = join(dir, 'dump.json');
    const r = await runner().run(req(`DUMP:${dump} MODE:ok`));
    delete process.env.AWS_SECRET;
    delete process.env.GITHUB_TOKEN;
    expect(r.json).toEqual({ items: [], ok: true });
    const d = JSON.parse(readFileSync(dump, 'utf8'));
    expect(d.env.AWS_SECRET).toBeUndefined();
    expect(d.env.GITHUB_TOKEN).toBeUndefined();
    expect(d.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(d.env.HOME).toBe(dir);
    expect(d.argv).toContain('--strict-mcp-config');
    expect(d.argv).toContain('--disallowedTools');
    expect(d.argv.some((a: string) => a.includes('DUMP:'))).toBe(false);
    expect(d.stdin).toContain('DUMP:');
    expect(d.cwdMode).toBe('700');
    expect(existsSync(d.cwd)).toBe(false);
  });

  it('sets ANTHROPIC_API_KEY only when provided', async () => {
    const dump = join(dir, 'dump2.json');
    await runner('sk-test').run(req(`DUMP:${dump}`));
    expect(JSON.parse(readFileSync(dump, 'utf8')).env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it.each([
    ['usage_limit', 'usage_limit'],
    ['unauthenticated', 'unauthenticated'],
    ['overloaded', 'overloaded'],
    ['other', 'unknown'],
    ['bad_json', 'invalid_output'],
  ])('classifies %s', async (mode, kind) => {
    await expect(runner().run(req(`MODE:${mode}`))).rejects.toMatchObject({ kind });
  });

  it('abort kills the child', async () => {
    const ac = new AbortController();
    const p = runner().run(req('MODE:hang', ac.signal));
    setTimeout(() => ac.abort(), 300);
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('reports spawn_failed for a missing binary', async () => {
    const r = new CliClaudeRunner({ bin: join(dir, 'nope'), home: dir, getApiKey: () => null, logger: createLogger('fatal') });
    await expect(r.run(req('x'))).rejects.toMatchObject({ kind: 'spawn_failed' });
  });
});

describe('parse / classify', () => {
  it('extracts the text from the result event', () => {
    const out = JSON.stringify({ type: 'result', is_error: false, result: 'hi' });
    expect(parseStreamJson(`garbage\n${out}\n`)).toMatchObject({ text: 'hi', isError: false });
  });
  it('classifies', () => {
    const c = (stderr: string) => classifyError({ stdout: '', stderr, code: 1 });
    expect(c('Claude usage limit reached')).toBe('usage_limit');
    expect(c('Not logged in')).toBe('unauthenticated');
    expect(c('overloaded_error')).toBe('overloaded');
    expect(c('segfault')).toBe('unknown');
  });
});

describe('FakeClaudeRunner', () => {
  const prompt = 'x\n<<<DATA id=instructions>>>\nfoo\n<<<END DATA>>>\n<<<DATA id=i1>>>\nT https://a.example/1\n<<<END DATA>>>\n<<<DATA id=i2>>>\nT2\n<<<END DATA>>>';
  it('auto mode is deterministic', async () => {
    const f = new FakeClaudeRunner();
    const { json } = (await f.run(req(prompt))) as { json: any };
    expect(json.items.map((i: any) => [i.ref, i.priority, i.keep])).toEqual([['i1', 'high', true], ['i2', 'medium', true]]);
    expect(json.items[0].sources).toEqual(['https://a.example/1']);
  });
  it('follows script', async () => {
    const f = new FakeClaudeRunner([{ kind: 'error', error: 'overloaded' }, { kind: 'invalid_json' }]);
    await expect(f.run(req(prompt))).rejects.toBeInstanceOf(ClaudeError);
    await expect(f.run(req(prompt))).rejects.toMatchObject({ kind: 'invalid_output' });
    expect(f.calls).toHaveLength(2);
  });
});
