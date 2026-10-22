import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { RSS_PORT, STATE_FILE } from './global-setup.js';

const SHOTS = 'docs/qa/screenshots';
mkdirSync(SHOTS, { recursive: true });

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  return problems;
}

test('invalid feed input shows clear field errors and creates nothing', async ({ page }) => {
  const problems = watchErrors(page);
  await page.goto('/feeds/new');
  await page.getByLabel('Nom', { exact: true }).fill('Invalid feed');
  await page.getByLabel('Instructions').fill('x');
  await page.getByLabel('URL des flux (une par ligne)').fill('ftp://example.com/feed.xml');
  await page.getByRole('button', { name: 'Créer le flux' }).click();
  const alert = page.locator('.ferr[role="alert"]').first();
  await expect(alert).toBeVisible();
  await expect(alert).not.toBeEmpty();
  await expect(page).toHaveURL(/\/feeds\/new/);
  await expect(page.getByRole('button', { name: 'Créer le flux' })).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/error-state.png`, fullPage: true });
  // client-side validation: no request reached the server
  expect(problems).toEqual([]);
  await page.goto('/');
  await expect(page.locator('article.feed', { hasText: 'Invalid feed' })).toHaveCount(0);
});

test('example feeds are present and disabled on first start', async ({ page }) => {
  await page.goto('/');
  for (const n of ['Actualités tech (RSS)', 'Vulnérabilités de dépendances (OSV)', 'CVE (NVD)']) {
    const card = page.locator('article.feed', { hasText: n });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveClass(/paused/);
  }
});

test('create rss feed, run now, open digest, mark read', async ({ page }) => {
  const problems = watchErrors(page);
  await page.goto('/feeds/new');
  await page.getByLabel('Nom', { exact: true }).fill('E2E feed');
  await page.getByLabel('Instructions').fill('Summarize releases.');
  await page.getByLabel('URL des flux (une par ligne)').fill(`http://127.0.0.1:${RSS_PORT}/feed.xml`);
  await page.getByRole('button', { name: 'Créer le flux' }).click();

  const card = page.locator('article.feed', { hasText: 'E2E feed' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Lancer maintenant' }).click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(page.locator('.stamp.s-ok')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Voir le digest' }).click();
  await expect(page).toHaveURL(/\/digests\//);

  const link = page.locator('dl.sources a').first();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  await page.getByRole('button', { name: 'Marquer lu' }).first().click();
  await expect(page.getByRole('button', { name: '✓ Lu' })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/happy-path.png`, fullPage: true });
  expect(problems).toEqual([]);
});

test('app process is tracked for teardown', () => {
  const { pid } = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { pid: number };
  expect(() => process.kill(pid, 0)).not.toThrow();
});
