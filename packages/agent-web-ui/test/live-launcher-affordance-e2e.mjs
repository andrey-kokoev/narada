import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DEFAULT_SITE_ROOT = 'D:\\code\\narada.sonar';

const options = parseArgs(process.argv.slice(2));
const requestedSiteRoot = options.siteRoot ? resolve(options.siteRoot) : null;
const siteRoot = requestedSiteRoot ?? await createEphemeralSiteRoot();
const ownsSiteRoot = requestedSiteRoot === null;
const siteId = options.siteId ?? inferSiteId(siteRoot);
const agentId = options.agent ?? `${siteId}.live_e2e_${Date.now()}.resident`;
const timeoutMs = Number(options.timeoutMs ?? 60_000);

if (!existsSync(siteRoot)) {
  throw new Error(`site_root_not_found: ${siteRoot}`);
}

async function startFixtureProvider() {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Live launcher fixture response' } }] }));
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('live_e2e_fixture_provider_address_missing');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    requests,
    async close() {
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

const browserPath = findHeadlessBrowser();
assert.ok(browserPath, 'expected an installed Chromium-family browser for live agent-web-ui e2e');

const startedAt = Date.now();
let runtimeProcess = null;
let webUiProcess = null;
let page = null;
let provider = null;

try {
  provider = await startFixtureProvider();
  console.log(`live-e2e: starting real operator-surface runtime for ${agentId}`);
  runtimeProcess = spawnTestChild(process.execPath, [
    join(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js'),
    'operator-surface',
    'runtime',
    'start',
    'agent-web-ui',
    '--site-root', siteRoot,
    '--target-site-id', siteId,
    '--workspace-root', REPO_ROOT,
    '--agent', agentId,
    '--runtime', 'narada-agent-runtime-server',
    '--intelligence-provider', 'kimi-code-api',
    '--mcp-scope', 'none',
    '--exec',
    '--format', 'human',
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
      NARADA_AI_API_KEY: 'live-e2e-fixture-key',
      NARADA_AI_BASE_URL: provider.baseUrl,
      NARADA_AI_MODEL: 'live-e2e-fixture-model',
      KIMI_CODE_API_KEY: 'live-e2e-fixture-key',
      KIMI_CODE_API_BASE_URL: provider.baseUrl,
      KIMI_CODE_MODEL: 'live-e2e-fixture-model',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const runtimeOutput = collectProcessOutput(runtimeProcess);

  const record = await waitForSessionRecord({ siteRoot, agentId, timeoutMs, runtimeProcess, runtimeOutput });
  assert.equal(record.agent_id, agentId);
  assert.equal(record.runtime_kind, 'narada-agent-runtime-server');
  assert.equal(record.launch_operator_surface_kind, 'agent-web-ui');
  assert.match(record.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
  assert.match(record.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
  const startupEvent = await waitFor(() => readJsonlFile(record.events_path).find((event) => event.event === 'session_started'), {
    timeoutMs,
    label: 'runtime_start_event',
  });
  assert.equal(startupEvent.provider, 'kimi-code-api');
  assert.equal(startupEvent.model, 'live-e2e-fixture-model');
  assert.equal(startupEvent.mcp_scope, 'none');
  assert.equal(startupEvent.mcp_operational_state, 'disabled');

  const health = await waitForHealthy(record.health_endpoint, timeoutMs);
  assert.equal(health.status, 'healthy');

  console.log(`live-e2e: attaching real agent-web-ui to ${record.session_id}`);
  webUiProcess = spawnTestChild(process.execPath, [
    join(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js'),
    'agent-web-ui',
    'attach',
    '--session', record.session_id,
    '--site-root', siteRoot,
    '--host', '127.0.0.1',
    '--port', '0',
    '--no-open',
    '--health-timeout-ms', '3000',
    '--onboarding',
    '--format', 'human',
  ], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const webUiOutput = collectProcessOutput(webUiProcess);
  const urlMatch = await waitForTextMatch(webUiOutput.all, /agent-web-ui:\s+(http:\/\/127\.0\.0\.1:\d+)/, { timeoutMs, label: 'agent_web_ui_url' });
  const webUrl = urlMatch[1];

  console.log(`live-e2e: opening browser projection ${webUrl}`);
  page = await openCdpPage({ browserPath, url: webUrl, workDir: siteRuntimeRoot(siteRoot) });
  await page.waitForExpression("document.querySelector('.onboarding-panel[data-phase=\\\"ready\\\"]') !== null", timeoutMs);
  const onboardingText = await page.evaluate("document.querySelector('.onboarding-panel')?.textContent ?? ''");
  assert.match(onboardingText, /Welcome to your General assistant/);

  await page.evaluate(`(() => {
    const input = document.querySelector('#operator-input');
    const form = document.querySelector('#operator-form');
    if (!input || !form) throw new Error('live_e2e_composer_not_found');
    input.value = 'What can you help me with?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`);
  await waitFor(() => readJsonlFile(record.events_path).some((event) => event.event === 'carrier_turn_completed'), { timeoutMs, label: 'first_assistant_turn' });
  await page.waitForExpression("document.body.textContent.includes('Live launcher fixture response')", timeoutMs);
  assert.equal(provider.requests.length, 1);
  const events = readJsonlFile(record.events_path);
  const unsupported = events.filter((event) => event.event === 'error' && (
    event.code === 'unsupported_method'
    || String(event.message ?? '').includes('Unsupported method')
  ));
  assert.deepEqual(unsupported, []);

  console.log(JSON.stringify({
    schema: 'narada.agent_web_ui.live_launcher_affordance_e2e.result.v1',
    status: 'passed',
    site_root: siteRoot,
    site_id: siteId,
    agent_id: agentId,
    session_id: record.session_id,
    event_endpoint: record.event_endpoint,
    health_endpoint: record.health_endpoint,
    events_path: record.events_path,
    first_turn_provider_request_count: provider.requests.length,
    elapsed_ms: Date.now() - startedAt,
  }, null, 2));
} finally {
  if (page) await page.close();
  if (webUiProcess) await stopProcess(webUiProcess);
  try {
    const record = findLatestSessionRecord(siteRoot, agentId);
    if (record?.event_endpoint) await closeNarsSession(record.event_endpoint);
  } catch {}
  if (runtimeProcess) await stopProcess(runtimeProcess);
  if (provider) await provider.close();
  if (ownsSiteRoot) await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

async function createEphemeralSiteRoot() {
  const root = await mkdtemp(join(tmpdir(), 'narada-live-launcher-'));
  await mkdir(join(root, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  return root;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (!arg.startsWith('--')) throw new Error(`unexpected_arg: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing_value_for_arg: ${arg}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function inferSiteId(root) {
  const name = basename(root).toLowerCase();
  if (name === '.narada') return basename(resolve(root, '..')).replace(/^narada[.-]/i, '');
  return name.replace(/^narada[.-]/i, '');
}

function siteRuntimeRoot(root) {
  return basename(root).toLowerCase() === '.narada' ? root : join(root, '.narada');
}

function sessionRoots(root) {
  return [
    join(root, '.narada', 'crew', 'nars-sessions'),
    join(root, 'crew', 'nars-sessions'),
  ];
}

async function waitForSessionRecord({ siteRoot, agentId, timeoutMs, runtimeProcess, runtimeOutput }) {
  return waitFor(() => {
    if (runtimeProcess.exitCode !== null && runtimeProcess.exitCode !== 0) {
      throw new Error(`runtime_process_exited:${runtimeProcess.exitCode}:${runtimeOutput.all().slice(0, 4000)}`);
    }
    const record = findLatestSessionRecord(siteRoot, agentId);
    return record?.event_endpoint && record?.health_endpoint ? record : false;
  }, { timeoutMs, label: 'session_index_record' });
}

function findLatestSessionRecord(siteRoot, agentId) {
  const records = [];
  for (const root of sessionRoots(siteRoot)) {
    if (!existsSync(root)) continue;
    let aggregate = null;
    try {
      aggregate = readNarsSessionIndex({ sessionsRoot: root, siteRoot });
    } catch {}
    if (Array.isArray(aggregate?.sessions)) {
      for (const entry of aggregate.sessions) {
        if (entry?.agent_id !== agentId) continue;
        const recordPath = entry.record_path ?? (entry.session_dir ? join(entry.session_dir, 'session-index-record.json') : null);
        if (!recordPath || !existsSync(recordPath)) continue;
        try {
          const record = readJsonFile(recordPath);
          if (record?.agent_id === agentId) records.push(record);
        } catch {}
      }
      if (records.length > 0) continue;
    }
    // Keep a bounded fallback for a partially written or legacy index. New sessions
    // are the newest directories, so this remains useful without rescanning history.
    const entries = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        entry,
        mtimeMs: statSync(join(root, entry.name)).mtimeMs,
      }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, 128);
    for (const { entry } of entries) {
      if (!entry.isDirectory()) continue;
      const recordPath = join(root, entry.name, 'session-index-record.json');
      if (!existsSync(recordPath)) continue;
      try {
        const record = readJsonFile(recordPath);
        if (record?.agent_id === agentId) records.push(record);
      } catch {}
    }
  }
  records.sort((left, right) => timestampMs(right) - timestampMs(left));
  return records[0] ?? null;
}

function timestampMs(record) {
  for (const field of ['last_seen_at', 'started_at', 'projection_generated_at']) {
    const value = record?.[field];
    if (typeof value !== 'string') continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function waitForHealthy(endpoint, timeoutMs) {
  return waitFor(async () => {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) return false;
      const body = await response.json();
      return body.status === 'healthy' ? body : false;
    } catch {
      return false;
    }
  }, { timeoutMs, label: 'health_endpoint' });
}

function findHeadlessBrowser() {
  return [
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((path) => existsSync(path)) ?? null;
}

async function openCdpPage({ browserPath, url, workDir }) {
  const userDataDir = join(workDir, 'runtime', `agent-web-ui-live-e2e-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(userDataDir, { recursive: true });
  const child = spawnTestChild(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-position=-32000,-32000',
    '--window-size=1280,900',
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const browserWsUrl = await new Promise((resolvePromise, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`cdp_start_timeout:${stderr.slice(0, 500)}`)), 10_000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolvePromise(match[1]);
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
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const nextId = ++id;
    pending.set(nextId, { resolve: resolvePromise, reject });
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 900));
  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result?.exceptionDetails) throw new Error(`cdp_evaluate_failed:${JSON.stringify(result.exceptionDetails)}`);
      return result?.result?.value;
    },
    async waitForExpression(expression, timeoutMs = 10_000) {
      return waitFor(async () => this.evaluate(expression), { timeoutMs, label: 'cdp_expression' });
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      await new Promise((resolvePromise) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolvePromise();
        const timer = setTimeout(() => {
          if (!child.killed) child.kill();
          resolvePromise();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolvePromise();
        });
      });
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
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
  }, { timeoutMs, label });
  if (!match) throw new Error(`${label}_not_found`);
  return match;
}

async function waitFor(check, { timeoutMs, label }) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
      throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${label}_timeout:${lastError instanceof Error ? lastError.message : ''}`);
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonlFile(path) {
  if (!existsSync(path)) return [];
  const events = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/).filter((entry) => entry.trim())) {
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events;
}

async function closeNarsSession(eventEndpoint) {
  const socket = new WebSocket(eventEndpoint);
  await once(socket, 'open');
  socket.send(JSON.stringify({ id: `live-e2e-close-${Date.now()}`, method: 'session.close', params: {} }));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  socket.close();
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
