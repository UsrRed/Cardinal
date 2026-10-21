import { useState } from 'react';
import type { GlobalStats, Page, Run } from '../../../src/shared/types.js';
import { get } from '../api/client.js';
import { Masthead } from '../components/Masthead.js';
import { Pagination } from '../components/Pagination.js';
import { RunList } from '../components/RunList.js';
import { fmtInt, fmtUsd } from '../components/StatsBar.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';

export interface RunsViewProps {
  loading: boolean; error: unknown; runs: Page<Run> | null; stats: GlobalStats | null;
  onRetry: () => void; onPage: (p: number) => void;
}

export function RunsView({ loading, error, runs, stats, onRetry, onPage }: RunsViewProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !runs) return <Loading />;
  if (runs.total === 0) return <Empty title="Aucun run">Lancez un flux pour voir son historique ici.</Empty>;
  return (
    <>
      {stats && (
        <>
          <dl className="stats">
            <div><dt>Runs</dt><dd>{stats.runs}</dd></div>
            <div><dt>Tokens entrée</dt><dd>{fmtInt(stats.totals.inputTokens)}</dd></div>
            <div><dt>Tokens sortie</dt><dd>{fmtInt(stats.totals.outputTokens)}</dd></div>
            <div><dt>Coût cumulé</dt><dd>{fmtUsd(stats.totals.costUsd)}</dd></div>
          </dl>
          {stats.byFeed.length > 0 && (
            <table className="runs" aria-label="Coûts par flux">
              <thead><tr><th>Flux</th><th>Runs</th><th>Tokens</th><th>Coût</th></tr></thead>
              <tbody>
                {stats.byFeed.map((f) => (
                  <tr key={f.feedId}><td>{f.name}</td><td>{f.runs}</td><td>{fmtInt(f.usage.inputTokens + f.usage.outputTokens)}</td><td>{fmtUsd(f.usage.costUsd)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <RunList runs={runs.items} />
      <Pagination page={runs.page} pageSize={runs.pageSize} total={runs.total} onPage={onPage} />
    </>
  );
}

export function RunsPage() {
  const [page, setPage] = useState(1);
  const runs = useAsync(() => get<Page<Run>>(`/api/runs?page=${page}&pageSize=20`), [page]);
  const stats = useAsync(() => get<GlobalStats>('/api/stats'), []);
  return (
    <>
      <Masthead title="Runs" />
      <RunsView loading={runs.loading} error={runs.error} runs={runs.data} stats={stats.data}
        onRetry={runs.reload} onPage={setPage} />
    </>
  );
}
