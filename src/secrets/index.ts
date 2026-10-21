import { chmodSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECRET_NAMES, type SecretName } from '../shared/schemas.js';
import type { SecretState } from '../shared/types.js';

type Stored = Partial<Record<SecretName, string>>;

export class SecretsStore {
  private readonly file: string;
  private readonly dataDir: string;
  private readonly env: Partial<Record<SecretName, string | null>>;

  constructor(o: { dataDir: string; env: Partial<Record<SecretName, string | null>> }) {
    this.dataDir = o.dataDir;
    this.env = o.env;
    this.file = join(o.dataDir, 'secrets.json');
  }

  private read(): Stored {
    if (!existsSync(this.file)) return {};
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
      const out: Stored = {};
      for (const n of SECRET_NAMES) if (typeof raw[n] === 'string' && raw[n]) out[n] = raw[n] as string;
      return out;
    } catch {
      return {};
    }
  }

  private write(data: Stored): void {
    const dir = mkdtempSync(join(this.dataDir, '.secrets-'));
    try {
      const tmp = join(dir, 'secrets.json');
      writeFileSync(tmp, JSON.stringify({ version: 1, ...data }), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, this.file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  get(name: SecretName): string | null {
    return this.env[name] || this.read()[name] || null;
  }

  state(name: SecretName): SecretState {
    if (this.env[name]) return { configured: true, source: 'env' };
    if (this.read()[name]) return { configured: true, source: 'ui' };
    return { configured: false, source: null };
  }

  set(name: SecretName, value: string): void {
    this.write({ ...this.read(), [name]: value });
  }

  clear(name: SecretName): void {
    const data = this.read();
    delete data[name];
    this.write(data);
  }
}
