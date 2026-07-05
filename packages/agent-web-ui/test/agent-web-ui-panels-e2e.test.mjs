import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
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
    response.end(JSON.stringify({
      schema: 'narada.nars.health.v1',
      status: 'healthy',
      site_id: 'narada.sonar',
      site_root: 'D:/code/narada.sonar',
      agent_id: 'resident',
      role: 'resident',
      session_id: 'carrier_panels',
      mcp_operational_state: 'healthy',
      mcp: {
        operational_state: 'healthy',
        server_count: 2,
        servers: [
          { server_name: 'narada-sonar-agent-context', tool_count: 2, operational_state: 'healthy' },
          { server_name: 'narada-sonar-sop', tool_count: 3, operational_state: 'healthy' },
        ],
      },
      mcp_tools: [
        { server_name: 'narada-sonar-agent-context', tool_name: 'agent_context_startup_sequence', description: 'Hydrate current agent session context.' },
        { server_name: 'narada-sonar-agent-context', tool_name: 'agent_context_whoami', description: 'Read current agent identity.' },
        { server_name: 'narada-sonar-sop', tool_name: 'sop_template_list', description: 'List SOP templates.' },
        { server_name: 'narada-sonar-sop', tool_name: 'sop_run_list', description: 'List SOP runs.' },
        { server_name: 'narada-sonar-sop', tool_name: 'sop_run_status', description: 'Read SOP run status.' },
      ],
    }));
  });
  const url = await listen(server);
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

async function withPanelServer(fn) {
  const childStdin = new PassThrough();
  const eventHub = createEventHub();
  childStdin.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        if (request?.method === 'session.sop.summary') publishSopSummary(eventHub, request.id ?? null);
      } catch {}
    }
  });
  const eventProjection = await startEventStreamProjection({ childStdin, eventHub, host: '127.0.0.1', port: 0 });
  return withHealthServer(async (healthUrl) => {
    const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: eventProjection.url, healthEndpoint: healthUrl });
    try {
      return await fn(web.url, () => publishPanelEvents(eventHub));
    } finally {
      web.server.close();
      eventProjection.server.close();
    }
  });
}

function publishPanelEvents(eventHub) {
  const base = { agent_id: 'resident', session_id: 'carrier_panels', timestamp: new Date().toISOString(), provider: 'codex-subscription' };
  eventHub.publish({
    ...base,
    event: 'session_started',
    site_id: 'narada.sonar',
    role: 'resident',
    model: 'gpt-5.5',
    mcp_server_count: 2,
    mcp_operational_state: 'healthy',
    mcp_servers: [
      { server_name: 'narada-sonar-agent-context', tool_count: 2, operational_state: 'healthy' },
      { server_name: 'narada-sonar-sop', tool_count: 3, operational_state: 'healthy' },
    ],
    mcp_tools: [
      { server_name: 'narada-sonar-agent-context', tool_name: 'agent_context_startup_sequence', description: 'Hydrate current agent session context.' },
      { server_name: 'narada-sonar-agent-context', tool_name: 'agent_context_whoami', description: 'Read current agent identity.' },
      { server_name: 'narada-sonar-sop', tool_name: 'sop_template_list', description: 'List SOP templates.' },
      { server_name: 'narada-sonar-sop', tool_name: 'sop_run_list', description: 'List SOP runs.' },
      { server_name: 'narada-sonar-sop', tool_name: 'sop_run_status', description: 'Read SOP run status.' },
    ],
  });
}

function publishSopSummary(eventHub, requestId = null) {
  const base = { agent_id: 'resident', session_id: 'carrier_panels', timestamp: new Date().toISOString(), provider: 'codex-subscription' };
  eventHub.publish({
    ...base,
    event: 'session_sop_summary',
    request_id: requestId,
    status: 'ok',
    server_name: 'narada-sonar-sop',
    templates: {
      count: 1,
      items: [{
        sop_id: 'webhook-delay-briefing',
        version: 40,
        title: 'Webhook Delay Briefing',
        status: 'active',
        steps: [
          { id: 'a', title: 'Refresh metrics', executor: 'engine', blocking: false, instructions: 'Refresh webhook delay summary.' },
          { id: 'b', title: 'Compose operator briefing', executor: 'agent', blocking: true, instructions: 'Write the body for operator review.' },
        ],
      }],
    },
    runs: {
      count: 1,
      items: [{
        run_id: 'sop_run_panels_001',
        sop_id: 'webhook-delay-briefing',
        sop_title: 'Webhook Delay Briefing',
        status: 'awaiting_operator_review',
        step_states: [
          { id: 'a', title: 'Refresh metrics', status: 'completed' },
          { id: 'b', title: 'Compose operator briefing', status: 'waiting' },
        ],
      }],
    },
    errors: [],
  });
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
    '--window-size=1280,900',
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

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

  await clickByText('button', 'Tool Surfaces (MCP):');
  await clickByText('#mcp-server-panel .mcp-server-row', 'narada-sonar-agent-context');
  if (!text().includes('agent_context_startup_sequence')) failures.push('missing_mcp_tool_startup_sequence');
  if (!text().includes('agent_context_whoami')) failures.push('missing_mcp_tool_whoami');
  document.querySelector('#mcp-server-panel .mcp-panel-close')?.click();
  await new Promise((resolve) => setTimeout(resolve, 150));

  await clickByText('button', 'SOP:');
  await clickByText('#sop-panel .sop-item-row', 'Webhook Delay Briefing');
  if (!text().includes('webhook-delay-briefing')) failures.push('missing_sop_template_id');
  if (!text().includes('Refresh metrics')) failures.push('missing_sop_template_step_refresh');
  if (!text().includes('Compose operator briefing')) failures.push('missing_sop_template_step_compose');
  await clickByText('#sop-panel .sop-item-row', 'sop_run_panels_001');
  if (!text().includes('awaiting_operator_review')) failures.push('missing_sop_run_status');
  if (!text().includes('waiting')) failures.push('missing_sop_run_step_state');
  return { failures, text: text().replace(/\s+/g, ' ').trim() };
})()`;

test('agent-web-ui panels expose MCP tools and SOP database items with step accordions', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for panel e2e');
  const outDir = join(tmpdir(), `agent-web-ui-panels-${Date.now()}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  try {
    await withPanelServer(async (url, publishEvents) => {
      const page = await openCdpPage({ browserPath, url, workDir: outDir });
      try {
        publishEvents();
        await new Promise((resolve) => setTimeout(resolve, 500));
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
