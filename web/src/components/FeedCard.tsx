import { Link } from 'react-router-dom';
import type { FeedSummary } from '../../../src/shared/types.js';
import { formatDateTime } from '../lib/dates.js';
import { MiniTape } from './MiniTape.js';
import { SourceStamp } from './SourceStamp.js';
import { StatusStamp } from './StatusStamp.js';

export interface FeedCardActions {
  onToggle: (f: FeedSummary) => void;
  onDuplicate: (f: FeedSummary) => void;
  onDelete: (f: FeedSummary) => void;
  onRun: (f: FeedSummary) => void;
}

export function FeedCard({ feed, busy, actions }: { feed: FeedSummary; busy?: boolean; actions: FeedCardActions }) {
  const active = feed.activeRunId !== null;
  return (
    <article className={`feed${feed.enabled ? '' : ' paused'}`}>
      <div className="unread"><b>{feed.unreadCount}</b><small>non lus</small></div>
      <div className="feed-top">
        <SourceStamp type={feed.sourceType} />
        <StatusStamp status={feed.enabled ? (feed.lastRunStatus ?? 'queued') : 'paused'} />
        {!feed.enabled && <span className="sr-only">Flux en pause</span>}
      </div>
      <h3>{feed.name}</h3>
      <p className="instr">{feed.instructions}</p>
      <dl className="meta">
        <div><dt>Dernier run</dt><dd>{formatDateTime(feed.lastRunAt)}</dd></div>
        <div><dt>Prochain</dt><dd>{feed.enabled ? formatDateTime(feed.nextRunAt) : '—'}</dd></div>
        <div><dt>Fréquence</dt><dd>{feed.frequencyHours} h</dd></div>
      </dl>
      <MiniTape active={active} done={feed.lastRunStatus === 'succeeded'} />
      <div className="foot">
        <button type="button" className="btn sm primary" disabled={busy || active} onClick={() => actions.onRun(feed)}>Lancer maintenant</button>
        <button type="button" className="btn sm" disabled={busy} onClick={() => actions.onToggle(feed)}>{feed.enabled ? 'Mettre en pause' : 'Reprendre'}</button>
        <Link className="btn sm ghost" to={`/feeds/${feed.id}/edit`}>Modifier</Link>
        <span className="sp" />
        <button type="button" className="btn sm ghost" disabled={busy} onClick={() => actions.onDuplicate(feed)}>Dupliquer</button>
        <button type="button" className="btn sm danger" disabled={busy} onClick={() => actions.onDelete(feed)}>Supprimer</button>
      </div>
    </article>
  );
}
