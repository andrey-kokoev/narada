import { expect, test } from '@playwright/test';
import { startSessionCoreRuntime, waitFor } from './nars-runtime-fixture.mjs';

test('deprecated Agent Web UI attaches to the session-core health and event projections', async ({ page }) => {
  const runtime = await startSessionCoreRuntime();
  try {
    await page.goto(runtime.localWeb.url);
    await expect(page.locator('#operator-input')).toBeVisible();
    await expect(page.locator('body')).toContainText('narada.e2e.resident');
    await page.locator('#operator-input').fill('/health');
    await page.locator('#operator-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await waitFor(() => runtime.events.some((event) => event.event === 'session_health'), 5_000);
    const health = await fetch(new URL('/api/health', runtime.localWeb.url)).then((response) => response.json());
    expect(health.schema).toBe('narada.nars.health.v1');
    expect(health.status).toBe('healthy');
  } finally {
    await runtime.close();
  }
});

test('deprecated Agent Web UI keeps panel authority outside the local session-core transport', async ({ page }) => {
  const runtime = await startSessionCoreRuntime();
  try {
    await page.goto(runtime.localWeb.url);
    await expect(page.locator('#operator-input')).toBeVisible();
    await expect(page.locator('body')).toContainText('narada.e2e.resident');
    const health = await fetch(runtime.healthProjection.url).then((response) => response.json());
    expect(health.schema).toBe('narada.nars.health.v1');
    expect(health.status).toBe('healthy');
    expect(health.mcp_tools).toBeUndefined();
  } finally {
    await runtime.close();
  }
});
