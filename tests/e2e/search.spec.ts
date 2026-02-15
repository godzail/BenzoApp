import { expect, test } from '@playwright/test';

test('defaults to configured theme when no stored preference', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

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
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

  await page.addInitScript(() => {
    try {
      localStorage.setItem('recentSearches', JSON.stringify([{ city: 'Firenze', radius: '5', fuel: 'benzina', results: '5' }]));
    } catch {}
  });

  await page.goto('/');
  await page.waitForSelector('#recent-searches-list button');

  // Click the recent-search button
  await page.click('#recent-searches-list button');

  // Form should reflect the selected recent search
  const cityVal = await page.inputValue('#city');
  expect(cityVal).toBe('Firenze');

  // Results should appear
  await page.waitForSelector('#results-section:not(.hidden)');
  await page.waitForSelector('#stations-list article');
  const count = await page.$$eval('#stations-list article', (els) => els.length);
  expect(count).toBeGreaterThan(0);
});

test('search form submission displays results in the UI', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

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
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

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
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

  // Force initial language to Italian and mock search result with no 'gestore' so fallback is used
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

  // With Italian active, fallback text should be the Italian translation
  const ariaIt = await page.getAttribute('#stations-list article', 'aria-label');
  expect(ariaIt).toContain('Distributore');

  // Switch to English and expect the result card to update to English
  await page.click('#lang-en');
  await page.waitForTimeout(100); // small wait for UI update
  const ariaEn = await page.getAttribute('#stations-list article', 'aria-label');
  expect(ariaEn).toContain('Gas Station');
});
