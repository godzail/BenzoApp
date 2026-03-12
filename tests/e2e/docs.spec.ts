import { expect, test } from '@playwright/test';
import { skipIfServerUnavailable } from './helpers';

test('documentation page loads without runtime errors', async ({ page }) => {
  await skipIfServerUnavailable(page);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/help/user-en');
  await page.waitForSelector('.docs-content');

  const heading = await page.textContent('.docs-content h1');
  expect(heading?.trim()).toBe('BenzoApp User Guide');

  expect(errors).toEqual([]);
});

test('returning from docs preserves SPA search state when using the back button', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.goto('/');
  await page.fill('#city', 'Firenze');
  await page.click('#search-submit');

  // wait for results to appear
  await page.waitForSelector('#stations-list article');

  // navigate to docs and then use the docs "Back" button
  await page.click('#docs-link');
  await page.waitForSelector('.docs-content');

  await page.click('button[aria-label="Back to main page"]');
  await page.waitForSelector('#city');

  const cityValue = await page.inputValue('#city');
  expect(cityValue).toBe('Firenze');
});
