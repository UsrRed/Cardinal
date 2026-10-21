import { NavLink } from 'react-router-dom';

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
      <div className="brand"><span className="mark">PF</span><span className="wordmark">Personnal <i>Flux</i></span></div>
      <nav className="nav" aria-label="Navigation principale">
        <NavLink to="/" end className={link}>Flux {feedCount !== undefined && <span className="count mute">{feedCount}</span>}</NavLink>
        <NavLink to="/feed" className={link}>Fil {!!unreadTotal && <span className="count">{unreadTotal}</span>}</NavLink>
        <NavLink to="/runs" className={link}>Runs {!!activeRuns && <span className="count mute">{activeRuns}</span>}</NavLink>
        <NavLink to="/settings" className={link}>Réglages</NavLink>
      </nav>
      {feeds.length > 0 && <div className="side-h">Flux suivis</div>}
      <ul className="feedlist">
        {feeds.map((f) => (
          <li key={f.id}>
            <i className={f.enabled ? (f.deferred ? 'dot def' : 'dot') : 'dot off'} />
            {f.name}
            <span className="n">{f.enabled ? f.unread : '—'}</span>
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
