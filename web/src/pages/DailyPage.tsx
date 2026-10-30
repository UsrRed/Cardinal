import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DailyItemRef, DailyView, Priority } from '../../../src/shared/types.js';
import { errorMessage, get, post } from '../api/client.js';
import { Masthead } from '../components/Masthead.js';
import { PriorityBadge } from '../components/PriorityBadge.js';
import { SafeText } from '../components/SafeText.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatDateTime, formatLongDate, getTimezone } from '../lib/dates.js';
import { safeHref } from './DigestPage.js';

const TIER_LABEL: Record<Priority, string> = { high: 'À retenir', medium: 'À surveiller', low: 'En bref' };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
/** Noon UTC keeps the calendar day stable whatever the display timezone. */
const dayIso = (day: string) => `${day}T12:00:00Z`;

function ItemLink({ item }: { item: DailyItemRef }) {
  const href = item.url ? safeHref(item.url) : null;
  return (
    <li>
      <PriorityBadge priority={item.priority} />
      <div>
        {href
          ? <a className="t" href={href} target="_blank" rel="noopener noreferrer">{item.title} ↗</a>
          : <span className="t">{item.title}</span>}
        <div className="m">{item.feedName} · <Link to={`/digests/${item.digestId}`}>digest</Link></div>
      </div>
    </li>
  );
}

export function DailySummaryView({ view }: { view: DailyView }) {
  const s = view.summary;
  if (!s || s.status !== 'succeeded') return null;
  return (
    <div className="article daily">
      <div className="kicker">Résumé journalier</div>
      <h1>{s.title}</h1>
      <div className="byline">
        <b>{formatLongDate(dayIso(s.day))}</b> · {getTimezone()} · {s.itemCount} élément(s) · généré {formatDateTime(s.finishedAt)}
      </div>
      <SafeText className="lede" text={s.overview} />
      {s.tiers.map((t) => (
        <section key={t.priority} className={`tier tier-${t.priority}`}>
          <h2>{TIER_LABEL[t.priority]}<span>{t.categories.reduce((n, c) => n + c.items.length, 0)}</span></h2>
          {t.categories.map((c, i) => (
            <div key={i} className="dcat">
              <h3>{c.name}</h3>
              <SafeText className="sbody" text={c.body} />
              {c.items.length > 0 && <ul className="dlinks">{c.items.map((it) => <ItemLink key={it.id} item={it} />)}</ul>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function DailyPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('day');
  const day = asked && DAY_RE.test(asked) ? asked : '';
  const { data, error, loading, reload } = useAsync(() => get<DailyView>(`/api/daily${day ? `?day=${day}` : ''}`), [day]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const running = data?.summary?.status === 'running';

  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [running, reload]);

  const go = (d: string) => setParams(data && d === data.today ? {} : { day: d });
  const generate = async () => {
    if (!data) return;
    setBusy(true); setActionError(null);
    try { await post(`/api/daily/${data.day}/generate`); reload(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); }
  };

  const s = data?.summary ?? null;
  const actions = data && (
    <>
      <button type="button" className="btn sm" onClick={() => go(shiftDay(data.day, -1))}>← Veille</button>
      <button type="button" className="btn sm" disabled={data.day >= data.today} onClick={() => go(shiftDay(data.day, 1))}>Lendemain →</button>
      <button type="button" className="btn sm primary" disabled={busy || running || data.itemCount === 0} onClick={() => void generate()}>
        {s ? 'Régénérer' : 'Générer'}
      </button>
    </>
  );
  return (
    <>
      <Masthead title="Résumé du jour" actions={actions}
        meta={data ? [formatLongDate(dayIso(data.day)), `${data.itemCount} élément(s)`, `${data.highCount} prioritaire(s)`] : []} />
      {actionError && <p className="note" role="alert">{actionError}</p>}
      {error ? <ErrorState error={error} onRetry={reload} />
        : loading && !data ? <Loading />
        : data && (
          <>
            {running && <><p className="note" role="status">Génération en cours : Claude lit les éléments de la journée…</p><Loading /></>}
            {s?.status === 'failed' && (
              <p className="note" role="alert">La dernière génération a échoué ({s.errorCode ?? 'erreur'}). Relancez-la avec « Régénérer ».</p>
            )}
            {s?.status === 'succeeded' && <DailySummaryView view={data} />}
            {!s && data.itemCount === 0 && <Empty title="Aucun élément ce jour">Les flux n’ont retenu aucun élément ce jour-là.</Empty>}
            {!s && data.itemCount > 0 && (
              <Empty title="Pas encore de résumé">
                {data.day === data.today
                  ? 'Le résumé de la veille est généré automatiquement chaque matin ; celui du jour se lance avec « Générer ».'
                  : 'Lancez la génération avec « Générer ».'}
              </Empty>
            )}
            {data.recent.length > 0 && (
              <div className="daily-recent">
                <label>Résumés récents</label>
                <div className="chips">
                  {data.recent.map((r) => (
                    <a key={r.day} href={`/daily?day=${r.day}`} className={r.day === data.day ? 'on' : undefined}
                      onClick={(e) => { e.preventDefault(); go(r.day); }}>
                      {r.day}{r.status === 'failed' ? ' ✕' : r.status === 'running' ? ' …' : ''}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
    </>
  );
}
