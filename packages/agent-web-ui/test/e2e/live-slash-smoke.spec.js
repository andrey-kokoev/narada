import { expect, test } from '@playwright/test';
import { startSharedRuntime, waitFor } from './nars-runtime-fixture.mjs';

async function submitOperatorInputText(page, value) {
  await page.locator('#operator-input').fill(value);
  await page.locator('#operator-input').press('Enter');
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
  const select = page.locator('#projection-verbosity');
  if (await select.count() === 0) return { ok: false, reason: 'missing_projection_verbosity_select' };
  await select.selectOption(value);
  return { ok: true, value: await select.inputValue() };
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

test.describe('agent-web-ui session-core runtime slash commands', () => {
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
      const replayCompletedRows = await renderedEventRows(page, 'session_events_replay_completed');
      expect(replayCompletedRows.length).toBeGreaterThanOrEqual(2);
      expect(replayCompletedRows.at(-1)?.text ?? '').toContain('Replay complete');
      expect(replayCompletedRows.at(-1)?.text ?? '').toContain('replayed event(s)');
      expect(replayCompletedRows.at(-1)?.text ?? '').not.toContain('[object Object]');

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
      const submittedFrame = runtime.outboundFrames.find((frame) => frame.id === queued.request_id);
      expect(submittedFrame).toMatchObject({
        method: 'session.submit',
        params: { content: 'run startup sequence', source: 'manual_operator' },
      });
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
      expect(runtime.providerCalls.at(-1)?.messages.at(-1)).toMatchObject({ role: 'user', content: 'run startup sequence' });
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

  test('replays terminal input outcome after the event stream reconnects', async ({ page }) => {
    const runtime = await startSharedRuntime({
      sessionId: 'web-ui-playwright-reconnect-e2e',
      providerDelayMs: 2_500,
      responseContent: 'replayed after reconnect',
    });
    const eventSockets = [];
    page.on('websocket', (socket) => {
      if (socket.url() !== runtime.eventProjection.url) return;
      eventSockets.push(socket);
    });

    try {
      await page.goto(runtime.localWeb.url);
      await expect(page.locator('#operator-input')).toBeVisible();
      await expect.poll(() => runtime.eventProjection.subscribeRequests.length, { timeout: 5_000 }).toBeGreaterThan(0);

      const fromIndex = runtime.events.length;
      await page.locator('#operator-input').fill('complete after event stream reconnect');
      await page.locator('.composer-submit').click();
      const queued = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_queued' && Boolean(event.request_id),
        'reconnect_input_queued_timeout',
      );
      const completion = waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_completed' && event.request_id === queued.request_id,
        'reconnect_input_completed_timeout',
        10_000,
      );

      const firstSubscribe = runtime.eventProjection.subscribeRequests[0];
      runtime.eventProjection.closeConnections();
      await expect.poll(() => eventSockets.length, { timeout: 5_000 }).toBeGreaterThan(1);
      await expect.poll(() => runtime.eventProjection.subscribeRequests.length, { timeout: 5_000 }).toBeGreaterThan(1);

      // Force the terminal event to land during the second disconnect, so the
      // UI can only learn the outcome from the event-log replay on reconnect.
      runtime.eventProjection.closeConnections();
      const completed = await completion;
      expect(completed.terminal_state).toBe('completed');
      await expect.poll(() => eventSockets.length, { timeout: 5_000 }).toBeGreaterThan(2);
      await expect.poll(() => runtime.eventProjection.subscribeRequests.length, { timeout: 5_000 }).toBeGreaterThan(2);

      const replaySubscribe = runtime.eventProjection.subscribeRequests.at(-1);
      expect(firstSubscribe.params.since_sequence).toBeUndefined();
      expect(replaySubscribe.params.since_sequence).toEqual(expect.any(Number));
      expect(replaySubscribe.params.since_sequence).toBeGreaterThan(0);
      expect(runtime.outboundFrames.filter((frame) => frame.id === queued.request_id)).toHaveLength(1);
      expect(runtime.providerCalls).toHaveLength(1);
      const replayBatch = runtime.eventProjection.replayBatches.at(-1);
      expect(replayBatch.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'input_event_completed',
          request_id: queued.request_id,
          terminal_state: 'completed',
        }),
      ]));
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'completed', { timeout: 5_000 });
      await expect(page.locator('.composer-delivery-status')).toContainText('Input delivered');
      await expect(page.locator('.composer-delivery-status')).not.toContainText('Waiting for NARS acknowledgment');
      await expect(page.locator('.composer-delivery-status')).not.toContainText('Steering the active turn');
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('keeps an unacknowledged input recoverable across reload without automatic resend', async ({ page }) => {
    const runtime = await startSharedRuntime({
      sessionId: 'web-ui-playwright-timeout-e2e',
      swallowInputFrames: true,
      responseContent: 'explicit retry response',
    });

    try {
      await page.goto(runtime.localWeb.url);
      await submitOperatorInputText(page, 'proceed');

      await expect.poll(
        () => page.locator('#operator-form').getAttribute('data-operator-delivery-phase'),
        { timeout: 10_000 },
      ).toBe('timed_out');
      await expect(page.locator('.composer-delivery-status')).toContainText('Input not acknowledged');
      await expect(page.locator('.composer-retry')).toBeVisible();
      expect(runtime.inputFrameAttempts).toHaveLength(1);
      expect(runtime.inputFrameAttempts[0].swallowed).toBe(true);
      expect(runtime.inputFrameAttempts[0].frame).toMatchObject({ method: 'session.submit', params: { content: 'proceed', source: 'manual_operator' } });
      expect(runtime.providerCalls).toHaveLength(0);

      await page.reload();
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'timed_out');
      await expect(page.locator('.composer-retry')).toBeVisible();
      expect(runtime.inputFrameAttempts).toHaveLength(1);
      expect(runtime.providerCalls).toHaveLength(0);

      await page.locator('.composer-retry').click();
      await expect(page.locator('#operator-input')).toHaveValue('proceed');
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'reviewing');
      expect(runtime.inputFrameAttempts).toHaveLength(1);
      expect(runtime.providerCalls).toHaveLength(0);

      runtime.setSwallowInputFrames(false);
      const fromIndex = runtime.events.length;
      await submitOperatorInputText(page, 'proceed');
      const queued = await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_queued' && Boolean(event.request_id),
        'explicit_retry_input_queued_timeout',
        10_000,
      );
      await waitForRuntimeEvent(
        runtime,
        fromIndex,
        (event) => event.event === 'input_event_completed' && event.request_id === queued.request_id,
        'explicit_retry_input_completed_timeout',
        10_000,
      );
      expect(runtime.inputFrameAttempts).toHaveLength(2);
      expect(runtime.inputFrameAttempts[1].swallowed).toBe(false);
      expect(runtime.inputFrameAttempts[1].frame).toMatchObject({ method: 'session.submit', params: { content: 'proceed', source: 'manual_operator' } });
      expect(runtime.providerCalls).toHaveLength(1);
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'completed');
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
      expect(runtime.outboundFrames.find((frame) => frame.id === secondQueued.request_id)).toMatchObject({
        method: 'session.submit',
        params: { content: 'second turn', source: 'operator_steering', delivery_mode: 'admit_after_active_turn' },
      });

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
      expect(runtime.outboundFrames.find((frame) => frame.id === queued.request_id)).toMatchObject({
        method: 'session.submit',
        params: { content: 'run failing turn', source: 'manual_operator' },
      });
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'failed');
      await expect(page.locator('.composer-delivery-status')).toContainText('Input failed');
      await expect(page.locator('.composer-delivery-status')).toContainText('fixture_provider_failure');
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('correlates missing request IDs and converges duplicate out-of-order delivery events', async ({ page }) => {
    const runtime = await startSharedRuntime({
      sessionId: 'web-ui-playwright-correlation-e2e',
      swallowInputFrames: true,
    });

    try {
      await page.goto(runtime.localWeb.url);
      await submitOperatorInputText(page, 'correlate this runtime input');
      const attempt = await waitFor(() => runtime.inputFrameAttempts.at(-1), 5_000);
      const inputEventId = 'input-event-only-e2e';
      const eventBase = {
        method: 'session.submit',
        input_event_id: inputEventId,
        session_id: runtime.sessionId,
      };

      runtime.eventHub.publish({ event: 'input_event_queued', ...eventBase });
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'steering');
      await expect(page.locator('.composer-delivery-status')).not.toContainText('Waiting for NARS acknowledgment');

      runtime.eventHub.publish({ event: 'input_event_completed', ...eventBase, terminal_state: 'completed' });
      runtime.eventHub.publish({ event: 'input_event_started', ...eventBase });
      runtime.eventHub.publish({ event: 'input_event_queued', ...eventBase });

      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'completed');
      await expect(page.locator('.composer-delivery-status')).toContainText('Input delivered');
      expect(attempt.frame.id).toBeTruthy();
      expect(runtime.inputFrameAttempts).toHaveLength(1);
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('keeps pending input state unchanged when an event comes from another session', async ({ page }) => {
    const runtime = await startSharedRuntime({
      sessionId: 'web-ui-playwright-session-mismatch-e2e',
      swallowInputFrames: true,
    });

    try {
      await page.goto(runtime.localWeb.url);
      await submitOperatorInputText(page, 'do not accept another session');
      const attempt = await waitFor(() => runtime.inputFrameAttempts.at(-1), 5_000);
      runtime.eventHub.publish({
        event: 'input_event_queued',
        request_id: attempt.frame.id,
        input_event_id: 'wrong-session-input-event',
        method: 'session.submit',
        session_id: 'web-ui-playwright-different-session',
      });

      await expect(page.locator('[data-event-kind="web_ui_session_correlation_mismatch"]')).toHaveCount(1);
      await expect(page.locator('#operator-form')).toHaveAttribute('data-operator-delivery-phase', 'submitting');
      await expect(page.locator('.composer-delivery-status')).toContainText('Waiting for NARS acknowledgment');
      expect(runtime.inputFrameAttempts).toHaveLength(1);
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });
});
