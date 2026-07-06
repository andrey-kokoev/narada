import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createEventHub, startHealthProjection, startEventStreamProjection } from '@narada2/agent-runtime-server';
import { startAgentWebUiServer } from '../src/server.js';
import { createCarrierRuntimeDependencies } from '../../carrier-runtime/src/runtime-dependencies.mjs';
import { runCarrierServerMode } from '../../carrier-runtime/src/server-mode.mjs';
import { removeTempDir, tempRoot, waitFor, writeFixtureMcpSurface } from '../../carrier-runtime/src/server-mode-test-helpers.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function findHeadlessBrowser() {
  return [
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((path) => existsSync(path)) ?? null;
}

function writeFixtureSopMcpSurface(siteRoot) {
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  mkdirSync(join(siteRoot, 'tools'), { recursive: true });
  writeFileSync(join(siteRoot, 'tools', 'fixture-sop-mcp.mjs'), `
let buffer = '';
function write(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}
function toolResult(id, structuredContent) {
  write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent } });
}
function handle(request) {
  if (request.method === 'initialize') {
    write({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'narada-fixture-sop-mcp', version: '0.0.0-test' } } });
    return;
  }
  if (request.method === 'tools/list') {
    write({ jsonrpc: '2.0', id: request.id, result: { tools: [
      { name: 'sop_template_list', description: 'List fixture SOP templates', inputSchema: { type: 'object', properties: {} } },
      { name: 'sop_run_list', description: 'List fixture SOP runs', inputSchema: { type: 'object', properties: {} } },
      { name: 'sop_run_status', description: 'Read fixture SOP run status', inputSchema: { type: 'object', properties: { run_id: { type: 'string' } } } },
      { name: 'sop_doctor', description: 'Inspect fixture SOP server', inputSchema: { type: 'object', properties: {} } }
    ] } });
    return;
  }
  if (request.method === 'tools/call') {
    const name = request.params?.name;
    if (name === 'sop_template_list') {
      toolResult(request.id, { items: [{ sop_id: 'webhook-delay-briefing', version: 40, title: 'Webhook Delay Briefing', description: 'Prepare and review the webhook delay update.', status: 'active', trigger_kind: 'manual', steps: [{ id: 'a', executor: 'engine', blocking: false, title: 'Refresh metrics', instructions: 'Refresh webhook delay summary.' }, { id: 'b', executor: 'agent', blocking: true, title: 'Compose operator briefing', instructions: 'Write the body for operator review.', depends_on: ['a'] }] }], count: 1 });
      return;
    }
    if (name === 'sop_run_list') {
      toolResult(request.id, { items: [{ run_id: 'sop_run_panels_001', sop_id: 'webhook-delay-briefing', sop_version: 40, sop_title: 'Webhook Delay Briefing', status: 'awaiting_operator_review', next_awaits_confirmation: true, started_at: '2026-07-05T03:00:00.000Z', updated_at: '2026-07-05T03:04:00.000Z', step_states: [{ step_id: 'a', id: 'a', executor: 'engine', blocking: false, title: 'Refresh metrics', status: 'completed', completed_at: '2026-07-05T03:01:00.000Z', result: { summary: 'Metrics refreshed.' } }, { step_id: 'b', id: 'b', executor: 'agent', blocking: true, title: 'Compose operator briefing', status: 'waiting', started_at: '2026-07-05T03:02:00.000Z' }] }], count: 1 });
      return;
    }
    if (name === 'sop_doctor') {
      toolResult(request.id, { status: 'ok', server_name: 'narada-fixture-sop' });
      return;
    }
    write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unexpected fixture SOP tool ' + name } });
    return;
  }
  write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unsupported method ' + request.method } });
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    handle(JSON.parse(line));
  }
});
`, 'utf8');
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture-sop-mcp.json'), `${JSON.stringify({
    schema: 'narada.mcp.client_config.v0',
    mcpServers: {
      'narada-fixture-sop': {
        command: 'node',
        args: ['{site_root}/tools/fixture-sop-mcp.mjs'],
        surface_id: 'fixture.sop',
        target_site_root: '{site_root}',
      },
    },
  }, null, 2)}\n`, 'utf8');
}

async function readSessionStartedFromEventEndpoint(url) {
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (message) => {
    const parsed = JSON.parse(String(message.data));
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  await once(socket, 'open');
  const next = () => {
    if (queue.length) return Promise.resolve(queue.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('event_endpoint_replay_timeout')), 1500);
      waiters.push((event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
  };
  try {
    socket.send(JSON.stringify({ id: 'event-endpoint-smoke', method: 'session.events.subscribe', params: { include_replay: true, since_sequence: 0, max_replay: 10 } }));
    for (let index = 0; index < 10; index += 1) {
      const event = await next();
      const payload = event?.payload ?? event;
      if (payload?.event === 'session_started') return payload;
    }
    throw new Error('session_started_not_replayed_from_event_endpoint');
  } finally {
    socket.close();
  }
}

async function withRealNarsFixtureServer(fn) {
  const siteRoot = tempRoot('agent-web-ui-real-nars-mcp-');
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const eventHub = createEventHub();
  const events = [];
  let outputBuffer = '';
  let runtimePromise = null;
  let healthProjection = null;
  let eventProjection = null;
  try {
    writeFixtureMcpSurface(siteRoot);
    writeFixtureSopMcpSurface(siteRoot);
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'session_web_ui_real_nars_mcp' }).narsSessionDir;
    const baseRuntimeContext = {
      identity: 'agent.test',
      session: 'session_web_ui_real_nars_mcp',
      siteRoot,
      siteId: 'narada.fixture',
      operatorSurfaceKind: 'agent-web-ui',
      sessionPath: join(sessionDir, 'session.jsonl'),
      eventsPath: join(sessionDir, 'events.jsonl'),
      intelligenceProvider: 'codex-subscription',
      providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
    };
    healthProjection = await startHealthProjection({ childStdin: () => runtimeInput, host: '127.0.0.1', port: 0, runtimeContext: { ...baseRuntimeContext, eventHub } });
    eventProjection = await startEventStreamProjection({ childStdin: () => runtimeInput, eventHub, host: '127.0.0.1', port: 0, eventsPath: baseRuntimeContext.eventsPath });
    const runtimeContext = {
      ...baseRuntimeContext,
      healthUrl: healthProjection.url,
      eventStreamUrl: eventProjection.url,
    };
    const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext });
    runtimeOutput.setEncoding('utf8');
    runtimeOutput.on('data', (chunk) => {
      outputBuffer += chunk;
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        events.push(event);
        healthProjection?.observe(event);
        eventHub.publish(event);
      }
    });
    runtimePromise = runCarrierServerMode({
      input: runtimeInput,
      output: runtimeOutput,
      callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'unused' } }] }),
      runtimeContext,
      dependencies: {
        ...dependencies,
        readMcpPreflightArtifact: () => null,
      },
    });
    await waitFor(() => events.some((event) => event.event === 'session_started'), { timeoutMs: 2000 });
    const directHealth = await fetch(healthProjection.url).then((response) => response.json());
    assert.equal(directHealth?.mcp_tools?.some((tool) => tool.server_name === 'narada-fixture' && tool.tool_name === 'fixture_read'), true);
    assert.equal(directHealth?.mcp_tools?.some((tool) => tool.server_name === 'narada-fixture-sop' && tool.tool_name === 'sop_template_list'), true);
    const directEvent = await readSessionStartedFromEventEndpoint(eventProjection.url);
    assert.equal(directEvent.event_endpoint, eventProjection.url);
    assert.equal(directEvent.health_endpoint, healthProjection.url);
    const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: eventProjection.url, healthEndpoint: healthProjection.url });
    try {
      return await fn(web.url, { events, directHealth, healthEndpoint: healthProjection.url, eventEndpoint: eventProjection.url });
    } finally {
      web.server.close();
    }
  } finally {
    runtimeInput.end();
    if (runtimePromise) await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
    healthProjection?.server.close();
    eventProjection?.server.close();
    removeTempDir(siteRoot);
  }
}

async function openCdpPage({ browserPath, url, workDir }) {
  const userDataDir = join(workDir, `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(userDataDir, { recursive: true });
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-position=-32000,-32000',
    '--window-size=1280,900',
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
  await once(ws, 'open');
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
  await new Promise((resolve) => setTimeout(resolve, 900));
  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      await new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        const timer = setTimeout(() => {
          if (!child.killed) child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonlFile(path) {
  if (!existsSync(path)) return [];
  const events = [];
  for (const line of readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((entry) => entry.trim())) {
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events;
}

function collectProcessOutput(child) {
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  return {
    stdout: () => stdout,
    stderr: () => stderr,
    all: () => `${stdout}\n${stderr}`,
  };
}

async function waitForTextMatch(readText, regex, { timeoutMs = 5000, label = 'text_match' } = {}) {
  let match = null;
  await waitFor(() => {
    match = readText().match(regex);
    return Boolean(match);
  }, { timeoutMs });
  if (!match) throw new Error(`${label}_not_found`);
  return match;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

const PANEL_ASSERTION_SCRIPT = String.raw`(async () => {
  const failures = [];
  const text = () => document.body.textContent || '';
  const clickByText = async (selector, needle) => {
    const node = [...document.querySelectorAll(selector)].find((item) => (item.textContent || '').includes(needle));
    if (!node) {
      failures.push('missing_click_target:' + needle);
      return false;
    }
    node.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  };
  const openSurface = async (label) => {
    if (!await clickByText('.surface-navigator-trigger', 'Surfaces:')) return false;
    return clickByText('#surface-navigator-panel .surface-navigator-row', label);
  };

  await openSurface('Tool Surfaces (MCP)');
  await clickByText('#mcp-server-panel .mcp-server-row', 'narada-fixture');
  if (!text().includes('fixture_read')) failures.push('missing_fixture_read_tool');
  document.querySelector('#mcp-server-panel .mcp-panel-close')?.click();
  await new Promise((resolve) => setTimeout(resolve, 150));

  await openSurface('SOP');
  await clickByText('#sop-panel .sop-item-row', 'Webhook Delay Briefing');
  if (!text().includes('webhook-delay-briefing')) failures.push('missing_sop_template_id');
  if (!text().includes('Refresh metrics')) failures.push('missing_sop_template_step_refresh');
  if (!text().includes('Compose operator briefing')) failures.push('missing_sop_template_step_compose');
  await clickByText('#sop-panel .sop-item-row', 'sop_run_panels_001');
  if (!text().includes('awaiting_operator_review')) failures.push('missing_sop_run_status');
  if (!text().includes('waiting')) failures.push('missing_sop_run_step_state');
  return { failures, text: text().replace(/\s+/g, ' ').trim() };
})()`;

const UNSUPPORTED_SURFACE_AFFORDANCES_REGRESSION_SCRIPT = String.raw`(async () => {
  const failures = [];
  const text = () => document.body.textContent || '';
  const clickByText = async (selector, needle) => {
    const node = [...document.querySelectorAll(selector)].find((item) => (item.textContent || '').includes(needle));
    if (!node) {
      failures.push('missing_click_target:' + needle);
      return false;
    }
    node.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return true;
  };
  const openSurface = async (label) => {
    if (!await clickByText('.surface-navigator-trigger', 'Surfaces:')) return false;
    return clickByText('#surface-navigator-panel .surface-navigator-row', label);
  };

  await openSurface('Tool Surfaces (MCP)');
  const body = text().replace(/\s+/g, ' ').trim();
  if (body.includes('Unsupported method: session.surface.affordances')) failures.push('unsupported_surface_affordances_visible');
  if (body.includes('Unsupported method')) failures.push('unsupported_method_visible');
  return { failures, text: body };
})()`;

const FIXTURE_MCP_TOOL_CATALOG_ASSERTION_SCRIPT = String.raw`(async () => {
  const failures = [];
  const text = () => document.body.textContent || '';
  const clickByText = async (selector, needle) => {
    const node = [...document.querySelectorAll(selector)].find((item) => (item.textContent || '').includes(needle));
    if (!node) {
      failures.push('missing_click_target:' + needle);
      return false;
    }
    node.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  };
  const openSurface = async (label) => {
    if (!await clickByText('.surface-navigator-trigger', 'Surfaces:')) return false;
    return clickByText('#surface-navigator-panel .surface-navigator-row', label);
  };

  await openSurface('Tool Surfaces (MCP)');
  await clickByText('#mcp-server-panel .mcp-server-row', 'narada-fixture');
  if (!text().includes('fixture_read')) failures.push('missing_fixture_read_tool');
  if (text().includes('Tool names are not available in the current runtime inventory.')) failures.push('unexpected_tool_catalog_empty_message');
  return { failures, text: text().replace(/\s+/g, ' ').trim() };
})()`;

test('agent-web-ui panels expose real NARS MCP tools and SOP MCP items with step accordions', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for panel e2e');
  const outDir = join(tmpdir(), `agent-web-ui-panels-${Date.now()}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  try {
    await withRealNarsFixtureServer(async (url) => {
      const page = await openCdpPage({ browserPath, url, workDir: outDir });
      try {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const result = await page.evaluate(PANEL_ASSERTION_SCRIPT);
        assert.deepEqual(result.failures, [], JSON.stringify(result));
      } finally {
        await page.close();
      }
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('agent-web-ui MCP panel shows tool names from real NARS fixture MCP health endpoint', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for real NARS web UI e2e');
  const outDir = join(tmpdir(), `agent-web-ui-real-nars-mcp-${Date.now()}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  try {
    await withRealNarsFixtureServer(async (url) => {
      const page = await openCdpPage({ browserPath, url, workDir: outDir });
      try {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const result = await page.evaluate(FIXTURE_MCP_TOOL_CATALOG_ASSERTION_SCRIPT);
        assert.deepEqual(result.failures, [], JSON.stringify(result));
      } finally {
        await page.close();
      }
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('agent-web-ui attach requests surface affordances from a live NARS process without unsupported_method', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for live NARS web UI e2e');
  const siteRoot = join(tmpdir(), `agent-web-ui-live-nars-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(siteRoot, { recursive: true });
  const sessionId = `carrier_nars_live_e2e_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const agentId = 'live-e2e.resident';
  const sessionDir = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId);
  const recordPath = join(sessionDir, 'session-index-record.json');
  const eventsPath = join(sessionDir, 'events.jsonl');
  let narsProcess = null;
  let webUiProcess = null;
  let page = null;
  try {
    narsProcess = spawn(process.execPath, [
      join(REPO_ROOT, 'packages', 'agent-runtime-server', 'bin', 'narada-agent-runtime-server.mjs'),
      '--identity', agentId,
      '--session', sessionId,
      '--site-root', siteRoot,
      '--operator-surface', 'agent-web-ui',
      '--raw-jsonl',
    ], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AI_MODEL: 'gpt-5.5',
        NARADA_AI_THINKING: 'medium',
        NARADA_AGENT_CLI_STREAM: '0',
        NARADA_OPERATION_HEARTBEAT_DIRECTIVE_ENABLED: '0',
      },
    });
    const narsOutput = collectProcessOutput(narsProcess);

    await waitFor(() => {
      if (narsProcess.exitCode !== null) throw new Error(`nars_process_exited:${narsProcess.exitCode}:${narsOutput.all().slice(0, 1000)}`);
      if (!existsSync(recordPath)) return false;
      try {
        const record = readJsonFile(recordPath);
        return typeof record.event_endpoint === 'string' && typeof record.health_endpoint === 'string';
      } catch {
        return false;
      }
    }, { timeoutMs: 8000 });
    const record = readJsonFile(recordPath);
    assert.equal(record.session_id, sessionId);
    assert.equal(record.agent_id, agentId);
    assert.match(record.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
    assert.match(record.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    const health = await fetch(record.health_endpoint).then((response) => response.json());
    assert.equal(health.status, 'healthy');

    webUiProcess = spawn(process.execPath, [
      join(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js'),
      'agent-web-ui',
      'attach',
      '--session', sessionId,
      '--site-root', siteRoot,
      '--host', '127.0.0.1',
      '--port', '0',
      '--no-open',
      '--health-timeout-ms', '2000',
      '--format', 'human',
    ], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const webOutput = collectProcessOutput(webUiProcess);
    const urlMatch = await waitForTextMatch(webOutput.all, /agent-web-ui:\s+(http:\/\/127\.0\.0\.1:\d+)/, { timeoutMs: 10000, label: 'agent_web_ui_url' });
    const webUrl = urlMatch[1];

    page = await openCdpPage({ browserPath, url: webUrl, workDir: siteRoot });
    await waitFor(() => readJsonlFile(eventsPath).some((event) => event.event === 'session_surface_affordances'), { timeoutMs: 10000 });
    const events = readJsonlFile(eventsPath);
    const surfaceAffordances = events.find((event) => event.event === 'session_surface_affordances');
    assert.match(surfaceAffordances.request_id, /^agent-web-ui-surface-affordances-/);
    const unsupported = events.filter((event) => event.event === 'error' && (
      event.code === 'unsupported_method'
      || String(event.message ?? '').includes('Unsupported method')
    ));
    assert.deepEqual(unsupported, []);
  } finally {
    if (page) await page.close();
    await stopProcess(webUiProcess);
    await stopProcess(narsProcess);
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

