import { Link, useParams } from 'react-router-dom';
import type { Digest, Item } from '../../../src/shared/types.js';
import { get } from '../api/client.js';
import { Masthead } from '../components/Masthead.js';
import { PriorityBadge } from '../components/PriorityBadge.js';
import { SafeText } from '../components/SafeText.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatLongDate, getTimezone } from '../lib/dates.js';

const CLS = { high: '', medium: ' med', low: ' low' } as const;

/** Only http(s) URLs become links; anything else is shown as plain text. */
export function safeHref(u: string): string | null {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null;
  } catch { return null; }
}

function SourceLink({ url }: { url: string }) {
  const href = safeHref(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{url}</a> : <>{url}</>;
}

function ItemBlock({ item, onToggleRead }: { item: Item; onToggleRead?: (i: Item) => void }) {
  const urls = [...new Set([...(item.url ? [item.url] : []), ...item.sources])];
  return (
    <article className={`item${CLS[item.priority]}${item.read ? ' read' : ''}`} id={item.ref}>
      <div className="item-head">
        <PriorityBadge priority={item.priority} />
        <span className="sp" />
        {onToggleRead && (
          <button type="button" className={`readbtn${item.read ? ' done' : ''}`} onClick={() => onToggleRead(item)}>
            {item.read ? '✓ Lu' : 'Marquer lu'}
          </button>
        )}
      </div>
      <h3>{item.title}</h3>
      {item.justification && <p className="why"><b>Pourquoi</b>{item.justification}</p>}
      <SafeText className="sum" text={item.summary} />
      {urls.length > 0 && (
        <dl className="sources">
          <dt>Sources</dt>
          {urls.map((u) => <dd key={u}><SourceLink url={u} /></dd>)}
        </dl>
      )}
    </article>
  );
}

export function DigestView({ loading, error, digest, onRetry, onToggleRead }: {
  loading: boolean; error: unknown; digest: Digest | null; onRetry: () => void; onToggleRead?: (i: Item) => void;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !digest) return <Loading />;
  const byRef = new Map(digest.items.map((i) => [i.ref, i]));
  const shown = new Set<string>();
  const sections = digest.sections.map((s) => {
    const items = s.itemRefs.map((r) => byRef.get(r)).filter((i): i is Item => !!i);
    items.forEach((i) => shown.add(i.ref));
    return { ...s, items };
  });
  const orphans = digest.items.filter((i) => !shown.has(i.ref));
  return (
    <>
      <div className="readbar">
        <Link to={`/feeds/${digest.feedId}`}>← {digest.feedName}</Link>
        <span className="sp" />
        <a className="btn sm" href={`/api/digests/${digest.id}/export.md`} download>Exporter Markdown</a>
        <a className="btn sm" href={`/api/digests/${digest.id}/export.json`} download>Exporter JSON</a>
      </div>
      <div className="article">
        <div className="kicker">{digest.feedName}{digest.partial ? ' · partiel (budget dépassé)' : ''}</div>
        <h1>{digest.title}</h1>
        <div className="byline"><b>{formatLongDate(digest.createdAt)}</b> · {getTimezone()} · {digest.items.length} élément(s)</div>
        <SafeText className="lede" text={digest.lede} />
        {sections.map((s, i) => (
          <section key={i}>
            <h2>{s.heading}<span>{s.items.length}</span></h2>
            <SafeText className="sbody" text={s.body} />
            {s.items.map((it) => <ItemBlock key={it.id} item={it} onToggleRead={onToggleRead} />)}
          </section>
        ))}
        {orphans.length > 0 && (
          <section>
            <h2>Autres éléments<span>{orphans.length}</span></h2>
            {orphans.map((it) => <ItemBlock key={it.id} item={it} onToggleRead={onToggleRead} />)}
          </section>
        )}
        {digest.items.length === 0 && <Empty title="Aucun élément">Ce digest ne contient aucun élément.</Empty>}
      </div>
    </>
  );
}

export function DigestPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(() => get<Digest>(`/api/digests/${id}`), [id]);
  return (
    <>
      <Masthead title="Digest" />
      <DigestView loading={loading} error={error} digest={data} onRetry={reload} />
    </>
  );
}
