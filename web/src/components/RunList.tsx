import { Link } from 'react-router-dom';
import type { Run } from '../../../src/shared/types.js';
import { formatDateTime } from '../lib/dates.js';
import { StatusStamp } from './StatusStamp.js';
import { fmtInt, fmtUsd } from './StatsBar.js';

export function RunList({ runs }: { runs: Run[] }) {
  return (
    <table className="runs">
      <thead><tr><th>Date</th><th>Flux</th><th>Statut</th><th>Retenus</th><th>Tokens</th><th>Coût</th></tr></thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td><Link to={`/runs/${r.id}`}>{formatDateTime(r.queuedAt)}</Link></td>
            <td>{r.feedName}</td>
            <td><StatusStamp status={r.status} /></td>
            <td>{r.keptCount}</td>
            <td>{fmtInt(r.usage.inputTokens + r.usage.outputTokens)}</td>
            <td>{fmtUsd(r.usage.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
