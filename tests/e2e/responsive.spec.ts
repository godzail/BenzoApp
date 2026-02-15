import { expect, test } from '@playwright/test';

test('search divider is present after search button', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

  await page.goto('/');
  await page.waitForSelector('#title-i18n');
  await page.waitForSelector('#search-submit + .search-divider');
  await expect(page.locator('#search-submit + .search-divider')).toBeVisible();
});

test('stations list has vertical gap when results render', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  // Trigger a real search (server-backed) — fallback to existing behavior in other e2e tests
  await page.fill('#city', 'Bologna');
  await page.click('#search-submit');
  await page.waitForSelector('#stations-list article');

  const gap = await page.$eval('#stations-list', (el) => getComputedStyle(el).gap);
  expect(parseFloat(gap)).toBeGreaterThan(0);
});

test('header controls wrap and language/docs buttons do not overlap (tablet)', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  const wrap = await page.$eval('.controls-row', (el) => getComputedStyle(el).flexWrap);
  expect(wrap).toBe('wrap');

  const en = await page.locator('#lang-en').boundingBox();
  const it = await page.locator('#lang-it').boundingBox();
  const docs = await page.locator('#docs-link').boundingBox();
  // boundingBox can be null in headless failure; guard against that
  expect(en).toBeTruthy();
  expect(it).toBeTruthy();
  expect(docs).toBeTruthy();

  const boxes = [en!, it!, docs!];
  // ensure no pair overlaps horizontally
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
      expect(overlap).toBe(false);
    }
  }
});

test('map becomes visible on mobile after search', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';
  try {
    const resp = await page.request.get(base);
    if (resp.status() !== 200) test.skip('E2E server not available');
  } catch {
    test.skip('E2E server not available');
  }

  // Mock search response for deterministic results
  await page.route('**/search', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stations: [
          { id: 1, latitude: 44.5, longitude: 11.3, address: 'Via Mock 1', fuel_prices: [{ type: 'benzina', price: 1.234 }], distance: 1.2 }
        ]
      })
    });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForSelector('#title-i18n');

  await page.fill('#city', 'MockCity');
  await page.click('#search-submit');
  await page.waitForSelector('#results-section:not(.hidden)');

  // Map should be visible on mobile and have reasonable height
  await page.waitForSelector('#map');
  expect(await page.isVisible('#map')).toBe(true);
  const h = await page.$eval('#map', (el) => (el as HTMLElement).clientHeight);
  expect(h).toBeGreaterThan(200);

  // Map must be rendered *after* the search controls (after the divider)
  // and *before* the results list on mobile.
  const mapBox = await page.locator('#map').boundingBox();
  const dividerBox = await page.locator('.search-divider').boundingBox();
  const resultsBox = await page.locator('#results-section').boundingBox();
  expect(mapBox).toBeTruthy();
  expect(dividerBox).toBeTruthy();
  expect(resultsBox).toBeTruthy();
  expect(mapBox!.y).toBeGreaterThan(dividerBox!.y);
  expect(mapBox!.y).toBeLessThan(resultsBox!.y);
});