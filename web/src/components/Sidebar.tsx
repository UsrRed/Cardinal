import { NavLink } from 'react-router-dom';
import { Logo } from './Logo.js';

export interface SidebarFeed { id: string; name: string; unread: number; enabled: boolean; deferred?: boolean }
export interface SidebarProps {
  feedCount?: number; unreadTotal?: number; activeRuns?: number;
  feeds?: SidebarFeed[];
  footer?: { claude: string; queue: string; cumul: string };
}

const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined);

export function Sidebar({ feedCount, unreadTotal, activeRuns, feeds = [], footer }: SidebarProps) {
  return (
    <aside className="side">
      <div className="brand"><Logo size={34} /><span className="wordmark">Cardinal</span></div>
      <nav className="nav" aria-label="Navigation principale">
        <NavLink to="/" end className={link}>Flux {feedCount !== undefined && <span className="count mute">{feedCount}</span>}</NavLink>
        <NavLink to="/stream" className={link}>Fil {!!unreadTotal && <span className="count">{unreadTotal}</span>}</NavLink>
        <NavLink to="/daily" className={link}>Résumé</NavLink>
        <NavLink to="/runs" className={link}>Runs {!!activeRuns && <span className="count mute">{activeRuns}</span>}</NavLink>
        <NavLink to="/settings" className={link}>Réglages</NavLink>
      </nav>
      {feeds.length > 0 && <div className="side-h">Flux suivis</div>}
      <ul className="feedlist">
        {feeds.map((f) => (
          <li key={f.id}>
            <NavLink to={`/feeds/${f.id}`} className={link}>
              <i className={f.enabled ? (f.deferred ? 'dot def' : 'dot') : 'dot off'} title={f.enabled ? (f.deferred ? 'reporté' : 'actif') : 'pause'} />
              {f.name}
              <span className="n">{f.enabled ? f.unread : '—'}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="side-foot">
          Claude : <b>{footer.claude}</b><br />
          File : <b>{footer.queue}</b><br />
          Cumul : <b>{footer.cumul}</b>
        </div>
      )}
    </aside>
  );
}
