import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PipelineTape } from '../../web/src/components/PipelineTape.js';
import { RunsView } from '../../web/src/pages/RunsPage.js';
import { RunView, applyRunEvent } from '../../web/src/pages/RunPage.js';
import { ApiError } from '../../web/src/api/client.js';
import type { Run } from '../../src/shared/types.js';

const steps = (states: string[]) =>
  ['fetch', 'dedup', 'triage', 'digest', 'notify'].map((step, i) => ({ step, state: states[i], detail: null })) as Run['steps'];
const run = (o: Partial<Run> = {}): Run => ({
  id: 'r1', feedId: 'f', feedName: 'Veille', status: 'running', trigger: 'manual', steps: steps(['done', 'done', 'running', 'todo', 'todo']),
  usage: { inputTokens: 1200, outputTokens: 300, costUsd: 0.1 }, fetchedCount: 5, newCount: 3, keptCount: 1, notifiedCount: 0, noNews: false,
  digestId: null, errorCode: null, queuedAt: '2026-01-01T10:00:00Z', startedAt: null, finishedAt: null, ...o,
});
const html = (el: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const rv = (p: Partial<Parameters<typeof RunsView>[0]>) =>
  html(createElement(RunsView, { loading: false, error: null, runs: null, stats: null, onRetry() {}, onPage() {}, ...p }));

describe('PipelineTape', () => {
  it('marks current step .now and previous .done', () => {
    const out = html(createElement(PipelineTape, { steps: run().steps }));
    expect(out).toMatch(/class="done" data-step="fetch"/);
    expect(out).toMatch(/class="done" data-step="dedup"/);
    expect(out).toMatch(/class="now" data-step="triage"/);
    expect(out).toMatch(/class="todo" data-step="digest"/);
  });
});

describe('RunsView', () => {
  it('renders loading, empty, error and totals', () => {
    expect(rv({ loading: true })).toContain('Chargement');
    expect(rv({ runs: { items: [], total: 0, page: 1, pageSize: 20 } })).toContain('Aucun run');
    expect(rv({ error: new ApiError(500, 'internal_error') })).toContain('Une erreur est survenue');
    const out = rv({
      runs: { items: [run()], total: 1, page: 1, pageSize: 20 },
      stats: { totals: { inputTokens: 1200, outputTokens: 300, costUsd: 0.1 }, runs: 1, byFeed: [{ feedId: 'f', name: 'Veille', usage: { inputTokens: 1200, outputTokens: 300, costUsd: 0.1 }, runs: 1 }] },
    });
    expect(out).toContain('Coût cumulé');
    expect(out).toContain('$0.1000');
  });
});

describe('RunView', () => {
  it('shows deferred stamp with explanation, cancel only when active', () => {
    const d = html(createElement(RunView, { run: run({ status: 'deferred' }), logs: [], onCancel() {} }));
    expect(d).toContain('Reporté');
    expect(d).toContain('reporté');
    expect(d).not.toContain('Annuler');
    expect(html(createElement(RunView, { run: run(), logs: [], onCancel() {} }))).toContain('Annuler');
  });
  it('applies live events', () => {
    let s = applyRunEvent(null, { type: 'run.snapshot', run: run(), logs: [] });
    s = applyRunEvent(s, { type: 'run.step', runId: 'r1', step: 'triage', state: 'done', detail: null });
    s = applyRunEvent(s, { type: 'run.log', runId: 'r1', log: { id: 1, runId: 'r1', ts: '2026-01-01T10:00:01Z', level: 'info', step: null, message: 'hi' } });
    s = applyRunEvent(s, { type: 'run.status', runId: 'r1', feedId: 'f', status: 'cancelled', errorCode: null });
    expect(s?.run.steps[2].state).toBe('done');
    expect(s?.logs).toHaveLength(1);
    expect(s?.run.status).toBe('cancelled');
  });
});
