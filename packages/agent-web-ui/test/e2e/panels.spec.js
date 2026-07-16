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
    expect(new Set(await providerSelect.locator('option').allTextContents())).toEqual(new Set([
      'codex-subscription',
      'kimi-api',
      'kimi-code-api',
      'openai-api',
      'anthropic-api',
      'deepseek-api',
      'glm-api',
      'openrouter-api',
    ]));
    await expect(providerSelect).toHaveValue('codex-subscription');
    await expect(modelSelect).toHaveValue('gpt-5.5');
    const modelChoices = await modelSelect.locator('option').allTextContents();
    expect(new Set(modelChoices)).toEqual(new Set([
      'gpt-5.5',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex-spark',
    ]));
  } finally {
    await runtime.close();
  }
});

