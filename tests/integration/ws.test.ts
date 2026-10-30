import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { LoginConsole } from '../../src/console/loginConsole.js';
import { FakeClock } from '../../src/shared/clock.js';
import { buildTestApp } from '../helpers/buildTestApp.js';

let closer: (() => Promise<void>) | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
});

function fakePty() {
  const calls: Array<{ bin: string; args: string[]; env: Record<string, string> }> = [];
  let dataCb: (d: string) => void = () => {};
  let exitCb: (e: { exitCode: number }) => void = () => {};
  const state = { killed: false, written: [] as string[] };
  const spawnPty = ((bin: string, args: string[], opts: { env: Record<string, string> }) => {
    calls.push({ bin, args, env: opts.env });
    queueMicrotask(() => dataCb('hello from claude'));
    return {
      onData: (f: (d: string) => void) => (dataCb = f),
      onExit: (f: (e: { exitCode: number }) => void) => (exitCb = f),
      write: (d: string) => state.written.push(d),
      resize: () => {},
      kill: () => {
        state.killed = true;
        exitCb({ exitCode: 0 });
      },
    };
  }) as never;
  return { spawnPty, calls, state };
}

async function start(env: Record<string, string> = {}) {
  const t = await buildTestApp(env);
  closer = t.close;
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (t.app.server.address() as { port: number }).port;
  return { ...t, port };
}

function open(url: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(url, { headers });
  const msgs: unknown[] = [];
  ws.on('message', (m: unknown) => msgs.push(JSON.parse(String(m))));
  const opened = new Promise<void>((res, rej) => {
    ws.on('open', () => res());
    ws.on('unexpected-response', (_q: unknown, r: { statusCode: number }) => rej(Object.assign(new Error('rejected'), { status: r.statusCode })));
    ws.on('error', rej);
  });
  const closed = new Promise<number>((res) => ws.on('close', (c: number) => res(c)));
  return { ws, msgs, opened, closed };
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(f()).toBe(true);
};

describe('ws auth', () => {
  it('refuses without session when exposed, and foreign origin', async () => {
    const { port, deps } = await start({ PFLUX_EXPOSE: '1', PFLUX_PASSWORD: 'correct horse battery' });
    const a = open(`ws://127.0.0.1:${port}/api/ws/runs`);
    await expect(a.opened).rejects.toMatchObject({ status: 401 });
    const s = deps.sessions.create(true);
    const { signCookie, SESSION_COOKIE } = await import('../../src/auth/session.js');
    const cookie = `${SESSION_COOKIE}=${signCookie(s.id, deps.sessionSecret)}`;
    const b = open(`ws://127.0.0.1:${port}/api/ws/runs`, { cookie, origin: 'http://evil.example' });
    await expect(b.opened).rejects.toMatchObject({ status: 403 });
    const c = open(`ws://127.0.0.1:${port}/api/ws/runs`, { cookie, origin: `http://127.0.0.1:${port}` });
    await c.opened;
    c.ws.close();
  });
});

describe('ws runs', () => {
  it('relays bus events, filtered by runId', async () => {
    const { port, deps } = await start();
    const c = open(`ws://127.0.0.1:${port}/api/ws/runs?runId=r1`);
    await c.opened;
    deps.bus.emit({ type: 'run.step', runId: 'r2', step: 'fetch', state: 'running', detail: null });
    deps.bus.emit({ type: 'run.status', runId: 'r1', feedId: 'f', status: 'running', errorCode: null });
    await until(() => c.msgs.length >= 1);
    expect(c.msgs).toEqual([{ type: 'run.status', runId: 'r1', feedId: 'f', status: 'running', errorCode: null }]);
    c.ws.close();
  });
});

describe('ws console', () => {
  it('relays output, refuses a second console, scrubbed env', async () => {
    const p = fakePty();
    const t = await buildTestApp({ PFLUX_CLAUDE_BIN: '/fake/claude', SECRET_HOST_VAR: 'leak' });
    closer = t.close;
    (t.deps as { console: LoginConsole }).console = new LoginConsole({
      bin: '/fake/claude', home: t.dir, getApiKey: () => null, clock: t.deps.clock, spawnPty: p.spawnPty,
    });
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (t.app.server.address() as { port: number }).port;
    const a = open(`ws://127.0.0.1:${port}/api/ws/console`);
    await a.opened;
    await until(() => a.msgs.length >= 1);
    expect(a.msgs[0]).toEqual({ type: 'output', data: 'hello from claude' });
    a.ws.send(JSON.stringify({ type: 'input', data: 'x' }));
    await until(() => p.state.written.length === 1);
    const b = open(`ws://127.0.0.1:${port}/api/ws/console`);
    await b.opened;
    expect(await b.closed).toBe(4409);
    expect(p.calls[0]!.args).toEqual(['/login']);
    expect(Object.keys(p.calls[0]!.env)).not.toContain('SECRET_HOST_VAR');
    expect(p.calls).toHaveLength(1);
    a.ws.close();
    await until(() => p.state.killed);
  });
});

describe('LoginConsole idle', () => {
  it('closes after 10 minutes of inactivity and allows reopening', () => {
    const clock = new FakeClock(0);
    const p = fakePty();
    const c = new LoginConsole({ bin: 'b', home: '/h', getApiKey: () => 'k', clock, spawnPty: p.spawnPty });
    const s = c.open(80, 24)!;
    let reason = '';
    s.onClose((r) => (reason = r));
    clock.advance(9 * 60_000);
    s.write('a');
    clock.advance(9 * 60_000);
    expect(p.state.killed).toBe(false);
    clock.advance(60_000 + 1);
    expect(reason).toBe('idle');
    expect(p.state.killed).toBe(true);
    expect(p.calls[0]!.env).toMatchObject({ ANTHROPIC_API_KEY: 'k', HOME: '/h' });
    expect(c.open(80, 24)).not.toBeNull();
  });
});
