import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CLI_ENTRYPOINT = join(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js');
const ROUTER_ENTRYPOINT = join(REPO_ROOT, 'packages', 'operator-router', 'dist', 'main.js');
const PROVIDER_ENTRYPOINT = join(REPO_ROOT, 'packages', 'agent-web-ui', 'test', 'fixtures', 'full-live-provider-fixture.mjs');
const WEB_UI_SIGNAL_RELAY_ENTRYPOINT = join(REPO_ROOT, 'packages', 'agent-web-ui', 'test', 'fixtures', 'full-live-agent-web-ui-signal-relay.mjs');
const AGENT_CONTEXT_MIGRATION_FIXTURE = join(REPO_ROOT, 'packages', 'agent-web-ui', 'test', 'fixtures', 'full-live-agent-context-migration.sql');
const AGENT_EVENTS_MIGRATION_FIXTURE = join(REPO_ROOT, 'packages', 'agent-web-ui', 'test', 'fixtures', 'full-live-agent-events-migration.sql');
const CODEX_ADMISSIONS_MIGRATION_FIXTURE = join(REPO_ROOT, 'packages', 'agent-web-ui', 'test', 'fixtures', 'full-live-codex-session-admissions-migration.sql');
const TIMEOUT_MS = Number(process.env.NARADA_FULL_LIVE_E2E_TIMEOUT_MS ?? 90_000);
const browserPath = findHeadlessBrowser();

assert.ok(browserPath, 'full live E2E requires an installed Chromium-family browser');

let siteRoot = null;
let routerPort = null;
let routerUrl = null;
let providerBaseUrl = null;
let providerProcess = null;
let routerProcess = null;
let runtimeProcess = null;
let webUiProcess = null;
let page = null;
let providerOutput = null;
let routerOutput = null;
let runtimeOutput = null;
let webUiOutput = null;
let providerControlFile = null;
let providerTranscriptFile = null;
let providerPortFile = null;
let resultEvidence = null;
let sessionIdForCleanup = '';

let runError = null;
try {
  await runFullLiveE2e();
} catch (error) {
  runError = error;
}
const cleanupErrors = await cleanup();
if (runError) {
  process.stderr.write((runError instanceof Error ? runError.stack : String(runError)) + '\n');
  process.exitCode = 1;
}
if (cleanupErrors.length > 0) {
  process.stderr.write('full_live_cleanup_errors:\n' + cleanupErrors.map((error) => String(error?.stack ?? error)).join('\n') + '\n');
  process.exitCode = 1;
}
if (!runError && cleanupErrors.length === 0) process.stdout.write(JSON.stringify(resultEvidence, null, 2) + '\n');

async function runFullLiveE2e() {
  siteRoot = await mkdtemp(join(tmpdir(), 'narada-full-live-router-'));
  await mkdir(join(siteRoot, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  await mkdir(join(siteRoot, '.ai', 'db', 'migrations'), { recursive: true });
  await writeFile(
    join(siteRoot, '.ai', 'db', 'migrations', '001-agent-context-materializations.sql'),
    await readFile(AGENT_CONTEXT_MIGRATION_FIXTURE, 'utf8'),
    'utf8',
  );
  await writeFile(
    join(siteRoot, '.ai', 'db', 'migrations', '002-agent-events.sql'),
    await readFile(AGENT_EVENTS_MIGRATION_FIXTURE, 'utf8'),
    'utf8',
  );
  await writeFile(
    join(siteRoot, '.ai', 'db', 'migrations', '003-codex-session-admissions.sql'),
    await readFile(CODEX_ADMISSIONS_MIGRATION_FIXTURE, 'utf8'),
    'utf8',
  );
  const runtimeRoot = join(siteRoot, '.narada', 'runtime', 'full-live');
  const routerStateRoot = join(siteRoot, '.narada', 'runtime', 'operator-router');
  const launchBindingPath = join(runtimeRoot, 'full-live-launch-binding.json');
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(routerStateRoot, { recursive: true });

  const siteId = 'full-live-' + Date.now();
  const agentId = siteId + '.full_live_e2e.resident';
  await mkdir(join(siteRoot, '.ai', 'agents'), { recursive: true });
  await writeFile(
    join(siteRoot, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      schema: 'narada.agent.roster.v1',
      enforce_session_roster: false,
      agents: [{ agent_id: agentId, role: 'resident', capabilities: [] }],
    }) + '\n',
    'utf8',
  );
  providerControlFile = join(runtimeRoot, 'provider-control.json');
  providerTranscriptFile = join(runtimeRoot, 'provider-transcript.jsonl');
  providerPortFile = join(runtimeRoot, 'provider-port.json');
  await writeControl({ hold: false, release: true });
  await writeFile(providerTranscriptFile, '', 'utf8');

  providerProcess = spawnTestChild(process.execPath, [
    PROVIDER_ENTRYPOINT,
    '--port-file', providerPortFile,
    '--transcript-file', providerTranscriptFile,
    '--control-file', providerControlFile,
  ], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  providerOutput = collectProcessOutput(providerProcess);
  const providerReady = await waitFor(() => readJsonFileIfPresent(providerPortFile), 'provider_ready');
  providerBaseUrl = providerReady.base_url;
  assert.equal(providerReady.schema, 'narada.full_live.provider_ready.v1');
  assert.equal(providerReady.pid, providerProcess.pid);

  routerPort = await reservePort();
  routerUrl = 'http://127.0.0.1:' + routerPort;
  routerProcess = startRouter(routerStateRoot);
  routerOutput = collectProcessOutput(routerProcess);
  await waitForRouterHealthy(routerUrl, 'router_initial_health');

  runtimeProcess = spawnTestChild(process.execPath, [
    CLI_ENTRYPOINT,
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
    '--launch-binding', launchBindingPath,
    '--format', 'json',
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_SITE_ROOT: siteRoot,
      NARADA_WORKSPACE_ROOT: REPO_ROOT,
      NARADA_SITE_ID: siteId,
      NARADA_MCP_SCOPE: 'none',
      NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
      NARADA_AI_API_KEY: 'full-live-fixture-key',
      NARADA_AI_BASE_URL: providerBaseUrl,
      NARADA_AI_MODEL: 'full-live-fixture-model',
      KIMI_CODE_API_KEY: 'full-live-fixture-key',
      KIMI_CODE_API_BASE_URL: providerBaseUrl,
      KIMI_CODE_MODEL: 'full-live-fixture-model',
      DEEPSEEK_API_KEY: 'full-live-fixture-key',
      DEEPSEEK_API_BASE_URL: providerBaseUrl,
      DEEPSEEK_MODEL: 'full-live-fixture-model',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runtimeOutput = collectProcessOutput(runtimeProcess);
  const record = await waitForSessionRecord(siteRoot, agentId);
  sessionIdForCleanup = record.session_id;
  const narsProcessPid = Number(record.process_ownership?.pid);
  assert.ok(Number.isInteger(narsProcessPid) && narsProcessPid > 0 && narsProcessPid !== process.pid, JSON.stringify(record.process_ownership));
  assert.equal(record.agent_id, agentId);
  assert.equal(record.runtime_kind, 'narada-agent-runtime-server');
  assert.equal(record.launch_operator_surface_kind, 'agent-web-ui');
  assert.match(record.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
  assert.match(record.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
  const startupEvent = await waitForEvent(
    record.events_path,
    0,
    (event) => event.event === 'session_started',
    'runtime_session_started',
  );
  assert.equal(startupEvent.provider, 'kimi-code-api');
  assert.equal(startupEvent.model, 'full-live-fixture-model');
  assert.equal(startupEvent.mcp_scope, 'none');
  assert.equal(startupEvent.mcp_operational_state, 'disabled');
  await waitForHealthy(record.health_endpoint, 'nars_health');

  webUiProcess = spawnTestChild(process.execPath, [
    WEB_UI_SIGNAL_RELAY_ENTRYPOINT,
    'agent-web-ui',
    'attach',
    '--session', record.session_id,
    '--site-root', siteRoot,
    '--host', '127.0.0.1',
    '--port', String(routerPort),
    '--no-open',
    '--health-timeout-ms', '3000',
    '--onboarding',
    '--format', 'human',
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_OPERATOR_ROUTER_STATE_ROOT: routerStateRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  webUiOutput = collectProcessOutput(webUiProcess);
  const urlMatch = await waitFor(
    () => webUiOutput.all().match(/agent-web-ui:\s+(http:\/\/127\.0\.0\.1:\d+\/sessions\/[^\s]+\/?)/),
    'agent_web_ui_public_url',
  );
  const publicWebUiUrl = normalizeHttpUrl(urlMatch[1]);
  const publicWebSocketUrl = publicWebUiUrl.replace(/^http:/, 'ws:') + 'events';
  const publicWebUiPath = normalizePathname(new URL(publicWebUiUrl).pathname);
  const publicWebSocketPath = normalizePathname(new URL(publicWebSocketUrl).pathname);
  assert.equal(new URL(publicWebUiUrl).port, String(routerPort));
  assert.notEqual(publicWebSocketUrl, record.event_endpoint);

  const routesBeforeBrowser = await waitForSessionRoutes(routerUrl, record.session_id, 2);
  assert.ok(routesBeforeBrowser.every((route) => route.state === 'healthy'), JSON.stringify(routesBeforeBrowser));
  for (const route of routesBeforeBrowser) {
    assert.equal(Object.prototype.hasOwnProperty.call(route, 'target_url'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(route, 'websocket_target_url'), false);
  }
  assert.ok(
    routesBeforeBrowser.some((route) => normalizePathname(route.public_path) === publicWebUiPath),
    JSON.stringify({ expected: publicWebUiPath, routes: routesBeforeBrowser }),
  );
  assert.ok(
    routesBeforeBrowser.some((route) => normalizePathname(route.public_path) === publicWebSocketPath),
    JSON.stringify({ expected: publicWebSocketPath, routes: routesBeforeBrowser }),
  );

  page = await openCdpPage({ browserPath, url: publicWebUiUrl, workDir: siteRoot });
  await page.waitForExpression(
    'document.querySelector(".onboarding-panel[data-phase=\\"ready\\"]") !== null',
    TIMEOUT_MS,
  );
  const config = await page.waitForExpression(
    '(() => { const value = document.querySelector("#nars-config")?.textContent; return value ? JSON.parse(value) : null; })()',
    TIMEOUT_MS,
  );
  assert.equal(config.eventEndpoint, publicWebSocketUrl);
  assert.notEqual(config.eventEndpoint, record.event_endpoint);
  await waitFor(
    () => page.network.websocketCreated.some((url) => sameUrl(url, publicWebSocketUrl)),
    'browser_public_websocket_created',
  );
  assert.equal(page.network.websocketCreated.some((url) => sameUrl(url, record.event_endpoint)), false);
  await page.evaluate(
    '(() => {'
      + 'window.__fullLiveFrames = [];'
      + 'window.__fullLiveSockets = [];'
      + 'window.__fullLiveOriginalSend = WebSocket.prototype.send;'
      + 'WebSocket.prototype.send = function(data) {'
      + 'if (!window.__fullLiveSockets.includes(this)) window.__fullLiveSockets.push(this);'
      + 'try { window.__fullLiveFrames.push(JSON.parse(String(data))); } catch {}'
      + 'return window.__fullLiveOriginalSend.call(this, data);'
      + '};'
      + '})()',
  );

  const baselineFromIndex = readJsonlFile(record.events_path).length;
  const baseline = await submitUiInput(page, 'full-live baseline sentinel');
  const baselineProvider = await waitForProviderContent('full-live baseline sentinel', 1);
  assert.equal(baselineProvider.length, 1);
  const baselineOperation = await waitForCompletedOperation(
    record.events_path,
    baselineFromIndex,
    baseline,
    'baseline_operation',
  );
  assert.equal(baselineOperation.assistant.content, 'Full live provider response: full-live baseline sentinel');
  await page.waitForExpression(
    'document.body.textContent.includes("Full live provider response: full-live baseline sentinel")',
    TIMEOUT_MS,
  );
  await assertUiCompleted(page, baseline.requestId);
  assert.equal(readProviderRecords().filter((entry) => entry.content === 'full-live baseline sentinel').length, 1);

  await writeControl({ hold: true, release: false });
  const interruptedFromIndex = readJsonlFile(record.events_path).length;
  const interrupted = await submitUiInput(page, 'full-live interrupted sentinel');
  const interruptedProvider = await waitForProviderContent('full-live interrupted sentinel', 1);
  assert.equal(interruptedProvider.length, 1);
  const interruptedQueued = await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'input_event_queued' && event.idempotency_key === interrupted.idempotencyKey,
    'interrupted_input_queued',
  );
  await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'input_event_started' && event.request_id === interruptedQueued.request_id,
    'interrupted_input_started',
  );
  const interruptedTurnStarted = await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'carrier_turn_started' && event.turn_id === interruptedQueued.event_id,
    'interrupted_turn_started',
  );
  const navigationCountBeforeRouterStop = page.network.navigations.length;
  const websocketCloseCountBeforeRouterStop = page.network.websocketClosed.length;
  await stopProcess(routerProcess, 'router_interruption');
  routerProcess = null;
  await waitFor(
    () => page.network.websocketClosed.length > websocketCloseCountBeforeRouterStop,
    'browser_socket_closed_after_router_stop',
  );
  assert.equal(page.network.navigations.length, navigationCountBeforeRouterStop);
  assert.equal(
    await page.evaluate('document.body.textContent.includes("Full live provider response: full-live interrupted sentinel")'),
    false,
  );

  await writeControl({ hold: false, release: true });
  const interruptedAssistant = await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'assistant_message' && event.turn_id === interruptedTurnStarted.turn_id,
    'interrupted_assistant_durable_completion',
  );
  const interruptedCompleted = await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'carrier_turn_completed' && event.turn_id === interruptedTurnStarted.turn_id,
    'interrupted_turn_durable_completion',
  );
  const interruptedInputCompleted = await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'input_event_completed' && event.request_id === interruptedQueued.request_id,
    'interrupted_input_durable_completion',
  );
  const interruptedResponse = await waitForEvent(
    record.events_path,
    interruptedFromIndex,
    (event) => event.event === 'session_control_response' && event.request_id === interruptedQueued.request_id,
    'interrupted_control_durable_completion',
  );
  assert.equal(interruptedAssistant.content, 'Full live provider response: full-live interrupted sentinel');
  assert.equal(interruptedCompleted.turn_id, interruptedTurnStarted.turn_id);
  assert.equal(interruptedInputCompleted.terminal_state, 'completed');
  assert.equal(interruptedResponse.terminal_state, 'completed');

  routerProcess = startRouter(routerStateRoot);
  routerOutput = collectProcessOutput(routerProcess);
  await waitForRouterHealthy(routerUrl, 'router_restart_health');
  await waitFor(
    async () => {
      const routes = await readSessionRoutes(routerUrl, record.session_id);
      return routes.length >= 2 && routes.every((route) => route.state === 'healthy');
    },
    'router_restarted_session_routes',
  );
  await waitFor(
    () => page.network.websocketCreated.filter((url) => sameUrl(url, publicWebSocketUrl)).length >= 2,
    'browser_public_websocket_reconnected',
  );
  assert.equal(page.network.navigations.length, navigationCountBeforeRouterStop);
  await page.waitForExpression(
    'document.body.textContent.includes("Full live provider response: full-live interrupted sentinel")',
    TIMEOUT_MS,
  );
  assert.equal(readProviderRecords().filter((entry) => entry.content === 'full-live interrupted sentinel').length, 1);

  await writeControl({ hold: true, release: false });
  const retryFromIndex = readJsonlFile(record.events_path).length;
  const retry = await submitUiInput(page, 'full-live idempotent retry sentinel');
  const retryProvider = await waitForProviderContent('full-live idempotent retry sentinel', 1);
  assert.equal(retryProvider.length, 1);
  const retryQueued = await waitForEvent(
    record.events_path,
    retryFromIndex,
    (event) => event.event === 'input_event_queued' && event.idempotency_key === retry.idempotencyKey,
    'retry_input_queued',
  );
  const retryTurnStarted = await waitForEvent(
    record.events_path,
    retryFromIndex,
    (event) => event.event === 'carrier_turn_started' && event.turn_id === retryQueued.event_id,
    'retry_turn_started',
  );
  assert.equal(retry.params.idempotency_key, retry.idempotencyKey);
  await sendPublicProtocolRetry(page, publicWebSocketUrl, retry);
  const deduplicated = await waitForEvent(
    record.events_path,
    retryFromIndex,
    (event) => event.event === 'input_event_deduplicated'
      && event.idempotency_key === retry.idempotencyKey
      && event.request_id !== retry.requestId,
    'retry_input_deduplicated',
  );
  assert.equal(deduplicated.deduplication_state, 'reused_existing_operation');
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(readProviderRecords().filter((entry) => entry.content === 'full-live idempotent retry sentinel').length, 1);
  await writeControl({ hold: false, release: true });
  const retryOperation = await waitForCompletedOperation(
    record.events_path,
    retryFromIndex,
    retry,
    'retry_operation',
    retryTurnStarted,
  );
  assert.equal(retryOperation.assistant.content, 'Full live provider response: full-live idempotent retry sentinel');
  await page.waitForExpression(
    'document.body.textContent.includes("Full live provider response: full-live idempotent retry sentinel")',
    TIMEOUT_MS,
  );
  await assertUiCompleted(page, deduplicated.request_id);
  assert.equal(readProviderRecords().filter((entry) => entry.content === 'full-live idempotent retry sentinel').length, 1);

  const closeFromIndex = readJsonlFile(record.events_path).length;
  await page.fill('#operator-input', '/exit');
  await page.click('.composer-submit');
  const sessionClosed = await waitForEvent(
    record.events_path,
    closeFromIndex,
    (event) => event.event === 'session_closed',
    'ui_exit_session_closed',
  );
  assert.equal(sessionClosed.terminal_state, 'closed');
  await waitForEndpointClosed(record.health_endpoint, 'nars_health_closed');
  await waitForProcessNotAlive(narsProcessPid, 'nars_process_closed');

  resultEvidence = {
    schema: 'narada.agent_web_ui.full_live_router_nars_provider_e2e.result.v1',
    status: 'passed',
    topology: {
      browser: 'chromium-cdp',
      operator_router: 'child',
      agent_web_ui: 'child',
      nars_runtime: 'child',
      deterministic_provider: 'separate-child',
    },
    session_id: record.session_id,
    public_web_ui_url: publicWebUiUrl,
    public_websocket_url: publicWebSocketUrl,
    direct_nars_websocket_url: record.event_endpoint,
    events_path: record.events_path,
    provider_transcript_path: providerTranscriptFile,
    provider_pid: providerReady.pid,
    provider_request_count: readProviderRecords().length,
    durable_router_restart: {
      router_stopped: true,
      router_restarted: true,
      navigation_count_unchanged: true,
      public_websocket_reconnected: true,
    },
    idempotent_retry: {
      original_request_id: retry.requestId,
      retry_request_id: deduplicated.request_id,
      idempotency_key: retry.idempotencyKey,
      deduplicated: true,
      provider_requests_for_sentinel: 1,
    },
    browser_observation: {
      public_websocket_created: page.network.websocketCreated.filter((url) => sameUrl(url, publicWebSocketUrl)).length,
      direct_nars_websocket_created: page.network.websocketCreated.filter((url) => sameUrl(url, record.event_endpoint)).length,
      websocket_closed: page.network.websocketClosed.length,
      navigations: page.network.navigations.length,
    },
    nars_health_closed: true,
    nars_process_closed: true,
  };
}

function startRouter(stateRoot) {
  return spawnTestChild(process.execPath, [
    ROUTER_ENTRYPOINT,
    '--host', '127.0.0.1',
    '--port', String(routerPort),
    '--state-root', stateRoot,
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NARADA_OPERATOR_ROUTER_STATE_ROOT: stateRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function submitUiInput(currentPage, content) {
  await currentPage.fill('#operator-input', content);
  await currentPage.click('.composer-submit');
  const frame = await currentPage.waitForExpression(
    '(() => (window.__fullLiveFrames || []).find((value) => value?.method === "session.submit" && value.params?.content === ' + JSON.stringify(content) + ') || false)()',
    TIMEOUT_MS,
  );
  assert.equal(frame.method, 'session.submit');
  assert.equal(frame.params.content, content);
  assert.equal(frame.params.source, 'manual_operator');
  assert.match(frame.params.idempotency_key, /^agent-web-ui:session\.submit:/);
  return {
    frame,
    requestId: frame.id,
    params: frame.params,
    idempotencyKey: frame.params.idempotency_key,
  };
}

async function sendPublicProtocolRetry(currentPage, publicWebSocketUrl, original) {
  const frame = {
    id: 'full-live-protocol-retry-' + Date.now(),
    method: original.frame.method,
    params: { ...original.frame.params },
  };
  const sent = await currentPage.evaluate(
    '(() => {'
      + 'const socket = (window.__fullLiveSockets || []).find((candidate) => candidate.readyState === WebSocket.OPEN);'
      + 'if (!socket) throw new Error("public_reconnected_socket_not_available");'
      + 'socket.send(' + JSON.stringify(JSON.stringify(frame)) + ');'
      + 'return true;'
      + '})()',
  );
  assert.equal(sent, true);
}

async function waitForCompletedOperation(eventsPath, fromIndex, submitted, label, knownTurnStarted = null) {
  const queued = await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'input_event_queued' && event.idempotency_key === submitted.idempotencyKey,
    label + '_queued',
  );
  const started = await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'input_event_started' && event.request_id === queued.request_id,
    label + '_started',
  );
  const turnStarted = knownTurnStarted ?? await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'carrier_turn_started' && event.turn_id === queued.event_id,
    label + '_turn_started',
  );
  const assistant = await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'assistant_message' && event.turn_id === turnStarted.turn_id,
    label + '_assistant',
  );
  const turnCompleted = await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'carrier_turn_completed' && event.turn_id === turnStarted.turn_id,
    label + '_turn_completed',
  );
  const inputCompleted = await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'input_event_completed' && event.request_id === queued.request_id,
    label + '_input_completed',
  );
  const response = await waitForEvent(
    eventsPath,
    fromIndex,
    (event) => event.event === 'session_control_response' && event.request_id === queued.request_id,
    label + '_control_response',
  );
  const sequence = [queued, started, turnStarted, assistant, turnCompleted, inputCompleted, response]
    .map((event) => Number(event.event_sequence ?? event.sequence));
  assert.equal(sequence.every(Number.isFinite), true, label + '_sequence_missing');
  for (let index = 1; index < sequence.length; index += 1) {
    assert.ok(sequence[index] > sequence[index - 1], label + '_sequence_not_monotonic');
  }
  assert.equal(started.request_id, queued.request_id);
  assert.equal(turnCompleted.turn_id, turnStarted.turn_id);
  assert.equal(inputCompleted.terminal_state, 'completed');
  assert.equal(response.terminal_state, 'completed');
  return { queued, started, turnStarted, assistant, turnCompleted, inputCompleted, response };
}

async function assertUiCompleted(currentPage, requestId) {
  await currentPage.waitForExpression(
    'document.querySelector("#operator-form")?.getAttribute("data-operator-delivery-phase") === "completed"',
    TIMEOUT_MS,
  );
  const observedRequestId = await currentPage.evaluate(
    'document.querySelector("#operator-form")?.getAttribute("data-operator-delivery-request-id")',
  );
  assert.equal(observedRequestId, requestId);
  const status = await currentPage.evaluate('document.querySelector(".composer-delivery-status")?.textContent || ""');
  assert.match(status, /Input delivered/);
  assert.equal(status.includes('Waiting for agent'), false);
  assert.equal(status.includes('Steering the active turn'), false);
}

async function waitForProviderContent(content, count) {
  return waitFor(
    () => {
      const matches = readProviderRecords().filter((entry) => entry.content === content);
      return matches.length === count ? matches : false;
    },
    'provider_request_' + content,
  );
}

function readProviderRecords() {
  if (!providerTranscriptFile || !existsSync(providerTranscriptFile)) return [];
  return readJsonlFile(providerTranscriptFile);
}

async function writeControl(value) {
  await writeFile(providerControlFile, JSON.stringify(value) + '\n', 'utf8');
}

async function waitForSessionRecord(root, agentId) {
  try {
    return await waitFor(() => {
      if (runtimeProcess && runtimeProcess.exitCode !== null && runtimeProcess.exitCode !== 0) {
        throw new Error('runtime_exited:' + runtimeOutput.all().slice(0, 5000));
      }
      return findSessionRecord(root, agentId);
    }, 'nars_session_index_record');
  } catch (error) {
    const entries = existsSync(root) ? readdirSync(root, { recursive: true }).slice(0, 160) : [];
    const indexPaths = [
      join(root, '.narada', 'crew', 'nars-sessions', 'index.json'),
      join(root, 'crew', 'nars-sessions', 'index.json'),
    ];
    const indexes = Object.fromEntries(indexPaths.map((path) => [path, readJsonFileIfPresent(path)]));
    const runtimeProcessRoot = join(root, '.ai', 'runtime', 'agent-start-processes');
    const runtimeProcessEntries = existsSync(runtimeProcessRoot)
      ? readdirSync(runtimeProcessRoot, { recursive: true }).slice(0, 120)
      : [];
    const runtimeProcessFiles = Object.fromEntries(runtimeProcessEntries
      .filter((entry) => /\.(log|json)$/i.test(String(entry)))
      .map((entry) => {
        const path = join(runtimeProcessRoot, String(entry));
        return [path, readTextFileIfPresent(path).slice(-8000)];
      }));
    const launcherResultPath = runtimeOutput?.all().match(/Result:\s+([^\s]+)/)?.[1] ?? null;
    const reconciliationPath = join(root, '.ai', 'runtime', 'agent-start-reconciliation', 'v1.json');
    throw new Error(
      String(error?.message ?? error)
        + '\nsite_root=' + root
        + '\nsite_entries=' + JSON.stringify(entries)
        + '\nsession_indexes=' + JSON.stringify(indexes)
        + '\nruntime_process_entries=' + JSON.stringify(runtimeProcessEntries)
        + '\nruntime_process_files=' + JSON.stringify(runtimeProcessFiles)
        + '\nlauncher_result_path=' + launcherResultPath
        + '\nlauncher_result=' + JSON.stringify(launcherResultPath ? readJsonFileIfPresent(launcherResultPath) : null)
        + '\nagent_start_reconciliation=' + JSON.stringify(readJsonFileIfPresent(reconciliationPath))
        + '\nruntime_output=' + runtimeOutput?.all().slice(0, 8000),
    );
  }
}

function findSessionRecord(root, agentId) {
  const records = [];
  const recordsRoots = [
    join(root, '.narada', 'crew', 'nars-sessions'),
    join(root, 'crew', 'nars-sessions'),
  ];
  for (const recordsRoot of recordsRoots) {
    if (!existsSync(recordsRoot)) continue;
    try {
      const aggregate = readNarsSessionIndex({ sessionsRoot: recordsRoot, siteRoot: root });
      for (const entry of aggregate?.sessions ?? []) {
        if (entry?.agent_id !== agentId) continue;
        const recordPath = entry.record_path
          ?? (entry.session_dir ? join(entry.session_dir, 'session-index-record.json') : null);
        const record = recordPath ? readJsonFileIfPresent(recordPath) : null;
        if (record?.agent_id === agentId && record.event_endpoint && record.health_endpoint) records.push(record);
      }
    } catch {}
    for (const entry of readdirSync(recordsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(recordsRoot, entry.name, 'session-index-record.json');
      const record = readJsonFileIfPresent(path);
      if (record?.agent_id === agentId && record.event_endpoint && record.health_endpoint) records.push(record);
    }
  }
  records.sort((left, right) => Date.parse(right.started_at ?? '') - Date.parse(left.started_at ?? ''));
  return records[0] ?? false;
}

async function waitForEvent(eventsPath, fromIndex, predicate, label) {
  try {
    return await waitFor(
      () => readJsonlFile(eventsPath).slice(fromIndex).find(predicate) ?? false,
      label,
    );
  } catch (error) {
    error.message += '\nrecent_events=' + JSON.stringify(readJsonlFile(eventsPath).slice(fromIndex).slice(-30));
    throw error;
  }
}

async function waitForRouterHealthy(url, label) {
  return waitFor(async () => {
    try {
      const response = await fetch(url + '/health', { cache: 'no-store' });
      if (!response.ok) return false;
      const body = await response.json();
      return body.status === 'healthy' ? body : false;
    } catch {
      return false;
    }
  }, label);
}

async function waitForHealthy(url, label) {
  return waitFor(async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return false;
      const body = await response.json();
      return body.status === 'healthy' ? body : false;
    } catch {
      return false;
    }
  }, label);
}

async function waitForEndpointClosed(url, label) {
  return waitFor(async () => {
    try {
      await fetch(url, { cache: 'no-store' });
      return false;
    } catch {
      return true;
    }
  }, label);
}

async function waitForProcessNotAlive(pid, label) {
  return waitFor(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  }, label);
}

async function waitForSessionRoutes(url, sessionId, minimum) {
  return waitFor(async () => {
    const routes = await readSessionRoutes(url, sessionId);
    return routes.length >= minimum ? routes : false;
  }, 'router_session_routes');
}

async function readSessionRoutes(url, sessionId) {
  try {
    const response = await fetch(url + '/routes', { cache: 'no-store' });
    if (!response.ok) return [];
    const body = await response.json();
    return (body.routes ?? []).filter((route) => route.session_id === sessionId);
  } catch {
    return [];
  }
}

async function waitFor(check, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(label + '_timeout:' + (lastError instanceof Error ? lastError.message : ''));
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('reserve_port_address_missing');
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
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
    all: () => stdout + '\n' + stderr,
  };
}

async function stopProcess(child, label, gracefulSignal = 'SIGTERM', { signalRelay = false } = {}) {
  if (!child) return { label, stopped: true, already_exited: true };
  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (signalRelay && child.connected) child.send({ signal: gracefulSignal });
      else child.kill(gracefulSignal);
    } catch {}
    await waitForExit(child, 5000);
  }
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawnTestChild('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      await waitForExit(killer, 5000);
    } else {
      try { child.kill('SIGKILL'); } catch {}
    }
    await waitForExit(child, 5000);
  }
  assert.ok(child.exitCode !== null || child.signalCode !== null, label + '_process_not_stopped');
  return {
    label,
    stopped: true,
    pid: child.pid,
    exit_code: child.exitCode,
    signal: child.signalCode,
  };
}

async function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function readJsonFileIfPresent(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readTextFileIfPresent(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function readJsonlFile(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function normalizeHttpUrl(value) {
  return String(value).replace(/\/+$/, '') + '/';
}

function normalizePathname(value) {
  const normalized = String(value ?? '').replace(/\/+$/, '');
  return normalized || '/';
}

function sameUrl(left, right) {
  return String(left).replace(/\/+$/, '') === String(right).replace(/\/+$/, '');
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
  const userDataDir = join(workDir, 'browser-profile-' + Date.now());
  await mkdir(userDataDir, { recursive: true });
  const browser = spawnTestChild(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--remote-debugging-port=0',
    '--user-data-dir=' + userDataDir,
    '--window-position=-32000,-32000',
    '--window-size=1280,900',
    url,
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const browserOutput = collectProcessOutput(browser);
  const browserWsUrl = await waitFor(
    () => browserOutput.stderr().match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? false,
    'browser_cdp_endpoint',
    15_000,
  );
  const browserHttpUrl = new URL(browserWsUrl);
  const pages = await fetch('http://' + browserHttpUrl.host + '/json/list').then((response) => response.json());
  const target = pages.find((entry) => entry.type === 'page') ?? pages[0];
  assert.ok(target?.webSocketDebuggerUrl, 'browser CDP page target missing');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  let commandId = 0;
  const pending = new Map();
  const network = {
    websocketCreated: [],
    websocketClosed: [],
    websocketSent: [],
    websocketReceived: [],
    navigations: [],
  };
  socket.addEventListener('message', (message) => {
    let payload;
    try { payload = JSON.parse(String(message.data)); } catch { return; }
    if (payload.method === 'Network.webSocketCreated') network.websocketCreated.push(payload.params.url);
    if (payload.method === 'Network.webSocketClosed') network.websocketClosed.push(payload.params);
    if (payload.method === 'Network.webSocketFrameSent') network.websocketSent.push(payload.params);
    if (payload.method === 'Network.webSocketFrameReceived') network.websocketReceived.push(payload.params);
    if (payload.method === 'Page.frameNavigated') network.navigations.push(payload.params.frame?.url ?? null);
    if (payload.id === undefined) return;
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(JSON.stringify(payload.error)));
    else waiter.resolve(payload.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await new Promise((resolve) => setTimeout(resolve, 700));

  return {
    network,
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result?.exceptionDetails) throw new Error('cdp_evaluate_failed:' + JSON.stringify(result.exceptionDetails));
      return result?.result?.value;
    },
    async click(selector) {
      const point = await this.evaluate(
        '(() => { const element = document.querySelector(' + JSON.stringify(selector) + ');'
          + ' if (!(element instanceof HTMLElement)) return null;'
          + ' const rect = element.getBoundingClientRect();'
          + ' return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; })()',
      );
      if (!point) throw new Error('cdp_click_target_not_found:' + selector);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    },
    async fill(selector, value) {
      await this.click(selector);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
      await send('Input.insertText', { text: String(value) });
    },
    async waitForExpression(expression, timeoutMs = TIMEOUT_MS) {
      return waitFor(() => this.evaluate(expression), 'cdp_expression', timeoutMs);
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { socket.close(); } catch {}
      await waitForExit(browser, 5000);
      if (browser.exitCode === null && browser.signalCode === null) {
        await stopProcess(browser, 'browser');
      }
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}

async function cleanup() {
  const cleanupErrors = [];
  try { await writeControl({ hold: false, release: true }); } catch (error) { cleanupErrors.push(error); }
  try { await page?.close(); } catch (error) { cleanupErrors.push(error); }
  page = null;
  try { await stopProcess(webUiProcess, 'agent_web_ui', 'SIGINT', { signalRelay: true }); } catch (error) { cleanupErrors.push(error); }
  webUiProcess = null;
  if (routerUrl && sessionIdForCleanup) {
    try {
      await waitFor(
        async () => (await readSessionRoutes(routerUrl, sessionIdForCleanup)).length === 0,
        'router_routes_cleanup',
        10_000,
      );
    } catch (error) {
      const remainingRoutes = await readSessionRoutes(routerUrl, sessionIdForCleanup);
      if (error instanceof Error) error.message += '\nremaining_routes=' + JSON.stringify(remainingRoutes);
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error) + '\nremaining_routes=' + JSON.stringify(remainingRoutes)));
    }
  }
  try { await stopProcess(runtimeProcess, 'nars_runtime'); } catch (error) { cleanupErrors.push(error); }
  runtimeProcess = null;
  try { await stopProcess(routerProcess, 'operator_router'); } catch (error) { cleanupErrors.push(error); }
  routerProcess = null;
  try { await stopProcess(providerProcess, 'deterministic_provider'); } catch (error) { cleanupErrors.push(error); }
  providerProcess = null;
  if (routerUrl) {
    try {
      await waitFor(async () => {
        try { await fetch(routerUrl + '/health'); return false; } catch { return true; }
      }, 'router_port_closed', 10_000);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (siteRoot) {
    try { await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { cleanupErrors.push(error); }
  }
  return cleanupErrors;
}
