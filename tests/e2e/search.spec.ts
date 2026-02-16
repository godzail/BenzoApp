import { expect, test } from '@playwright/test';
import { skipIfServerUnavailable } from './helpers';

test('defaults to configured theme when no stored preference', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('app-theme');
      document.documentElement.removeAttribute('data-theme');
    } catch {}
  });

  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(theme).toBe('light');
});

test('clicking a recent search updates the form and shows results', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.addInitScript(() => {
    try {
      localStorage.setItem('recentSearches', JSON.stringify([{ city: 'Firenze', radius: '5', fuel: 'benzina', results: '5' }]));
    } catch {}
  });

  await page.goto('/');
  await page.waitForSelector('#recent-searches-list button');

  await page.click('#recent-searches-list button');

  const cityVal = await page.inputValue('#city');
  expect(cityVal).toBe('Firenze');

  await page.waitForSelector('#results-section:not(.hidden)');
  await page.waitForSelector('#stations-list article');
  const count = await page.$$eval('#stations-list article', (els) => els.length);
  expect(count).toBeGreaterThan(0);
});

test('search form submission displays results in the UI', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  await page.fill('#city', 'Bologna');
  await page.click('#search-submit');

  await page.waitForSelector('#results-section:not(.hidden)');
  await page.waitForSelector('#stations-list article');
  const count = await page.$$eval('#stations-list article', (els) => els.length);
  expect(count).toBeGreaterThan(0);
});

test('pressing Enter in city input starts search', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  await page.fill('#city', 'Bologna');
  await page.press('#city', 'Enter');

  await page.waitForSelector('#results-section:not(.hidden)');
  await page.waitForSelector('#stations-list article');
  const count = await page.$$eval('#stations-list article', (els) => els.length);
  expect(count).toBeGreaterThan(0);
});

test('language switch updates station card aria-label (EN/IT)', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.addInitScript(() => {
    try {
      localStorage.setItem('lang', 'it');
    } catch {}
  });

  await page.route('**/search', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stations: [
          {
            id: 99999,
            latitude: 45.0,
            longitude: 9.0,
            address: 'Via Mock 1',
            fuel_prices: [{ type: 'benzina', price: 1.234 }],
            distance: 1.2
          }
        ]
      }),
    });
  });

  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  await page.fill('#city', 'MockCity');
  await page.click('#search-submit');
  await page.waitForSelector('#stations-list article');

  const ariaIt = await page.getAttribute('#stations-list article', 'aria-label');
  expect(ariaIt).toContain('Distributore');

  await page.click('#lang-en');
  await page.waitForTimeout(100);
  const ariaEn = await page.getAttribute('#stations-list article', 'aria-label');
  expect(ariaEn).toContain('Gas Station');
});
