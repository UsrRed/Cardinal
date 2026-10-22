import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { RSS_PORT, STATE_FILE } from './global-setup.js';

test('example feeds are present and disabled on first start', async ({ page }) => {
  await page.goto('/');
  for (const n of ['Actualités tech (RSS)', 'Vulnérabilités de dépendances (OSV)', 'CVE (NVD)']) {
    const card = page.locator('article.feed', { hasText: n });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveClass(/paused/);
  }
});

test('create rss feed, run now, open digest, mark read', async ({ page }) => {
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
});

test('app process is tracked for teardown', () => {
  const { pid } = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { pid: number };
  expect(() => process.kill(pid, 0)).not.toThrow();
});
