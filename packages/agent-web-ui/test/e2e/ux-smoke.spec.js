import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { expect, test } from '@playwright/test';
import { createEventHub, startEventStreamProjection } from '@narada2/agent-runtime-server/test-fixtures';
import { AGENT_WEB_UI_NARS_METHOD_LIST } from '@narada2/nars-client-projection-contract';
import { startAgentWebUiServer } from '../../src/server.ts';

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve(`http://${host}:${address.port}/health`);
    });
  });
}

async function withHealthServer(fn, options = {}) {
  const healthState = options.healthState ?? { sessionId: 'ux_session' };
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ schema: 'narada.nars.health.v1', status: 'healthy', site_id: 'narada.ux', agent_id: 'ux.agent', role: 'resident', session_id: healthState.sessionId, mcp_operational_state: 'healthy' }));
  });
  const url = await listen(server);
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

// Projection-only fixture events for layout/rendering assertions. Runtime
// delivery, turn completion, and terminal outcomes belong in live-slash-smoke.
function publishScenarioEvents(eventHub, scenario, sessionId = `ux_${scenario}`) {
  const base = { agent_id: 'ux.agent', session_id: sessionId, timestamp: new Date().toISOString(), provider: 'codex-subscription' };
  eventHub.publish({ ...base, event: 'session_started', site_id: 'narada.ux', role: 'resident', model: 'gpt-5.5', mcp_server_count: 15, mcp_operational_state: 'healthy' });
  if (scenario === 'thinking') {
    eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_thinking', content: 'Think through the plan' });
    eventHub.publish({ ...base, event: 'turn_started', turn_id: 'turn_thinking', request_id: 'input_thinking' });
    return;
  }
  if (scenario === 'markdown') {
    eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_markdown', content: 'Show markdown stress sample' });
    eventHub.publish({ ...base, event: 'assistant_message', request_id: 'input_markdown', content: [
      'markdown',
      '# Sample Report',
      '',
      '| Item | Status | Owner | Action | Notes |',
      '|---|---|---|---|---|',
      '| Login flow | Passing | Ava | [Dismiss](intent:entity_number:dismiss) | Smoke tested with the full operator surface |',
      '| Billing sync | Review | Priya | [Escalate](narada-intent:entity_number:escalate) | Needs API check before rollout |',
      '| Email alerts | Failing | Sam | [Retry](intent:entity_number:retry) | Retry job timing issue with a long explanation that must wrap inside the card |',
      '',
      'Evidence:',
      '- `pull_and_ingest` reported `received: 1`, `inserted: 1`, `duplicate: 0`.',
      '- Event synced: `pgagent-step-22950551`.',
      '  - `status`: `resolved`',
      '  - `linked_task_id`: `392`',
      '',
      '```js',
      'const status = await checkNaradaSession({ sessionId: "ux_session" });',
      'console.log(status.operational_posture);',
      '```',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[Start] --> B{Decision}',
      '  B -->|Yes| C[Do the thing]',
      '  B -->|No| D[Skip it]',
      '```',
      '',
      'The content should stay inside the message card on desktop and mobile.',
    ].join('\n') });
    return;
  }
  if (scenario === 'diagnostics') {
    eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_diag', content: 'Run startup sequence' });
    eventHub.publish({ ...base, event: 'tool_call', request_id: 'input_diag', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence' });
    eventHub.publish({ ...base, event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence', status: 'ok' });
    eventHub.publish({ ...base, event: 'assistant_message', request_id: 'input_diag', content: 'Startup sequence completed.' });
    eventHub.publish({ ...base, event: 'session_health', status: 'degraded', mcp_operational_state: 'degraded', mcp_runtime_fault_count: 1 });
    eventHub.publish({ ...base, event: 'websocket_error', message: 'socket dropped' });
    eventHub.publish({ ...base, event: 'turn_failed', terminal_state: 'failed', message: 'provider failed' });
    return;
  }
  if (scenario === 'raw') {
    eventHub.publish({ ...base, event: 'websocket_connected' });
    eventHub.publish({ ...base, event: 'session_health', status: 'healthy', mcp_operational_state: 'healthy' });
    eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_raw', content: 'Run startup sequence' });
    eventHub.publish({ ...base, event: 'tool_call', request_id: 'input_raw', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence' });
    eventHub.publish({ ...base, event: 'tool_result', request_id: 'input_raw', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence', status: 'ok' });
    eventHub.publish({ ...base, event: 'assistant_message', request_id: 'input_raw', content: 'Startup sequence completed.' });
    return;
  }
  if (scenario === 'confirmation') {
    eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_confirm', content: 'Run unsafe affordance actions' });
    eventHub.publish({
      ...base,
      event: 'session_affordance_confirmation_required',
      request_id: 'unsafe_action_1',
      confirmation_id: 'confirm-browser-1',
      surface_id: 'fixture.filesystem',
      action_id: 'delete_temp_output',
      terminal_state: 'awaiting_confirmation',
      status: 'confirmation_required',
      message: 'This affordance action requires explicit confirmation before execution.',
    });
    eventHub.publish({
      ...base,
      event: 'session_affordance_confirmation_required',
      request_id: 'unsafe_action_2',
      confirmation_id: 'confirm-browser-2',
      surface_id: 'fixture.mail',
      action_id: 'send_draft',
      terminal_state: 'awaiting_confirmation',
      status: 'confirmation_required',
      message: 'Sending a draft requires operator confirmation.',
    });
    return;
  }
  eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_normal', content: 'Run startup sequence' });
  eventHub.publish({ ...base, event: 'tool_call', request_id: 'input_normal', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence' });
  eventHub.publish({ ...base, event: 'tool_result', request_id: 'input_normal', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence', status: 'ok' });
  eventHub.publish({ ...base, event: 'assistant_message', request_id: 'input_normal', content: 'Startup sequence completed.\n\nIdentity hydrated as `ux.agent`. Next action: await operator.' });
}

async function withScenarioServer(scenario, fn, options = {}) {
  if (scenario === 'disconnected') {
    return withHealthServer(async (healthUrl) => {
      const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: 'ws://127.0.0.1:9/events', healthEndpoint: healthUrl });
      try {
        return await fn(web.url);
      } finally {
        web.server.close();
      }
    });
  }

  const childStdin = new PassThrough();
  const inputFrames = [];
  let inputBuffer = '';
  childStdin.setEncoding('utf8');
  childStdin.on('data', (chunk) => {
    inputBuffer += String(chunk);
    const lines = inputBuffer.split(/\r?\n/);
    inputBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        inputFrames.push(JSON.parse(line));
      } catch {
        inputFrames.push({ parse_error: line });
      }
    }
  });
  const eventHub = createEventHub();
  const eventProjection = await startEventStreamProjection({ childStdin, eventHub, host: '127.0.0.1', port: 0 });
  return withHealthServer(async (healthUrl) => {
    const web = await startAgentWebUiServer({
      host: '127.0.0.1',
      port: 0,
      eventEndpoint: eventProjection.url,
      healthEndpoint: healthUrl,
      admittedMethods: [...AGENT_WEB_UI_NARS_METHOD_LIST],
      ...(options.onboarding === true ? { onboarding: true } : {}),
    });
    try {
      return await fn(web.url, () => publishScenarioEvents(eventHub, scenario, options.sessionId ?? `ux_${scenario}`), inputFrames, eventHub);
    } finally {
      web.server.close();
      eventProjection.server.close();
    }
  }, options);
}

const UX_ASSERTION_SCRIPT = String.raw`(() => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const doc = document.documentElement;
  const body = document.body;
  const failures = [];
  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const rowRects = [...document.querySelectorAll('#events > .event')].map((row) => row.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  for (let i = 1; i < rowRects.length; i += 1) {
    if (rowRects[i].top + 1 < rowRects[i - 1].bottom) failures.push('event_rows_overlap:' + i);
  }
  const shellHeader = document.querySelector('.shell-header');
  const composer = document.querySelector('.composer');
  if (!visible(shellHeader)) failures.push('header_not_visible');
  if (!visible(composer)) failures.push('composer_not_visible');
  const headerRect = shellHeader?.getBoundingClientRect();
  const composerRect = composer?.getBoundingClientRect();
  if (headerRect && headerRect.top < -1) failures.push('header_scrolled_out');
  if (composerRect && composerRect.bottom > viewportHeight + 1) failures.push('composer_outside_viewport');
  const overflowAllowance = 1;
  if (doc.scrollWidth > viewportWidth + overflowAllowance || body.scrollWidth > viewportWidth + overflowAllowance) failures.push('document_horizontal_overflow:' + doc.scrollWidth + ':' + body.scrollWidth + ':' + viewportWidth);
  for (const card of document.querySelectorAll('.event-detail, .rendered-part-frame, .rendered-part-render, .message-content, .message-part')) {
    const rect = card.getBoundingClientRect();
    if (rect.width > viewportWidth + overflowAllowance || rect.right > viewportWidth + overflowAllowance) failures.push('card_overflow:' + card.className + ':' + Math.round(rect.right) + ':' + viewportWidth);
  }
  const renderedFrames = [...document.querySelectorAll('.rendered-part-frame')];
  for (const frame of renderedFrames) {
    const frameRect = frame.getBoundingClientRect();
    for (const node of frame.querySelectorAll('table, pre, code')) {
      const rect = node.getBoundingClientRect();
      if (rect.right > frameRect.right + overflowAllowance) failures.push('markdown_overflow:' + node.tagName + ':' + Math.round(rect.right) + ':' + Math.round(frameRect.right));
    }
  }
  const messages = [...document.querySelectorAll('#events > .event')]
    .map((row) => {
      const detail = row.querySelector('.event-detail')?.cloneNode(true);
      detail?.querySelectorAll('.rendered-part-tabs, .rendered-part-code').forEach((node) => node.remove());
      return { kind: row.dataset.eventKind, text: (detail?.textContent ?? '').replace(/\s+/g, ' ').trim() };
    })
    .filter((row) => ['assistant_message', 'user_message', 'operator_input_submitted'].includes(row.kind));
  const seen = new Set();
  for (const row of messages) {
    const key = row.kind + ':' + row.text;
    if (seen.has(key)) failures.push('duplicate_message:' + row.kind);
    seen.add(key);
  }
  const visibleText = [...document.querySelectorAll('body *')]
    .filter(visible)
    .map((element) => element.textContent ?? '')
    .join('\n');
  return {
    ok: failures.length === 0,
    failures,
    viewportWidth,
    viewportHeight,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: body.scrollWidth,
    text: visibleText,
    messages,
    markdownListItemCount: document.querySelectorAll('.rendered-part-render li, .message-content li').length,
    markdownListCodeCount: document.querySelectorAll('.rendered-part-render li code, .message-content li code').length,
  };
})()`;
async function scrollTranscriptToTop(page) {
  const scroller = page.locator('.events-scroll');
  await scroller.hover();
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop), { timeout: 5_000 }).toBe(0);
}

async function runScenarioViewport({ page, scenario, viewport }) {
  return withScenarioServer(scenario.name, async (url, publishEvents = () => {}, inputFrames = [], eventHub = null) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(({ view }) => {
      localStorage.setItem('narada:agent-web-ui:status-row-open.v1', 'true');
      if (view) localStorage.setItem('narada:agent-web-ui:projection-verbosity.v1', view);
    }, { view: scenario.view ?? null });
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    try {
      if (scenario.view) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      publishEvents();
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (scenario.name === 'snippets') {
        await page.locator('#operator-input').fill('/snippet save "ux drawer" First reusable operator instruction for screenshot coverage');
        await page.locator('.composer-submit').click();
        await page.waitForFunction(() => {
          const stored = JSON.parse(window.localStorage.getItem('narada:agent-web-ui:operator-snippets.v1') ?? '[]');
          return Array.isArray(stored) && stored.some((snippet) => snippet.name === 'ux-drawer');
        });
        await page.locator('#operator-input').fill('/snippets ux');
        await page.locator('.composer-submit').click();
        await page.waitForSelector('.operator-snippet-panel');
      }
      if (scenario.name === 'confirmation') {
        const confirmationResult = await page.evaluate(String.raw`(async () => {
          let panel = null;
          let items = [];
          const started = Date.now();
          while (Date.now() - started < 3000) {
            panel = document.querySelector('.affordance-confirmations');
            items = [...document.querySelectorAll('.affordance-confirmation-item')];
            if (panel && items.length >= 2) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          const textBefore = panel?.textContent ?? '';
          const confirm = items[0]?.querySelector('.affordance-confirmation-confirm');
          const cancel = items[1]?.querySelector('.affordance-confirmation-cancel');
          return {
            panelVisible: Boolean(panel && panel.getBoundingClientRect().height > 0),
            itemCount: document.querySelectorAll('.affordance-confirmation-item').length,
            textBefore,
            confirmText: confirm?.textContent ?? null,
            cancelText: cancel?.textContent ?? null,
          };
        })()`);
        assert.equal(confirmationResult.panelVisible, true, `${scenario.name}/${viewport.name}: expected confirmation panel to be visible: ${confirmationResult.textBefore}`);
        assert.equal(confirmationResult.itemCount, 2, `${scenario.name}/${viewport.name}: expected two pending confirmations: ${confirmationResult.textBefore}`);
        assert.match(confirmationResult.textBefore, /Confirmation Required[\s\S]*fixture\.filesystem \/ delete_temp_output/i);
        assert.match(confirmationResult.textBefore, /fixture\.mail \/ send_draft/i);
        assert.match(confirmationResult.confirmText ?? '', /Confirm/);
        assert.match(confirmationResult.cancelText ?? '', /Cancel/);
      }
      if (scenario.name === 'markdown') {
        await page.locator('.mermaid-diagram, .mermaid-fallback').first().waitFor({ state: 'visible', timeout: 10_000 });
      }
      const result = await page.evaluate(UX_ASSERTION_SCRIPT);
      assert.deepEqual(result.failures, [], `${scenario.name}/${viewport.name}: ${JSON.stringify({ failures: result.failures, messages: result.messages })}`);
      if (!scenario.onboarding) {
        assert.equal(await page.locator('.onboarding-panel').count(), 0, `${scenario.name}/${viewport.name}: onboarding must remain opt-in`);
      }
      if (scenario.name !== 'disconnected') {
        assert.match(result.text, /narada\.ux[\s\S]*ux\.agent/i, 'expected header to show site and agent identity');
        assert.match(result.text, /Role:\s*resident/i, 'expected header to show agent role');
      }
      if (scenario.name === 'thinking') assert.match(result.text, /Thinking|Waiting for agent|thinking/i, 'expected active thinking indicator');
      if (scenario.name === 'disconnected') assert.match(result.text, /disconnected|reconnecting|failed|127\.0\.0\.1:9\/events/i, 'expected disconnected endpoint or reconnecting state');
      if (scenario.name === 'operations') {
        assert.match(result.text, /Tool call/i, 'expected operations tool call row');
        assert.match(result.text, /Tool result/i, 'expected operations tool result row');
      }
      if (scenario.name === 'diagnostics') {
        assert.match(result.text, /degraded|socket dropped|provider failed/i, 'expected diagnostics fault signals');
        assert.doesNotMatch(result.text, /Tool call|Tool result|Startup sequence completed/i, 'expected diagnostics to suppress routine transcript and operation rows');
      }
      if (scenario.name === 'raw') {
        assert.match(result.text, /Raw event/i, 'expected raw payload drawer affordance');
        assert.match(result.text, /routine status updates? folded into State/i, 'expected raw view to summarize routine state samples');
        assert.match(result.text, /Tool call|Tool result/i, 'expected raw view to keep operation records');
      }
      if (scenario.name === 'markdown') {
        assert.match(result.text, /Sample Report/);
        assert.match(result.text, /const status/);
        assert.match(result.text, /Mermaid|Start|Decision/);
        assert.ok(result.markdownListItemCount >= 4, `expected markdown list items to render as list DOM: ${JSON.stringify(result)}`);
        assert.ok(result.markdownListCodeCount >= 8, `expected inline code inside markdown list items to render as code DOM: ${JSON.stringify(result)}`);
        await page.locator('.markdown-intent-button[data-intent="entity_number:dismiss"]').click();
        await page.waitForTimeout(150);
        const intentResult = await page.evaluate(() => {
          const button = document.querySelector('.markdown-intent-button[data-intent="entity_number:dismiss"]');
          const input = document.querySelector('#operator-input');
          if (!button || !input) return { ok: false, reason: 'missing_intent_button_or_input', text: document.body.textContent };
          return {
            ok: input.value === 'entity_number:dismiss' && document.activeElement === input,
            value: input.value,
            activeId: document.activeElement?.id ?? null,
            status: button.dataset.status ?? null,
          };
        });
        assert.equal(intentResult.ok, true, `${scenario.name}/${viewport.name}: expected markdown intent click to stage composer input: ${JSON.stringify(intentResult)}`);
      }
      if (scenario.name === 'normal') {
        assert.doesNotMatch(result.text, /routine status updates? folded into State/i, 'expected Chat view to hide debug state-sample note');
        await scrollTranscriptToTop(page);
        await page.locator('#operator-input').fill('Follow latest after submit');
        await page.locator('.composer-submit').click();
        await page.waitForTimeout(350);
        const submitScroll = await page.evaluate(() => {
          const scroller = document.querySelector('.events-scroll');
          const distanceFromBottom = scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : Number.POSITIVE_INFINITY;
          return {
            ok: distanceFromBottom < 4,
            distanceFromBottom,
            scrollTop: scroller?.scrollTop ?? null,
            scrollHeight: scroller?.scrollHeight ?? null,
            clientHeight: scroller?.clientHeight ?? null,
          };
        });
        assert.equal(submitScroll.ok, true, `${scenario.name}/${viewport.name}: expected submit to scroll transcript to bottom: ${JSON.stringify(submitScroll)}`);
      }
      if (scenario.name === 'snippets') {
        assert.match(result.text, /Snippets[\s\S]*Browser\/operator local saved inputs/i, 'expected snippets drawer to be visible');
        assert.match(result.text, /ux-drawer[\s\S]*First reusable operator instruction/i, 'expected saved snippet to render in drawer');
      }
      if (scenario.name === 'confirmation') {
        assert.match(result.text, /Confirmation Required[\s\S]*fixture\.filesystem \/ delete_temp_output/i, 'expected confirmation panel to show filesystem action');
        assert.match(result.text, /fixture\.mail \/ send_draft/i, 'expected confirmation panel to show mail action');
      }
      return `${scenario.name}-${viewport.name}.png`;
    } finally {
      await page.evaluate(() => window.localStorage.clear()).catch(() => {});
    }
  });
}

test('agent-web-ui projection UX matrix has no obvious layout regressions', async ({ page }) => {
  const scenarios = [
    { name: 'normal' },
    { name: 'snippets' },
    { name: 'thinking' },
    { name: 'disconnected' },
    { name: 'markdown' },
    { name: 'confirmation' },
    { name: 'operations', view: 'operations' },
    { name: 'diagnostics', view: 'diagnostics' },
    { name: 'raw', view: 'raw' },
  ];
  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  for (const scenario of scenarios) {
    for (const viewport of viewports) await runScenarioViewport({ page, scenario, viewport });
  }
});

test('agent-web-ui User Site onboarding makes the first-use path explicit', async ({ page }) => {
  await withScenarioServer('normal', async (url, publishEvents) => {
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.onboarding-panel[data-phase="ready"]');

    const readyText = await page.locator('.onboarding-panel').textContent();
    assert.match(readyText ?? '', /Welcome to your General assistant/);
    assert.match(readyText ?? '', /No project setup is needed/);
    assert.match(readyText ?? '', /Registry default|Resolved at launch/);
    assert.match(readyText ?? '', /resident/);
    assert.match(readyText ?? '', /Surface[\s\S]*Browser/);
    assert.match(readyText ?? '', /Authority[\s\S]*Resident runtime[\s\S]*NARS/);

    await page.getByRole('button', { name: 'Ask what is possible' }).click();
    assert.equal(await page.locator('#operator-input').inputValue(), 'What can you help me with?');

    await page.getByRole('button', { name: 'Start with a request' }).click();
    assert.equal(await page.locator('#operator-input').inputValue(), 'What would you like to work on?');
    assert.equal(await page.locator('#operator-input').evaluate((element) => document.activeElement === element), true);

    publishEvents();
    await page.waitForSelector('.onboarding-panel[data-phase="complete"]');
    const completeText = await page.locator('.onboarding-panel').textContent();
    assert.match(completeText ?? '', /Resident is enough to begin/);
    assert.match(completeText ?? '', /architect and builder roles/);
    await page.getByRole('button', { name: 'Review optional roles' }).click();
    assert.equal(await page.locator('#operator-input').inputValue(), 'What roles could I add later, and when would architect or builder help?');
  }, { onboarding: true });
});

test('agent-web-ui User Site onboarding dismissal is scoped to the attached runtime session', async ({ page }) => {
  const healthState = { sessionId: 'ux_onboarding_session_a' };
  await withScenarioServer('thinking', async (url, publishEvents, _inputFrames, eventHub) => {
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.onboarding-panel[data-phase="ready"]');
    publishEvents();
    await page.waitForSelector('.onboarding-panel[data-phase="working"]');
    await page.getByRole('button', { name: 'Dismiss onboarding' }).click();
    assert.equal(await page.locator('.onboarding-panel').count(), 0);

    healthState.sessionId = 'ux_onboarding_session_b';
    eventHub.publish({
      agent_id: 'ux.agent',
      session_id: healthState.sessionId,
      site_id: 'narada.ux',
      role: 'resident',
      provider: 'codex-subscription',
      model: 'gpt-5.5',
      timestamp: new Date().toISOString(),
      event: 'session_started',
      mcp_server_count: 15,
      mcp_operational_state: 'healthy',
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.onboarding-panel');
    assert.match(await page.locator('.onboarding-panel').textContent() ?? '', /Your assistant is working|Welcome to your General assistant/);
  }, { onboarding: true, healthState });
});

test('agent-web-ui User Site onboarding shows active work and persists dismissal for the session', async ({ page }) => {
  await withScenarioServer('thinking', async (url, publishEvents) => {
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.onboarding-panel[data-phase="ready"]');

    publishEvents();
    await page.waitForSelector('.onboarding-panel[data-phase="working"]');
    const workingText = await page.locator('.onboarding-panel').textContent();
    assert.match(workingText ?? '', /Your assistant is working/);
    assert.match(workingText ?? '', /Keep this page open/);

    await page.getByRole('button', { name: 'Dismiss onboarding' }).click();
    assert.equal(await page.locator('.onboarding-panel').count(), 0);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.onboarding-panel').count(), 0, 'dismissal should survive reload for the same session');
  }, { onboarding: true });
});

test('agent-web-ui transcript scroll authority preserves operator-controlled history until explicit follow', async ({ page }) => {
  await withScenarioServer('normal', async (url, _publishEvents, _inputFrames, eventHub) => {
    const base = { agent_id: 'ux.agent', session_id: 'ux_scroll', timestamp: new Date().toISOString(), provider: 'codex-subscription' };
    const publishAssistant = (index, content) => eventHub.publish({ ...base, event: 'assistant_message', request_id: `scroll_${index}`, content });
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    eventHub.publish({ ...base, event: 'session_started', site_id: 'narada.ux', role: 'resident', model: 'gpt-5.5', mcp_server_count: 2, mcp_operational_state: 'healthy' });
    for (let index = 0; index < 28; index += 1) {
      publishAssistant(index, `Initial transcript row ${index}.\n\nThis row gives the transcript enough vertical height for scroll authority coverage.`);
    }
    await page.waitForFunction(() => document.querySelectorAll('#events > .event').length >= 20);
    await scrollTranscriptToTop(page);
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => {
      const scroller = document.querySelector('.events-scroll');
      return { scrollTop: scroller?.scrollTop ?? null, scrollHeight: scroller?.scrollHeight ?? null, clientHeight: scroller?.clientHeight ?? null };
    });
    assert.equal(before.scrollTop, 0, `expected operator-controlled setup at top: ${JSON.stringify(before)}`);
    publishAssistant(99, 'Late message while operator is reading history. The viewport must not jump to this live tail automatically.');
    await page.waitForTimeout(500);
    const held = await page.evaluate(() => {
      const scroller = document.querySelector('.events-scroll');
      const button = document.querySelector('.new-messages-button');
      return {
        scrollTop: scroller?.scrollTop ?? null,
        distanceFromBottom: scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : null,
        buttonText: button?.textContent?.trim() ?? null,
        lateVisible: document.body.textContent.includes('Late message while operator is reading history'),
      };
    });
    assert.equal(held.scrollTop, 0, `operator-controlled scroll should not jump on late content: ${JSON.stringify(held)}`);
    assert.equal(held.buttonText, 'New messages', `expected new-message affordance while operator controls scroll: ${JSON.stringify(held)}`);
    assert.ok((held.distanceFromBottom ?? 0) > 100, `expected viewport to remain away from live tail: ${JSON.stringify(held)}`);
    await page.locator('.new-messages-button').click();
    await page.waitForTimeout(350);
    const followed = await page.evaluate(() => {
      const scroller = document.querySelector('.events-scroll');
      return {
        distanceFromBottom: scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : null,
        buttonVisible: Boolean(document.querySelector('.new-messages-button')),
      };
    });
    assert.ok((followed.distanceFromBottom ?? Number.POSITIVE_INFINITY) < 4, `expected explicit follow to scroll to bottom: ${JSON.stringify(followed)}`);
    assert.equal(followed.buttonVisible, false, `expected new-message affordance to clear after explicit follow: ${JSON.stringify(followed)}`);
  });
});

test('agent-web-ui operator footer selector hides and restores target and input boxes', async ({ page }) => {
  await withScenarioServer('normal', async (url, publishEvents) => {
    await page.setViewportSize({ width: 900, height: 560 });
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    publishEvents();
    await page.waitForSelector('#operator-input');
    const selectorLayout = await page.evaluate(() => {
      const footerSelector = document.querySelector('button[aria-label="Choose Operator footer items"]');
      const send = document.querySelector('.composer-submit');
      const headerSelector = document.querySelector('button[aria-label="Choose Header items"]');
      const statusSelector = document.querySelector('button[aria-label="Choose Status boxes"]');
      const statusCollapse = document.querySelector('button[aria-label="Collapse status boxes"]');
      const statusRow = document.querySelector('.box-row-shell.status');
      const statusItems = document.querySelector('.status .box-row-items');
      const footerRect = footerSelector?.getBoundingClientRect();
      const sendRect = send?.getBoundingClientRect();
      const statusSelectorRect = statusSelector?.getBoundingClientRect();
      const statusCollapseRect = statusCollapse?.getBoundingClientRect();
      const statusRowRect = statusRow?.getBoundingClientRect();
      const statusItemsRect = statusItems?.getBoundingClientRect();
      return {
        footerRight: footerRect?.right ?? null,
        footerBottom: footerRect?.bottom ?? null,
        sendRight: sendRect?.right ?? null,
        sendTop: sendRect?.top ?? null,
        headerInRowControls: Boolean(headerSelector?.closest('.box-row-controls')),
        statusInRowControls: Boolean(statusSelector?.closest('.box-row-controls')),
        statusSelectorTop: statusSelectorRect?.top ?? null,
        statusSelectorCenter: statusSelectorRect ? statusSelectorRect.left + statusSelectorRect.width / 2 : null,
        statusCollapseBottom: statusCollapseRect?.bottom ?? null,
        statusCollapseCenter: statusCollapseRect ? statusCollapseRect.left + statusCollapseRect.width / 2 : null,
        statusRowTop: statusRowRect?.top ?? null,
        statusItemsTop: statusItemsRect?.top ?? null,
        statusCollapseTop: statusCollapseRect?.top ?? null,
      };
    });
    assert.ok(Math.abs((selectorLayout.footerRight ?? 0) - (selectorLayout.sendRight ?? 100)) < 1, `expected footer selector and Send to share a right edge: ${JSON.stringify(selectorLayout)}`);
    assert.ok((selectorLayout.footerBottom ?? Number.POSITIVE_INFINITY) <= (selectorLayout.sendTop ?? Number.NEGATIVE_INFINITY), `expected footer selector above Send: ${JSON.stringify(selectorLayout)}`);
    assert.equal(selectorLayout.headerInRowControls, true, `expected header selector to retain shared row-control placement: ${JSON.stringify(selectorLayout)}`);
    assert.equal(selectorLayout.statusInRowControls, true, `expected status selector to retain shared row-control placement: ${JSON.stringify(selectorLayout)}`);
    assert.ok((selectorLayout.statusCollapseBottom ?? Number.POSITIVE_INFINITY) <= (selectorLayout.statusSelectorTop ?? Number.NEGATIVE_INFINITY), `expected Collapse above the status selector: ${JSON.stringify(selectorLayout)}`);
    assert.ok(Math.abs((selectorLayout.statusCollapseCenter ?? 0) - (selectorLayout.statusSelectorCenter ?? 100)) < 1, `expected status controls to share a horizontal center: ${JSON.stringify(selectorLayout)}`);
    assert.ok(Math.abs((selectorLayout.statusCollapseTop ?? 0) - (selectorLayout.statusItemsTop ?? 100)) < 1, `expected status controls to align to the status content top: ${JSON.stringify(selectorLayout)}`);
    await page.locator('button[aria-label="Choose Operator footer items"]').click();
    const setFooterSelectorItem = async (label, visible) => {
      const row = page.locator('#operator-footer-item-selector-panel .box-visibility-selector-item').filter({
        has: page.getByText(label, { exact: true }),
      });
      await expect(row).toHaveCount(1);
      const checkbox = row.locator('input[type="checkbox"]');
      if ((await checkbox.isChecked()) !== visible) await checkbox.setChecked(visible);
    };
    await setFooterSelectorItem('Target', false);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.composer-target').count(), 0, 'expected target box to hide');
    assert.equal(await page.locator('#operator-input').count(), 1, 'expected input box to remain visible after hiding target');
    await setFooterSelectorItem('Operator Input', false);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#operator-input').count(), 0, 'expected input box to hide');
    assert.equal(await page.locator('button[aria-label="Choose Operator footer items"]').count(), 1, 'expected selector to remain available when boxes are hidden');
    await setFooterSelectorItem('Operator Input', true);
    await setFooterSelectorItem('Target', true);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.composer-target').count(), 1, 'expected target box to restore');
    assert.equal(await page.locator('#operator-input').count(), 1, 'expected input box to restore');
    const stored = await page.evaluate(() => window.localStorage.getItem('narada:agent-web-ui:operator-footer-items.v1'));
    assert.equal(stored, JSON.stringify(['target', 'input']), `expected footer selector state to persist in canonical order: ${stored}`);
    await setFooterSelectorItem('Operator Input', false);
    await setFooterSelectorItem('Target', false);
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('.composer-target').count(), 0, 'expected persisted empty footer to hide target after reload');
    assert.equal(await page.locator('#operator-input').count(), 0, 'expected persisted empty footer to hide input after reload');
    await page.locator('button[aria-label="Choose Operator footer items"]').click();
    await setFooterSelectorItem('Operator Input', true);
    await page.waitForSelector('#operator-input');
    assert.equal(await page.locator('#operator-input').count(), 1, 'expected selector to recover input from persisted empty footer state');
    await page.setViewportSize({ width: 360, height: 560 });
    await page.waitForTimeout(150);
    const mobileLayout = await page.evaluate(() => {
      const form = document.querySelector('#operator-form');
      const input = document.querySelector('#operator-input');
      return {
        bodyWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
        formWidth: form?.getBoundingClientRect().width ?? 0,
        inputWidth: input?.getBoundingClientRect().width ?? 0,
        selectorVisible: Boolean(document.querySelector('button[aria-label="Choose Operator footer items"]')),
      };
    });
    assert.equal(mobileLayout.selectorVisible, true, `expected selector to remain visible on mobile: ${JSON.stringify(mobileLayout)}`);
    assert.ok(mobileLayout.inputWidth > 240, `expected mobile input to retain usable width: ${JSON.stringify(mobileLayout)}`);
    assert.ok(mobileLayout.bodyScrollWidth <= mobileLayout.bodyWidth + 1, `expected no horizontal overflow in mobile footer: ${JSON.stringify(mobileLayout)}`);
  });
});
