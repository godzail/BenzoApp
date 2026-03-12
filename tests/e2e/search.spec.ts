import { expect, isServerAvailable, preventCsvPopupScript, test } from './helpers';

test('defaults to configured theme when no stored preference', async ({ page }) => {
  if (!(await isServerAvailable(page))) test.skip();


  await page.addInitScript(() => {
    try {
      localStorage.removeItem('app-theme');
      document.documentElement.removeAttribute('data-theme');
    } catch {}
  });
  await page.addInitScript(preventCsvPopupScript());

  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(theme).toBe('light');
});

test('search form submission displays results in the UI', async ({ page }) => {
  if (!(await isServerAvailable(page))) test.skip();

  await page.addInitScript(preventCsvPopupScript());
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
  if (!(await isServerAvailable(page))) test.skip();

  await page.addInitScript(preventCsvPopupScript());
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
  if (!(await isServerAvailable(page))) test.skip();

  await page.addInitScript(() => {
    try {
      localStorage.setItem('lang', 'it');
    } catch {}
  });
  await page.addInitScript(preventCsvPopupScript());

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

  // use built-in expect to wait for attribute values rather than manual timeouts
  await expect(page.locator('#stations-list article')).toHaveAttribute(
    'aria-label',
    /Distributore/
  );

  await page.click('#lang-en');
  // rerun a search to force results re-render with updated language. the
  // global route stub defined in helpers will still return the same mock data.
  await page.click('#search-submit');
  await page.waitForSelector('#stations-list article');
  await expect(page.locator('#stations-list article')).toHaveAttribute(
    'aria-label',
    /Gas Station/
  );
});
