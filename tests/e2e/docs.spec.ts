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
