import { useState } from 'react';
import type { Page, Run } from '../../../src/shared/types.js';
import { get } from '../api/client.js';
import { Masthead } from '../components/Masthead.js';
import { Pagination } from '../components/Pagination.js';
import { RunList } from '../components/RunList.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';

export interface RunsViewProps {
  loading: boolean; error: unknown; runs: Page<Run> | null;
  onRetry: () => void; onPage: (p: number) => void;
}

export function RunsView({ loading, error, runs, onRetry, onPage }: RunsViewProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !runs) return <Loading />;
  if (runs.total === 0) return <Empty title="Aucun run">Lancez un flux pour voir son historique ici.</Empty>;
  return (
    <>
      <RunList runs={runs.items} />
      <Pagination page={runs.page} pageSize={runs.pageSize} total={runs.total} onPage={onPage} />
    </>
  );
}

export function RunsPage() {
  const [page, setPage] = useState(1);
  const runs = useAsync(() => get<Page<Run>>(`/api/runs?page=${page}&pageSize=20`), [page]);
  return (
    <>
      <Masthead title="Runs" />
      <RunsView loading={runs.loading} error={runs.error} runs={runs.data}
        onRetry={runs.reload} onPage={setPage} />
    </>
  );
}
