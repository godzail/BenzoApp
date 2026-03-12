import { Page, test as baseTest, expect } from "@playwright/test";

// Re-export `expect` so specs can import it from helpers instead of '@playwright/test'.
export { expect };

// Create a custom test fixture that adds cleanup logic.
export const test = baseTest.extend<{}>({});

// Close context (and therefore page) after each test to avoid leaks and ensure
// total isolation. In most cases Playwright already does this, but explicit
// cleanup solves flaky failures where a skipped/errored test left resources
// open and subsequent tests behaved unexpectedly.
test.afterEach(async ({ page }) => {
  try {
    await page.context().close();
  } catch {
    // ignore errors during teardown, page may already be closed
  }
});

// ensure consistent theme in headless environment: default to light mode so
// assertions that look at data-theme are deterministic. Individual tests can
// override if they need different behavior.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(mockMatchMedia('light'));

  // stub the search endpoint with a simple predictable response so
  // tests do not depend on an external backend or live data. Individual
  // tests may override this by registering their own route after this
  // hook.
  await page.route('**/search', (route) => {
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stations: [
          {
            id: 1,
            latitude: 45.0,
            longitude: 9.0,
            address: 'Via Mock 1',
            fuel_prices: [{ type: 'benzina', price: 1.234 }],
            distance: 1.2,
          },
        ],
      }),
    });
  });
});

export const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8000";

/**
 * Check if the server is available. Returns true if server responds with 200.
 * Use with test.skip() in spec files: if (!(await isServerAvailable(page))) test.skip();
 */
export async function isServerAvailable(page: Page): Promise<boolean> {
  // We no longer rely on a live backend for most tests; the global
  // route defined in beforeEach provides canned results. As long as the
  // app itself can be navigated, assume availability. This prevents the
  // `test.skip()` logic from silencing failing specs in CI when the
  // server is offline.
  try {
    const resp = await page.request.get(E2E_BASE_URL);
    return resp.status() === 200;
  } catch {
    // swallow the error and treat as available
    return true;
  }
}

/**
 * @deprecated Use isServerAvailable() instead and call test.skip() in spec files.
 * This function is kept for backward compatibility but should not be used in new code.
 */
export async function skipIfServerUnavailable(page: Page): Promise<void> {
  // This function is deprecated - spec files should use isServerAvailable() with test.skip()
  // Keeping for backward compatibility but it won't actually skip anymore
  const available = await isServerAvailable(page);
  if (!available) {
    console.warn(`Server at ${E2E_BASE_URL} is not available. Test may fail.`);
  }
}

/**
 * Prevent the CSV update popup from showing during tests.
 * This should be called before page.goto() using addInitScript.
 */
export function preventCsvPopupScript(): string {
  return `
    // Override showCsvUpdatePopup to prevent popup from showing
    window.addEventListener('DOMContentLoaded', () => {
      // Wait for the app to initialize, then override the popup function
      const checkAndOverride = setInterval(() => {
        if (window.app && typeof window.app.showCsvUpdatePopup === 'function') {
          window.app.showCsvUpdatePopup = () => {};
          clearInterval(checkAndOverride);
        }
      }, 50);

      // Also hide the popup element if it exists
      setTimeout(() => {
        const popup = document.getElementById('csv-update-popup');
        if (popup) {
          popup.classList.add('hidden');
          popup.style.display = 'none';
        }
      }, 100);
    });
  `;
}

/**
 * Dismiss the CSV update popup if it appears on the main page.
 * The popup may show when data is stale or missing.
 * Note: prefer using preventCsvPopupScript() with addInitScript for more reliable prevention.
 */
export async function dismissCsvPopup(page: Page): Promise<void> {
  try {
    const popup = page.locator('#csv-update-popup');

    // Wait for popup to potentially appear (not hidden)
    await popup.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

    // Check if popup is visible and dismiss it
    const isVisible = await popup.isVisible().catch(() => false);
    if (isVisible) {
      // Hide the popup by adding the hidden class
      await page.evaluate(() => {
        const popup = document.getElementById('csv-update-popup');
        if (popup) {
          popup.classList.add('hidden');
          popup.style.display = 'none';
        }
      });

      // Wait for popup to be hidden
      await popup.waitFor({ state: 'hidden', timeout: 1000 }).catch(() => {});
    }
  } catch {
    // Popup didn't appear, which is fine
  }
}

// Helper to fake system colour-scheme preference in tests. Returns a string
// script suitable for page.addInitScript().
export function mockMatchMedia(theme: 'light' | 'dark'): string {
  const matchesLight = theme === 'light';
  return `
    Object.defineProperty(window, 'matchMedia', {
      value: (query) => ({
        matches: query === '(prefers-color-scheme: light)' ? ${matchesLight} : !${matchesLight},
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        onchange: null,
        dispatchEvent: () => false
      })
    });
  `;
}
