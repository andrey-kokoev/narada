import { expect, test } from '@playwright/test';
import { startSessionCoreRuntime, waitFor } from './nars-runtime-fixture.mjs';

test('Agent Web UI renders health emitted by the attached session-core runtime', async ({ page }) => {
  const runtime = await startSessionCoreRuntime();
  try {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('narada:agent-web-ui:status-row-open.v1', 'true');
      localStorage.setItem('narada:agent-web-ui:header-items.v2', JSON.stringify(['identity', 'runtime', 'session', 'status_toggle']));
      localStorage.setItem('narada:agent-web-ui:status-boxes.v3', JSON.stringify(['events', 'health', 'intelligence', 'view']));
    });
    await page.goto(runtime.localWeb.url);
    await expect(page.locator('#operator-input')).toBeVisible();
    await expect(page.locator('body')).toContainText('narada.e2e.resident');
    await page.locator('#operator-input').fill('/health');
    await page.locator('#operator-input').press('Enter');
    await waitFor(() => runtime.events.some((event) => event.event === 'session_health'), 5_000);
    await expect(page.locator('.session-chip[data-state="healthy"]')).toBeVisible();
    await expect(page.locator('.session-chip[data-state="healthy"]')).toContainText('web-ui-playwright-e2e');
  } finally {
    await runtime.close();
  }
});

