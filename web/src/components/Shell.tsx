import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from './Sidebar.js';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../theme/theme.js';
import { useAsync } from '../hooks/useAsync.js';
import { useRunEvents } from '../api/ws.js';
import { get } from '../api/client.js';
import type { ClaudeStatus, FeedSummary } from '../../../src/shared/types.js';

const CLAUDE_LABEL: Record<string, string> = {
  connected: 'connecté', api_key: 'clé API', not_connected: 'non connecté', unknown: 'inconnu',
};

function useSidebarData(): SidebarProps {
  const { pathname } = useLocation();
  const feeds = useAsync(() => get<FeedSummary[]>('/api/feeds'), [pathname]);
  const claude = useAsync(() => get<ClaudeStatus>('/api/claude/status'), []);
  useRunEvents(undefined, (e) => {
    if (e.type === 'run.status') feeds.reload();
  });
  const list = feeds.data ?? [];
  const active = list.filter((f) => f.activeRunId).length;
  return {
    feedCount: feeds.data ? list.length : undefined,
    unreadTotal: list.reduce((n, f) => n + f.unreadCount, 0),
    activeRuns: active,
    feeds: list.map((f) => ({
      id: f.id, name: f.name, unread: f.unreadCount, enabled: f.enabled, deferred: f.lastRunStatus === 'deferred',
    })),
    footer: {
      claude: claude.data ? (CLAUDE_LABEL[claude.data.state] ?? 'inconnu') : '…',
      queue: active ? `${active} en cours` : 'vide',
    },
  };
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button type="button" className="btn ghost sm" onClick={toggle} aria-label="Basculer le thème clair/sombre">
      {theme === 'dark' ? '☀ Clair' : '☾ Sombre'}
    </button>
  );
}

export function Shell({ children, sidebar }: { children: ReactNode; sidebar?: SidebarProps }) {
  const data = useSidebarData();
  return (
    <div className="app">
      <Sidebar {...data} {...sidebar} />
      <main className="main">{children}</main>
    </div>
  );
}
