import type { Db } from './index.js';
import type { Config } from '../config/index.js';
import type { Clock } from '../shared/clock.js';
import type { FeedInput } from '../shared/schemas.js';
import { createFeedsRepo } from './repos/feeds.js';

export function seedIfEmpty(db: Db, cfg: Config, clock: Clock): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM feeds').get() as { n: number };
  if (n > 0) return;
  const base = {
    enabled: false, notify: false, notifyThreshold: 'high', ntfyServer: null, ntfyTopic: null,
    model: cfg.defaultModel, budgetUsd: cfg.defaultBudgetUsd, frequencyHours: 24, freshnessDays: 7,
  } as const;
  const feeds: FeedInput[] = [
    { ...base, name: 'Exemple — Actualités tech (RSS)', instructions: 'Résume les articles marquants sur le développement logiciel et l’IA ; priorise les annonces majeures.', sourceType: 'rss', sourceParams: { urls: ['https://hnrss.org/frontpage'] } },
    { ...base, name: 'Exemple — Vulnérabilités de dépendances (OSV)', instructions: 'Signale les vulnérabilités affectant ces paquets ; priorise celles exploitables à distance.', sourceType: 'osv', sourceParams: { packages: [{ name: 'express', ecosystem: 'npm' }] } },
    { ...base, name: 'Exemple — CVE (NVD)', instructions: 'Signale les CVE récentes liées à ces mots-clés ; priorise les sévérités élevées.', sourceType: 'nvd', sourceParams: { keywords: ['openssl'], minSeverity: 'HIGH' } },
  ];
  const repo = createFeedsRepo(db);
  const now = clock.now();
  db.transaction(() => {
    for (const f of feeds) repo.create(f, now);
  })();
}
