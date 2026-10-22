import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeText } from '../../web/src/components/SafeText.js';
import { api, resetCsrf } from '../../web/src/api/client.js';

describe('SafeText', () => {
  it('escapes markup', () => {
    const html = renderToStaticMarkup(createElement(SafeText, { text: '<script>alert(1)</script>\n\nsecond' }));
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.match(/<p>/g)).toHaveLength(2);
  });
});

describe('api client', () => {
  afterEach(() => { vi.unstubAllGlobals(); resetCsrf(); });
  it('adds X-CSRF-Token on mutations only', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      const body = url === '/api/csrf' ? { token: 'tok' } : { ok: true };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    await api('GET', '/api/feeds');
    await api('POST', '/api/feeds', { a: 1 });
    expect(calls.find((c) => c.url === '/api/feeds' && c.headers['X-CSRF-Token'] === undefined)).toBeTruthy();
    expect(calls.filter((c) => c.url === '/api/feeds').pop()!.headers['X-CSRF-Token']).toBe('tok');
  });
  it('logs in without fetching a CSRF token (401 before login in exposed mode)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url === '/api/csrf') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      return new Response(JSON.stringify({ ok: true, token: 't' }), { status: 200 });
    });
    await api('POST', '/api/auth/login', { password: 'x' });
    expect(urls).toEqual(['/api/auth/login']);
  });
});
