import { expect, test } from '@playwright/test';
import { startSharedRuntime, waitFor } from './nars-runtime-fixture.mjs';

async function submitOperatorInputText(page, value) {
  await page.locator('#operator-input').fill(value);
  await page.locator('#operator-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

async function renderedEventRows(page, kind = null) {
  return page.evaluate((eventKind) => {
    const rows = Array.from(document.querySelectorAll('[data-event-kind]'));
    const filtered = eventKind ? rows.filter((row) => row.dataset.eventKind === eventKind) : rows;
    return filtered.map((row) => ({
      kind: row.dataset.eventKind ?? null,
      text: row.textContent ?? '',
      summary: row.querySelector('.event-summary')?.textContent ?? '',
    }));
  }, kind);
}

async function waitForRenderedEventCount(page, kind, count, label, timeoutMs = 5_000) {
  await waitFor(
    async () => (await renderedEventRows(page, kind)).length === count,
    timeoutMs,
    async () => ({ label, rows: await renderedEventRows(page, kind) }),
  );
}

async function setProjectionView(page, value) {
  return page.evaluate((nextValue) => {
    const select = document.querySelector('#projection-verbosity');
    if (!select) return { ok: false, reason: 'missing_projection_verbosity_select' };
    select.value = nextValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  }, value);
}

async function waitForRuntimeEvent(runtime, fromIndex, predicate, label, timeoutMs = 5_000) {
  return waitFor(
    () => runtime.events.slice(fromIndex).find(predicate),
    timeoutMs,
    () => ({
      label,
      recent_events: runtime.events.slice(fromIndex).map((entry) => ({
        event: entry.event,
        command: entry.command,
        request_id: entry.request_id,
        terminal_state: entry.terminal_state,
        message: entry.message,
        fields: entry.fields,
      })),
    }),
  );
}

test.describe('agent-web-ui live slash commands', () => {
  test('projects local UI slash actions and runtime control events through Playwright', async ({ page }) => {
    const runtime = await startSharedRuntime();

    try {
      await page.goto(runtime.localWeb.url);
      await expect(page.locator('#operator-input')).toBeVisible();
      await expect(page.locator('body')).toContainText('narada.e2e.resident');

      await submitOperatorInputText(page, '/help');
      await waitForRenderedEventCount(page, 'agent_web_ui_help', 1, 'slash_help_render_timeout');
      const helpRow = (await renderedEventRows(page, 'agent_web_ui_help'))[0];
      expect(helpRow.text).toMatch(/Commands/);
      expect(helpRow.text).toMatch(/Session state/);
      expect(helpRow.text).toMatch(/\/status/);

      await submitOperatorInputText(page, '/clear');
      await waitForRenderedEventCount(page, null, 0, 'slash_clear_render_timeout');

      await expect.poll(async () => await setProjectionView(page, 'raw')).toEqual({ ok: true, value: 'raw' });

      await submitOperatorInputText(page, '/events');
      await waitForRenderedEventCount(page, 'session_events_subscription_started', 1, 'slash_events_render_timeout');
      const eventsRow = (await renderedEventRows(page, 'session_events_subscription_started')).at(-1);
      expect(eventsRow?.text ?? '').toMatch(/Replay attached|replayed event\(s\)/);

      const runtimeCases = [
        {
          command: '/status',
          kind: 'session_health',
          assertEvent(event) {
            expect(event.event).toBe('session_health');
            expect(event.schema).toBe('narada.nars.health.v1');
            expect(event.session_id).toBe('web-ui-playwright-e2e');
            expect(event.intelligence?.provider).toBe('codex-subscription');
            expect(event.intelligence?.model).toBe('gpt-5.5');
          },
        },
        {
          command: '/health',
          kind: 'session_health',
          assertEvent(event) {
            expect(event.event).toBe('session_health');
            expect(event.schema).toBe('narada.nars.health.v1');
            expect(event.session_id).toBe('web-ui-playwright-e2e');
          },
        },
        {
          command: '/recovery',
          kind: 'session_recovery',
          assertEvent(event) {
            expect(event.event).toBe('session_recovery');
            expect(event.session_id).toBe('web-ui-playwright-e2e');
          },
        },
        {
          command: '/interrupt',
          kind: 'session_cancel',
          assertEvent(event) {
            expect(event.event).toBe('session_cancel');
            expect(typeof event.cancelled).toBe('boolean');
          },
        },
        {
          command: '/exit',
          kind: 'session_closed',
          assertEvent(event) {
            expect(event.event).toBe('session_closed');
            expect(event.terminal_state).toBe('closed');
          },
        },
      ];

      for (const step of runtimeCases) {
        const fromIndex = runtime.events.length;
        await submitOperatorInputText(page, step.command);
        const event = await waitForRuntimeEvent(
          runtime,
          fromIndex,
          (candidate) => candidate.event === step.kind,
          `slash_command_${step.kind}_timeout`,
        );
        step.assertEvent(event);
      }
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });
});
