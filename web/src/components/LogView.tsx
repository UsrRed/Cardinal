import { useEffect, useRef } from 'react';
import type { RunLog } from '../../../src/shared/types.js';
import { getTimezone } from '../lib/dates.js';

const LV = { info: ['i', 'INFO'], warn: ['w', 'WARN'], error: ['e', 'ERR'] } as const;

function time(iso: string): string {
  try { return new Intl.DateTimeFormat('fr-FR', { timeZone: getTimezone(), hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)); }
  catch { return iso; }
}

export function LogView({ logs, live }: { logs: RunLog[]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  return (
    <div className="log" ref={ref} role="log" aria-live="off" tabIndex={0}>
      {logs.length === 0 && <div><time /><span /><span>Aucun journal pour l’instant.</span></div>}
      {logs.map((l, i) => {
        const [c, label] = LV[l.level];
        return (
          <div key={l.id} className={live && i === logs.length - 1 ? 'cur' : undefined}>
            <time dateTime={l.ts}>{time(l.ts)}</time>
            <span className={`lv ${c}`}>{label}</span>
            <span>{l.message}</span>
          </div>
        );
      })}
    </div>
  );
}
