import { FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests.
 * Ensures proper browser lifecycle management.
 */
async function globalSetup(config: FullConfig) {
  // This runs once before all tests
  console.log('Playwright global setup: initializing...');
}

export default globalSetup;
