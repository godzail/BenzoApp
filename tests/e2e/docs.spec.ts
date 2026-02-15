import { expect, test } from '@playwright/test';

test('documentation page loads without runtime errors', async ({ page }) => {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';

  // Skip if server not available
  try {
    const resp = await page.request.get(base + '/help/user-en');
    if (resp.status() !== 200) {
      test.skip('E2E server not available');
    }
  } catch {
    test.skip('E2E server not available');
  }

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/help/user-en');
  await page.waitForSelector('.docs-content');

  // Assert expected heading present
  const heading = await page.textContent('.docs-content h1');
  expect(heading?.trim()).toBe('BenzoApp User Guide');

  // Fail if any runtime errors were captured
  expect(errors).toEqual([]);
});