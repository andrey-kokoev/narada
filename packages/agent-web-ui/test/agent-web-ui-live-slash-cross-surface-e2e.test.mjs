import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createEventHub, startHealthProjection, startEventStreamProjection } from '@narada2/agent-runtime-server';
import { startAgentWebUiServer } from '../src/server.js';
import { createCarrierRuntimeContext } from '../../carrier-runtime/src/carrier-runtime-context.mjs';
import { createCarrierRuntimeDependencies } from '../../carrier-runtime/src/runtime-dependencies.mjs';
import { runCarrierServerMode } from '../../carrier-runtime/src/server-mode.mjs';
import { findHeadlessBrowser, openCdpPage, waitForPageText } from '../../cloudflare-nars-projection/scripts/lib/browser-smoke.mjs';
import { runNarsAttachClient } from '@narada2/agent-cli/nars-attach-client';

function waitFor(predicate, timeoutMs, evidence = () => ({})) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const result = await predicate();
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(JSON.stringify(await evidence())));
          return;
        }
        setTimeout(tick, 50);
      } catch (error) {
        reject(error);
      }
    };
    tick();
  });
}


async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startSharedRuntime() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-web-ui-slash-cross-surface-'));
  mkdirSync(siteRoot, { recursive: true });
  const eventHub = createEventHub();
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const events = [];
  let outputBuffer = '';
  let runtimePromise = null;

  const runtimeContext = createCarrierRuntimeContext({
    identity: 'narada.e2e.resident',
    session: 'web-ui-slash-cross-surface-e2e',
    siteRoot,
    siteId: 'narada.e2e',
    operatorSurfaceKind: 'agent-web-ui',
    sessionPath: join(siteRoot, 'session.jsonl'),
    eventsPath: join(siteRoot, 'events.jsonl'),
    intelligenceProvider: 'codex-subscription',
    providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
  });

  const healthProjection = await startHealthProjection({
    childStdin: () => runtimeInput,
    host: '127.0.0.1',
    port: 0,
    runtimeContext: { ...runtimeContext, eventHub },
  });
  const eventProjection = await startEventStreamProjection({
    childStdin: () => runtimeInput,
    eventHub,
    host: '127.0.0.1',
    port: 0,
    eventsPath: runtimeContext.eventsPath,
  });
  const fullRuntimeContext = { ...runtimeContext, healthUrl: healthProjection.url, eventStreamUrl: eventProjection.url };
  const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext: fullRuntimeContext });

  runtimeOutput.setEncoding('utf8');
  runtimeOutput.on('data', (chunk) => {
    outputBuffer += String(chunk);
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      events.push(event);
      healthProjection.observe(event);
      eventHub.publish(event);
    }
  });

  runtimePromise = runCarrierServerMode({
    input: runtimeInput,
    output: runtimeOutput,
    callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'web-ui slash cross-surface test response' } }] }),
    runtimeContext: fullRuntimeContext,
    dependencies: { ...dependencies, readMcpPreflightArtifact: () => null },
  });

  await waitFor(() => events.some((event) => event.event === 'session_started'), 5000, () => ({ events: events.map((event) => event.event) }));

  const localWeb = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    eventEndpoint: eventProjection.url,
    healthEndpoint: healthProjection.url,
  });

  return {
    eventProjection,
    events,
    healthProjection,
    localWeb,
    runtimeInput,
    runtimePromise,
    siteRoot,
    get outputText() {
      return outputBuffer;
    },
    async close() {
      runtimeInput.end();
      await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
      await closeServer(localWeb.server);
      await closeServer(healthProjection.server);
      await closeServer(eventProjection.server);
      rmSync(siteRoot, { recursive: true, force: true });
    },
  };
}

function createRecordingWebSocketClass(messages) {
  return class RecordingWebSocket {
    constructor(url) {
      this.socket = new WebSocket(url);
      this.socket.addEventListener('message', (event) => {
        messages.push(String(event.data));
      });
    }

    addEventListener(...args) {
      return this.socket.addEventListener(...args);
    }

    send(...args) {
      return this.socket.send(...args);
    }

    close(...args) {
      return this.socket.close(...args);
    }
  };
}

async function submitOperatorInputText(page, value) {
  return page.evaluate(String.raw`((nextValue) => {
    const input = document.querySelector('#operator-input');
    const form = document.querySelector('#operator-form');
    if (!input || !form) return { ok: false, reason: 'missing_composer' };
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return { ok: true };
  })(${JSON.stringify(value)})`);
}

async function setComposerDraft(page, value) {
  return page.evaluate(String.raw`((nextValue) => {
    const input = document.querySelector('#operator-input');
    if (!input) return { ok: false, reason: 'missing_input' };
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })(${JSON.stringify(value)})`);
}

async function dispatchComposerKey(page, key, options = {}) {
  return page.evaluate(String.raw`((payload) => {
    const input = document.querySelector('#operator-input');
    if (!input) return { ok: false, reason: 'missing_input' };
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: payload.key,
      shiftKey: Boolean(payload.shiftKey),
    }));
    return { ok: true };
  })(${JSON.stringify({ key, shiftKey: Boolean(options.shiftKey) })})`);
}

async function commandPaletteState(page) {
  return page.evaluate(String.raw`(() => {
    const input = document.querySelector('#operator-input');
    return {
      open: Boolean(document.querySelector('#agent-web-ui-command-palette')),
      activeSlash: document.querySelector('.command-option-active code')?.textContent ?? null,
      activeLabel: document.querySelector('.command-option-active strong')?.textContent ?? null,
      inputValue: input?.value ?? '',
      interruptVisible: Boolean(document.querySelector('.interrupt-confirm-modal')),
    };
  })()`);
}

async function bodyText(page) {
  return page.evaluate('document.body.innerText');
}

async function openSnippetPanel(page) {
  return page.evaluate(String.raw`(() => {
    document.querySelector('.operator-snippet-trigger')?.click();
    return Boolean(document.querySelector('#operator-snippet-panel'));
  })()`);
}

async function saveSnippetFromPanel(page, name, body) {
  return page.evaluate(String.raw`((payload) => {
    const panel = document.querySelector('#operator-snippet-panel');
    const nameInput = panel?.querySelector('.operator-snippet-form input[type="text"]');
    const bodyInput = panel?.querySelector('.operator-snippet-form textarea');
    const form = panel?.querySelector('.operator-snippet-form');
    if (!panel || !nameInput || !bodyInput || !form) return { ok: false, reason: 'missing_snippet_form' };
    nameInput.value = payload.name;
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    bodyInput.value = payload.body;
    bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return { ok: true };
  })(${JSON.stringify({ name, body })})`);
}

async function setSnippetPanelSearch(page, query) {
  return page.evaluate(String.raw`((query) => {
    const input = document.querySelector('#operator-snippet-panel .operator-snippet-search input');
    if (!input) return { ok: false, reason: 'missing_snippet_search' };
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })(${JSON.stringify(query)})`);
}

async function setSnippetImportText(page, value) {
  return page.evaluate(String.raw`((value) => {
    const input = document.querySelector('#operator-snippet-panel .operator-snippet-import textarea');
    if (!input) return { ok: false, reason: 'missing_snippet_import' };
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })(${JSON.stringify(value)})`);
}

async function clickSnippetPanelAction(page, snippetName, actionLabel) {
  return page.evaluate(String.raw`((payload) => {
    const items = [...document.querySelectorAll('#operator-snippet-panel .operator-snippet-item')];
    const item = items.find((candidate) => candidate.querySelector('strong')?.textContent?.includes(payload.snippetName));
    const button = [...(item?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent === payload.actionLabel);
    if (!button) return { ok: false, reason: 'missing_action' };
    button.click();
    return { ok: true };
  })(${JSON.stringify({ snippetName, actionLabel })})`);
}

async function clickSnippetPanelButton(page, actionLabel) {
  return page.evaluate(String.raw`((actionLabel) => {
    const button = [...document.querySelectorAll('#operator-snippet-panel button')].find((candidate) => candidate.textContent === actionLabel);
    if (!button) return { ok: false, reason: 'missing_button' };
    button.click();
    return { ok: true };
  })(${JSON.stringify(actionLabel)})`);
}

function healthSnapshot(event) {
  return {
    agent_id: event.agent_id,
    carrier_kind: event.carrier_kind,
    model: event.model,
    operator_surface_kind: event.operator_surface_kind,
    provider: event.provider,
    session_id: event.session_id,
    status: event.status,
    thinking: event.thinking,
  };
}

test('browser and cli slash health commands project the same session snapshot', { concurrency: false }, async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for live slash cross-surface E2E');

  const runtime = await startSharedRuntime();
  const page = await openCdpPage({ browserPath, url: runtime.localWeb.url, userDataPrefix: 'narada-slash-cross-surface-' });

  const attachInput = new PassThrough();
  const attachOutput = new PassThrough();
  let attachText = '';
  const websocketMessages = [];
  attachOutput.setEncoding('utf8');
  attachOutput.on('data', (chunk) => { attachText += String(chunk); });

  const attachPromise = runNarsAttachClient({
    endpoint: runtime.eventProjection.url,
    input: attachInput,
    output: attachOutput,
    WebSocketImpl: createRecordingWebSocketClass(websocketMessages),
  });

  try {
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#operator-input"))'), 5000, () => ({ output: attachText.slice(0, 1200) }));
    await waitFor(() => websocketMessages.some((message) => message.includes('session_events_subscription_started')), 5000, () => ({ websocket_messages: websocketMessages.slice(-3) }));
    websocketMessages.length = 0;

    const browserFromIndex = runtime.events.length;
    await submitOperatorInputText(page, '/health');
    const browserHealth = await waitFor(
      () => runtime.events.slice(browserFromIndex).find((event) => event.event === 'session_health'),
      5000,
      () => ({ browser_events: runtime.events.slice(browserFromIndex).map((event) => ({ event: event.event, request_id: event.request_id, session_id: event.session_id, status: event.status })) }),
    );

    const cliFromIndex = runtime.events.length;
    attachInput.write('/health\n');
    const cliHealth = await waitFor(
      () => runtime.events.slice(cliFromIndex).find((event) => event.event === 'session_health'),
      5000,
      () => ({ cli_events: runtime.events.slice(cliFromIndex).map((event) => ({ event: event.event, request_id: event.request_id, session_id: event.session_id, status: event.status })) }),
    );

    assert.deepEqual(healthSnapshot(browserHealth), healthSnapshot(cliHealth));
  } finally {
    attachInput.end();
    await Promise.race([attachPromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
    await page.close();
    await runtime.close();
  }
});

test('browser operator snippets persist, search, run, enqueue, delete, and invoke from palette', { concurrency: false }, async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for live snippet E2E');

  const runtime = await startSharedRuntime();
  const page = await openCdpPage({ browserPath, url: runtime.localWeb.url, userDataPrefix: 'narada-snippet-library-' });

  try {
    await waitForPageText(page, 'resident', 15000);
    await page.evaluate('window.localStorage.removeItem("narada:agent-web-ui:operator-snippets.v1")');
    await page.evaluate(String.raw`(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copiedSnippetText = text; } }, configurable: true });
    })()`);

    await submitOperatorInputText(page, '/snippet save launch run startup sequence');
    await waitFor(async () => /Saved snippet: launch/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await submitOperatorInputText(page, '/snippet search launch');
    await waitFor(async () => /launch: run startup sequence/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await submitOperatorInputText(page, '/snippet edit launch run startup sequence now');
    await waitFor(async () => /Updated snippet: launch/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    let fromIndex = runtime.events.length;
    await submitOperatorInputText(page, '/snippet run launch');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && /run startup sequence now/.test(event.content ?? event.message ?? '')),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );

    fromIndex = runtime.events.length;
    await submitOperatorInputText(page, '/snippet enqueue launch');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'conversation_enqueue_requested')
        && runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && /run startup sequence now/.test(event.content ?? event.message ?? '')),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );

    await submitOperatorInputText(page, '/snippet save slash-health /health');
    await waitFor(async () => /Saved snippet: slash-health/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
    fromIndex = runtime.events.length;
    await submitOperatorInputText(page, '/snippet run slash-health');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && (event.content ?? event.message) === '/health'),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );
    assert.equal(runtime.events.slice(fromIndex).some((event) => event.event === 'session_health'), false);

    await submitOperatorInputText(page, '/snippet save palette check webhook delay');
    await waitFor(async () => /Saved snippet: palette/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
    await page.evaluate('document.querySelector("#operator-input")?.focus()');
    await setComposerDraft(page, '/snippet run pal');
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#agent-web-ui-command-palette"))'), 5000, () => ({ state: 'snippet palette not open' }));
    const paletteState = await commandPaletteState(page);
    assert.equal(paletteState.activeSlash, '/snippet run palette');
    fromIndex = runtime.events.length;
    await dispatchComposerKey(page, 'Enter');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && /check webhook delay/.test(event.content ?? event.message ?? '')),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );

    await page.evaluate('document.querySelector("#operator-input")?.focus()');
    await setComposerDraft(page, '/snippet enqueue pal');
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#agent-web-ui-command-palette"))'), 5000, () => ({ state: 'snippet enqueue palette not open' }));
    const enqueuePaletteState = await commandPaletteState(page);
    assert.equal(enqueuePaletteState.activeSlash, '/snippet enqueue palette');
    fromIndex = runtime.events.length;
    await dispatchComposerKey(page, 'Enter');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'conversation_enqueue_requested')
        && runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && /check webhook delay/.test(event.content ?? event.message ?? '')),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );

    await openSnippetPanel(page);
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#operator-snippet-panel"))'), 5000, () => ({ state: 'snippet panel not open' }));
    await saveSnippetFromPanel(page, 'drawer launch', 'drawer body first');
    await waitFor(async () => /Saved snippet: drawer-launch/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
    await setSnippetPanelSearch(page, 'drawer');
    await waitFor(async () => /drawer-launch/.test(await bodyText(page)) && /drawer body first/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await page.evaluate('document.querySelector("#operator-input")?.focus()');
    await setComposerDraft(page, '/drawer');
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#agent-web-ui-command-palette"))'), 5000, () => ({ state: 'snippet direct palette not open' }));
    const directSnippetPaletteState = await commandPaletteState(page);
    assert.equal(directSnippetPaletteState.activeSlash, '/snippet run drawer-launch');

    await clickSnippetPanelAction(page, 'drawer-launch', 'Pin');
    await waitFor(async () => /Pinned snippet: drawer-launch/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
    await clickSnippetPanelAction(page, 'drawer-launch', 'Copy');
    await waitFor(() => page.evaluate('window.__copiedSnippetText === "drawer body first"'), 5000, () => ({ state: 'copy body failed' }));
    await clickSnippetPanelButton(page, 'Export JSON');
    await waitFor(() => page.evaluate('String(window.__copiedSnippetText ?? "").includes("drawer-launch")'), 5000, () => ({ state: 'export copy failed' }));
    await clickSnippetPanelAction(page, 'drawer-launch', 'Fill');
    await waitFor(() => page.evaluate('document.querySelector("#operator-input")?.value === "drawer body first"'), 5000, () => ({ state: 'fill failed' }));

    await clickSnippetPanelAction(page, 'drawer-launch', 'Edit');
    await saveSnippetFromPanel(page, 'drawer renamed', 'drawer body updated');
    await waitFor(async () => /Renamed snippet: drawer-launch -> drawer-renamed/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    fromIndex = runtime.events.length;
    await clickSnippetPanelAction(page, 'drawer-renamed', 'Run');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && /drawer body updated/.test(event.content ?? event.message ?? '')),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );
    await waitFor(async () => /Ran snippet: drawer-renamed/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    fromIndex = runtime.events.length;
    await clickSnippetPanelAction(page, 'drawer-renamed', 'Queue');
    await waitFor(
      () => runtime.events.slice(fromIndex).some((event) => event.event === 'conversation_enqueue_requested')
        && runtime.events.slice(fromIndex).some((event) => event.event === 'user_message' && /drawer body updated/.test(event.content ?? event.message ?? '')),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, content: event.content, message: event.message, method: event.method })) }),
    );
    await waitFor(async () => /Queued snippet: drawer-renamed/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await clickSnippetPanelAction(page, 'drawer-renamed', 'Delete');
    await waitFor(async () => /Deleted snippet: drawer-renamed/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
    await clickSnippetPanelButton(page, 'Undo');
    await waitFor(async () => /Restored drawer-renamed/.test(await bodyText(page)) && /drawer-renamed/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await setSnippetImportText(page, JSON.stringify({ snippets: [{ name: 'imported sample', body: 'imported body', pinned: true }] }));
    await clickSnippetPanelButton(page, 'Import');
    await waitFor(async () => /Imported 1 snippet/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
    await setSnippetPanelSearch(page, 'imported');
    await waitFor(async () => /imported-sample/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await submitOperatorInputText(page, '/snippet delete drawer-renamed');
    await waitFor(async () => /Deleted snippet: drawer-renamed/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));

    await submitOperatorInputText(page, '/snippet delete launch');
    await waitFor(async () => /Deleted snippet: launch/.test(await bodyText(page)), 5000, async () => ({ text: await bodyText(page) }));
  } finally {
    await page.close();
    await runtime.close();
  }
});

test('browser slash palette supports autocomplete, selection, escape dismissal, and submit', { concurrency: false }, async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for live slash palette E2E');

  const runtime = await startSharedRuntime();
  const page = await openCdpPage({ browserPath, url: runtime.localWeb.url, userDataPrefix: 'narada-slash-palette-' });

  try {
    await waitForPageText(page, 'resident', 15000);
    await page.evaluate('document.querySelector("#operator-input")?.focus()');

    await setComposerDraft(page, '/');
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#agent-web-ui-command-palette"))'), 5000, () => ({ state: 'palette not open' }));

    const beforeSelection = await commandPaletteState(page);
    assert.equal(beforeSelection.open, true);
    assert.match(beforeSelection.activeSlash ?? '', /^\//);

    await dispatchComposerKey(page, 'ArrowDown');
    const afterSelection = await commandPaletteState(page);
    assert.equal(afterSelection.open, true);
    assert.match(afterSelection.activeSlash ?? '', /^\//);
    assert.notEqual(afterSelection.activeSlash, beforeSelection.activeSlash);

    await setComposerDraft(page, '/heal');
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#agent-web-ui-command-palette"))'), 5000, () => ({ state: 'palette not open for autocomplete check' }));
    await dispatchComposerKey(page, 'Tab');
    const afterAutocomplete = await commandPaletteState(page);
    assert.equal(afterAutocomplete.activeSlash, '/health');
    assert.equal(afterAutocomplete.inputValue, afterAutocomplete.activeSlash);

    const fromIndex = runtime.events.length;
    await dispatchComposerKey(page, 'Enter');
    const submittedEvent = await waitFor(
      () => runtime.events.slice(fromIndex).find((event) => event.event === 'session_health'),
      5000,
      () => ({ events: runtime.events.slice(fromIndex).map((event) => ({ event: event.event, request_id: event.request_id, session_id: event.session_id, status: event.status })) }),
    );
    assert.ok(submittedEvent);

    await page.evaluate('document.querySelector("#operator-input")?.focus()');
    await setComposerDraft(page, '/st');
    await waitFor(() => page.evaluate('Boolean(document.querySelector("#agent-web-ui-command-palette"))'), 5000, () => ({ state: 'palette not open for escape check' }));
    await dispatchComposerKey(page, 'Escape');
    const afterEscape = await commandPaletteState(page);
    assert.equal(afterEscape.open, false);
    assert.equal(afterEscape.inputValue, '/st');
    assert.equal(afterEscape.interruptVisible, false);
  } finally {
    await page.close();
    await runtime.close();
  }
});
