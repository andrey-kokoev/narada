import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentIdentityDisplay } from '@narada2/agent-identity';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { startAgentWebUiServer } from '../src/server.js';

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DEFAULT_SITE_ROOT = 'D:\\code\\narada.sonar';
const NARS_SESSION_MCP_ENTRYPOINT = resolve(
  REPO_ROOT,
  '..',
  'mcp-surfaces',
  'packages',
  'nars-session-mcp',
  'dist',
  'src',
  'main.js',
);
const AGENT_CLI_ENTRYPOINT = resolve(
  REPO_ROOT,
  '..',
  'agent-cli',
  'bin',
  'narada-agent-cli.mjs',
);

const options = parseArgs(process.argv.slice(2));
const requestedSiteRoot = options.siteRoot ? resolve(options.siteRoot) : null;
const siteRoot = requestedSiteRoot ?? await createEphemeralSiteRoot();
const ownsSiteRoot = requestedSiteRoot === null;
const siteId = options.siteId ?? inferSiteId(siteRoot);
const agentId = options.agent ?? `${siteId}.live_e2e_${Date.now()}.resident`;
const timeoutMs = Number(options.timeoutMs ?? 60_000);
const scenario = options.scenario ?? 'launcher_affordance';

if (!existsSync(siteRoot)) {
  throw new Error(`site_root_not_found: ${siteRoot}`);
}

async function startJsonlMcpServer({ entrypoint, siteRoot, siteId, timeoutMs }) {
  if (!existsSync(entrypoint)) throw new Error(`nars_session_mcp_entrypoint_not_found:${entrypoint}`);
  const child = spawnTestChild(process.execPath, [entrypoint], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_SITE_ID: siteId,
      NARADA_NARS_SESSION_SOURCE_KIND: 'operator',
      NARADA_OPERATOR_ID: 'agent-web-ui-live-e2e',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdoutBuffer = '';
  let stderr = '';
  let requestId = 0;
  let closing = false;
  const pending = new Map();

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += String(chunk);
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = stdoutBuffer.indexOf('\n');
      if (!line) continue;
      let response;
      try {
        response = JSON.parse(line);
      } catch (error) {
        rejectPending(new Error(`nars_session_mcp_invalid_json:${error instanceof Error ? error.message : String(error)}`));
        continue;
      }
      const waiter = pending.get(response.id);
      if (!waiter) continue;
      pending.delete(response.id);
      clearTimeout(waiter.timer);
      if (response.error) waiter.reject(new Error(`nars_session_mcp_error:${JSON.stringify(response.error)}`));
      else waiter.resolve(response);
    }
  });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.on('error', (error) => rejectPending(error));
  child.on('exit', (code, signal) => {
    if (!closing) rejectPending(new Error(`nars_session_mcp_exited:${code ?? 'null'}:${signal ?? 'null'}:${stderr.slice(0, 2000)}`));
  });

  const request = (method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
    const id = `live-e2e-mcp-${++requestId}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectPromise(new Error(`nars_session_mcp_request_timeout:${method}:${stderr.slice(0, 2000)}`));
    }, timeoutMs);
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  const close = async () => {
    closing = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.end();
      await Promise.race([
        once(child, 'exit'),
        new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
      ]);
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rejectPending(new Error('nars_session_mcp_closed'));
  };

  try {
    const initialize = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'narada-agent-web-ui-live-e2e', version: '0.1.0' },
    });
    assert.equal(initialize.result?.serverInfo?.name, 'nars-session-mcp');
    const toolList = await request('tools/list');
    const toolNames = new Set((toolList.result?.tools ?? []).map((tool) => tool.name));
    for (const requiredTool of ['nars_session_input_deliver', 'nars_session_input_status']) {
      assert.ok(toolNames.has(requiredTool), `NARS session MCP must advertise ${requiredTool}`);
    }

    return {
      async callTool(name, argumentsValue) {
        const response = await request('tools/call', { name, arguments: argumentsValue });
        const result = response.result;
        return result?.structuredContent ?? JSON.parse(result?.content?.[0]?.text ?? '{}');
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
  function rejectPending(error) {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  }
}

async function startFixtureProvider({ responseDelayMs = 0, responseDelayForRequest = null } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(requestBody);
    const requestDelayMs = typeof responseDelayForRequest === 'function'
      ? responseDelayForRequest(requestBody)
      : responseDelayMs;
    if (requestDelayMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, requestDelayMs));
    const latestMessage = requestBody.messages?.at(-1)?.content;
    const responseContent = String(latestMessage ?? '').includes('Cloudflare projection remote input')
      ? 'Live launcher remote projection response'
      : String(latestMessage ?? '').includes('replay sentinel')
        ? 'Live launcher replay sentinel response'
        : String(latestMessage ?? '').includes('reconnect cursor')
          ? 'Live launcher reconnect cursor response'
          : 'Live launcher fixture response';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: responseContent } }] }));
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

function createWorkerHttpServer(worker, envRef, servedResponses = []) {
  return createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const requestUrl = `http://${request.headers.host}${request.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) headers.set(key, value.join(', '));
        else if (value !== undefined) headers.set(key, value);
      }
      const upstream = await worker.fetch(new Request(requestUrl, {
        method: request.method,
        headers,
        ...(body && request.method !== 'GET' && request.method !== 'HEAD' ? { body } : {}),
      }), envRef.current);
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      servedResponses.push({
        url: requestUrl,
        status: upstream.status,
        content_type: upstream.headers.get('content-type'),
        body: responseBody.toString('utf8'),
      });
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
      response.end(responseBody);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });
}

async function listenHttpServer(server) {
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('live_e2e_http_server_address_missing');
  return `http://127.0.0.1:${address.port}`;
}

async function closeHttpServer(server) {
  if (!server?.listening) return;
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

const browserPath = findHeadlessBrowser();
assert.ok(browserPath, 'expected an installed Chromium-family browser for live agent-web-ui e2e');

const startedAt = Date.now();
let runtimeProcess = null;
let webUiProcess = null;
let agentCliProcess = null;
let agentCliOutput = null;
let page = null;
let projectionRemotePage = null;
let provider = null;
let narsSessionMcp = null;
let projectionWorkerServer = null;
let projectionWorkerEnvRef = null;
let projectionWorkerBaseUrl = null;
let projectionWorkerResponses = null;
let projectionAssetServer = null;
let projectionBridgePid = null;

try {
  if (!['launcher_affordance', 'external_input', 'intelligence_reconfiguration', 'replay_reconnect'].includes(scenario)) {
    throw new Error(`unknown_live_e2e_scenario: ${scenario}`);
  }
  // Keep the provider turn active long enough for the real Worker poll, bridge
  // WebSocket admission, and cancellation to cross the process boundary.
  provider = await startFixtureProvider({
    responseDelayMs: scenario === 'external_input' ? 500 : 0,
    responseDelayForRequest: scenario === 'external_input'
      ? (request) => JSON.stringify(request).includes('Cloudflare direct interrupt') ? 15_000 : 500
      : null,
  });
  if (scenario === 'external_input') {
    projectionWorkerEnvRef = { current: {} };
    projectionWorkerResponses = [];
    projectionWorkerServer = createWorkerHttpServer(
      createCloudflareNarsProjectionWorker({ now: () => new Date().toISOString() }),
      projectionWorkerEnvRef,
      projectionWorkerResponses,
    );
    projectionWorkerBaseUrl = await listenHttpServer(projectionWorkerServer);
  }
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
      DEEPSEEK_API_KEY: 'live-e2e-fixture-key',
      DEEPSEEK_API_BASE_URL: provider.baseUrl,
      DEEPSEEK_MODEL: 'deepseek-fixture-model',
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
  const sessionAgentId = agentIdentityDisplay(startupEvent.agent_identity_ref, startupEvent.agent_id ?? agentId)
    ?? startupEvent.agent_id
    ?? agentId;

  const health = await waitForHealthy(record.health_endpoint, timeoutMs);
  assert.equal(health.status, 'healthy');

  narsSessionMcp = await startJsonlMcpServer({
    entrypoint: NARS_SESSION_MCP_ENTRYPOINT,
    siteRoot,
    siteId: record.site_id ?? siteId,
    timeoutMs,
  });

  console.log(`live-e2e: attaching real agent-web-ui to ${record.session_id}`);
  const webUiAttachArgs = [
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
  ];
  if (projectionWorkerBaseUrl) webUiAttachArgs.push('--cloudflare-api-base-url', projectionWorkerBaseUrl);
  webUiProcess = spawnTestChild(process.execPath, webUiAttachArgs, {
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

  if (scenario === 'external_input') {
    agentCliProcess = spawnTestChild(process.execPath, [
      AGENT_CLI_ENTRYPOINT,
      '--attach',
      record.event_endpoint,
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NO_COLOR: '1',
        NARADA_AGENT_CLI_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    agentCliOutput = collectProcessOutput(agentCliProcess);
    try {
      await waitFor(() => {
        if (agentCliProcess.exitCode !== null) {
          throw new Error('agent_cli_peer_exited:' + agentCliProcess.exitCode + ':' + agentCliOutput.all().slice(0, 2000));
        }
        const output = agentCliOutput.all();
        return output.includes(record.session_id) && output.includes(sessionAgentId);
      }, { timeoutMs, label: 'agent_cli_peer_attachment' });
    } catch (error) {
      throw new Error((error instanceof Error ? error.message : String(error))
        + ': agent_cli_output=' + agentCliOutput.all().slice(0, 4000));
    }
  }

  await page.fill('#operator-input', 'What can you help me with?');
  await page.click('.composer-submit');
  await waitFor(() => readJsonlFile(record.events_path).some((event) => event.event === 'carrier_turn_completed'), { timeoutMs, label: 'first_assistant_turn' });
  await page.waitForExpression("document.body.textContent.includes('Live launcher fixture response')", timeoutMs);
  assert.equal(provider.requests.length, 1);
  const events = readJsonlFile(record.events_path);
  const unsupported = events.filter((event) => event.event === 'error' && (
    event.code === 'unsupported_method'
    || String(event.message ?? '').includes('Unsupported method')
  ));
  assert.deepEqual(unsupported, []);

  if (scenario === 'external_input') {
    await runExternalInputProjectionScenario({
      record,
      page,
      narsSessionMcp,
      provider,
      timeoutMs,
      siteRoot,
      cloudflareApiBaseUrl: projectionWorkerBaseUrl,
      cloudflareEnvRef: projectionWorkerEnvRef,
      cloudflareResponses: projectionWorkerResponses,
    });
    await runParallelSurfaceScenario({
      record,
      page,
      provider,
      timeoutMs,
      agentId: sessionAgentId,
      recordAgentId: agentId,
      agentCliProcess,
      agentCliOutput,
    });
  }
  if (scenario === 'intelligence_reconfiguration') {
    await runIntelligenceReconfigurationScenario({ record, page, provider, timeoutMs });
  }
  if (scenario === 'replay_reconnect') {
    await runReplayReconnectScenario({ record, page, narsSessionMcp, provider, timeoutMs });
  }

  console.log(JSON.stringify({
    schema: 'narada.agent_web_ui.live_launcher_affordance_e2e.result.v1',
    status: 'passed',
    scenario,
    site_root: siteRoot,
    site_id: siteId,
    agent_id: agentId,
    session_id: record.session_id,
    event_endpoint: record.event_endpoint,
    health_endpoint: record.health_endpoint,
    events_path: record.events_path,
    provider_request_count: provider.requests.length,
    elapsed_ms: Date.now() - startedAt,
  }, null, 2));
} finally {
  if (page) await page.close();
  if (projectionRemotePage) await projectionRemotePage.close();
  if (narsSessionMcp) await narsSessionMcp.close();
  if (agentCliProcess) await stopProcess(agentCliProcess);
  if (webUiProcess) await stopProcess(webUiProcess);
  try {
    const record = findLatestSessionRecord(siteRoot, agentId);
    if (record?.event_endpoint) await closeNarsSession(record.event_endpoint);
  } catch {}
  if (projectionBridgePid) await stopProcessByPid(projectionBridgePid);
  if (projectionAssetServer?.server) await closeHttpServer(projectionAssetServer.server);
  await closeHttpServer(projectionWorkerServer);
  if (runtimeProcess) await stopProcess(runtimeProcess);
  if (provider) await provider.close();
  if (ownsSiteRoot) await removeEphemeralSiteRoot(siteRoot);
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
    async click(selector) {
      const point = await this.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!point) throw new Error(`cdp_click_target_not_found:${selector}`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    },
    async fill(selector, value) {
      await this.click(selector);
      const modifiers = 2;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await send('Input.insertText', { text: String(value) });
    },
    async selectOption(selector, value) {
      const optionIndex = await this.evaluate(`(() => {
        const select = document.querySelector(${JSON.stringify(selector)});
        if (!(select instanceof HTMLSelectElement)) return -1;
        return Array.from(select.options).findIndex((option) => option.value === ${JSON.stringify(String(value))});
      })()`);
      if (optionIndex < 0) throw new Error(`cdp_select_option_not_found:${selector}:${value}`);
      await this.click(selector);
      const pressKey = async ({ key, code, windowsVirtualKeyCode }) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
      };
      await pressKey({ key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
      for (let index = 0; index < optionIndex; index += 1) {
        await pressKey({ key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
      }
      await pressKey({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      const selectedValue = await this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
      if (selectedValue !== String(value)) throw new Error(`cdp_select_option_failed:${selector}:${value}:${selectedValue}`);
      return { ok: true, value: selectedValue };
    },
    async clickText(containerSelector, text, { textSelector = '*', clickSelector = null } = {}) {
      const point = await this.evaluate(`(() => {
        const container = document.querySelector(${JSON.stringify(containerSelector)});
        const textElement = Array.from(container?.querySelectorAll(${JSON.stringify(textSelector)}) ?? [])
          .find((element) => element.textContent?.trim() === ${JSON.stringify(text)});
        if (!(textElement instanceof HTMLElement)) return null;
        const target = ${clickSelector ? `textElement.closest(${JSON.stringify(clickSelector)}) ?? textElement.querySelector(${JSON.stringify(clickSelector)}) ?? textElement` : 'textElement'};
        if (!(target instanceof HTMLElement)) return null;
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!point) throw new Error(`cdp_click_text_target_not_found:${containerSelector}:${text}`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    },
    async scrollToTop(selector) {
      const point = await this.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!point) throw new Error(`cdp_scroll_target_not_found:${selector}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', deltaY: -100_000, deltaX: 0, ...point });
      const scrollTop = await this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollTop ?? null`);
      if (scrollTop !== 0) throw new Error(`cdp_scroll_to_top_failed:${selector}:${scrollTop}`);
      return scrollTop;
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

async function requestSessionHealth(eventEndpoint, requestId, timeoutMs) {
  const socket = new WebSocket(eventEndpoint);
  await once(socket, 'open');
  try {
    return await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        rejectPromise(new Error('session_health_request_timeout:' + requestId));
      }, timeoutMs);
      const onMessage = (message) => {
        let parsed;
        try {
          parsed = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const candidates = [parsed, parsed?.payload].filter((value) => value && typeof value === 'object');
        const health = candidates.find((value) => value.event === 'session_health' && value.request_id === requestId);
        if (!health) return;
        clearTimeout(timer);
        resolvePromise(health);
      };
      const onError = () => {
        clearTimeout(timer);
        rejectPromise(new Error('session_health_socket_error:' + requestId));
      };
      socket.addEventListener('message', onMessage);
      socket.addEventListener('error', onError);
      socket.send(JSON.stringify({
        id: requestId + '-subscribe',
        method: 'session.events.subscribe',
        params: {
          include_replay: false,
          subscription_id: requestId + '-subscription',
        },
      }));
      socket.send(JSON.stringify({ id: requestId, method: 'session.health', params: {} }));
    });
  } finally {
    try { socket.close(); } catch {}
  }
}

async function closeNarsSession(eventEndpoint) {
  const socket = new WebSocket(eventEndpoint);
  await once(socket, 'open');
  socket.send(JSON.stringify({ id: `live-e2e-close-${Date.now()}`, method: 'session.close', params: {} }));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  socket.close();
}

async function runIntelligenceReconfigurationScenario({ record, page, provider, timeoutMs }) {
  const initialHealth = await waitForIntelligenceHealth(record.health_endpoint, {
    provider: 'kimi-code-api',
    model: 'live-e2e-fixture-model',
    thinking: 'medium',
  }, timeoutMs, 'initial_intelligence_health');
  const controls = await page.waitForExpression(`(() => {
    const selectors = {
      provider: document.querySelector('select.intelligence-provider-select'),
      model: document.querySelector('select.intelligence-model-select'),
      thinking: document.querySelector('select.intelligence-thinking-select'),
    };
    if (Object.values(selectors).some((control) => !(control instanceof HTMLSelectElement))) return false;
    return Object.fromEntries(Object.entries(selectors).map(([key, control]) => [
      key,
      Array.from(control.options).map((option) => option.value),
    ]));
  })()`, timeoutMs);
  const launchConfig = await page.waitForExpression(`(() => {
    const element = document.querySelector('#nars-config');
    if (!element?.textContent) return null;
    return JSON.parse(element.textContent);
  })()`, timeoutMs);
  assert.ok(
    launchConfig?.admittedMethods?.includes('runtime.intelligence.reconfigure'),
    `local agent-web-ui must admit runtime reconfiguration: ${JSON.stringify(launchConfig)}`,
  );
  await page.evaluate(`(() => {
    if (window.__liveE2eOriginalWebSocketSend) return;
    window.__liveE2eFrames = [];
    window.__liveE2eOriginalWebSocketSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
      try { window.__liveE2eFrames.push(JSON.parse(String(data))); } catch {}
      return window.__liveE2eOriginalWebSocketSend.call(this, data);
    };
  })()`);

  assert.ok(controls.thinking.includes('high'), `thinking selector must advertise high: ${JSON.stringify(controls)}`);
  assert.ok(controls.model.some((value) => value !== initialHealth.intelligence.model), `model selector must advertise an alternate model: ${JSON.stringify(controls)}`);
  assert.ok(controls.provider.includes('deepseek-api'), `provider selector must advertise deepseek-api: ${JSON.stringify(controls)}`);

  const thinkingTarget = 'high';
  await changeIntelligenceSelector({
    page,
    record,
    selector: 'select.intelligence-thinking-select',
    value: thinkingTarget,
    target: { thinking: thinkingTarget },
    timeoutMs,
    label: 'thinking_reconfiguration',
  });

  const modelTarget = controls.model.find((value) => value !== initialHealth.intelligence.model);
  await changeIntelligenceSelector({
    page,
    record,
    selector: 'select.intelligence-model-select',
    value: modelTarget,
    target: { model: modelTarget },
    timeoutMs,
    label: 'model_reconfiguration',
  });

  const providerTarget = 'deepseek-api';
  const finalHealth = await changeIntelligenceSelector({
    page,
    record,
    selector: 'select.intelligence-provider-select',
    value: providerTarget,
    target: { provider: providerTarget },
    timeoutMs,
    label: 'provider_runtime_reconfiguration',
  });

  const requestCountBeforeFinalTurn = provider.requests.length;
  const finalPrompt = 'verify the final intelligence binding';
  await page.fill('#operator-input', finalPrompt);
  await page.click('.composer-submit');
  await waitFor(() => provider.requests.length > requestCountBeforeFinalTurn, {
    timeoutMs,
    label: 'final_reconfigured_provider_request',
  });
  await page.waitForExpression(`document.body.textContent.includes(${JSON.stringify(responseText())})`, timeoutMs);
  const finalRequest = provider.requests.at(-1);
  assert.equal(finalRequest?.model, finalHealth.intelligence.model);
  assert.ok(JSON.stringify(finalRequest?.messages ?? '').includes(finalPrompt));
}

function responseText() {
  return 'Live launcher fixture response';
}

async function changeIntelligenceSelector({ page, record, selector, value, target, timeoutMs, label }) {
  const baselineSequence = Math.max(0, ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)));
  await page.selectOption(selector, value);

  const browserFrame = await page.waitForExpression(`(() => {
    const target = ${JSON.stringify(target)};
    return (window.__liveE2eFrames ?? []).find((frame) => (
      frame?.method === 'runtime.intelligence.reconfigure'
      && Object.entries(target).every(([key, expected]) => frame.params?.[key] === expected)
    )) || false;
  })()`, timeoutMs);
  assert.equal(browserFrame.method, 'runtime.intelligence.reconfigure');

  const reconfiguration = await waitFor(() => {
    const event = readJsonlFile(record.events_path).find((candidate) => (
      Number(candidate.event_sequence ?? candidate.sequence ?? 0) > baselineSequence
      && candidate.event === 'runtime_intelligence_reconfiguration'
      && candidate.terminal_state === 'active'
      && Object.entries(target).every(([key, expected]) => candidate.active?.[key] === expected)
    ));
    return event || false;
  }, { timeoutMs, label: `${label}_event` });

  const health = await waitForIntelligenceHealth(record.health_endpoint, target, timeoutMs, `${label}_health`);
  await page.waitForExpression(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`, timeoutMs);
  assert.equal(reconfiguration.active?.[Object.keys(target)[0]], Object.values(target)[0]);
  return health;
}

async function waitForIntelligenceHealth(endpoint, target, timeoutMs, label) {
  let latest = null;
  await waitFor(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    latest = await response.json();
    const intelligence = latest?.intelligence ?? {};
    return Object.entries(target).every(([key, expected]) => intelligence[key] === expected);
  }, { timeoutMs, label });
  return latest;
}

async function runExternalInputProjectionScenario({
  record,
  page,
  narsSessionMcp,
  provider,
  timeoutMs,
  siteRoot,
  cloudflareApiBaseUrl,
  cloudflareEnvRef,
  cloudflareResponses,
}) {
  const response = 'Live launcher fixture response';
  const inputs = ['external NARS input one', 'external NARS input two'];

  for (const [index, content] of inputs.entries()) {
    const activityCountBefore = await page.evaluate("document.querySelectorAll('.event-agent-activity').length");
    const delivery = submitExternalSessionInput({
      record,
      narsSessionMcp,
      content,
      requestId: `external-input-${index + 1}`,
      response,
      timeoutMs,
    });
    await page.waitForExpression(`(() => {
      const rows = Array.from(document.querySelectorAll('.event-agent-activity'));
      const text = rows.at(-1)?.textContent ?? '';
      return rows.length > ${activityCountBefore} && /is (thinking|using tools|responding)/.test(text);
    })()`, timeoutMs);
    await delivery;
    await page.waitForExpression(`document.body.textContent.includes(${JSON.stringify(content)})`, timeoutMs);
  }

  assert.equal(provider.requests.length, 3);
  for (const content of inputs) {
    assert.ok(provider.requests.some((request) => JSON.stringify(request).includes(content)), `provider did not receive ${content}`);
  }

  await selectProjectionView({ page, view: 'conversation', timeoutMs });
  const readProjectionRows = () => page.evaluate(`Array.from(document.querySelectorAll('#events > li.event[data-event-kind]:not(.event-agent-activity)')).map((row) => ({
    kind: row.dataset.eventKind,
    text: row.textContent ?? '',
    disposition: Array.from(row.classList)
      .find((className) => className.startsWith('event-disposition-'))
      ?.slice('event-disposition-'.length) ?? null,
  }))`);
  const chatRows = await readProjectionRows();
  assert.equal(chatRows.filter((row) => row.kind === 'user_message' && row.text.includes(inputs[0])).length, 1);
  assert.equal(chatRows.filter((row) => row.kind === 'user_message' && row.text.includes(inputs[1])).length, 1);
  assert.equal(chatRows.filter((row) => row.kind === 'assistant_message' && row.text.includes(response)).length, 3);
  assert.ok(chatRows.some((row) => row.kind === 'user_message'), `Chat must show conversation input rows: ${JSON.stringify(chatRows)}`);
  assert.ok(chatRows.some((row) => row.kind === 'assistant_message'), `Chat must show assistant conversation rows: ${JSON.stringify(chatRows)}`);
  assert.ok(
    chatRows.every((row) => row.disposition === 'conversation_fact'),
    `Chat must exclude operations, diagnostics, and raw records: ${JSON.stringify(chatRows)}`,
  );
  assert.ok(
    !chatRows.some((row) => ['session_started', 'turn_started', 'turn_complete', 'tool_call', 'tool_result'].includes(row.kind)),
    `Chat must not show operation rows: ${JSON.stringify(chatRows)}`,
  );

  await selectProjectionView({ page, view: 'operations', timeoutMs });
  await page.waitForExpression("document.querySelector('[data-event-kind=\\\"session_started\\\"]') !== null", timeoutMs);
  const operationRows = await readProjectionRows();
  assert.equal(operationRows.filter((row) => row.kind === 'user_message' && row.text.includes(inputs[0])).length, 1);
  assert.equal(operationRows.filter((row) => row.kind === 'user_message' && row.text.includes(inputs[1])).length, 1);
  assert.equal(operationRows.filter((row) => row.kind === 'assistant_message' && row.text.includes(response)).length, 3);
  assert.ok(operationRows.some((row) => row.disposition === 'operation_fact'), `Operations must show operation rows: ${JSON.stringify(operationRows)}`);
  assert.ok(operationRows.some((row) => row.disposition === 'conversation_fact'), `Operations must retain conversation context: ${JSON.stringify(operationRows)}`);
  assert.ok(
    operationRows.every((row) => ['conversation_fact', 'operation_fact'].includes(row.disposition)),
    `Operations must exclude diagnostics and raw records: ${JSON.stringify(operationRows)}`,
  );

  await publishCloudflareProjectionFromBox({
    page,
    record,
    provider,
    browserPath,
    siteRoot,
    cloudflareApiBaseUrl,
    cloudflareEnvRef,
    cloudflareResponses,
    timeoutMs,
  });
}

async function runParallelSurfaceScenario({
  record,
  page,
  provider,
  timeoutMs,
  agentId,
  recordAgentId,
  agentCliProcess,
  agentCliOutput,
}) {
  assert.ok(agentCliProcess, 'parallel surface scenario must start the real agent-cli peer');
  assert.ok(agentCliOutput, 'parallel surface scenario must capture the real agent-cli peer');
  const response = 'Live launcher fixture response';
  const browserInput = 'parallel input from agent-web-ui';
  const agentCliInput = 'parallel input from agent-cli';
  const latestSequence = () => Math.max(
    0,
    ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)),
  );
  const waitForTurn = async (content, baselineSequence, label) => waitFor(() => {
    const events = readJsonlFile(record.events_path);
    const userMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > baselineSequence
      && event.event === 'user_message'
      && event.content === content);
    const assistantMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > baselineSequence
      && event.event === 'assistant_message'
      && event.content === response
      && (!userMessage || event.turn_id === (userMessage.turn_id ?? userMessage.input_event_id ?? userMessage.input_id)));
    return userMessage && assistantMessage ? { userMessage, assistantMessage } : false;
  }, { timeoutMs, label });

  const browserIdentityText = await page.evaluate('document.body.textContent ?? ""');
  assert.ok(browserIdentityText.includes(record.session_id), 'agent-web-ui must display the shared session identity');
  assert.ok(browserIdentityText.includes(agentId), 'agent-web-ui must display the shared agent identity');
  const agentCliIdentityText = agentCliOutput.all();
  assert.ok(agentCliIdentityText.includes(record.session_id), 'agent-cli must receive the shared session identity');
  assert.ok(agentCliIdentityText.includes(agentId), 'agent-cli must receive the shared agent identity');

  const browserBaselineSequence = latestSequence();
  const providerRequestsBeforeBrowser = provider.requests.length;
  await page.fill('#operator-input', browserInput);
  await page.click('.composer-submit');
  await waitFor(() => provider.requests.length > providerRequestsBeforeBrowser, {
    timeoutMs,
    label: 'parallel_browser_provider_request',
  });
  await waitForTurn(browserInput, browserBaselineSequence, 'parallel_browser_turn');
  await page.waitForExpression('document.body.textContent.includes(' + JSON.stringify(browserInput) + ')', timeoutMs);
  await waitFor(() => agentCliOutput.all().includes(browserInput), {
    timeoutMs,
    label: 'parallel_agent_cli_receives_browser_input',
  });

  const agentCliBaselineSequence = latestSequence();
  const providerRequestsBeforeAgentCli = provider.requests.length;
  agentCliProcess.stdin.write(String(agentCliInput) + '\n');
  await waitFor(() => provider.requests.length > providerRequestsBeforeAgentCli, {
    timeoutMs,
    label: 'parallel_agent_cli_provider_request',
  });
  await waitForTurn(agentCliInput, agentCliBaselineSequence, 'parallel_agent_cli_turn');
  await page.waitForExpression('document.body.textContent.includes(' + JSON.stringify(agentCliInput) + ')', timeoutMs);
  await waitFor(() => agentCliOutput.all().includes(agentCliInput), {
    timeoutMs,
    label: 'parallel_agent_cli_receives_agent_cli_input',
  });

  const browserProjectionText = await page.evaluate('document.body.textContent ?? ""');
  assert.ok(browserProjectionText.includes(browserInput), 'agent-web-ui must project its own durable user event');
  assert.ok(browserProjectionText.includes(agentCliInput), 'agent-web-ui must project the agent-cli durable user event');
  assert.ok(browserProjectionText.includes(response), 'agent-web-ui must project the durable assistant events');
  const agentCliProjectionText = agentCliOutput.all();
  assert.ok(agentCliProjectionText.includes(browserInput), 'agent-cli must project the web-ui durable user event');
  assert.ok(agentCliProjectionText.includes(agentCliInput), 'agent-cli must project its own durable user event');
  assert.ok(agentCliProjectionText.includes(response), 'agent-cli must project the durable assistant events');

  const persistedEvents = readJsonlFile(record.events_path);
  for (const content of [browserInput, agentCliInput]) {
    const userMessage = persistedEvents.find((event) => event.event === 'user_message' && event.content === content);
    assert.ok(userMessage, 'durable user event missing for ' + content);
    assert.equal(userMessage.session_id, record.session_id);
    assert.equal(userMessage.agent_id, recordAgentId);
    const assistantMessage = persistedEvents.find((event) => event.event === 'assistant_message'
      && event.content === response
      && event.turn_id === (userMessage.turn_id ?? userMessage.input_event_id ?? userMessage.input_id));
    assert.ok(assistantMessage, 'durable assistant event missing for ' + content);
    assert.equal(assistantMessage.session_id, record.session_id);
    assert.equal(assistantMessage.agent_id, recordAgentId);
  }

  const healthRequestId = 'live-e2e-health-' + Date.now();
  const healthEvent = await requestSessionHealth(record.event_endpoint, healthRequestId, timeoutMs);
  assert.equal(healthEvent.session_id, record.session_id);
  assert.equal(healthEvent.agent_id, recordAgentId);
  await selectProjectionView({ page, view: 'diagnostics', timeoutMs });
  await page.waitForExpression("document.querySelector('[data-event-kind=\\\"session_health\\\"]') !== null", timeoutMs);
  const diagnosticRows = await page.evaluate("Array.from(document.querySelectorAll('#events > li.event[data-event-kind]:not(.event-agent-activity)')).map((row) => ({ kind: row.dataset.eventKind, text: row.textContent ?? '', disposition: Array.from(row.classList).find((className) => className.startsWith('event-disposition-'))?.slice('event-disposition-'.length) ?? null }))");
  assert.ok(
    diagnosticRows.some((row) => row.kind === 'session_health' && row.disposition === 'diagnostic_signal'),
    'Diagnostics must show the live session health event: ' + JSON.stringify(diagnosticRows),
  );
  assert.ok(
    !diagnosticRows.some((row) => ['user_message', 'assistant_message', 'tool_call', 'tool_result'].includes(row.kind)),
    'Diagnostics must suppress conversation and tool-operation rows: ' + JSON.stringify(diagnosticRows),
  );
}

async function runReplayReconnectScenario({ record, page, narsSessionMcp, provider, timeoutMs }) {
  const replayInput = 'replay sentinel ' + Date.now();
  const replayResponse = 'Live launcher replay sentinel response';
  await submitExternalSessionInput({
    record,
    narsSessionMcp,
    content: replayInput,
    requestId: 'replay-sentinel',
    response: replayResponse,
    timeoutMs,
  });
  await page.waitForExpression(
    'document.body.textContent.includes(' + JSON.stringify(replayInput) + ')'
      + ' && document.body.textContent.includes(' + JSON.stringify(replayResponse) + ')',
    timeoutMs,
  );

  let rows = await readConversationProjectionRows(page);
  assert.equal(rows.filter((row) => row.kind === 'user_message' && row.text.includes(replayInput)).length, 1);
  assert.equal(rows.filter((row) => row.kind === 'assistant_message' && row.text.includes(replayResponse)).length, 1);
  assert.ok(rows.every((row) => row.disposition === 'conversation_fact'), JSON.stringify(rows));

  await page.evaluate('location.reload()');
  await page.waitForExpression('document.querySelector("#operator-input") !== null', timeoutMs);
  await page.waitForExpression(
    'document.body.textContent.includes(' + JSON.stringify(replayInput) + ')'
      + ' && document.body.textContent.includes(' + JSON.stringify(replayResponse) + ')',
    timeoutMs,
  );
  rows = await readConversationProjectionRows(page);
  assert.equal(rows.filter((row) => row.kind === 'user_message' && row.text.includes(replayInput)).length, 1, JSON.stringify(rows));
  assert.equal(rows.filter((row) => row.kind === 'assistant_message' && row.text.includes(replayResponse)).length, 1, JSON.stringify(rows));
  assert.ok(rows.every((row) => row.disposition === 'conversation_fact'), JSON.stringify(rows));
  assert.ok(!rows.some((row) => ['session_started', 'turn_started', 'turn_complete', 'tool_call', 'tool_result'].includes(row.kind)), JSON.stringify(rows));
  await selectProjectionView({ page, view: 'operations', timeoutMs });
  await page.waitForExpression('document.querySelector("[data-event-kind=\\"session_started\\"]") !== null', timeoutMs);
  const operationRows = await readConversationProjectionRows(page);
  assert.ok(operationRows.some((row) => row.disposition === 'operation_fact'), JSON.stringify(operationRows));
  assert.ok(operationRows.some((row) => row.kind === 'user_message' && row.text.includes(replayInput)), JSON.stringify(operationRows));
  assert.ok(operationRows.every((row) => ['conversation_fact', 'operation_fact'].includes(row.disposition)), JSON.stringify(operationRows));
  const replayHealth = await requestSessionHealth(record.event_endpoint, 'live-e2e-replay-health-' + Date.now(), timeoutMs);
  assert.equal(replayHealth.session_id, record.session_id);
  await selectProjectionView({ page, view: 'diagnostics', timeoutMs });
  const diagnosticRows = await readConversationProjectionRows(page);
  assert.ok(diagnosticRows.some((row) => ['session_events_subscription_started', 'websocket_connected', 'session_health'].includes(row.kind)), JSON.stringify(diagnosticRows));
  assert.ok(!diagnosticRows.some((row) => ['user_message', 'assistant_message', 'tool_call', 'tool_result'].includes(row.kind)), JSON.stringify(diagnosticRows));
  await selectProjectionView({ page, view: 'conversation', timeoutMs });

  const initialReplay = await readSessionReplay(record.event_endpoint, {
    maxReplay: 100,
    timeoutMs,
  });
  const initialPayloads = initialReplay.replay.map(unwrapSessionReplayMessage);
  const initialSequences = initialReplay.replay.map(sequenceFromSessionReplayMessage);
  assert.ok(initialPayloads.some((event) => event?.event === 'user_message' && event.content === replayInput), JSON.stringify(initialReplay));
  assert.ok(initialPayloads.some((event) => event?.event === 'assistant_message' && event.content === replayResponse), JSON.stringify(initialReplay));
  assert.ok(initialSequences.every((sequence) => Number.isFinite(sequence)), JSON.stringify(initialReplay));
  assert.equal(new Set(initialSequences).size, initialSequences.length, JSON.stringify(initialReplay));
  const reconnectCursor = Math.max(...initialSequences);

  const reconnectInput = 'reconnect cursor input ' + Date.now();
  const reconnectResponse = 'Live launcher reconnect cursor response';
  await submitExternalSessionInput({
    record,
    narsSessionMcp,
    content: reconnectInput,
    requestId: 'reconnect-cursor',
    response: reconnectResponse,
    timeoutMs,
  });
  const reconnectReplay = await readSessionReplay(record.event_endpoint, {
    sinceSequence: reconnectCursor,
    maxReplay: 100,
    timeoutMs,
  });
  const reconnectPayloads = reconnectReplay.replay.map(unwrapSessionReplayMessage);
  const reconnectSequences = reconnectReplay.replay.map(sequenceFromSessionReplayMessage);
  assert.ok(reconnectPayloads.some((event) => event?.event === 'user_message' && event.content === reconnectInput), JSON.stringify(reconnectReplay));
  assert.ok(reconnectPayloads.some((event) => event?.event === 'assistant_message' && event.content === reconnectResponse), JSON.stringify(reconnectReplay));
  assert.ok(reconnectPayloads.every((event) => event?.content !== replayInput && event?.content !== replayResponse), JSON.stringify(reconnectReplay));
  assert.ok(reconnectSequences.every((sequence) => Number.isFinite(sequence) && sequence > reconnectCursor), JSON.stringify(reconnectReplay));
  assert.equal(new Set(reconnectSequences).size, reconnectSequences.length, JSON.stringify(reconnectReplay));

  await page.waitForExpression(
    'document.body.textContent.includes(' + JSON.stringify(reconnectInput) + ')'
      + ' && document.body.textContent.includes(' + JSON.stringify(reconnectResponse) + ')',
    timeoutMs,
  );
  await page.evaluate('location.reload()');
  await page.waitForExpression('document.querySelector("#operator-input") !== null', timeoutMs);
  await page.waitForExpression(
    'document.body.textContent.includes(' + JSON.stringify(reconnectInput) + ')'
      + ' && document.body.textContent.includes(' + JSON.stringify(reconnectResponse) + ')',
    timeoutMs,
  );
  rows = await readConversationProjectionRows(page);
  assert.equal(rows.filter((row) => row.kind === 'user_message' && row.text.includes(reconnectInput)).length, 1, JSON.stringify(rows));
  assert.equal(rows.filter((row) => row.kind === 'assistant_message' && row.text.includes(reconnectResponse)).length, 1, JSON.stringify(rows));

  const scrollInputs = Array.from({ length: 8 }, (_value, index) => 'long-session input ' + (index + 1) + ' ' + Date.now());
  for (const [index, content] of scrollInputs.entries()) {
    await submitExternalSessionInput({
      record,
      narsSessionMcp,
      content,
      requestId: 'long-session-' + (index + 1),
      response: 'Live launcher fixture response',
      timeoutMs,
    });
  }
  await page.waitForExpression('(() => { const scroller = document.querySelector(".events-scroll"); return Boolean(scroller && scroller.scrollHeight > scroller.clientHeight); })()', timeoutMs);
  const initialScrollState = await page.evaluate('(() => { const scroller = document.querySelector(".events-scroll"); return { scrollTop: scroller?.scrollTop ?? null, scrollHeight: scroller?.scrollHeight ?? null, clientHeight: scroller?.clientHeight ?? null }; })()');
  assert.ok(initialScrollState.scrollHeight > initialScrollState.clientHeight, JSON.stringify(initialScrollState));

  await page.scrollToTop('.events-scroll');
  await page.waitForExpression('document.querySelector(".events-scroll")?.scrollTop <= 1', timeoutMs);
  const followInput = 'long-session follow latest ' + Date.now();
  const followResponse = 'Live launcher fixture response';
  const followBaseline = Math.max(0, ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)));
  const providerRequestsBeforeFollow = provider.requests.length;
  await page.fill('#operator-input', followInput);
  await page.click('.composer-submit');
  await waitFor(() => provider.requests.length > providerRequestsBeforeFollow, { timeoutMs, label: 'long_session_follow_provider_request' });
  await waitFor(() => {
    const events = readJsonlFile(record.events_path);
    const userMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > followBaseline
      && event.event === 'user_message'
      && event.content === followInput);
    const assistantMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > followBaseline
      && event.event === 'assistant_message'
      && event.content === followResponse);
    return userMessage && assistantMessage;
  }, { timeoutMs, label: 'long_session_follow_turn' });
  await page.waitForExpression('document.body.textContent.includes(' + JSON.stringify(followInput) + ')', timeoutMs);
  await page.waitForExpression('document.querySelector(".new-messages-button") !== null', timeoutMs);
  const unseenState = await page.evaluate('(() => { const scroller = document.querySelector(".events-scroll"); const button = document.querySelector(".new-messages-button"); return { button: Boolean(button), scrollTop: scroller?.scrollTop ?? null, scrollHeight: scroller?.scrollHeight ?? null, clientHeight: scroller?.clientHeight ?? null }; })()');
  assert.equal(unseenState.button, true, JSON.stringify(unseenState));
  await page.click('.new-messages-button');
  await page.waitForExpression('(() => { const scroller = document.querySelector(".events-scroll"); return Boolean(scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 4 && !document.querySelector(".new-messages-button")); })()', timeoutMs);
  rows = await readConversationProjectionRows(page);
  assert.ok(rows.length <= 500, 'browser retained event projection must stay bounded: ' + rows.length);
}

async function readConversationProjectionRows(page) {
  return page.evaluate('Array.from(document.querySelectorAll("#events > li.event[data-event-kind]:not(.event-agent-activity)")).map((row) => ({'
    + 'kind: row.dataset.eventKind,'
    + 'text: row.textContent ?? "",'
    + 'disposition: Array.from(row.classList).find((className) => className.startsWith("event-disposition-"))?.slice("event-disposition-".length) ?? null'
    + '}))');
}

async function openJsonSocket(endpoint) {
  const socket = new WebSocket(endpoint);
  await once(socket, 'open');
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (message) => {
    let parsed;
    try {
      parsed = JSON.parse(String(message.data));
    } catch {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(parsed);
    else queue.push(parsed);
  });
  socket.addEventListener('close', () => {
    for (const waiter of waiters.splice(0)) waiter.reject(new Error('json_socket_closed'));
  });
  return {
    sendJson(payload) {
      socket.send(JSON.stringify(payload));
    },
    nextJson(timeoutMs) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((resolvePromise, rejectPromise) => {
        const waiter = {
          resolve: (value) => {
            clearTimeout(timer);
            resolvePromise(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            rejectPromise(error);
          },
        };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          rejectPromise(new Error('json_socket_message_timeout'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() {
      try { socket.close(); } catch {}
    },
  };
}

async function readSessionReplay(endpoint, { sinceSequence = null, maxReplay = 100, timeoutMs }) {
  const socket = await openJsonSocket(endpoint);
  try {
    const connected = await socket.nextJson(timeoutMs);
    assert.equal(connected.event, 'websocket_connected', JSON.stringify(connected));
    const requestId = 'live-e2e-replay-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    const params = { include_replay: true, max_replay: maxReplay };
    if (sinceSequence !== null) params.since_sequence = sinceSequence;
    socket.sendJson({ id: requestId, method: 'session.events.subscribe', params });
    const subscribed = await socket.nextJson(timeoutMs);
    assert.equal(subscribed.event, 'session_events_subscription_started', JSON.stringify(subscribed));
    const replay = [];
    for (let index = 0; index < Number(subscribed.replay_count ?? 0); index += 1) {
      replay.push(await socket.nextJson(timeoutMs));
    }
    return { subscribed, replay };
  } finally {
    socket.close();
  }
}

function unwrapSessionReplayMessage(message) {
  if (message?.event === 'session_event' && message.payload && typeof message.payload === 'object') return message.payload;
  return message?.payload && typeof message.payload === 'object' && message.payload.event ? message.payload : message;
}

function sequenceFromSessionReplayMessage(message) {
  const payload = unwrapSessionReplayMessage(message);
  const value = payload?.event_sequence ?? payload?.sequence ?? message?.event_sequence ?? message?.sequence;
  const sequence = Number(value);
  return Number.isFinite(sequence) ? sequence : null;
}

async function publishCloudflareProjectionFromBox({
  page,
  record,
  provider,
  browserPath,
  siteRoot,
  cloudflareApiBaseUrl,
  cloudflareEnvRef,
  cloudflareResponses,
  timeoutMs,
}) {
  assert.ok(cloudflareApiBaseUrl, 'live Cloudflare projection fixture must provide a Worker URL');
  assert.ok(cloudflareEnvRef, 'live Cloudflare projection fixture must provide an environment reference');

  await page.waitForExpression("document.querySelector('button[aria-label=\\\"Choose Status boxes\\\"]') !== null", timeoutMs);
  await page.click('button[aria-label="Choose Status boxes"]');
  await page.waitForExpression("document.querySelector('#status-row-box-selector-panel') !== null", timeoutMs);
  await page.clickText('#status-row-box-selector-panel', 'Cloudflare Projection', {
    textSelector: 'strong',
    clickSelector: 'label',
  });
  const selected = await page.evaluate(`(() => {
    const item = Array.from(document.querySelectorAll('#status-row-box-selector-panel li'))
      .find((candidate) => candidate.querySelector('strong')?.textContent?.trim() === 'Cloudflare Projection');
    return { ok: Boolean(item), checked: item?.querySelector('input[type="checkbox"]')?.checked === true };
  })()`);
  assert.deepEqual(selected, { ok: true, checked: true });
  await page.click('#status-row-box-selector-panel button[aria-label="Close status boxes"]');
  await page.waitForExpression("document.querySelector('#cloudflare-api-base-url') !== null", timeoutMs);

  await page.evaluate(`(() => {
    window.__liveE2eProjectionStart = null;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (String(requestUrl ?? '').includes('/api/projections/cloudflare/start')) {
        response.clone().json().then((body) => { window.__liveE2eProjectionStart = body; }).catch(() => {});
      }
      return response;
    };
  })()`);
  await page.fill('#cloudflare-api-base-url', cloudflareApiBaseUrl);
  await page.click('.projection-control button');

  const publication = await page.waitForExpression(`(() => {
    const result = window.__liveE2eProjectionStart;
    return result?.status === 'published' && result.projection_id && result.remote_url ? result : false;
  })()`, timeoutMs);
  assert.equal(publication.status, 'published', JSON.stringify(publication));
  assert.equal(publication.registration_status, 'registered_remotely', JSON.stringify(publication));
  assert.equal(publication.bridge_once_status, 'connected', JSON.stringify(publication));
  assert.equal(publication.bridge_run_status, 'launched', JSON.stringify(publication));
  assert.equal(publication.bridge_state?.status, 'connected', JSON.stringify(publication));
  projectionBridgePid = publication.bridge_process?.pid ?? null;
  assert.ok(projectionBridgePid, JSON.stringify(publication));
  await page.waitForExpression("document.querySelector('.projection-status-label')?.textContent?.trim() === 'Published'", timeoutMs);

  const remoteUrl = new URL(publication.remote_url);
  assert.equal(remoteUrl.searchParams.get('cloudflare_projection_id'), publication.projection_id);
  assert.equal(remoteUrl.searchParams.get('cloudflare_api_base_url'), cloudflareApiBaseUrl);
  assert.ok(remoteUrl.searchParams.get('cloudflare_browser_token'));
  assert.ok(
    cloudflareResponses.some((entry) => entry.url.includes('/api/nars/projections/register') && entry.status < 400),
    `Cloudflare Worker must receive a successful registration request: ${JSON.stringify(cloudflareResponses)}`,
  );

  projectionAssetServer = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    cloudflareProjectionId: publication.projection_id,
    cloudflareApiBaseUrl,
  });
  const assetBaseUrl = projectionAssetServer.url.replace(/\/+$/, '');
  cloudflareEnvRef.current = {
    ASSETS: {
      fetch(request) {
        const url = new URL(request.url);
        return fetch(`${assetBaseUrl}${url.pathname}${url.search}`);
      },
    },
  };

  const remoteHealthResponse = await fetch(`${cloudflareApiBaseUrl}/api/nars/projections/${encodeURIComponent(publication.projection_id)}/health`, {
    headers: { 'x-narada-browser-token-fingerprint': remoteUrl.searchParams.get('cloudflare_browser_token') },
  });
  assert.equal(remoteHealthResponse.status, 200);
  const remoteHealth = await remoteHealthResponse.json();
  assert.equal(remoteHealth.status, 'healthy', JSON.stringify(remoteHealth));

  projectionRemotePage = await openCdpPage({ browserPath, url: publication.remote_url, workDir: siteRuntimeRoot(siteRoot) });
  await projectionRemotePage.waitForExpression("document.body.textContent.includes('Live launcher fixture response')", timeoutMs);
  const remoteText = await projectionRemotePage.evaluate('document.body.textContent');
  assert.match(remoteText, /resident/);
  assert.match(remoteText, /Live launcher fixture response/);

  const remoteContent = `Cloudflare projection remote input ${Date.now()}`;
  const remoteResponse = 'Live launcher remote projection response';
  const baselineSequence = Math.max(
    0,
    ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)),
  );
  await projectionRemotePage.fill('#operator-input', remoteContent);
  await projectionRemotePage.click('.composer-submit');

  await waitFor(() => cloudflareResponses.some((entry) => (
    entry.url.includes(`/api/nars/projections/${encodeURIComponent(publication.projection_id)}/input`)
    && entry.status < 400
  )), { timeoutMs, label: 'cloudflare_remote_input_submission' });

  const bridgeAck = await waitFor(() => cloudflareResponses.find((entry) => (
    entry.url.includes(`/api/nars/projections/${encodeURIComponent(publication.projection_id)}/input/`)
    && entry.url.endsWith('/ack')
    && entry.status < 400
    && String(entry.body ?? '').includes('"status":"acknowledged"')
  )) || false, { timeoutMs, label: 'cloudflare_remote_input_bridge_ack' });
  assert.match(String(bridgeAck.body), /"status":"acknowledged"/);

  let remoteUserMessage = null;
  let remoteAssistantMessage = null;
  await waitFor(() => {
    const events = readJsonlFile(record.events_path);
    remoteUserMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > baselineSequence
      && event.event === 'user_message'
      && event.content === remoteContent);
    remoteAssistantMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > baselineSequence
      && event.event === 'assistant_message'
      && event.content === remoteResponse
      && (!remoteUserMessage || event.turn_id === (remoteUserMessage.turn_id ?? remoteUserMessage.input_event_id ?? remoteUserMessage.input_id)));
    return remoteUserMessage && remoteAssistantMessage;
  }, { timeoutMs, label: 'cloudflare_remote_input_nars_response' });
  assert.equal(remoteUserMessage?.transport, 'carrier_server_api');
  assert.equal(remoteUserMessage?.source_kind, 'operator');
  assert.match(String(remoteUserMessage?.request_id), /^cloudflare_projection_input_/);
  assert.match(String(remoteUserMessage?.input_event_id), /^input_cloudflare_/);
  assert.equal(remoteAssistantMessage?.turn_id, remoteUserMessage?.input_event_id);
  await waitFor(() => provider.requests.some((request) => JSON.stringify(request).includes(remoteContent)), {
    timeoutMs,
    label: 'cloudflare_remote_input_provider_request',
  });
  assert.equal(provider.requests.length, 4);

  const projectionInputBase = `${cloudflareApiBaseUrl}/api/nars/projections/${encodeURIComponent(publication.projection_id)}`;
  const browserToken = remoteUrl.searchParams.get('cloudflare_browser_token');
  const submitProjectionInput = async (method, payload = {}) => {
    const response = await fetch(`${projectionInputBase}/input`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-narada-browser-token-fingerprint': browserToken,
      },
      body: JSON.stringify({ method, payload }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.ok(body.input_id, JSON.stringify(body));
    return body;
  };
  const waitForProjectionAck = (inputId, label) => waitFor(() => cloudflareResponses.find((entry) => (
    entry.url.includes(`/api/nars/projections/${encodeURIComponent(publication.projection_id)}/input/`)
    && entry.url.endsWith('/ack')
    && entry.status < 400
    && String(entry.body ?? '').includes('"status":"acknowledged"')
    && String(entry.body ?? '').includes(`"input_id":"${inputId}"`)
  )) || false, { timeoutMs, label });

  const steerBaselineSequence = Math.max(
    0,
    ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)),
  );
  const steerContent = `Cloudflare direct steer ${Date.now()}`;
  const steerInput = await submitProjectionInput('conversation.steer', { message: steerContent });
  await waitForProjectionAck(steerInput.input_id, 'cloudflare_direct_steer_bridge_ack');
  await waitFor(() => {
    const events = readJsonlFile(record.events_path);
    return events.some((event) => Number(event.event_sequence ?? event.sequence ?? 0) > steerBaselineSequence
      && event.event === 'user_message'
      && event.content === steerContent)
      && events.some((event) => Number(event.event_sequence ?? event.sequence ?? 0) > steerBaselineSequence
        && event.event === 'assistant_message'
        && event.content === 'Live launcher fixture response');
  }, { timeoutMs, label: 'cloudflare_direct_steer_nars_response' });
  assert.ok(provider.requests.some((request) => JSON.stringify(request).includes(steerContent)));

  const interruptBaselineSequence = Math.max(
    0,
    ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)),
  );
  const interruptContent = `Cloudflare direct interrupt ${Date.now()}`;
  const interruptInput = await submitProjectionInput('conversation.send', { message: interruptContent });
  await waitFor(() => provider.requests.some((request) => JSON.stringify(request).includes(interruptContent)), {
    timeoutMs,
    label: 'cloudflare_direct_interrupt_provider_request',
  });
  const interruptControl = await submitProjectionInput('conversation.interrupt', { reason: 'live_e2e_interrupt' });
  await waitForProjectionAck(interruptInput.input_id, 'cloudflare_direct_interrupt_input_bridge_ack');
  await waitForProjectionAck(interruptControl.input_id, 'cloudflare_direct_interrupt_control_bridge_ack');
  await waitFor(() => {
    const events = readJsonlFile(record.events_path);
    return events.some((event) => Number(event.event_sequence ?? event.sequence ?? 0) > interruptBaselineSequence
      && event.event === 'interrupt_requested')
      && events.some((event) => Number(event.event_sequence ?? event.sequence ?? 0) > interruptBaselineSequence
        && event.event === 'turn_interrupted')
      && !events.some((event) => Number(event.event_sequence ?? event.sequence ?? 0) > interruptBaselineSequence
        && event.event === 'assistant_message'
        && event.content === 'Live launcher fixture response'
        && event.turn_id === interruptInput.input_id);
  }, { timeoutMs, label: 'cloudflare_direct_interrupt_nars_response' });

  await projectionRemotePage.waitForExpression(`document.body.textContent.includes(${JSON.stringify(remoteContent)})
    && document.body.textContent.includes(${JSON.stringify(remoteResponse)})`, timeoutMs);
  assert.ok(
    cloudflareResponses.some((entry) => entry.url.includes('/events') && entry.body.includes(remoteContent)),
    `Cloudflare Worker must serve the remote input event: ${JSON.stringify(cloudflareResponses)}`,
  );
  assert.ok(
    cloudflareResponses.some((entry) => entry.url.includes('/events') && entry.body.includes(remoteResponse)),
    `Cloudflare Worker must serve the remote assistant response event: ${JSON.stringify(cloudflareResponses)}`,
  );
  assert.ok(
    cloudflareResponses.some((entry) => entry.url.includes(`/api/nars/projections/${encodeURIComponent(publication.projection_id)}/events`)),
    `Cloudflare Worker must serve published session events: ${JSON.stringify(cloudflareResponses)}`,
  );
}

async function selectProjectionView({ page, view, timeoutMs }) {
  await page.selectOption('#projection-verbosity', view);
  await page.waitForExpression(`document.querySelector('#projection-verbosity')?.value === ${JSON.stringify(view)}`, timeoutMs);
}

async function submitExternalSessionInput({ record, narsSessionMcp, content, requestId, response, timeoutMs }) {
  const baselineSequence = Math.max(0, ...readJsonlFile(record.events_path).map((event) => Number(event.event_sequence ?? event.sequence ?? 0)));
  const delivery = await narsSessionMcp.callTool('nars_session_input_deliver', {
    site_id: record.site_id,
    session_id: record.session_id,
    delivery: 'send',
    content,
    idempotency_key: `live-e2e-${requestId}`,
  });
  assert.equal(delivery.status, 'admitted', JSON.stringify(delivery));
  assert.equal(delivery.session_id, record.session_id);
  assert.ok(delivery.input_event_id);

  try {
    await waitFor(() => {
      const events = readJsonlFile(record.events_path);
      const userMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > baselineSequence
        && event.event === 'user_message'
        && event.content === content);
      const assistantMessage = events.find((event) => Number(event.event_sequence ?? event.sequence ?? 0) > baselineSequence
        && event.event === 'assistant_message'
        && event.content === response
        && (!userMessage || event.turn_id === (userMessage.turn_id ?? userMessage.input_event_id ?? userMessage.input_id)));
      return userMessage && assistantMessage;
    }, { timeoutMs, label: `external_input_turn_${requestId}` });
  } catch (error) {
    const recentEvents = readJsonlFile(record.events_path).slice(-30);
    throw new Error(`${error instanceof Error ? error.message : String(error)}: recent_events=${JSON.stringify(recentEvents)}`);
  }

  const status = await narsSessionMcp.callTool('nars_session_input_status', {
    site_id: record.site_id,
    session_id: record.session_id,
    input_event_id: delivery.input_event_id,
    request_id: delivery.request_id,
    directive_id: delivery.directive_id,
    limit: 200,
  });
  assert.equal(status.status, 'processed', JSON.stringify(status));
}

async function stopProcess(child) {
  if (!child) return;
  const numericPid = Number(child.pid);
  if (process.platform === 'win32' && Number.isInteger(numericPid) && numericPid > 0) {
    await stopProcessByPid(numericPid);
  } else if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function stopProcessByPid(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return;
  if (process.platform === 'win32') {
    const killer = spawnTestChild('taskkill.exe', ['/PID', String(numericPid), '/T', '/F'], {
      stdio: 'ignore',
    });
    await Promise.race([
      once(killer, 'exit'),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
    ]);
    if (killer.exitCode === null && killer.signalCode === null) killer.kill('SIGKILL');
    return;
  }
  try {
    process.kill(numericPid, 'SIGTERM');
  } catch {}
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(numericPid, 0);
    } catch {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  try {
    process.kill(numericPid, 'SIGKILL');
  } catch {}
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
}

async function removeEphemeralSiteRoot(path) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  throw lastError;
}
