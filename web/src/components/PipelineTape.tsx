import type { RunStepInfo } from '../../../src/shared/types.js';

const LABELS: Record<string, string> = { fetch: 'Collecte', dedup: 'Dédoublonnage', triage: 'Tri', digest: 'Digest', notify: 'Notification' };
const CLS: Record<string, string> = { done: 'done', running: 'now', todo: 'todo', error: 'err', skipped: 'todo' };

export function PipelineTape({ steps }: { steps: RunStepInfo[] }) {
  return (
    <div className="tape">
      <ol aria-label="Étapes du run">
        {steps.map((s, i) => (
          <li key={s.step} className={CLS[s.state]} data-step={s.step} data-state={s.state}>
            <b>{String(i + 1).padStart(2, '0')} {LABELS[s.step] ?? s.step}</b>
            <span>{s.detail ?? (s.state === 'skipped' ? 'ignoré' : s.state === 'todo' ? 'en attente' : '')}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
