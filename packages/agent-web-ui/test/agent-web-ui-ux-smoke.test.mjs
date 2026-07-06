import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { startAgentWebUiServer } from '../src/server.js';
import { createEventHub, startEventStreamProjection } from '@narada2/agent-runtime-server/test-fixtures';

function findHeadlessBrowser() {
  return [
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((path) => existsSync(path)) ?? null;
}

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

async function withHealthServer(fn) {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ schema: 'narada.nars.health.v1', status: 'healthy', site_id: 'narada.ux', agent_id: 'ux.agent', role: 'resident', session_id: 'ux_session', mcp_operational_state: 'healthy' }));
  });
  const url = await listen(server);
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

function publishScenarioEvents(eventHub, scenario) {
  const base = { agent_id: 'ux.agent', session_id: `ux_${scenario}`, timestamp: new Date().toISOString(), provider: 'codex-subscription' };
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
      '| Item | Status | Owner | Notes |',
      '|---|---|---|---|',
      '| Login flow | Passing | Ava | Smoke tested with the full operator surface |',
      '| Billing sync | Review | Priya | Needs API check before rollout |',
      '| Email alerts | Failing | Sam | Retry job timing issue with a long explanation that must wrap inside the card |',
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
  eventHub.publish({ ...base, event: 'operator_input_submitted', request_id: 'input_normal', content: 'Run startup sequence' });
  eventHub.publish({ ...base, event: 'tool_call', request_id: 'input_normal', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence' });
  eventHub.publish({ ...base, event: 'tool_result', request_id: 'input_normal', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence', status: 'ok' });
  eventHub.publish({ ...base, event: 'assistant_message', request_id: 'input_normal', content: 'Startup sequence completed.\n\nIdentity hydrated as `ux.agent`. Next action: await operator.' });
}

async function withScenarioServer(scenario, fn) {
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
  const eventHub = createEventHub();
  const eventProjection = await startEventStreamProjection({ childStdin, eventHub, host: '127.0.0.1', port: 0 });
  return withHealthServer(async (healthUrl) => {
    const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: eventProjection.url, healthEndpoint: healthUrl });
    try {
      return await fn(web.url, () => publishScenarioEvents(eventHub, scenario));
    } finally {
      web.server.close();
      eventProjection.server.close();
    }
  });
}

async function openCdpPage({ browserPath, url, viewport, workDir }) {
  const userDataDir = join(workDir, `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(userDataDir, { recursive: true });
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-position=-32000,-32000',
    `--window-size=${viewport.width},${viewport.height}`,
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  const browserWsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`cdp_start_timeout:${stderr.slice(0, 500)}`)), 10000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`browser_exited_before_cdp:${code}:${stderr.slice(0, 500)}`));
    });
  });

  const browserUrl = new URL(browserWsUrl);
  const pages = await fetch(`http://${browserUrl.host}/json/list`).then((response) => response.json());
  const page = pages.find((entry) => entry.type === 'page') ?? pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(JSON.stringify(payload.error)));
    else waiter.resolve(payload.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const nextId = ++id;
    pending.set(nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Runtime.evaluate', { expression: 'document.readyState === "complete"', awaitPromise: true });
  await new Promise((resolve) => setTimeout(resolve, 700));
  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    },
    async screenshot(path) {
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path, Buffer.from(result.data, 'base64'));
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      await new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          if (!child.killed) child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      try { await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
    },
  };
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
  const markdownListItemCount = document.querySelectorAll('.message-markdown li').length;
  const markdownListCodeCount = document.querySelectorAll('.message-markdown li code').length;
  const markdownHtml = [...document.querySelectorAll('.message-markdown')].map((node) => node.innerHTML).join('\n---\n');
  return { failures, messages, scrollWidth: doc.scrollWidth, bodyScrollWidth: body.scrollWidth, viewportWidth, viewportHeight, rowCount: rowRects.length, markdownListItemCount, markdownListCodeCount, markdownHtml, text: document.body.textContent };
})()`;

const SUBMIT_SCROLL_ASSERTION_SCRIPT = String.raw`(async () => {
  const scroller = document.querySelector('.events-scroll');
  const input = document.querySelector('#operator-input');
  const form = document.querySelector('#operator-form');
  if (!scroller || !input || !form) return { ok: false, reason: 'missing_composer_or_scroller' };
  scroller.scrollTop = 0;
  input.value = 'Follow latest after submit';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  return {
    ok: distanceFromBottom < 4,
    distanceFromBottom,
    scrollTop: scroller.scrollTop,
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    text: document.body.textContent,
  };
})()`;

async function runScenarioViewport({ browserPath, scenario, viewport, outDir }) {
  return withScenarioServer(scenario.name, async (url, publishEvents = () => {}) => {
    const page = await openCdpPage({ browserPath, url, viewport, workDir: outDir });
    try {
      if (scenario.view) {
        await page.evaluate(`((view) => { const select = document.querySelector('#projection-verbosity'); select.value = view; select.dispatchEvent(new Event('change', { bubbles: true })); })(${JSON.stringify(scenario.view)})`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      publishEvents();
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (scenario.name === 'snippets') {
        await page.evaluate(String.raw`(() => {
          const input = document.querySelector('#operator-input');
          const form = document.querySelector('#operator-form');
          input.value = '/snippet save "ux drawer" First reusable operator instruction for screenshot coverage';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        await page.evaluate(String.raw`(() => {
          const headerSelector = document.querySelector('.shell-header .status-box-selector-trigger');
          headerSelector?.click();
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        await page.evaluate(String.raw`(() => {
          const rows = [...document.querySelectorAll('.status-box-selector-item')];
          const snippetsRow = rows.find((row) => row.textContent?.includes('Snippets'));
          const checkbox = snippetsRow?.querySelector('input[type="checkbox"]');
          if (checkbox && !checkbox.checked) checkbox.click();
          document.querySelector('.mcp-panel-close')?.click();
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        await page.evaluate("document.querySelector('.operator-snippet-trigger')?.click()");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const screenshotPath = join(outDir, `${scenario.name}-${viewport.name}.png`);
      await page.screenshot(screenshotPath);
      const screenshot = await readFile(screenshotPath);
      assert.deepEqual([...screenshot.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], screenshotPath);
      assert.ok(screenshot.length > 5000, `expected non-empty screenshot: ${screenshotPath}`);
      const result = await page.evaluate(UX_ASSERTION_SCRIPT);
      assert.deepEqual(result.failures, [], `${scenario.name}/${viewport.name}: ${JSON.stringify({ failures: result.failures, messages: result.messages })}`);
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
      }
      if (scenario.name === 'normal') {
        assert.doesNotMatch(result.text, /routine status updates? folded into State/i, 'expected Chat view to hide debug state-sample note');
        const submitScroll = await page.evaluate(SUBMIT_SCROLL_ASSERTION_SCRIPT);
        assert.equal(submitScroll.ok, true, `${scenario.name}/${viewport.name}: expected submit to scroll transcript to bottom: ${JSON.stringify(submitScroll)}`);
      }
      if (scenario.name === 'snippets') {
        assert.match(result.text, /Snippets[\s\S]*Browser\/operator local saved inputs/i, 'expected snippets drawer to be visible');
        assert.match(result.text, /ux-drawer[\s\S]*First reusable operator instruction/i, 'expected saved snippet to render in drawer');
      }
      return screenshotPath;
    } finally {
      await page.close();
    }
  });
}

test('agent-web-ui UX smoke matrix has no obvious layout regressions', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for UX smoke');
  const outDir = join(tmpdir(), `agent-web-ui-ux-${Date.now()}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const scenarios = [
    { name: 'normal' },
    { name: 'snippets' },
    { name: 'thinking' },
    { name: 'disconnected' },
    { name: 'markdown' },
    { name: 'operations', view: 'operations' },
    { name: 'diagnostics', view: 'diagnostics' },
    { name: 'raw', view: 'raw' },
  ];
  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  try {
    const screenshots = [];
    for (const scenario of scenarios) {
      for (const viewport of viewports) screenshots.push(await runScenarioViewport({ browserPath, scenario, viewport, outDir }));
    }
    assert.equal(screenshots.length, scenarios.length * viewports.length);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
