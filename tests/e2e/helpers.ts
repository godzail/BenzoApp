import { test } from "@playwright/test";

export const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:8000";

export async function skipIfServerUnavailable(page: any): Promise<void> {
  try {
    const resp = await page.request.get(E2E_BASE_URL);
    if (resp.status() !== 200) {
      test.skip();
    }
  } catch {
    test.skip();
  }
}
