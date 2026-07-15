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
      await waitForRenderedEventCount(page, 'session_events_subscription_started', 1, 'raw_view_replay_render_timeout');
      const replayRowsBeforeEventsCommand = (await renderedEventRows(page, 'session_events_subscription_started')).length;

      await submitOperatorInputText(page, '/events');
      await waitForRenderedEventCount(page, 'session_events_subscription_started', replayRowsBeforeEventsCommand + 1, 'slash_events_render_timeout');
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

  test('projects operator input delivery through NARS acknowledgment and turn completion', async ({ page }) => {
    const runtime = await startSharedRuntime({ responseContent: 'operator delivery success' });

    try {
      await page.goto(runtime.localWeb.url);
      const fromIndex = runtime.events.length;
      await submitOperatorInputText(page, 'run startup sequence');

      const queued = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_queued' && Boolean(event.request_id),
        'operator_input_queued_timeout',
      );
      const started = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_started' && event.request_id === queued.request_id,
        'operator_input_started_timeout',
      );
      const turnStarted = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'carrier_turn_started' && event.turn_id === queued.event_id,
        'operator_turn_started_timeout',
      );
      const assistant = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'assistant_message' && event.turn_id === turnStarted.turn_id,
        'operator_assistant_message_timeout',
      );
      const turnCompleted = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'carrier_turn_completed' && event.turn_id === turnStarted.turn_id,
        'operator_turn_completed_timeout',
      );
      const inputCompleted = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_completed' && event.request_id === queued.request_id,
        'operator_input_completed_timeout',
      );
      const response = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'session_control_response' && event.request_id === queued.request_id,
        'operator_control_response_timeout',
      );

      expect(started.request_id).toBe(queued.request_id);
      expect(assistant.content).toBe('operator delivery success');
      expect(turnCompleted.turn_id).toBe(queued.event_id);
      expect(inputCompleted.terminal_state).toBe('completed');
      expect(response.terminal_state).toBe('completed');
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'completed');
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-request-id', queued.request_id);
      await expect(page.locator('.composer-delivery-status')).toContainText('Input delivered');
      await expect(page.locator('[data-event-kind^="activity_"]')).toHaveCount(0);
      await expect(page.locator('.composer-delivery-status')).not.toContainText('Waiting for agent');
      await expect(page.locator('.composer-delivery-status')).not.toContainText('Steering the active turn');
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('shows queued delivery while an earlier NARS turn is active', async ({ page }) => {
    const runtime = await startSharedRuntime({ providerDelayMs: 800, responseContent: 'queued delivery response' });

    try {
      await page.goto(runtime.localWeb.url);
      const firstFromIndex = runtime.events.length;
      await submitOperatorInputText(page, 'first turn');
      const firstTurn = await waitForRuntimeEvent(
        runtime,
        firstFromIndex,
        (event) => event.event === 'carrier_turn_started',
        'first_turn_started_timeout',
      );

      await page.locator('#operator-input').fill('second turn');
      await page.locator('#operator-input').press('Tab');
      const secondQueued = await waitForRuntimeEvent(
        runtime,
        firstFromIndex,
        (event) => event.event === 'input_event_queued' && event.event_id !== firstTurn.turn_id && Boolean(event.request_id),
        'second_input_queued_timeout',
      );

      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'queued');
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-request-id', secondQueued.request_id);
      await expect(page.locator('.composer-delivery-status')).toContainText('Queued for the next turn');

      await waitForRuntimeEvent(
        runtime,
        firstFromIndex,
        (event) => event.event === 'input_event_completed' && event.request_id === secondQueued.request_id,
        'second_input_completed_timeout',
        10_000,
      );
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'completed');
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('projects provider failure as failed input delivery after NARS rejection', async ({ page }) => {
    const runtime = await startSharedRuntime({ providerError: 'fixture_provider_failure' });

    try {
      await page.goto(runtime.localWeb.url);
      const fromIndex = runtime.events.length;
      await submitOperatorInputText(page, 'run failing turn');
      const queued = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_queued' && Boolean(event.request_id),
        'failed_input_queued_timeout',
      );
      const failedTurn = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'carrier_turn_failed' && event.turn_id === queued.event_id,
        'failed_turn_timeout',
      );
      const rejected = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'session_control_rejected' && event.request_id === queued.request_id,
        'failed_control_rejection_timeout',
      );

      expect(failedTurn.error).toBe('fixture_provider_failure');
      expect(rejected.code).toBe('request_dispatch_failed');
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'failed');
      await expect(page.locator('.composer-delivery-status')).toContainText('Input failed');
      await expect(page.locator('.composer-delivery-status')).toContainText('fixture_provider_failure');
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });
});
