import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from './Sidebar.js';
import { useTheme } from '../theme/theme.js';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button type="button" className="btn ghost sm" onClick={toggle} aria-label="Basculer le thème clair/sombre">
      {theme === 'dark' ? '☀ Clair' : '☾ Sombre'}
    </button>
  );
}

export function Shell({ children, sidebar }: { children: ReactNode; sidebar?: SidebarProps }) {
  return (
    <div className="app">
      <Sidebar {...sidebar} />
      <main className="main">{children}</main>
    </div>
  );
}
