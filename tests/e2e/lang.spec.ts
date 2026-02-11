import { expect, test } from '@playwright/test';

test('updates title and recent searches when changing language', async ({ page }) => {
  // If the app server is not available, skip E2E test to avoid false failures in local runs.
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) {
      test.skip('E2E server not available');
    }
  } catch {
    test.skip('E2E server not available');
  }

  // Ensure there is at least one recent search so the UI shows the Recent Searches element
  await page.addInitScript(() => {
    try {
      localStorage.setItem('recentSearches', JSON.stringify([{ city: 'Firenze', radius: '5', fuel: 'benzina' }]));
    } catch {
      // ignore
    }
  });

  await page.goto('/');
  // Wait for header to load
  await page.waitForSelector('#title-i18n');
  // Ensure the recent searches summary appears
  await page.waitForSelector('#recent-searches-i18n');

  // Click Italian button and verify translations
  await page.click('button:has-text("IT")');
  await page.waitForTimeout(250); // small delay for language change

  const titleIt = await page.title();
  expect(titleIt).toBe('Ricerca Distributori Benzina');

  const recentIt = await page.textContent('#recent-searches-i18n');
  expect(recentIt?.trim()).toBe('Ricerche Recenti:');

  // Click English button and verify translations
  await page.click('button:has-text("EN")');
  await page.waitForTimeout(250);

  const titleEn = await page.title();
  expect(titleEn).toBe('Gas Station Finder');

  const recentEn = await page.textContent('#recent-searches-i18n');
  expect(recentEn?.trim()).toBe('Recent Searches:');
});