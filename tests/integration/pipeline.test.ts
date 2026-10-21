import http from 'node:http';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openDb, migrate } from '../../src/db/index.js';
import { createFeedsRepo } from '../../src/db/repos/feeds.js';
import { createRunsRepo } from '../../src/db/repos/runs.js';
import { createDigestsRepo } from '../../src/db/repos/digests.js';
import { createItemsRepo } from '../../src/db/repos/items.js';
import { createSeenRepo } from '../../src/db/repos/seen.js';
import { createSettingsRepo } from '../../src/db/repos/settings.js';
import { executeRun, type PipelineDeps } from '../../src/pipeline/index.js';
import { RunEventBus, type RunEvent } from '../../src/pipeline/runEvents.js';
import { FakeClaudeRunner, type FakeStep } from '../../src/claude/fakeRunner.js';
import { NtfyNotifier } from '../../src/notify/ntfy.js';
import { SecretsStore } from '../../src/secrets/index.js';
import { createSafeFetch } from '../../src/net/safeFetch.js';
import { FakeClock } from '../../src/shared/clock.js';
import type { Config } from '../../src/config/index.js';
import type { Settings } from '../../src/shared/types.js';
import { tmpDataDir } from '../helpers/tmpDataDir.js';

const NOW = Date.parse('2026-01-10T00:00:00Z');
let srv: http.Server;
let base: string;
let bigCount = 1;

const rss = (n: number) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${Array.from({ length: n }, (_, i) =>
    `<item><title>Post ${i}</title><link>https://example.com/p${i}</link><pubDate>Fri, 09 Jan 2026 10:00:00 GMT</pubDate><description>Body ${i}</description></item>`,
  ).join('')}</channel></rss>`;

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    if (req.url === '/rss') res.end(rss(bigCount));
    else { res.statusCode = 500; res.end('x'); }
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => srv.close());
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((c) => c()); bigCount = 1; });

function setup(script?: FakeStep[], opts: { notify?: boolean; notifier?: Partial<NtfyNotifier>; urls?: string[] } = {}) {
  const t = tmpDataDir();
  const db = openDb(join(t.dir, 't.db'));
  cleanups.push(() => { db.close(); t.cleanup(); });
  migrate(db, join(process.cwd(), 'migrations'));
  const repos = {
    feeds: createFeedsRepo(db), runs: createRunsRepo(db), digests: createDigestsRepo(db),
    items: createItemsRepo(db), seen: createSeenRepo(db), settings: createSettingsRepo(db),
  };
  const feed = repos.feeds.create({
    name: 'F', instructions: 'x', sourceType: 'rss', sourceParams: { urls: opts.urls ?? [`${base}/rss`] },
    frequencyHours: 1, freshnessDays: 30, enabled: true, notify: opts.notify ?? false, notifyThreshold: 'low',
    ntfyServer: 'http://127.0.0.1:1', ntfyTopic: 'topic', model: 'sonnet', budgetUsd: 0.5,
  }, NOW);
  const runner = new FakeClaudeRunner(script);
  const fetch = createSafeFetch({ allowlist: [{ kind: 'cidr', cidr: '127.0.0.1/32' }], maxBytes: 1e6, timeoutMs: 3000 });
  const events: RunEvent[] = [];
  const bus = new RunEventBus();
  bus.on((e) => events.push(e));
  const secrets = new SecretsStore({ dataDir: t.dir, env: { nvdApiKey: 'NVDSECRET123', anthropicApiKey: 'sk-ant-SECRETKEY' } });
  const deps: PipelineDeps = {
    db: repos, runner, fetch, bus, secrets, clock: new FakeClock(NOW),
    notifier: Object.assign(new NtfyNotifier(fetch), opts.notifier ?? {}),
    settings: () => ({ ntfyServer: 'http://127.0.0.1:1', ntfyTopic: '', publicUrl: '' } as Settings),
    config: { deferMinutes: 60, publicUrl: null } as Config,
    logger: { error: () => {} } as never,
  };
  const go = (signal = new AbortController().signal) => {
    const run = repos.runs.create(feed.id, 'manual', NOW);
    return executeRun(run.id, deps, signal).then((status) => ({ status, run: repos.runs.get(run.id)!, id: run.id }));
  };
  return { repos, runner, deps, feed, go, events };
}

describe('executeRun', () => {
  it('second run on same fixture: no new item, no runner call, no notification', async () => {
    let sent = 0;
    const s = setup(undefined, { notify: true, notifier: { notifyRun: async () => { sent++; return { sent: 1, failed: 0 }; } } });
    const r1 = await s.go();
    expect(r1.status).toBe('succeeded');
    expect(r1.run.keptCount).toBe(1);
    expect(r1.run.digestId).toBeTruthy();
    expect(r1.run.steps.map((x) => x.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(sent).toBe(1);
    const calls = s.runner.calls.length;
    const r2 = await s.go();
    expect(r2.status).toBe('succeeded');
    expect(r2.run.noNews).toBe(true);
    expect(r2.run.newCount).toBe(0);
    expect(r2.run.digestId).toBeNull();
    expect(s.runner.calls.length).toBe(calls);
    expect(sent).toBe(1);
    expect(s.repos.feeds.get(s.feed.id)!.lastRunAt).toBeTruthy();
    expect(s.events.some((e) => e.type === 'run.usage')).toBe(true);
    expect(r1.run.usage.costUsd).toBeGreaterThan(0);
  });

  it('a discarded item stays seen and is not resubmitted', async () => {
    const out = {
      items: [{ ref: 'i1', keep: false, priority: 'low', justification: 'no', summary: 'no', sources: [] }],
      digest: { title: 't', lede: 'l', sections: [{ heading: 'h', itemRefs: [], body: 'b' }] },
    };
    const s = setup([{ kind: 'raw', text: JSON.stringify(out) }]);
    const r1 = await s.go();
    expect(r1.status).toBe('succeeded');
    expect(r1.run.keptCount).toBe(0);
    expect(r1.run.digestId).toBeNull();
    const calls = s.runner.calls.length;
    const r2 = await s.go();
    expect(r2.run.newCount).toBe(0);
    expect(s.runner.calls.length).toBe(calls);
  });

  it.each(['usage_limit', 'unauthenticated', 'overloaded'] as const)('%s defers with capped backoff', async (kind) => {
    const s = setup([{ kind: 'error', error: kind }]);
    const r = await s.go();
    expect(r.status).toBe('deferred');
    expect(r.run.errorCode).toBe(`claude_${kind}`);
    const f = () => s.repos.feeds.get(s.feed.id)!;
    expect(Date.parse(f().nextRunAt!)).toBe(NOW + 60 * 60_000);
    expect(s.repos.seen.filterUnseen(s.feed.id, ['x']).size).toBe(1);
    // many deferrals: capped at 6 h
    for (let i = 0; i < 5; i++) {
      s.runner['script'] = [{ kind: 'error', error: kind }];
      await s.go();
    }
    expect(Date.parse(f().nextRunAt!)).toBe(NOW + 360 * 60_000);
  });

  it('budget exceeded yields a partial digest', async () => {
    bigCount = 50;
    const s = setup([{ kind: 'valid', costUsd: 1 }]);
    const r = await s.go();
    expect(r.status).toBe('budget_exceeded');
    expect(r.run.errorCode).toBe('budget_exceeded');
    const d = s.repos.digests.get(r.run.digestId!)!;
    expect(d.partial).toBe(true);
    expect(d.items.length).toBe(40);
  });

  it('ntfy failure does not fail the run', async () => {
    const s = setup(undefined, { notify: true, notifier: { notifyRun: async () => ({ sent: 0, failed: 1 }) } });
    const r = await s.go();
    expect(r.status).toBe('succeeded');
    expect(r.run.steps.find((x) => x.step === 'notify')!.state).toBe('error');
    expect(s.repos.runs.logs(r.id).some((l) => l.level === 'error' && l.step === 'notify')).toBe(true);
  });

  it('logs contain no secret nor raw exception message', async () => {
    const s = setup();
    s.deps.runner = { run: async () => { throw new Error('boom sk-ant-SECRETKEY NVDSECRET123 /etc/passwd'); } };
    const r = await s.go();
    expect(r.status).toBe('failed');
    expect(r.run.errorCode).toBe('internal_error');
    const all = JSON.stringify(s.repos.runs.logs(r.id));
    expect(all).not.toMatch(/SECRETKEY|NVDSECRET|boom|passwd/);
  });

  it('fails with fetch_failed when every source errors', async () => {
    const s = setup(undefined, { urls: [`${base}/nope`] });
    const r = await s.go();
    expect(r.status).toBe('failed');
    expect(r.run.errorCode).toBe('fetch_failed');
  });

  it('abort signal yields cancelled', async () => {
    const s = setup([{ kind: 'delay', ms: 5000 }]);
    const ac = new AbortController();
    const p = s.go(ac.signal);
    setTimeout(() => ac.abort(), 200);
    const r = await p;
    expect(r.status).toBe('cancelled');
    expect(r.run.status).toBe('cancelled');
  });
});
