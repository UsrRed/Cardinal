import type { RunStatus } from '../../../src/shared/types.js';

const MAP: Record<RunStatus | 'paused', [string, string]> = {
  queued: ['s-queue', 'En file'],
  running: ['s-run', '● En cours'],
  succeeded: ['s-ok', 'Réussi'],
  failed: ['s-fail', 'Échec'],
  deferred: ['s-def', 'Reporté'],
  cancelled: ['s-cancel', 'Annulé'],
  budget_exceeded: ['s-budget', 'Budget dépassé'],
  paused: ['s-pause', 'En pause'],
};

export function StatusStamp({ status }: { status: RunStatus | 'paused' }) {
  const [cls, label] = MAP[status];
  return <span className={`stamp ${cls}`}>{label}</span>;
}
