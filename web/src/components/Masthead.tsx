import type { ReactNode } from 'react';
import { formatDateTime, getTimezone } from '../lib/dates.js';
import { ThemeToggle } from './Shell.js';

export function Masthead({ title, meta = [], actions }: { title: string; meta?: string[]; actions?: ReactNode }) {
  return (
    <div className="mast">
      <div>
        <div className="dateline">{formatDateTime(new Date().toISOString())} · {getTimezone()}</div>
        <h2>{title}</h2>
        {meta.length > 0 && <div className="mast-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
      </div>
      <div className="actions">{actions}<ThemeToggle /></div>
    </div>
  );
}
