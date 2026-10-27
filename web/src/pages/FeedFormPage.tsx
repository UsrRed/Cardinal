import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Feed, NvdSeverity, OsvEcosystem, Priority, SourceType } from '../../../src/shared/types.js';
import { feedInputSchema, zodFields } from '../../../src/shared/schemas.js';
import { ApiError, errorMessage, get, post, put } from '../api/client.js';
import { Masthead } from '../components/Masthead.js';
import { OSV_ECOSYSTEMS, SourceHelp } from '../components/SourceHelp.js';
import { ErrorState, Loading } from '../components/States.js';

interface FormState {
  name: string; instructions: string; sourceType: SourceType;
  urls: string; packages: { name: string; ecosystem: OsvEcosystem }[];
  keywords: string; minSeverity: NvdSeverity | '';
  frequencyHours: string; freshnessDays: string; enabled: boolean;
  notify: boolean; notifyThreshold: Priority; ntfyServer: string; ntfyTopic: string;
  model: string; budgetUsd: string;
}

const EMPTY: FormState = {
  name: '', instructions: '', sourceType: 'rss', urls: '', packages: [{ name: '', ecosystem: 'PyPI' }],
  keywords: '', minSeverity: '', frequencyHours: '24', freshnessDays: '7', enabled: true,
  notify: false, notifyThreshold: 'high', ntfyServer: '', ntfyTopic: '', model: 'sonnet', budgetUsd: '1',
};

const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

function fromFeed(f: Feed): FormState {
  const base: FormState = {
    ...EMPTY, name: f.name, instructions: f.instructions, sourceType: f.sourceType,
    frequencyHours: String(f.frequencyHours), freshnessDays: String(f.freshnessDays), enabled: f.enabled,
    notify: f.notify, notifyThreshold: f.notifyThreshold, ntfyServer: f.ntfyServer ?? '', ntfyTopic: f.ntfyTopic ?? '',
    model: f.model, budgetUsd: String(f.budgetUsd),
  };
  const p = f.sourceParams;
  if ('urls' in p) base.urls = p.urls.join('\n');
  else if ('packages' in p) base.packages = p.packages.map((x) => ({ ...x }));
  else { base.keywords = p.keywords.join('\n'); base.minSeverity = p.minSeverity ?? ''; }
  return base;
}

export function toPayload(s: FormState): unknown {
  const sourceParams = s.sourceType === 'rss' ? { urls: lines(s.urls).map((u) => u.trim()) }
    : s.sourceType === 'osv' ? { packages: s.packages.map((p) => ({ name: p.name.trim(), ecosystem: p.ecosystem })) }
      : { keywords: lines(s.keywords), ...(s.minSeverity ? { minSeverity: s.minSeverity } : {}) };
  return {
    name: s.name, instructions: s.instructions, sourceType: s.sourceType, sourceParams,
    frequencyHours: s.frequencyHours.trim() === '' ? NaN : Number(s.frequencyHours),
    freshnessDays: s.freshnessDays.trim() === '' ? NaN : Number(s.freshnessDays),
    enabled: s.enabled, notify: s.notify, notifyThreshold: s.notifyThreshold,
    ntfyServer: s.ntfyServer.trim() || null, ntfyTopic: s.ntfyTopic.trim() || null,
    model: s.model, budgetUsd: s.budgetUsd.trim() === '' ? NaN : Number(s.budgetUsd),
  };
}

export function FeedFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [urlTest, setUrlTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [notifyTest, setNotifyTest] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    get<Feed>(`/api/feeds/${id}`).then(
      (f) => { if (!cancelled) { setForm(fromFeed(f)); setLoading(false); } },
      (e: unknown) => { if (!cancelled) { setLoadError(e); setLoading(false); } },
    );
    return () => { cancelled = true; };
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = (...keys: string[]) => {
    const k = Object.keys(errors).find((e) => keys.some((p) => e === p || e.startsWith(`${p}.`)));
    return k ? errors[k] : undefined;
  };
  const fieldErr = (k: string[]) => { const m = err(...k); return m ? <div className="ferr" role="alert">{m}</div> : null; };
  const cls = (...k: string[]) => `input${err(...k) ? ' bad' : ''}`;

  const save = async () => {
    setGeneral(null);
    const payload = toPayload(form);
    const parsed = feedInputSchema.safeParse(payload);
    if (!parsed.success) { setErrors(zodFields(parsed.error)); return; }
    setErrors({}); setSaving(true);
    try {
      if (id) await put(`/api/feeds/${id}`, parsed.data); else await post('/api/feeds', parsed.data);
      nav('/');
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      setGeneral(errorMessage(e));
    } finally { setSaving(false); }
  };

  const testUrl = async () => {
    const first = lines(form.urls)[0];
    if (!first) { setUrlTest({ ok: false, text: 'Saisissez une URL.' }); return; }
    setUrlTest(null);
    try {
      const r = await post<{ ok: true; count: number } | { ok: false; error: string }>('/api/feeds/test-url', { url: first });
      if (r.ok) setUrlTest({ ok: true, text: `OK — ${r.count} items` });
      else setUrlTest({ ok: false, text: r.error === 'destination_blocked' ? 'Destination non autorisée.' : r.error === 'parse_failed' ? 'Flux illisible.' : 'Récupération impossible.' });
    } catch (e) { setUrlTest({ ok: false, text: errorMessage(e) }); }
  };

  const testNotify = async () => {
    if (!id) return;
    setNotifyTest(null);
    try {
      const r = await post<{ ok: boolean; error?: string }>(`/api/feeds/${id}/test-notify`);
      setNotifyTest(r.ok ? { ok: true, text: 'Notification envoyée.' }
        : { ok: false, text: r.error === 'not_configured' ? 'Aucun topic ntfy configuré.' : r.error === 'destination_blocked' ? 'Destination non autorisée.' : 'Envoi impossible.' });
    } catch (e) { setNotifyTest({ ok: false, text: errorMessage(e) }); }
  };

  if (loading) return <Loading />;
  if (loadError) return <ErrorState error={loadError} />;

  return (
    <>
      <Masthead title={id ? 'Modifier le flux' : 'Nouveau flux'} actions={<Link className="btn sm" to="/">Annuler</Link>} />
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div>
          {general && <div className="err-box" role="alert">{general}</div>}
          <div className="field">
            <label htmlFor="f-name">Nom</label>
            <input id="f-name" className={cls('name')} value={form.name} onChange={(e) => set('name', e.target.value)} />
            {fieldErr(['name'])}
          </div>
          <div className="field">
            <label htmlFor="f-instr">Instructions</label>
            <textarea id="f-instr" className={cls('instructions')} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
            <div className="hint">Décrivez ce qui compte pour vous : Claude s’en sert pour trier et résumer.</div>
            {fieldErr(['instructions'])}
          </div>
          <div className="field">
            <label htmlFor="f-type">Type de source</label>
            <select id="f-type" className="input" value={form.sourceType} onChange={(e) => set('sourceType', e.target.value as SourceType)}>
              <option value="rss">RSS / Atom</option>
              <option value="osv">OSV (paquets)</option>
              <option value="nvd">NVD (CVE)</option>
            </select>
          </div>

          {form.sourceType === 'rss' && (
            <div className="field">
              <label htmlFor="f-urls">URL des flux (une par ligne)</label>
              <textarea id="f-urls" className={cls('sourceParams')} value={form.urls} onChange={(e) => set('urls', e.target.value)} />
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn sm" onClick={() => void testUrl()}>Tester l’URL</button>
              </div>
              {urlTest && <div className={urlTest.ok ? 'fok' : 'ferr'} role="status">{urlTest.text}</div>}
              {fieldErr(['sourceParams'])}
            </div>
          )}

          {form.sourceType === 'osv' && (
            <div className="field">
              <label>Paquets</label>
              {form.packages.map((p, i) => (
                <div className="pkg" key={i}>
                  <input className="input" aria-label={`Nom du paquet ${i + 1}`} value={p.name} placeholder="requests"
                    onChange={(e) => set('packages', form.packages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <select className="input" aria-label={`Écosystème ${i + 1}`} value={p.ecosystem}
                    onChange={(e) => set('packages', form.packages.map((x, j) => (j === i ? { ...x, ecosystem: e.target.value as OsvEcosystem } : x)))}>
                    {OSV_ECOSYSTEMS.map((eco) => <option key={eco} value={eco}>{eco}</option>)}
                  </select>
                  <button type="button" className="btn sm ghost" disabled={form.packages.length <= 1} aria-label={`Retirer le paquet ${i + 1}`}
                    onClick={() => set('packages', form.packages.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="btn sm" onClick={() => set('packages', [...form.packages, { name: '', ecosystem: 'PyPI' }])}>Ajouter un paquet</button>
              {fieldErr(['sourceParams'])}
            </div>
          )}

          {form.sourceType === 'nvd' && (
            <>
              <div className="field">
                <label htmlFor="f-kw">Mots-clés (un par ligne)</label>
                <textarea id="f-kw" className={cls('sourceParams.keywords')} value={form.keywords} onChange={(e) => set('keywords', e.target.value)} />
                {fieldErr(['sourceParams.keywords'])}
              </div>
              <div className="field">
                <label htmlFor="f-sev">Sévérité minimale</label>
                <select id="f-sev" className="input" value={form.minSeverity} onChange={(e) => set('minSeverity', e.target.value as NvdSeverity | '')}>
                  <option value="">Toutes</option>
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {fieldErr(['sourceParams.minSeverity'])}
              </div>
            </>
          )}

          <div className="row">
            <div className="field">
              <label htmlFor="f-freq">Fréquence (heures)</label>
              <input id="f-freq" className={cls('frequencyHours')} inputMode="numeric" value={form.frequencyHours} onChange={(e) => set('frequencyHours', e.target.value)} />
              {fieldErr(['frequencyHours'])}
            </div>
            <div className="field">
              <label htmlFor="f-fresh">Fraîcheur (jours)</label>
              <input id="f-fresh" className={cls('freshnessDays')} inputMode="numeric" value={form.freshnessDays} onChange={(e) => set('freshnessDays', e.target.value)} />
              {fieldErr(['freshnessDays'])}
            </div>
            <div className="field">
              <label htmlFor="f-budget">Budget par run ($)</label>
              <input id="f-budget" className={cls('budgetUsd')} inputMode="decimal" value={form.budgetUsd} onChange={(e) => set('budgetUsd', e.target.value)} />
              {fieldErr(['budgetUsd'])}
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-model">Modèle</label>
            <input id="f-model" className={cls('model')} value={form.model} onChange={(e) => set('model', e.target.value)} />
            {fieldErr(['model'])}
          </div>
          <div className="field">
            <label className="toggle"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Flux actif</label>
          </div>

          <fieldset className="field">
            <legend>Notifications ntfy</legend>
            <label className="toggle"><input type="checkbox" checked={form.notify} onChange={(e) => set('notify', e.target.checked)} /> Notifier ce flux</label>
            {form.notify && (
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field">
                  <label htmlFor="f-thr">Seuil</label>
                  <select id="f-thr" className="input" value={form.notifyThreshold} onChange={(e) => set('notifyThreshold', e.target.value as Priority)}>
                    <option value="high">Haute</option><option value="medium">Moyenne</option><option value="low">Basse</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-ns">Serveur (optionnel)</label>
                  <input id="f-ns" className={cls('ntfyServer')} value={form.ntfyServer} placeholder="https://ntfy.sh" onChange={(e) => set('ntfyServer', e.target.value)} />
                  {fieldErr(['ntfyServer'])}
                </div>
                <div className="field">
                  <label htmlFor="f-nt">Topic (optionnel)</label>
                  <input id="f-nt" className={cls('ntfyTopic')} value={form.ntfyTopic} onChange={(e) => set('ntfyTopic', e.target.value)} />
                  {fieldErr(['ntfyTopic'])}
                </div>
              </div>
            )}
            {id && <button type="button" className="btn sm" onClick={() => void testNotify()}>Tester la notification</button>}
            {notifyTest && <div className={notifyTest.ok ? 'fok' : 'ferr'} role="status">{notifyTest.text}</div>}
          </fieldset>

          <button type="submit" className="btn primary" disabled={saving}>{id ? 'Enregistrer' : 'Créer le flux'}</button>
        </div>
        <SourceHelp type={form.sourceType} />
      </form>
    </>
  );
}
