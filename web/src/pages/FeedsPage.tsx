import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FeedSummary, Run } from '../../../src/shared/types.js';
import { ApiError, del, errorMessage, get, post } from '../api/client.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { FeedCard, type FeedCardActions } from '../components/FeedCard.js';
import { Masthead } from '../components/Masthead.js';
import { Empty, ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';

export interface FeedsViewProps {
  loading: boolean; error: unknown; feeds: FeedSummary[] | null;
  onRetry: () => void; actions: FeedCardActions; busy?: boolean;
}

export function FeedsView({ loading, error, feeds, onRetry, actions, busy }: FeedsViewProps) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !feeds) return <Loading />;
  if (feeds.length === 0) {
    return <Empty title="Aucun flux">Créez votre premier flux de veille pour recevoir des digests.</Empty>;
  }
  return <div className="feeds">{feeds.map((f) => <FeedCard key={f.id} feed={f} busy={busy} actions={actions} />)}</div>;
}

interface ImportReport { created: number; rejected: Array<{ index: number; fields: Record<string, string> }> }

export function FeedsPage() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => get<FeedSummary[]>('/api/feeds'), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [toDelete, setToDelete] = useState<FeedSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  };

  const actions: FeedCardActions = {
    onToggle: (f) => void wrap(async () => { await post(`/api/feeds/${f.id}/${f.enabled ? 'pause' : 'resume'}`); reload(); }),
    onDuplicate: (f) => void wrap(async () => { await post(`/api/feeds/${f.id}/duplicate`); reload(); }),
    onDelete: (f) => setToDelete(f),
    onRun: (f) => void wrap(async () => {
      try {
        const run = await post<Run>(`/api/feeds/${f.id}/run`);
        nav(`/runs/${run.id}`);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'run_already_active' && f.activeRunId) nav(`/runs/${f.activeRunId}`);
        else throw e;
      }
    }),
  };

  const doExport = () => void wrap(async () => {
    const payload = await get<unknown>('/api/feeds/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'cardinal-feeds.json'; a.click();
    URL.revokeObjectURL(url);
  });

  const doImport = (file: File) => void wrap(async () => {
    let body: unknown;
    try { body = JSON.parse(await file.text()); } catch { setMsg('Fichier JSON illisible.'); return; }
    const r = await post<ImportReport>('/api/feeds/import', body);
    setReport(r);
    reload();
  });

  return (
    <>
      <Masthead
        title="Flux de veille"
        meta={data ? [`${data.length} flux`] : []}
        actions={(
          <>
            <button type="button" className="btn sm" disabled={busy} onClick={doExport}>Exporter JSON</button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>Importer JSON</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Fichier JSON à importer"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
            <Link className="btn sm primary" to="/feeds/new">Nouveau flux</Link>
          </>
        )}
      />
      {msg && <div className="err-box" role="alert">{msg}</div>}
      {report && (
        <div className="banner def" role="status">
          <div style={{flex:1}}>
            {report.created} flux importé(s) (en pause), {report.rejected.length} rejeté(s).
            {report.rejected.length > 0 && (
              <ul>
                {report.rejected.map((r) => (
                  <li key={r.index}>Entrée {r.index + 1} : {Object.entries(r.fields).map(([k, v]) => `${k} — ${v}`).join(' ; ')}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="btn sm" onClick={() => setReport(null)}>Fermer</button>
        </div>
      )}
      <FeedsView loading={loading} error={error} feeds={data} onRetry={reload} actions={actions} busy={busy} />
      {toDelete && (
        <ConfirmDialog
          title="Supprimer ce flux ?"
          message={`« ${toDelete.name} » et son historique (runs, digests, éléments) seront supprimés définitivement.`}
          confirmLabel="Supprimer" danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => { const f = toDelete; setToDelete(null); void wrap(async () => { await del(`/api/feeds/${f.id}`); reload(); }); }}
        />
      )}
    </>
  );
}
