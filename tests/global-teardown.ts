import { FullConfig } from '@playwright/test';

/**
 * Global teardown for Playwright tests.
 * Ensures browser is properly closed after all tests complete.
 */
async function globalTeardown(config: FullConfig) {
  console.log('Playwright global teardown: cleaning up...');
  // Browser cleanup is handled automatically by Playwright
  // This file exists for any additional cleanup needed
}

export default globalTeardown;
