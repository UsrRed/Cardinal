import { useState } from 'react';
import type { SecretState } from '../../../src/shared/types.js';

export interface SecretFieldProps {
  id: string;
  label: string;
  state: SecretState;
  busy?: boolean;
  error?: string | null;
  onSave: (value: string) => void;
  onClear: () => void;
}

/** Never displays the secret value: only whether it is configured and where it comes from. */
export function SecretField({ id, label, state, busy, error, onSave, onClear }: SecretFieldProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const showInput = editing || !state.configured;
  const submit = () => {
    if (!value) return;
    onSave(value);
    setValue('');
    setEditing(false);
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {state.configured && !editing && (
        <div className="secret-state">
          <span className="tag" id={id}>configuré ({state.source})</span>
          <button type="button" className="btn sm" disabled={busy} onClick={() => setEditing(true)}>Remplacer</button>
          {state.source === 'ui' && <button type="button" className="btn sm ghost" disabled={busy} onClick={onClear}>Effacer</button>}
        </div>
      )}
      {state.configured && state.source === 'env' && (
        <div className="hint">Définie par variable d’environnement : l’environnement a la priorité sur la valeur saisie ici.</div>
      )}
      {showInput && (
        <div className="secret-state">
          <input id={id} className={error ? 'input err' : 'input'} type="password" autoComplete="off" value={value}
            onChange={(e) => setValue(e.target.value)} placeholder="Saisir une valeur" />
          <button type="button" className="btn sm" disabled={busy || !value} onClick={submit}>Enregistrer</button>
          {editing && <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setValue(''); }}>Annuler</button>}
        </div>
      )}
      {error && <div className="ferr" role="alert">{error}</div>}
    </div>
  );
}
