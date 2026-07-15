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

test('Intelligence box exposes the admitted provider/runtime and active provider model choices', async ({ page }) => {
  const runtime = await startSessionCoreRuntime();
  try {
    await page.goto(runtime.localWeb.url);
    const providerSelect = page.locator('select.intelligence-provider-select');
    const modelSelect = page.locator('select.intelligence-model-select');
    await expect(providerSelect).toBeVisible();
    await expect(modelSelect).toBeVisible();
    await expect(providerSelect.locator('option')).toHaveCount(8);
    await expect(modelSelect.locator('option')).toHaveCount(7);
    expect(await providerSelect.locator('option').allTextContents()).toEqual([
      'codex-subscription',
      'kimi-api',
      'kimi-code-api',
      'openai-api',
      'anthropic-api',
      'deepseek-api',
      'glm-api',
      'openrouter-api',
    ]);
    expect(await modelSelect.locator('option').allTextContents()).toEqual([
      'gpt-5.5',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex-spark',
    ]);
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
