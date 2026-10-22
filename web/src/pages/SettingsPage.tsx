import { useState } from 'react';
import type { ClaudeStatus, SecretState, Settings } from '../../../src/shared/types.js';
import type { SecretName } from '../../../src/shared/schemas.js';
import { ApiError, del, errorMessage, get, patch, post, put } from '../api/client.js';
import { LoginTerminal } from '../components/LoginTerminal.js';
import { Masthead } from '../components/Masthead.js';
import { SecretField } from '../components/SecretField.js';
import { ErrorState, Loading } from '../components/States.js';
import { useAsync } from '../hooks/useAsync.js';

const CLAUDE_LABEL: Record<ClaudeStatus['state'], string> = {
  connected: 'Connecté (abonnement)', api_key: 'Clé API', not_connected: 'Non connecté', unknown: 'Inconnu',
};

interface Form { ntfyServer: string; ntfyTopic: string; publicUrl: string; timezone: string; maxConcurrentRuns: string; retentionDays: string }
const toForm = (s: Settings): Form => ({
  ntfyServer: s.ntfyServer, ntfyTopic: s.ntfyTopic, publicUrl: s.publicUrl, timezone: s.timezone,
  maxConcurrentRuns: String(s.maxConcurrentRuns), retentionDays: String(s.retentionDays),
});

export function SettingsView({ loading, error, settings, onRetry, children }: {
  loading: boolean; error: unknown; settings: Settings | null; onRetry: () => void; children: (s: Settings) => React.ReactNode;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !settings) return <Loading />;
  return <>{children(settings)}</>;
}

function SettingsBody({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [secretErr, setSecretErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notif, setNotif] = useState<{ ok: boolean; text: string } | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const claude = useAsync(() => get<ClaudeStatus>('/api/claude/status'), []);
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const shown = status ?? claude.data;

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const fe = (k: string) => (fields[k] ? <div className="ferr" role="alert">{fields[k]}</div> : null);
  const env = (k: keyof Form) => settings.overriddenByEnv.includes(k) ? <div className="hint">Défini par l’environnement (prioritaire).</div> : null;

  const save = async () => {
    setBusy(true); setFields({}); setMsg(null);
    try {
      const s = await patch<Settings>('/api/settings', {
        ntfyServer: form.ntfyServer, ntfyTopic: form.ntfyTopic, publicUrl: form.publicUrl, timezone: form.timezone,
        maxConcurrentRuns: Number(form.maxConcurrentRuns), retentionDays: Number(form.retentionDays),
      });
      setSettings(s); setForm(toForm(s)); setMsg('Réglages enregistrés.');
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setMsg(errorMessage(e));
    } finally { setBusy(false); }
  };

  const secret = async (name: SecretName, fn: () => Promise<SecretState>) => {
    setBusy(true); setSecretErr((m) => ({ ...m, [name]: '' }));
    try {
      const st = await fn();
      setSettings((s) => ({ ...s, secrets: { ...s.secrets, [name]: st } }));
    } catch (e) { setSecretErr((m) => ({ ...m, [name]: errorMessage(e) })); } finally { setBusy(false); }
  };
  const secretField = (name: SecretName, id: string, label: string) => (
    <SecretField id={id} label={label} state={settings.secrets[name]} busy={busy} error={secretErr[name]}
      onSave={(value) => void secret(name, () => put<SecretState>(`/api/settings/secrets/${name}`, { value }))}
      onClear={() => void secret(name, async () => { await del(`/api/settings/secrets/${name}`); return { configured: false, source: null }; })} />
  );

  const recheck = async () => {
    try { setStatus(await post<ClaudeStatus>('/api/claude/check')); } catch (e) { setMsg(errorMessage(e)); }
  };
  const testNotify = async () => {
    setNotif(null);
    try {
      const r = await post<{ ok: boolean }>('/api/settings/test-notify');
      setNotif(r.ok ? { ok: true, text: 'Notification envoyée.' } : { ok: false, text: 'Échec de l’envoi de la notification.' });
    } catch { setNotif({ ok: false, text: 'Échec de l’envoi de la notification.' }); }
  };

  return (
    <>
      <section className="panel">
        <h3>Connexion à Claude</h3>
        <p>État : <b>{shown ? CLAUDE_LABEL[shown.state] : '…'}</b>{shown?.cliVersion ? ` · CLI ${shown.cliVersion}` : ''}</p>
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => void recheck()}>Revérifier</button>
          {!consoleOpen && <button type="button" className="btn sm" onClick={() => setConsoleOpen(true)}>Ouvrir la console</button>}
        </div>
        {consoleOpen && <LoginTerminal onClose={() => { setConsoleOpen(false); void recheck(); }} />}
        {secretField('anthropicApiKey', 's-anthropic', 'Clé API Anthropic')}
      </section>

      <form className="panel" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h3>Notifications ntfy</h3>
        <div className="field">
          <label htmlFor="s-ntfy-server">Serveur ntfy</label>
          <input id="s-ntfy-server" className="input" value={form.ntfyServer} onChange={(e) => set('ntfyServer', e.target.value)} />
          {env('ntfyServer')}{fe('ntfyServer')}
        </div>
        <div className="field">
          <label htmlFor="s-ntfy-topic">Sujet ntfy</label>
          <input id="s-ntfy-topic" className="input" value={form.ntfyTopic} onChange={(e) => set('ntfyTopic', e.target.value)} />
          {env('ntfyTopic')}{fe('ntfyTopic')}
        </div>
        {secretField('ntfyToken', 's-ntfy-token', 'Jeton ntfy')}
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => void testNotify()}>Tester la notification</button>
          {notif && <span className={notif.ok ? 'fok' : 'ferr'} role="status">{notif.text}</span>}
        </div>

        <h3>Général</h3>
        {secretField('nvdApiKey', 's-nvd', 'Clé API NVD')}
        <div className="field">
          <label htmlFor="s-public">URL publique</label>
          <input id="s-public" className="input" value={form.publicUrl} onChange={(e) => set('publicUrl', e.target.value)} />
          {env('publicUrl')}{fe('publicUrl')}
        </div>
        <div className="field">
          <label htmlFor="s-tz">Fuseau horaire</label>
          <input id="s-tz" className={fields.timezone ? 'input err' : 'input'} value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
          {env('timezone')}{fe('timezone')}
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="s-conc">Runs simultanés</label>
            <input id="s-conc" className="input" inputMode="numeric" value={form.maxConcurrentRuns} onChange={(e) => set('maxConcurrentRuns', e.target.value)} />
            {env('maxConcurrentRuns')}{fe('maxConcurrentRuns')}
          </div>
          <div className="field">
            <label htmlFor="s-ret">Rétention (jours, 0 = illimitée)</label>
            <input id="s-ret" className="input" inputMode="numeric" value={form.retentionDays} onChange={(e) => set('retentionDays', e.target.value)} />
            {env('retentionDays')}{fe('retentionDays')}
          </div>
        </div>
        {msg && <div className="hint" role="status">{msg}</div>}
        <div><button type="submit" className="btn primary" disabled={busy}>Enregistrer</button></div>
      </form>
    </>
  );
}

export function SettingsPage() {
  const { data, error, loading, reload } = useAsync(() => get<Settings>('/api/settings'), []);
  return (
    <>
      <Masthead title="Réglages" />
      <SettingsView loading={loading} error={error} settings={data} onRetry={reload}>
        {(s) => <SettingsBody initial={s} />}
      </SettingsView>
    </>
  );
}
