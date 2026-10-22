import { readFileSync, rmSync } from 'node:fs';
import { STATE_FILE } from './global-setup.js';

export default async function globalTeardown(): Promise<void> {
  const { pid, dataDir } = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { pid: number; dataDir: string };
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    try { process.kill(pid, 0); } catch { break; }
    await new Promise((r) => setTimeout(r, 100));
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  const rss = (globalThis as { __pfluxRss?: { close(): void } }).__pfluxRss;
  rss?.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(STATE_FILE, { force: true });
}
