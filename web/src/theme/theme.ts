import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'pflux-theme';

export function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
}

export function initTheme(): void {
  applyTheme(resolveTheme());
}

export function useTheme(): [Theme, () => void] {
  const [theme, set] = useState<Theme>(resolveTheme);
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set(next);
  }, [theme]);
  return [theme, toggle];
}
