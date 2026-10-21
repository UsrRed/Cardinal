import type { Run } from '../../../src/shared/types.js';

export const fmtUsd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
export const fmtInt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

export function StatsBar({ run, budgetUsd }: { run: Run; budgetUsd?: number | null }) {
  const pct = budgetUsd ? Math.min(100, (run.usage.costUsd / budgetUsd) * 100) : null;
  return (
    <dl className="stats">
      <div><dt>Tokens entrée</dt><dd>{fmtInt(run.usage.inputTokens)}</dd></div>
      <div><dt>Tokens sortie</dt><dd>{fmtInt(run.usage.outputTokens)}</dd></div>
      <div>
        <dt>Coût</dt>
        <dd>{fmtUsd(run.usage.costUsd)}{budgetUsd ? <small> / {fmtUsd(budgetUsd)}</small> : null}</dd>
        {pct !== null && <div className="gauge" role="meter" aria-label="Budget consommé" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${pct}%` }} /></div>}
      </div>
      <div><dt>Éléments</dt><dd>{run.keptCount}<small> retenus / {run.newCount} nouveaux / {run.fetchedCount}</small></dd></div>
    </dl>
  );
}
