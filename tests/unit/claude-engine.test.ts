import { describe, expect, it } from 'vitest';
import { runTriageAndDigest } from '../../src/claude/engine.js';
import { checkClaudeStatus } from '../../src/claude/status.js';
import { FakeClaudeRunner, type FakeStep } from '../../src/claude/fakeRunner.js';
import { ClaudeError } from '../../src/claude/types.js';

const mkItems = (n: number) =>
  Array.from({ length: n }, (_, k) => ({
    ref: `i${k + 1}`, title: `t${k}`, url: `https://a.com/${k}`, content: `c ${k}`, sources: [`https://a.com/${k}`],
  }));
const run = (script: FakeStep[], n: number) => {
  const runner = new FakeClaudeRunner(script);
  const p = runTriageAndDigest({
    runner, feed: { name: 'f', instructions: 'x', model: 'sonnet' }, items: mkItems(n),
    signal: new AbortController().signal, onLog: () => {},
  });
  return { runner, p };
};

describe('runTriageAndDigest', () => {
  it('retries once after invalid output', async () => {
    const { runner, p } = run([{ kind: 'invalid_json' }, { kind: 'valid' }], 3);
    const r = await p;
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1]!.prompt).toContain('rejetée');
    expect(r.digest).not.toBeNull();
  });
  it('fails generically after two invalid outputs', async () => {
    const { p } = run([{ kind: 'raw', text: '{"secret":"LEAK"}' }, { kind: 'raw', text: '{"secret":"LEAK"}' }], 3);
    const e = await p.catch((x) => x);
    expect(e).toBeInstanceOf(ClaudeError);
    expect(e.kind).toBe('invalid_output');
    expect(e.message).not.toContain('LEAK');
  });
  it('rejects invented URL then retries', async () => {
    const { runner, p } = run([{ kind: 'invented_url' }, { kind: 'valid' }], 3);
    expect((await p).digest).not.toBeNull();
    expect(runner.calls).toHaveLength(2);
  });
  it('batches 100 items into 3 triage calls + 1 digest', async () => {
    const { runner, p } = run([], 100);
    const r = await p;
    expect(runner.calls).toHaveLength(4);
    expect(r.processedRefs).toHaveLength(100);
    expect(r.digest).not.toBeNull();
  });
  it('propagates usage_limit', async () => {
    const { p } = run([{ kind: 'error', error: 'usage_limit' }], 3);
    await expect(p).rejects.toMatchObject({ kind: 'usage_limit' });
  });
});

describe('checkClaudeStatus', () => {
  it('maps outcomes', async () => {
    expect((await checkClaudeStatus(new FakeClaudeRunner([{ kind: 'valid' }]), false)).state).toBe('connected');
    expect((await checkClaudeStatus(new FakeClaudeRunner([{ kind: 'valid' }]), true)).state).toBe('api_key');
    expect((await checkClaudeStatus(new FakeClaudeRunner([{ kind: 'error', error: 'unauthenticated' }]), false)).state).toBe('not_connected');
    expect((await checkClaudeStatus(new FakeClaudeRunner([{ kind: 'error', error: 'spawn_failed' }]), false)).state).toBe('unknown');
  });
});
