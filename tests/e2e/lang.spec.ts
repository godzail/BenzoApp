import { expect, test } from '@playwright/test';
import { skipIfServerUnavailable } from './helpers';

test('updates title and recent searches when changing language', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.addInitScript(() => {
    try {
      localStorage.setItem('recentSearches', JSON.stringify([{ city: 'Firenze', radius: '5', fuel: 'benzina' }]));
    } catch {
      // ignore
    }
  });

  await page.goto('/');
  await page.waitForSelector('#title-i18n');
  await page.waitForSelector('#recent-searches-i18n');

  await page.click('button:has-text("IT")');
  await page.waitForTimeout(250);

  const titleIt = await page.title();
  expect(titleIt).toBe('Ricerca Distributori Benzina');

  const recentIt = await page.textContent('#recent-searches-i18n');
  expect(recentIt?.trim()).toBe('Ricerche Recenti:');

  await page.waitForSelector('#fuel-benzina-text');
  const fuelIt = await page.textContent('#fuel-benzina-text');
  expect(fuelIt?.trim()).toBe('Benzina');

  // language buttons should reflect selected state (ARIA + visual)
  expect(await page.getAttribute('#lang-it', 'aria-pressed')).toBe('true');
  expect(await page.getAttribute('#lang-en', 'aria-pressed')).toBe('false');

  await page.click('button:has-text("EN")');
  await page.waitForTimeout(250);

  const titleEn = await page.title();
  expect(titleEn).toBe('Gas Station Finder');

  const recentEn = await page.textContent('#recent-searches-i18n');
  expect(recentEn?.trim()).toBe('Recent Searches:');

  await page.waitForSelector('#fuel-benzina-text');
  const fuelEn = await page.textContent('#fuel-benzina-text');
  const tf = await page.evaluate(() => (window.translateFuel ? window.translateFuel('benzina') : null));
  expect(tf).toBe('Gasoline');
  expect(fuelEn?.trim()).toBe('Gasoline');

  // ARIA state should update when language changes
  expect(await page.getAttribute('#lang-en', 'aria-pressed')).toBe('true');
  expect(await page.getAttribute('#lang-it', 'aria-pressed')).toBe('false');
});
