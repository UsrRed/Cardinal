import { Link } from 'react-router-dom';
import type { Item, Page, Priority } from '../../../src/shared/types.js';
import { formatDateTime } from '../lib/dates.js';
import { Pagination } from './Pagination.js';
import { PriorityBadge } from './PriorityBadge.js';
import { SegFilter } from './SegFilter.js';
import { Empty, ErrorState, Loading } from './States.js';

export type PrioFilter = Priority | 'all';
export type ReadFilter = 'all' | 'unread' | 'read';

export const PRIO_OPTIONS: { value: PrioFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' }, { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' }, { value: 'low', label: 'Basse' },
];
export const READ_OPTIONS: { value: ReadFilter; label: string }[] = [
  { value: 'all', label: 'Tous' }, { value: 'unread', label: 'Non lus' }, { value: 'read', label: 'Lus' },
];

export function itemsQuery(o: { feedId?: string; priority: PrioFilter; read: ReadFilter; page: number }): string {
  const q = new URLSearchParams();
  if (o.feedId) q.set('feedId', o.feedId);
  if (o.priority !== 'all') q.set('priority', o.priority);
  if (o.read !== 'all') q.set('read', o.read === 'read' ? 'true' : 'false');
  q.set('page', String(o.page)); q.set('pageSize', '30');
  return q.toString();
}

export function ItemFilters({ priority, read, onPriority, onRead, onMarkAll, busy }: {
  priority: PrioFilter; read: ReadFilter; onPriority: (v: PrioFilter) => void; onRead: (v: ReadFilter) => void;
  onMarkAll: () => void; busy?: boolean;
}) {
  return (
    <div className="filters">
      <label>Priorité</label>
      <SegFilter label="Filtrer par priorité" options={PRIO_OPTIONS} value={priority} onChange={onPriority} />
      <label>Lecture</label>
      <SegFilter label="Filtrer par lecture" options={READ_OPTIONS} value={read} onChange={onRead} />
      <span className="sp" />
      <button type="button" className="btn sm" disabled={busy} onClick={onMarkAll}>Tout marquer lu</button>
    </div>
  );
}

export interface ItemWireProps {
  loading: boolean; error: unknown; items: Page<Item> | null;
  onRetry: () => void; onPage: (p: number) => void; onToggleRead: (i: Item) => void; showFeed?: boolean;
}

export function ItemWire({ loading, error, items, onRetry, onPage, onToggleRead }: ItemWireProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !items) return <Loading />;
  if (items.items.length === 0) return <Empty title="Aucun élément">Aucun élément ne correspond à ces filtres.</Empty>;
  return (
    <>
      <ul className="wire">
        {items.items.map((it) => (
          <li key={it.id} className={it.read ? 'isread' : undefined}>
            <span className={it.read ? 'r' : 'u'} aria-label={it.read ? 'Lu' : 'Non lu'} />
            <PriorityBadge priority={it.priority} />
            <div>
              <Link className="t" to={`/digests/${it.digestId}`}>{it.title}</Link>
              <div className="m">{formatDateTime(it.createdAt)}</div>
            </div>
            <button type="button" className="readbtn" onClick={() => onToggleRead(it)}>
              {it.read ? 'Marquer non lu' : 'Marquer lu'}
            </button>
          </li>
        ))}
      </ul>
      <Pagination page={items.page} pageSize={items.pageSize} total={items.total} onPage={onPage} />
    </>
  );
}
