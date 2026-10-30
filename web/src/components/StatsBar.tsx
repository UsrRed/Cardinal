import type { Run } from '../../../src/shared/types.js';

export function StatsBar({ run }: { run: Run }) {
  return (
    <dl className="stats">
      <div><dt>Récupérés</dt><dd>{run.fetchedCount}</dd></div>
      <div><dt>Nouveaux</dt><dd>{run.newCount}</dd></div>
      <div><dt>Retenus</dt><dd>{run.keptCount}</dd></div>
      <div><dt>Notifiés</dt><dd>{run.notifiedCount}</dd></div>
    </dl>
  );
}
