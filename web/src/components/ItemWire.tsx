import { Link } from 'react-router-dom';
import type { Item, Page, Priority } from '../../../src/shared/types.js';
import { formatDateTime } from '../lib/dates.js';
import { Pagination } from './Pagination.js';
import { PriorityBadge } from './PriorityBadge.js';
import { SafeText } from './SafeText.js';
import { SegFilter } from './SegFilter.js';
import { Empty, ErrorState, Loading } from './States.js';

export type PrioFilter = Priority | 'all';
export type ReadFilter = 'all' | 'unread' | 'read';

export const PRIO_OPTIONS: { value: PrioFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' }, { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' }, { value: 'low', label: 'Basse' },
];
export type WireView = 'list' | 'cards';
export const VIEW_OPTIONS: { value: WireView; label: string }[] = [
  { value: 'list', label: 'Liste' }, { value: 'cards', label: 'Détaillée' },
];
const VIEW_KEY = 'pflux-wire-view';
export function loadWireView(): WireView {
  try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'; } catch { return 'list'; }
}
export function saveWireView(v: WireView): void {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
}

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

export function ItemFilters({ priority, read, onPriority, onRead, onMarkAll, busy, view, onView }: {
  priority: PrioFilter; read: ReadFilter; onPriority: (v: PrioFilter) => void; onRead: (v: ReadFilter) => void;
  onMarkAll: () => void; busy?: boolean; view?: WireView; onView?: (v: WireView) => void;
}) {
  return (
    <div className="filters">
      {view && onView && (
        <>
          <label>Vue</label>
          <SegFilter label="Vue du fil" options={VIEW_OPTIONS} value={view} onChange={onView} />
        </>
      )}
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
  view?: WireView; feedNames?: Record<string, string>;
}

/** http(s) only; anything else is not linked. */
function externalHref(u: string | null): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null;
  } catch { return null; }
}

function ItemCards({ items, onToggleRead, feedNames }: { items: Item[]; onToggleRead: (i: Item) => void; feedNames?: Record<string, string> }) {
  return (
    <ul className="icards">
      {items.map((it) => {
        const href = externalHref(it.url);
        return (
          <li key={it.id} className={`icard ic-${it.priority}${it.read ? ' isread' : ''}`}>
            <div className="icard-head">
              <span className={it.read ? 'r' : 'u'} aria-label={it.read ? 'Lu' : 'Non lu'} />
              <PriorityBadge priority={it.priority} />
              <span className="sp" />
              {feedNames?.[it.feedId] && <span className="icard-feed">{feedNames[it.feedId]}</span>}
            </div>
            <Link className="t" to={`/digests/${it.digestId}`}>{it.title}</Link>
            <SafeText className="icard-sum" text={it.summary} />
            <div className="icard-foot">
              <span className="m">{formatDateTime(it.createdAt)}</span>
              <span className="sp" />
              {href && <a className="btn sm" href={href} target="_blank" rel="noopener noreferrer">Article ↗</a>}
              <button type="button" className="readbtn" onClick={() => onToggleRead(it)}>
                {it.read ? 'Marquer non lu' : 'Marquer lu'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ItemWire({ loading, error, items, onRetry, onPage, onToggleRead, view = 'list', feedNames }: ItemWireProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !items) return <Loading />;
  if (items.items.length === 0) return <Empty title="Aucun élément">Aucun élément ne correspond à ces filtres.</Empty>;
  if (view === 'cards') {
    return (
      <>
        <ItemCards items={items.items} onToggleRead={onToggleRead} feedNames={feedNames} />
        <Pagination page={items.page} pageSize={items.pageSize} total={items.total} onPage={onPage} />
      </>
    );
  }
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
