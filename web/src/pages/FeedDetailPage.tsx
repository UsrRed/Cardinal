import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DigestSummary, FeedSummary, Item, Page, Run } from '../../../src/shared/types.js';
import { get, post } from '../api/client.js';
import {
  ItemFilters, ItemWire, itemsQuery, loadWireView, saveWireView, type PrioFilter, type ReadFilter, type WireView,
} from '../components/ItemWire.js';
import { Masthead } from '../components/Masthead.js';
import { Pagination } from '../components/Pagination.js';
import { RunList } from '../components/RunList.js';
import { SegFilter } from '../components/SegFilter.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatDateTime } from '../lib/dates.js';

export type Tab = 'stream' | 'digests' | 'runs';
const TABS: { value: Tab; label: string }[] = [
  { value: 'stream', label: 'Fil' }, { value: 'digests', label: 'Digests' }, { value: 'runs', label: 'Runs' },
];

export function DigestList({ loading, error, digests, onRetry, onPage }: {
  loading: boolean; error: unknown; digests: Page<DigestSummary> | null; onRetry: () => void; onPage: (p: number) => void;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !digests) return <Loading />;
  if (digests.total === 0) return <Empty title="Aucun digest">Les digests apparaîtront après le premier run réussi.</Empty>;
  return (
    <>
      <ul className="wire">
        {digests.items.map((d) => (
          <li key={d.id}>
            <span className={d.highCount > 0 ? 'u' : 'r'} aria-hidden="true" />
            <span className="m">{formatDateTime(d.createdAt)}</span>
            <div>
              <Link className="t" to={`/digests/${d.id}`}>{d.title}</Link>
              <div className="m">{d.itemCount} élément(s) · {d.highCount} haute(s)</div>
            </div>
            <span />
          </li>
        ))}
      </ul>
      <Pagination page={digests.page} pageSize={digests.pageSize} total={digests.total} onPage={onPage} />
    </>
  );
}

export function RunsTab({ loading, error, runs, onRetry, onPage }: {
  loading: boolean; error: unknown; runs: Page<Run> | null; onRetry: () => void; onPage: (p: number) => void;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !runs) return <Loading />;
  if (runs.total === 0) return <Empty title="Aucun run">Ce flux n’a pas encore été exécuté.</Empty>;
  return (<><RunList runs={runs.items} /><Pagination page={runs.page} pageSize={runs.pageSize} total={runs.total} onPage={onPage} /></>);
}

export function FeedDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('stream');
  const [priority, setPriority] = useState<PrioFilter>('all');
  const [read, setRead] = useState<ReadFilter>('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<WireView>(loadWireView);
  const feed = useAsync(() => get<FeedSummary>(`/api/feeds/${id}`), [id]);
  const items = useAsync(() => tab === 'stream'
    ? get<Page<Item>>(`/api/items?${itemsQuery({ feedId: id, priority, read, page })}`) : Promise.resolve(null),
  [id, tab, priority, read, page]);
  const digests = useAsync(() => tab === 'digests'
    ? get<Page<DigestSummary>>(`/api/feeds/${id}/digests?page=${page}&pageSize=20`) : Promise.resolve(null), [id, tab, page]);
  const runs = useAsync(() => tab === 'runs'
    ? get<Page<Run>>(`/api/runs?feedId=${id}&page=${page}&pageSize=20`) : Promise.resolve(null), [id, tab, page]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); items.reload(); feed.reload(); } finally { setBusy(false); }
  };
  if (feed.error) {
    return (<><Masthead title="Flux" /><ErrorState error={feed.error} onRetry={feed.reload} /></>);
  }
  const unread = feed.data?.unreadCount;
  return (
    <>
      <Masthead title={feed.data?.name ?? 'Flux'}
        meta={unread === undefined ? [] : [`${unread} non lu(s)`]}
        actions={<Link className="btn sm" to={`/feeds/${id}/edit`}>Modifier</Link>} />
      <div className="filters">
        <SegFilter label="Section" options={TABS} value={tab} onChange={(t) => { setTab(t); setPage(1); }} />
      </div>
      {tab === 'stream' && (
        <>
          <ItemFilters priority={priority} read={read} busy={busy}
            view={view} onView={(v) => { setView(v); saveWireView(v); }}
            onPriority={(v) => { setPriority(v); setPage(1); }} onRead={(v) => { setRead(v); setPage(1); }}
            onMarkAll={() => void act(() => post(`/api/feeds/${id}/items/read-all`))} />
          <ItemWire loading={items.loading} error={items.error} items={items.data} onRetry={items.reload} onPage={setPage} view={view}
            onToggleRead={(i) => void act(() => post(`/api/items/${i.id}/read`, { read: !i.read }))} />
        </>
      )}
      {tab === 'digests' && <DigestList loading={digests.loading} error={digests.error} digests={digests.data} onRetry={digests.reload} onPage={setPage} />}
      {tab === 'runs' && <RunsTab loading={runs.loading} error={runs.error} runs={runs.data} onRetry={runs.reload} onPage={setPage} />}
    </>
  );
}
