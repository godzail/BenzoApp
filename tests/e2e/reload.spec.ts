import { expect, test } from '@playwright/test';
import { skipIfServerUnavailable } from './helpers';

test('reload button shows spinner while reloading and becomes enabled after', async ({ page }) => {
  await skipIfServerUnavailable(page);

  await page.goto('/');
  await page.waitForSelector('#reload-btn');

  // Click reload and assert spinner appears and button is disabled
  await page.click('#reload-btn');

  // spinner should be visible immediately after click
  const spinnerHidden = await page.$eval('#reload-spinner', (el) => el.classList.contains('hidden'));
  expect(spinnerHidden).toBe(false);

  const btnDisabled = await page.$eval('#reload-btn', (el) => (el as HTMLButtonElement).disabled);
  expect(btnDisabled).toBe(true);

  // wait until spinner is hidden again (reload completed)
  await page.waitForSelector('#reload-spinner.hidden', { timeout: 5000 });

  const btnDisabledAfter = await page.$eval('#reload-btn', (el) => (el as HTMLButtonElement).disabled);
  expect(btnDisabledAfter).toBe(false);
});