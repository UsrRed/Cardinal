import type { Settings } from '../../shared/types.js';
import type { Db } from '../index.js';

export interface SettingsRepo {
  getAll(): Partial<Settings>;
  set(patch: Partial<Settings>): void;
}

export function createSettingsRepo(db: Db): SettingsRepo {
  return {
    getAll() {
      const out: Record<string, unknown> = {};
      for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) {
        out[r.key] = JSON.parse(r.value);
      }
      return out as Partial<Settings>;
    },
    set(patch) {
      const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      db.transaction(() => {
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) up.run(k, JSON.stringify(v));
      })();
    },
  };
}
