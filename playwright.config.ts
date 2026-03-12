import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  globalSetup: require.resolve('./tests/global-setup'),
  globalTeardown: require.resolve('./tests/global-teardown'),
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Ensure fresh context for each test (browser context isolation)
    // Each test gets its own isolated browser context
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  // Ensure each test gets a fresh browser context
  // Browser is shared across tests for performance but contexts are isolated
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
