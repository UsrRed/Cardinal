import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('delivery artefacts', () => {
  it('workflow example is safe and pinned', () => {
    const y = read('docs/ci/workflow.example.yml');
    expect(y).not.toMatch(/pull_request_target/);
    expect(y).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(y).not.toMatch(/\t/);
    const uses = [...y.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
    expect(y).toMatch(/npm ci/);
    expect(y).toMatch(/docker build/);
    expect(existsSync('.github/workflows')).toBe(false);
  });

  it('compose is hardened', () => {
    const c = read('docker-compose.yml');
    expect(c).toMatch(/read_only: true/);
    expect(c).toMatch(/cap_drop:\s*\n\s+- ALL/);
    expect(c).toMatch(/no-new-privileges/);
    expect(c).toMatch(/"127\.0\.0\.1:8787:8787"/);
    expect(c).not.toMatch(/docker\.sock/);
  });

  it('Dockerfile pins image and runs non-root', () => {
    const d = read('Dockerfile');
    expect(d).toMatch(/node:22-bookworm-slim@sha256:[0-9a-f]{64}/);
    expect(d).toMatch(/USER 10001/);
    expect(d).toMatch(/HEALTHCHECK[\s\S]*dist\/healthcheck\.js/);
  });

  it('every PFLUX_* variable of the config is documented', () => {
    const vars = new Set(read('src/config/index.ts').match(/PFLUX_[A-Z_]+/g));
    const env = read('.env.example');
    const readme = read('README.md');
    for (const v of vars) {
      expect(env, v).toContain(v);
      expect(readme, v).toContain(v);
    }
  });
});
