import type { Settings } from '../../shared/types.js';

export interface SettingsRepo {
  getAll(): Partial<Settings>;
  set(patch: Partial<Settings>): void;
}
