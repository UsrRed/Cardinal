import { useEffect, useState } from 'react';
import type { Run, RunLog, RunStatus, RunStep, StepState, Usage } from '../../../src/shared/types.js';

export type RunEvent =
  | { type: 'run.snapshot'; run: Run; logs: RunLog[] }
  | { type: 'run.status'; runId: string; feedId: string; status: RunStatus; errorCode: string | null }
  | { type: 'run.step'; runId: string; step: RunStep; state: StepState; detail: string | null }
  | { type: 'run.log'; runId: string; log: RunLog }
  | { type: 'run.usage'; runId: string; usage: Usage };

export function wsUrl(runId?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
  return `${proto}//${window.location.host}/api/ws/runs${q}`;
}

/** Subscribes to run events, reconnecting with backoff; calls onEvent for each message. */
export function useRunEvents(runId: string | undefined, onEvent: (e: RunEvent) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const open = () => {
      ws = new WebSocket(wsUrl(runId));
      ws.onopen = () => { attempt = 0; setConnected(true); };
      ws.onmessage = (m) => {
        try { onEvent(JSON.parse(String(m.data)) as RunEvent); } catch { /* ignore malformed */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        timer = setTimeout(open, Math.min(1000 * 2 ** attempt++, 15000));
      };
    };
    open();
    return () => { stopped = true; clearTimeout(timer); ws?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  return { connected };
}
