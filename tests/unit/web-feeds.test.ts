import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { FeedsView } from '../../web/src/pages/FeedsPage.js';
import { SourceHelp } from '../../web/src/components/SourceHelp.js';
import { toPayload } from '../../web/src/pages/FeedFormPage.js';
import { feedInputSchema } from '../../src/shared/schemas.js';
import { ApiError } from '../../web/src/api/client.js';
import type { FeedSummary } from '../../src/shared/types.js';

const actions = { onToggle() {}, onDuplicate() {}, onDelete() {}, onRun() {} };
const render = (props: Partial<Parameters<typeof FeedsView>[0]>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(FeedsView, { loading: false, error: null, feeds: [], onRetry() {}, actions, ...props })));

const feed = {
  id: 'a', name: 'Veille', instructions: 'x', sourceType: 'rss', sourceParams: { urls: ['https://e.org/f'] },
  frequencyHours: 24, freshnessDays: 7, enabled: false, unreadCount: 3, lastRunStatus: null, activeRunId: null,
  lastRunAt: null, nextRunAt: null,
} as unknown as FeedSummary;

describe('FeedsPage view', () => {
  it('renders loading, empty and error states', () => {
    expect(render({ loading: true, feeds: null })).toContain('Chargement');
    expect(render({ feeds: [] })).toContain('Aucun flux');
    expect(render({ error: new ApiError(500, 'internal_error'), feeds: null })).toContain('Une erreur est survenue');
  });
  it('renders paused cards with hatching class', () => {
    const html = render({ feeds: [feed] });
    expect(html).toContain('feed paused');
    expect(html).toContain('En pause');
    expect(html).toContain('Lancer maintenant');
  });
});

describe('SourceHelp', () => {
  it('differs per source type', () => {
    const h = (t: 'rss' | 'osv' | 'nvd') => renderToStaticMarkup(createElement(SourceHelp, { type: t }));
    expect(new Set([h('rss'), h('osv'), h('nvd')]).size).toBe(3);
    expect(h('osv')).toContain('crates.io');
    expect(h('nvd')).toContain('clé API');
  });
});

describe('feed form payload', () => {
  it('rejects frequency 0 with a field error', () => {
    const p = toPayload({
      name: 'n', instructions: 'i', sourceType: 'rss', urls: 'https://e.org/f', packages: [], keywords: '', minSeverity: '',
      frequencyHours: '0', freshnessDays: '7', enabled: true, notify: false, notifyThreshold: 'high',
      ntfyServer: '', ntfyTopic: '', model: 'sonnet',
    });
    const r = feedInputSchema.safeParse(p);
    expect(r.success).toBe(false);
  });
});
