import { describe, expect, it } from 'vitest';
import { feedInputSchema, feedPatchSchema, settingsPatchSchema, zodFields } from '../../src/shared/schemas.js';
import { FakeClock } from '../../src/shared/clock.js';

const base = {
  name: 'N',
  instructions: 'I',
  sourceType: 'rss',
  sourceParams: { urls: ['https://a.example/feed'] },
  frequencyHours: 24,
  freshnessDays: 7,
};
const fields = (v: unknown) => {
  const r = feedInputSchema.safeParse(v);
  return r.success ? null : zodFields(r.error);
};

describe('feedInputSchema', () => {
  it('accepts valid input and applies defaults', () => {
    const r = feedInputSchema.parse(base);
    expect(r.model).toBe('sonnet');
    expect(r.budgetUsd).toBe(1);
  });
  it('rejects frequency 0 and 721', () => {
    expect(fields({ ...base, frequencyHours: 0 })).toHaveProperty('frequencyHours');
    expect(fields({ ...base, frequencyHours: 721 })).toHaveProperty('frequencyHours');
  });
  it('rejects empty url list and ftp url with per-field errors', () => {
    expect(fields({ ...base, sourceParams: { urls: [] } })).toHaveProperty(['sourceParams.urls']);
    expect(fields({ ...base, sourceParams: { urls: ['ftp://x.example/f'] } })).toHaveProperty(['sourceParams.urls.0']);
  });
  it('rejects unknown ecosystem', () => {
    const f = fields({ ...base, sourceType: 'osv', sourceParams: { packages: [{ name: 'x', ecosystem: 'Foo' }] } });
    expect(f).toHaveProperty(['sourceParams.packages.0.ecosystem']);
  });
  it('patch requires sourceParams with sourceType', () => {
    expect(feedPatchSchema.safeParse({ sourceType: 'rss' }).success).toBe(false);
    expect(feedPatchSchema.safeParse({ name: 'x' }).success).toBe(true);
  });
});

describe('settingsPatchSchema', () => {
  it('validates timezone', () => {
    expect(settingsPatchSchema.safeParse({ timezone: 'Europe/Paris' }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false);
  });
});

describe('FakeClock', () => {
  it('advance moves now and fires timers', () => {
    const c = new FakeClock(1000);
    let fired = 0;
    c.setTimeout(() => fired++, 50);
    c.advance(100);
    expect(c.now()).toBe(1100);
    expect(fired).toBe(1);
  });
});
