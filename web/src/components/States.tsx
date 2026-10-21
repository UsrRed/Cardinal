import type { ReactNode } from 'react';
import { ApiError, errorMessage } from '../api/client.js';

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="tag">{label}</span>
      <div className="compose h" /><div className="compose w80" /><div className="compose w60" />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <span className="empty-mark" aria-hidden="true">∅</span>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const ref = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className="err-box" role="alert">
      <b>Erreur</b>
      {errorMessage(error)}
      {ref && <div className="ref">réf. {ref}</div>}
      {onRetry && <div style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={onRetry}>Réessayer</button></div>}
    </div>
  );
}
