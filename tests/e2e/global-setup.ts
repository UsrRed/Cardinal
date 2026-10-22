import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const APP_PORT = 8799;
export const RSS_PORT = 8798;
export const STATE_FILE = join(tmpdir(), 'pflux-e2e-state.json');

async function waitHealthy(url: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server not healthy: ${url}`);
}

export default async function globalSetup(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pflux-e2e-'));
  const template = readFileSync('tests/fixtures/e2e-rss.xml', 'utf8');
  const rss = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(template.replaceAll('{{NOW}}', new Date().toUTCString()));
  });
  await new Promise<void>((r) => rss.listen(RSS_PORT, '127.0.0.1', r));

  const child = spawn('node', ['dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PFLUX_DATA_DIR: dataDir,
      PFLUX_PORT: String(APP_PORT),
      PFLUX_CLAUDE_RUNNER: 'fake',
      PFLUX_SSRF_ALLOWLIST: `127.0.0.1:${RSS_PORT}`,
      PFLUX_EXPOSE: '',
    },
    stdio: 'ignore',
  });
  writeFileSync(STATE_FILE, JSON.stringify({ pid: child.pid, dataDir }));
  (globalThis as { __pfluxRss?: unknown }).__pfluxRss = rss;
  await waitHealthy(`http://127.0.0.1:${APP_PORT}/healthz`, 15_000);
}
