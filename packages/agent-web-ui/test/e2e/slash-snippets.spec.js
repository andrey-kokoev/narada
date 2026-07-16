import { PassThrough } from 'node:stream';
import { expect, test } from '@playwright/test';
import { runNarsAttachClient } from '@narada2/agent-cli/nars-attach-client';
import { AGENT_WEB_UI_SNIPPET_ACTIONS } from '@narada2/nars-client-projection-contract';
import { startSharedRuntime, waitFor } from './nars-runtime-fixture.mjs';

function healthSnapshot(event) {
  return {
    agent_id: event.agent_id,
    carrier_kind: event.carrier_kind,
    model: event.model,
    operator_surface_kind: event.operator_surface_kind,
    status: event.status,
    thinking: event.thinking,
  };
}

async function submitOperatorInputText(page, value) {
  const input = page.locator('#operator-input');
  await input.fill(value);
  await page.locator('.composer-submit').click();
}

async function setComposerDraft(page, value) {
  await page.locator('#operator-input').fill(value);
}

async function clearOperatorSnippets(page) {
  await page.evaluate(() => window.localStorage.removeItem('narada:agent-web-ui:operator-snippets.v1'));
}

async function commandPaletteState(page) {
  return await page.evaluate(() => {
    const input = document.querySelector('#operator-input');
    return {
      open: Boolean(document.querySelector('#agent-web-ui-command-palette')),
      activeSlash: document.querySelector('.command-option-active code')?.textContent ?? null,
      activeLabel: document.querySelector('.command-option-active strong')?.textContent ?? null,
      inputValue: input?.value ?? '',
      interruptVisible: Boolean(document.querySelector('.interrupt-confirm-modal')),
    };
  });
}

async function visibleCommandPaletteSlashes(page) {
  return await page.locator('#agent-web-ui-command-palette code').evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
}

const SNIPPET_ACTION_PALETTE_PROBES = Object.freeze({
  run: 'ru',
  enqueue: 'enq',
  search: 'sea',
  save: 'sav',
  edit: 'edi',
  delete: 'del',
});

test.describe('agent-web-ui slash and snippet palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('narada:agent-web-ui:status-row-open.v1', 'true');
      localStorage.setItem('narada:agent-web-ui:header-items.v2', JSON.stringify(['identity', 'runtime', 'session', 'status_toggle']));
      localStorage.setItem('narada:agent-web-ui:status-boxes.v3', JSON.stringify(['events', 'health', 'intelligence', 'view']));
    });
  });

  test('browser and attach-client slash health commands project the same session snapshot without raw CDP', async ({ page }) => {
    const runtime = await startSharedRuntime();
    const attachInput = new PassThrough();
    const attachOutput = new PassThrough();
    let attachText = '';
    attachOutput.setEncoding('utf8');
    attachOutput.on('data', (chunk) => { attachText += String(chunk); });

    const attachPromise = runNarsAttachClient({
      endpoint: runtime.eventProjection.url,
      input: attachInput,
      output: attachOutput,
    });

    try {
      await page.goto(runtime.localWeb.url);
      await expect(page.locator('#operator-input')).toBeVisible();
      await waitFor(() => /attached|subscribed|session/i.test(attachText), 5_000, () => ({ attach_text: attachText.slice(0, 1200) }));

      const browserFromIndex = runtime.events.length;
      await submitOperatorInputText(page, '/health');
      const browserHealth = await waitFor(
        () => runtime.events.slice(browserFromIndex).find((event) => event.event === 'session_health'),
        5_000,
        () => ({ browser_events: runtime.events.slice(browserFromIndex).map((event) => ({ event: event.event, request_id: event.request_id, session_id: event.session_id, status: event.status })) }),
      );
      expect(runtime.outboundFrames.find((frame) => frame.method === 'session.health')).toMatchObject({
        method: 'session.health',
        params: {},
      });
      await expect(page.locator('.session-chip[data-state="healthy"]')).toBeVisible();

      const cliFromIndex = runtime.events.length;
      attachInput.write('/health\n');
      const cliHealth = await waitFor(
        () => runtime.events.slice(cliFromIndex).find((event) => event.event === 'session_health'),
        5_000,
        () => ({ cli_events: runtime.events.slice(cliFromIndex).map((event) => ({ event: event.event, request_id: event.request_id, session_id: event.session_id, status: event.status })) }),
      );

      expect(healthSnapshot(browserHealth)).toEqual(healthSnapshot(cliHealth));
    } finally {
      attachInput.end();
      await Promise.race([attachPromise, new Promise((resolve) => setTimeout(resolve, 1_000))]);
      await page.close().catch(() => {});
      await runtime.close();
    }
  });
  test('supports command autocomplete and snippet submenu without raw CDP', async ({ page }) => {
    const runtime = await startSharedRuntime();
    try {
      await page.goto(runtime.localWeb.url);
      await expect(page.locator('#operator-input')).toBeVisible();
      await expect(page.locator('body')).toContainText('narada.e2e.resident');
      await clearOperatorSnippets(page);

      await setComposerDraft(page, '/');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      const beforeSelection = await commandPaletteState(page);
      expect(beforeSelection.open).toBe(true);
      expect(beforeSelection.activeSlash).toMatch(/^\//);

      await page.keyboard.press('ArrowDown');
      const afterSelection = await commandPaletteState(page);
      expect(afterSelection.open).toBe(true);
      expect(afterSelection.activeSlash).toMatch(/^\//);
      expect(afterSelection.activeSlash).not.toBe(beforeSelection.activeSlash);

      await setComposerDraft(page, '/heal');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.locator('.command-option-active code')).toHaveText('/health');
      await expect(page.locator('#operator-input')).toHaveValue('/health');

      const healthFromIndex = runtime.events.length;
      await page.keyboard.press('Enter');
      const submittedEvent = await waitFor(
        () => runtime.events.slice(healthFromIndex).find((event) => event.event === 'session_health'),
        5_000,
        () => ({ events: runtime.events.slice(healthFromIndex).map((event) => ({ event: event.event, request_id: event.request_id, status: event.status })) }),
      );
      expect(submittedEvent).toBeTruthy();

      await submitOperatorInputText(page, '/snippet save "palette sample" Run from snippet submenu');
      await expect(page.getByText(/Saved snippet: palette-sample/)).toBeVisible();

      await submitOperatorInputText(page, '/snippet');
      await expect(page.locator('#operator-input')).toHaveValue('/snippet ');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await expect(page.locator('#agent-web-ui-command-palette .command-palette-header')).toContainText('Snippets');
      await expect(page.locator('#agent-web-ui-command-palette .command-palette-header')).toContainText('Choose what to do');
      await expect(page.locator('#agent-web-ui-command-palette .command-section h3').first()).toHaveText('Actions');
      await expect(page.locator('.command-option-active code')).toHaveText('/snippet run');
      await expect(page.getByText(/Usage: \/snippet/)).toHaveCount(0);

      await page.locator('#operator-input').focus();
      await setComposerDraft(page, '/snip');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.locator('#operator-input')).toHaveValue('/snippet ');
      await expect(page.locator('.command-option-active code')).toHaveText('/snippet run');

      await page.keyboard.press('Enter');
      await expect(page.locator('#operator-input')).toHaveValue('/snippet run ');
      await expect(page.locator('#agent-web-ui-command-palette .command-palette-header')).toContainText('Snippet run');

      await setComposerDraft(page, '/snippet run palette');
      await expect(page.locator('.command-option-active code')).toHaveText('/snippet run palette-sample');
      const runFromIndex = runtime.events.length;
      await page.keyboard.press('Enter');
      await waitFor(
        () => runtime.events.slice(runFromIndex).some((event) => event.event === 'assistant_message' && event.content === 'web-ui playwright test response'),
        5_000,
        () => ({ events: runtime.events.slice(runFromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
      );
      expect(runtime.inputFrameAttempts.at(-1)?.frame).toMatchObject({
        method: 'session.submit',
        params: { content: 'Run from snippet submenu', source: 'manual_operator' },
      });
      await expect(page.locator('#operator-input')).toHaveValue('');
      await expect(page.getByText(/Ran snippet: palette-sample/)).toBeVisible();

      await page.locator('#operator-input').focus();
      await setComposerDraft(page, '/snippet run palette');
      await expect(page.locator('.command-option-active code')).toHaveText('/snippet run palette-sample');
      const clickRunFromIndex = runtime.events.length;
      await page.locator('.command-option-active').click();
      await waitFor(
        () => runtime.events.slice(clickRunFromIndex).some((event) => event.event === 'assistant_message' && event.content === 'web-ui playwright test response'),
        5_000,
        () => ({ events: runtime.events.slice(clickRunFromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
      );
      expect(runtime.inputFrameAttempts.at(-1)?.frame).toMatchObject({
        method: 'session.submit',
        params: { content: 'Run from snippet submenu', source: 'manual_operator' },
      });
      await expect(page.locator('#operator-input')).toHaveValue('');
      await expect(page.getByText(/Ran snippet: palette-sample/).last()).toBeVisible();

      await page.locator('#operator-input').focus();
      await setComposerDraft(page, '/snippet enqueue palette');
      await expect(page.locator('.command-option-active code')).toHaveText('/snippet enqueue palette-sample');
      const clickQueueFromIndex = runtime.events.length;
      await page.locator('.command-option-active').click();
      await waitFor(
        () => runtime.events.slice(clickQueueFromIndex).some((event) => event.event === 'input_event_completed')
          && runtime.events.slice(clickQueueFromIndex).some((event) => event.event === 'assistant_message' && event.content === 'web-ui playwright test response'),
        5_000,
        () => ({ events: runtime.events.slice(clickQueueFromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
      );
      expect(runtime.inputFrameAttempts.at(-1)?.frame).toMatchObject({
        method: 'session.submit',
        params: { content: 'Run from snippet submenu', source: 'operator_steering', delivery_mode: 'admit_after_active_turn' },
      });
      await expect(page.locator('#operator-input')).toHaveValue('');
      await expect(page.getByText(/Queued snippet: palette-sample/).last()).toBeVisible();

      await page.locator('#operator-input').focus();
      await setComposerDraft(page, '/snippets');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.locator('#operator-snippet-panel')).toBeVisible();
      await page.locator('#operator-snippet-panel .mcp-panel-close').click();
      await expect(page.locator('#operator-snippet-panel')).toHaveCount(0);

      await page.locator('#operator-input').focus();
      await setComposerDraft(page, '/st');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await page.keyboard.press('Escape');
      const afterEscape = await commandPaletteState(page);
      expect(afterEscape.open).toBe(false);
      expect(afterEscape.inputValue).toBe('/st');
      expect(afterEscape.interruptVisible).toBe(false);
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('snippet slash grammar is registry-driven across actions and aliases', async ({ page }) => {
    const runtime = await startSharedRuntime();
    try {
      await page.goto(runtime.localWeb.url);
      await expect(page.locator('#operator-input')).toBeVisible();
      await clearOperatorSnippets(page);

      for (const action of AGENT_WEB_UI_SNIPPET_ACTIONS) {
        const paletteProbe = SNIPPET_ACTION_PALETTE_PROBES[action.id];
        await page.locator('#operator-input').focus();
        await setComposerDraft(page, `/snippet ${paletteProbe}`);
        await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
        await expect.poll(() => visibleCommandPaletteSlashes(page)).toContain(action.slash);
      }
      await setComposerDraft(page, '/snippet del');
      await expect(page.locator('#agent-web-ui-command-palette .command-option-danger code')).toHaveText('/snippet delete');
      await expect(page.locator('#agent-web-ui-command-palette .command-option-danger')).toContainText('choose snippet to delete');

      await submitOperatorInputText(page, '/snippet save registry-run Registry run body');
      await expect(page.getByText(/Saved snippet: registry-run/)).toBeVisible();
      await submitOperatorInputText(page, '/snippet save registry-delete Registry delete body');
      await expect(page.getByText(/Saved snippet: registry-delete/)).toBeVisible();

      const searchAction = AGENT_WEB_UI_SNIPPET_ACTIONS.find((action) => action.id === 'search');
      for (const verb of searchAction.verbs) {
        await submitOperatorInputText(page, `/snippet ${verb} registry-run`);
        await expect(page.locator('#operator-snippet-panel')).toBeVisible();
        await expect(page.locator('#operator-snippet-panel')).toContainText('registry-run');
        await expect(page.locator('#operator-snippet-panel')).not.toContainText('registry-delete');
        await page.locator('#operator-snippet-panel .mcp-panel-close').click();
        await expect(page.locator('#operator-snippet-panel')).toHaveCount(0);
      }

      await page.locator('#operator-input').focus();
      await setComposerDraft(page, '/snippet search registry-run');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await expect(page.locator('.command-option-active code')).toHaveText('/snippet search');
      await page.keyboard.press('Enter');
      await expect(page.locator('#operator-snippet-panel')).toBeVisible();
      await expect(page.locator('#operator-snippet-panel')).toContainText('registry-run');
      await page.locator('#operator-snippet-panel .mcp-panel-close').click();
      await expect(page.locator('#operator-snippet-panel')).toHaveCount(0);

      const editAction = AGENT_WEB_UI_SNIPPET_ACTIONS.find((action) => action.id === 'edit');
      for (const verb of editAction.verbs) {
        await submitOperatorInputText(page, `/snippet ${verb} registry-run Registry run body edited by ${verb}`);
        await expect(page.getByText(/Updated snippet: registry-run/)).toBeVisible();
        await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem('narada:agent-web-ui:operator-snippets.v1') ?? '[]').find((entry) => entry.name === 'registry-run')?.body)).toBe(`Registry run body edited by ${verb}`);
      }

      const runAction = AGENT_WEB_UI_SNIPPET_ACTIONS.find((action) => action.id === 'run');
      for (const verb of runAction.verbs) {
        const fromIndex = runtime.events.length;
        await submitOperatorInputText(page, `/snippet ${verb} registry-run`);
        await waitFor(
          () => runtime.events.slice(fromIndex).some((event) => event.event === 'assistant_message' && event.content === 'web-ui playwright test response'),
          5_000,
          () => ({ verb, events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
        );
        await expect(page.getByText(/Ran snippet: registry-run/).last()).toBeVisible();
      }

      const enqueueAction = AGENT_WEB_UI_SNIPPET_ACTIONS.find((action) => action.id === 'enqueue');
      for (const verb of enqueueAction.verbs) {
        const fromIndex = runtime.events.length;
        await submitOperatorInputText(page, `/snippet ${verb} registry-run`);
        await waitFor(
          () => runtime.events.slice(fromIndex).some((event) => event.event === 'input_event_completed')
            && runtime.events.slice(fromIndex).some((event) => event.event === 'assistant_message' && event.content === 'web-ui playwright test response'),
          5_000,
          () => ({ verb, events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
        );
        await expect(page.getByText(/Queued snippet: registry-run/).last()).toBeVisible();
      }

      const deleteAction = AGENT_WEB_UI_SNIPPET_ACTIONS.find((action) => action.id === 'delete');
      for (const [index, verb] of deleteAction.verbs.entries()) {
        const name = index === 0 ? 'registry-delete' : 'registry-remove';
        if (index > 0) {
          await submitOperatorInputText(page, `/snippet save ${name} Registry remove body`);
          await expect(page.getByText(new RegExp(`Saved snippet: ${name}`))).toBeVisible();
        }
        await submitOperatorInputText(page, `/snippet ${verb} ${name}`);
        await expect(page.getByText(new RegExp(`Deleted snippet: ${name}`)).last()).toBeVisible();
        await expect.poll(() => page.evaluate((snippetName) => JSON.parse(window.localStorage.getItem('narada:agent-web-ui:operator-snippets.v1') ?? '[]').some((entry) => entry.name === snippetName), name)).toBe(false);
      }

      await submitOperatorInputText(page, '/snippet unknown-action registry-run');
      await expect(page.getByText(/Usage: \/snippet run\|enqueue\|search\|save\|edit\|delete/).last()).toBeVisible();
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });

  test('command palette keeps mobile layout and listbox semantics coherent for long snippet rows', async ({ page }) => {
    const runtime = await startSharedRuntime();
    try {
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(runtime.localWeb.url);
      await expect(page.locator('#operator-input')).toBeVisible();
      await clearOperatorSnippets(page);

      await setComposerDraft(page, '/snippet run missing');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await expect(page.locator('#agent-web-ui-command-palette .command-palette-header')).toContainText('Enter runs the highlighted snippet');
      await expect(page.locator('#agent-web-ui-command-palette .command-empty')).toContainText('Backspace to snippet actions');

      await submitOperatorInputText(page, '/snippet save "extremely long saved snippet name for mobile palette wrapping" This is a deliberately long saved input body that should be visually clamped inside the command palette row instead of forcing horizontal overflow across the mobile viewport.');
      await expect(page.getByText(/Saved snippet: extremely-long-saved-snippet-name-for-mobile-palette-wrapping/)).toBeVisible();

      await setComposerDraft(page, '/snippet run extremely');
      await expect(page.locator('#agent-web-ui-command-palette')).toBeVisible();
      await expect(page.locator('.command-option-active code')).toContainText('/snippet run extremely-long-saved-snippet-name-for-mobile-palette-wrapping');

      const uxState = await page.evaluate(() => {
        const input = document.querySelector('#operator-input');
        const list = document.querySelector('#agent-web-ui-command-palette-list');
        const activeId = input?.getAttribute('aria-activedescendant');
        const active = activeId ? document.getElementById(activeId) : null;
        const palette = document.querySelector('#agent-web-ui-command-palette');
        const header = document.querySelector('#agent-web-ui-command-palette .command-palette-header');
        const code = document.querySelector('.command-option-active code');
        const detail = document.querySelector('.command-option-active .command-option-detail');
        const optionButtons = document.querySelectorAll('#agent-web-ui-command-palette [role="option"] button, #agent-web-ui-command-palette button[role="option"]');
        const paletteRect = palette?.getBoundingClientRect();
        const codeRect = code?.getBoundingClientRect();
        const detailStyle = detail ? window.getComputedStyle(detail) : null;
        const headerStyle = header ? window.getComputedStyle(header) : null;
        return {
          inputRole: input?.getAttribute('role'),
          expanded: input?.getAttribute('aria-expanded'),
          controlsExists: Boolean(input?.getAttribute('aria-controls') && document.getElementById(input.getAttribute('aria-controls'))),
          listRole: list?.getAttribute('role'),
          activeRole: active?.getAttribute('role'),
          activeTag: active?.tagName,
          optionButtonCount: optionButtons.length,
          paletteLeft: paletteRect?.left ?? null,
          paletteRight: paletteRect?.right ?? null,
          viewportWidth: window.innerWidth,
          headerDirection: headerStyle?.flexDirection ?? null,
          codeClientWidth: code?.clientWidth ?? null,
          codeScrollWidth: code?.scrollWidth ?? null,
          codeWidth: codeRect?.width ?? null,
          lineClamp: detailStyle?.webkitLineClamp ?? null,
        };
      });

      expect(uxState).toMatchObject({
        inputRole: 'combobox',
        expanded: 'true',
        controlsExists: true,
        listRole: 'listbox',
        activeRole: 'option',
        activeTag: 'DIV',
        optionButtonCount: 0,
        headerDirection: 'column',
        lineClamp: '2',
      });
      expect(uxState.paletteLeft).toBeGreaterThanOrEqual(0);
      expect(uxState.paletteRight).toBeLessThanOrEqual(uxState.viewportWidth);
      expect(uxState.codeWidth).toBeLessThanOrEqual(uxState.viewportWidth - 20);
      expect(uxState.codeScrollWidth).toBeGreaterThan(uxState.codeClientWidth);
    } finally {
      await page.close().catch(() => {});
      await runtime.close();
    }
  });
});
