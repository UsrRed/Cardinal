import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecretField } from '../../web/src/components/SecretField.js';
import { SettingsView } from '../../web/src/pages/SettingsPage.js';
import { LoginView, loginErrorText } from '../../web/src/pages/LoginPage.js';
import { ApiError } from '../../web/src/api/client.js';

const field = (state: { configured: boolean; source: 'env' | 'ui' | null }) =>
  renderToStaticMarkup(createElement(SecretField, { id: 'x', label: 'Clé', state, onSave() {}, onClear() {} }));

describe('SecretField', () => {
  it('configured (ui): no value, Remplacer and Effacer', () => {
    const html = field({ configured: true, source: 'ui' });
    expect(html).toContain('configuré (ui)');
    expect(html).toContain('Remplacer');
    expect(html).toContain('Effacer');
    expect(html).not.toContain('<input');
  });
  it('env source mentions priority of env', () => {
    const html = field({ configured: true, source: 'env' });
    expect(html).toContain('configuré (env)');
    expect(html).toContain('priorité');
  });
  it('unconfigured shows a password input', () => {
    expect(field({ configured: false, source: null })).toContain('type="password"');
  });
});

describe('SettingsView', () => {
  const r = (p: object) => renderToStaticMarkup(createElement(SettingsView, { loading: false, error: null, settings: null, onRetry() {}, children: () => 'ok', ...p }));
  it('loading and error states', () => {
    expect(r({ loading: true })).toContain('Chargement');
    expect(r({ error: new ApiError(500, 'internal_error') })).toContain('Une erreur est survenue');
  });
});

describe('LoginPage', () => {
  it('generic messages', () => {
    expect(loginErrorText(new ApiError(401, 'unauthorized'))).toBe('Connexion refusée.');
    expect(loginErrorText(new ApiError(429, 'rate_limited'))).toContain('Trop de tentatives');
    expect(renderToStaticMarkup(createElement(LoginView, { error: 'Connexion refusée.', onSubmit() {} }))).toContain('Connexion refusée.');
  });
});

describe('LoginTerminal paste', () => {
  it('Coller sends clipboard text through the input channel', async () => {
    const { pasteToConsole } = await import('../../web/src/components/LoginTerminal.js');
    const sent: string[] = [];
    expect(await pasteToConsole(async () => 'abc-123', (d) => sent.push(d))).toBe(true);
    expect(sent).toEqual(['abc-123']);
  });
  it('denied or unavailable clipboard falls back without sending', async () => {
    const { pasteToConsole } = await import('../../web/src/components/LoginTerminal.js');
    const sent: string[] = [];
    expect(await pasteToConsole(async () => { throw new Error('denied'); }, (d) => sent.push(d))).toBe(false);
    expect(await pasteToConsole(undefined, (d) => sent.push(d))).toBe(false);
    expect(sent).toEqual([]);
  });
  it('button disabled when disconnected; fallback shows field', async () => {
    const { PasteControls } = await import('../../web/src/components/LoginTerminal.js');
    const h = (p: object) => renderToStaticMarkup(createElement(PasteControls, { connected: false, fallback: false, onPaste() {}, onSend() {}, ...p }));
    expect(h({})).toMatch(/<button[^>]*disabled[^>]*>Coller/);
    expect(h({ connected: true })).not.toMatch(/disabled=""[^>]*>Coller/);
    expect(h({ connected: true, fallback: true })).toContain('Envoyer');
  });
});
