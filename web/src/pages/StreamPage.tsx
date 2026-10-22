import { useState } from 'react';
import type { Item, Page } from '../../../src/shared/types.js';
import { get, post } from '../api/client.js';
import { ItemFilters, ItemWire, itemsQuery, type PrioFilter, type ReadFilter } from '../components/ItemWire.js';
import { Masthead } from '../components/Masthead.js';
import { useAsync } from '../hooks/useAsync.js';

export function StreamPage() {
  const [priority, setPriority] = useState<PrioFilter>('all');
  const [read, setRead] = useState<ReadFilter>('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(
    () => get<Page<Item>>(`/api/items?${itemsQuery({ priority, read, page })}`), [priority, read, page]);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); reload(); } finally { setBusy(false); } };
  return (
    <>
      <Masthead title="Fil global" />
      <ItemFilters priority={priority} read={read} busy={busy}
        onPriority={(v) => { setPriority(v); setPage(1); }} onRead={(v) => { setRead(v); setPage(1); }}
        onMarkAll={() => void act(() => post('/api/items/read-all', priority === 'all' ? {} : { priority }))} />
      <ItemWire loading={loading} error={error} items={data} onRetry={reload} onPage={setPage}
        onToggleRead={(i) => void act(() => post(`/api/items/${i.id}/read`, { read: !i.read }))} />
    </>
  );
}
