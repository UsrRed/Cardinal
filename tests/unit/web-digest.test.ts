import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DigestView, safeHref } from '../../web/src/pages/DigestPage.js';
import { DigestList, RunsTab } from '../../web/src/pages/FeedDetailPage.js';
import { ItemWire } from '../../web/src/components/ItemWire.js';
import { ApiError } from '../../web/src/api/client.js';
import type { Digest, Item } from '../../src/shared/types.js';

const X = '<script>alert(1)</script>';
const item = (o: Partial<Item> = {}): Item => ({
  id: 'a', feedId: 'f', digestId: 'd', runId: 'r', ref: 'i1', title: X, url: 'https://ex.com/a', priority: 'high',
  justification: X, summary: X, sources: ['https://ex.com/b', 'javascript:alert(1)'], publishedAt: null, read: false,
  createdAt: '2026-01-01T10:00:00Z', ...o,
});
const digest: Digest = {
  id: 'd', feedId: 'f', feedName: 'Veille', runId: 'r', title: X, lede: X,
  sections: [{ heading: X, itemRefs: ['i1'], body: X }], createdAt: '2026-01-01T10:00:00Z', items: [item()],
};
const html = (el: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const dv = (p: Partial<Parameters<typeof DigestView>[0]>) =>
  html(createElement(DigestView, { loading: false, error: null, digest, onRetry() {}, ...p }));

describe('DigestView', () => {
  it('escapes script content', () => {
    const out = dv({});
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('Haute');
    expect(out).toContain('export.md');
  });
  it('source links are safe', () => {
    const out = dv({});
    const links = out.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
    expect(links.length).toBe(2);
    for (const l of links) expect(l).toMatch(/rel="noopener noreferrer"/);
    expect(out).not.toContain('href="javascript:');
    expect(safeHref('javascript:alert(1)')).toBeNull();
  });
  it('states', () => {
    expect(dv({ loading: true, digest: null })).toContain('Chargement');
    expect(dv({ error: new ApiError(500, 'x') })).toContain('Une erreur est survenue');
  });
});

describe('list states', () => {
  const noop = () => {};
  it('ItemWire (stream/feed)', () => {
    const w = (p: object) => html(createElement(ItemWire, { loading: false, error: null, items: null, onRetry: noop, onPage: noop, onToggleRead: noop, ...p }));
    expect(w({ loading: true })).toContain('Chargement');
    expect(w({ items: { items: [], total: 0, page: 1, pageSize: 30 } })).toContain('Aucun élément');
    expect(w({ error: new ApiError(500, 'x') })).toContain('Une erreur est survenue');
    const out = w({ items: { items: [item({ read: true })], total: 1, page: 1, pageSize: 30 } });
    expect(out).toContain('isread');
    expect(out).not.toContain('<script');
  });
  it('DigestList and RunsTab', () => {
    expect(html(createElement(DigestList, { loading: false, error: null, digests: { items: [], total: 0, page: 1, pageSize: 20 }, onRetry: noop, onPage: noop }))).toContain('Aucun digest');
    expect(html(createElement(RunsTab, { loading: true, error: null, runs: null, onRetry: noop, onPage: noop }))).toContain('Chargement');
    expect(html(createElement(RunsTab, { loading: false, error: new ApiError(500, 'x'), runs: null, onRetry: noop, onPage: noop }))).toContain('Erreur');
  });
});
