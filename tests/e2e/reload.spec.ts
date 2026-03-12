import { expect, isServerAvailable, preventCsvPopupScript, test } from './helpers';

test('reload button shows spinner while reloading and becomes enabled after', async ({ page }) => {
  if (!(await isServerAvailable(page))) test.skip();

  await page.addInitScript(preventCsvPopupScript());
  await page.goto('/');
  await page.waitForSelector('#reload-btn');

  // Click reload and assert spinner appears and button is disabled
  // stub the reload endpoint with a small delay so the spinner has time to
  // appear; without this the promise resolves instantly and the UI briefly
  // toggles back before Playwright can observe it.
  await page.route('**/api/reload-csv', async (route) => {
    // simulate network latency
    await page.waitForTimeout(50);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_updated: new Date().toISOString(), source: 'manual' }),
    });
  });

  await page.click('#reload-btn');

  // spinner should now be visible and button disabled
  await expect(page.locator('#reload-spinner')).toBeVisible();
  await expect(page.locator('#reload-btn')).toBeDisabled();

  // when the reload completes the spinner should hide and button re-enable
  await expect(page.locator('#reload-spinner')).toHaveClass(/hidden/, { timeout: 5000 });
  await expect(page.locator('#reload-btn')).toBeEnabled();
});