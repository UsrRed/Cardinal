import type { FeedsRepo } from './feeds.js';
import type { RunsRepo } from './runs.js';
import type { DigestsRepo } from './digests.js';
import type { ItemsRepo } from './items.js';
import type { SeenRepo } from './seen.js';
import type { SettingsRepo } from './settings.js';
import type { DailyRepo } from './daily.js';

export interface Repos {
  feeds: FeedsRepo;
  runs: RunsRepo;
  digests: DigestsRepo;
  items: ItemsRepo;
  seen: SeenRepo;
  settings: SettingsRepo;
  daily: DailyRepo;
}
