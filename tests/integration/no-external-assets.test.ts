import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIST = join(process.cwd(), 'dist', 'web');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('built web bundle', () => {
  beforeAll(() => {
    if (!existsSync(join(DIST, 'index.html'))) execSync('npx vite build', { stdio: 'ignore' });
  }, 120_000);

  it('loads no external resources', () => {
    const files = walk(DIST);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of files) {
      if (!/\.(html|js|css)$/.test(f)) continue;
      const t = readFileSync(f, 'utf8');
      const pats: RegExp[] = [
        /\b(?:src|href)\s*=\s*["']?https?:\/\//gi,
        /url\(\s*["']?(?:https?:)?\/\//gi,
        /@import\s+(?:url\()?["']?https?:\/\//gi,
        /\bimport\s*\(?\s*["']https?:\/\//g,
        /\bfrom\s*["']https?:\/\//g,
      ];
      for (const re of pats) if (re.test(t)) offenders.push(`${f}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
