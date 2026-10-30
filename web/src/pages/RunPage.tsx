import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Run, RunLog, StepState } from '../../../src/shared/types.js';
import { errorMessage, get, post } from '../api/client.js';
import { useRunEvents, type RunEvent } from '../api/ws.js';
import { LogView } from '../components/LogView.js';
import { Masthead } from '../components/Masthead.js';
import { PipelineTape } from '../components/PipelineTape.js';
import { StatsBar } from '../components/StatsBar.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { StatusStamp } from '../components/StatusStamp.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatDateTime } from '../lib/dates.js';

interface RunData { run: Run; logs: RunLog[] }

export function applyRunEvent(cur: RunData | null, e: RunEvent): RunData | null {
  if (e.type === 'run.snapshot') return { run: e.run, logs: e.logs };
  if (!cur || e.runId !== cur.run.id) return cur;
  const { run, logs } = cur;
  switch (e.type) {
    case 'run.status': return { run: { ...run, status: e.status, errorCode: e.errorCode }, logs };
    case 'run.step':
      return { run: { ...run, steps: run.steps.map((s) => (s.step === e.step ? { ...s, state: e.state as StepState, detail: e.detail } : s)) }, logs };
    case 'run.log': return logs.some((l) => l.id === e.log.id) ? cur : { run, logs: [...logs, e.log] };
  }
}

const isActive = (r: Run) => r.status === 'queued' || r.status === 'running';

export function RunView({ run, logs, onCancel, cancelling, msg }: {
  run: Run; logs: RunLog[]; onCancel: () => void; cancelling?: boolean; msg?: string | null;
}) {
  const active = isActive(run);
  return (
    <>
      <div className="run-head">
        <StatusStamp status={run.status} />
        <span>{run.feedName} · {formatDateTime(run.queuedAt)}</span>
        {active && <button type="button" className="btn sm" disabled={cancelling} onClick={onCancel}>Annuler</button>}
        {run.digestId && <Link className="btn sm" to={`/digests/${run.digestId}`}>Voir le digest</Link>}
      </div>
      {msg && <div className="err-box" role="alert">{msg}</div>}
      {run.status === 'deferred' && (
        <p className="note" role="status">Ce run est reporté : une autre exécution était en cours ou la limite de concurrence était atteinte. Il sera relancé automatiquement.</p>
      )}
      {run.status === 'failed' && <div className="err-box" role="alert"><b>Échec</b>{run.errorCode ?? 'internal_error'}</div>}
      {run.noNews && <p className="note">Aucune nouveauté pour ce run.</p>}
      <PipelineTape steps={run.steps} />
      <StatsBar run={run} />
      <h3>Journal</h3>
      <LogView logs={logs} live={active} />
    </>
  );
}

export function RunPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => get<RunData>(`/api/runs/${id}`), [id]);
  const [live, setLive] = useState<RunData | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cur = live && live.run.id === id ? live : data;
  useRunEvents(id, (e) => setLive((p) => applyRunEvent(p && p.run.id === id ? p : data, e)));

  const cancel = async () => {
    setCancelling(true); setMsg(null);
    try { await post(`/api/runs/${id}/cancel`); } catch (e) { setMsg(errorMessage(e)); reload(); } finally { setCancelling(false); }
  };

  return (
    <>
      <Masthead title="Run" />
      {error ? <ErrorState error={error} onRetry={reload} />
        : loading && !cur ? <Loading />
        : !cur ? <Empty title="Run introuvable" />
        : <RunView run={cur.run} logs={cur.logs} onCancel={() => void cancel()} cancelling={cancelling} msg={msg} />}
    </>
  );
}
