import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { registerNarsArtifact } from '@narada2/nars-session-core/artifacts';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import * as canonicalRuntimeEvents from '../src/runtime-server-events.mjs';
import {
  createDelegatedAuthorityHandoff,
  createEventHub,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  formatHostStatusEvent,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  lifecycleBindingFromArgs,
  parseEventStreamOptions,
  shouldUseInteractiveTerminalProjection,
  startHealthProjection,
  startEventStreamProjection,
} from '../src/server-wrapper.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function waitForOutput(child, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => { cleanup(); reject(new Error(`output_timeout:${text.slice(-500)}`)); }, timeoutMs);
    const onData = (chunk) => { text += String(chunk); if (predicate(text)) { cleanup(); resolve(text); } };
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', onData); };
    child.stdout.on('data', onData);
  });
}

function readRawUpgradeResponse(endpoint, requestPath) {
  const target = new URL(endpoint);
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: target.hostname, port: Number(target.port) });
    let settled = false;
    let response = '';
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback();
    };
    socket.setTimeout(5000, () => finish(() => reject(new Error(`raw_upgrade_timeout:${requestPath}`))));
    socket.once('error', (error) => finish(() => reject(error)));
    socket.on('data', (chunk) => {
      response += String(chunk);
      if (response.includes('\r\n\r\n')) finish(() => resolve(response));
    });
    socket.once('connect', () => {
      socket.write([
        `GET ${requestPath} HTTP/1.1`,
        `Host: ${target.host}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        '',
        '',
      ].join('\r\n'));
    });
  });
}

async function waitForCapturedOutput(child, readCaptured, predicate, timeoutMs = 5000) {
  if (predicate(readCaptured())) return readCaptured();
  await waitForOutput(child, () => predicate(readCaptured()), timeoutMs);
  return readCaptured();
}

async function connectWebSocket(url) {
  assert.equal(typeof WebSocket, 'function');
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
  return {
    sendJson(payload) {
      socket.send(JSON.stringify(payload));
    },
    sendText(text) {
      socket.send(text);
    },
    async nextJson() {
      if (queue.length) return queue.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      socket.close();
    },
  };
}

async function nextWebSocketJson(client, timeoutMs = 5000) {
  let timer;
  try {
    return await Promise.race([
      client.nextJson(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('websocket_message_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForFileCondition(path, predicate, timeoutMs = 5000) {
  return waitForCondition(() => {
    if (!existsSync(path)) return false;
    return predicate(readFileSync(path, 'utf8'));
  }, timeoutMs);
}

function readJsonlFile(path) {
  return readJsonlFileFromText(readFileSync(path, 'utf8'));
}

function readJsonlFileFromText(text) {
  return String(text)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function hasCapturedJsonEvent(text, predicate) {
  return String(text).split(/\r?\n/).some((line) => {
    if (!line.trim()) return false;
    try {
      return predicate(JSON.parse(line));
    } catch {
      return false;
    }
  });
}

async function nextWebSocketUntil(client, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = await nextWebSocketJson(client, Math.max(1, deadline - Date.now()));
    if (predicate(frame)) return frame;
  }
  throw new Error('websocket_predicate_timeout');
}

async function waitForCondition(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('condition_timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('package owns the Narada agent runtime server bins and exports', () => {
  assert.equal(packageJson.name, '@narada2/agent-runtime-server');
  assert.equal(packageJson.narada.package_role, 'nars_runtime_server');
  assert.equal(packageJson.narada.owns.includes('server_request_handling'), true);
  assert.equal(packageJson.narada.owns.includes('session_binding'), true);
  assert.equal(packageJson.narada.owns.includes('artifact_http_request_handling'), true);
  assert.equal(packageJson.narada.owns.includes('attachment_contract'), true);
  assert.equal(packageJson.narada.owns.includes('runtime_host_lifecycle'), true);
  assert.equal(packageJson.narada.owns.includes('server_request_lifecycle'), true);
  assert.equal(packageJson.narada.owns.includes('health_projection_request_lifecycle'), true);
  assert.equal(packageJson.narada.owns.includes('runtime_intelligence_reconfiguration'), true);
  assert.equal(packageJson.narada.carrier_substrate, '@narada2/carrier-runtime in-process');
  assert.equal(packageJson.narada.runtime_dependency_owner.includes('nars-session-core owns session control'), true);
  assert.equal(packageJson.bin['narada-agent-runtime-server'], './bin/narada-agent-runtime-server.mjs');
  assert.equal(packageJson.bin['agent-runtime-server'], undefined);
  assert.equal(packageJson.exports['.'], './src/server-wrapper.mjs');
  assert.equal(packageJson.exports['./runtime-server-events'], './src/runtime-server-events.mjs');
  assert.equal(packageJson.exports['./runtime-request-state'], './src/runtime-request-state.mjs');
  assert.equal(packageJson.exports['./health-projection-request-state'], './src/health-projection-request-state.mjs');
  assert.equal(packageJson.exports['./runtime-control-contract'], './src/runtime-control-contract.mjs');
  assert.equal(packageJson.exports['./provider-runtime-reconfiguration-state'], './src/provider-runtime-reconfiguration-state.mjs');
  assert.equal(packageJson.exports['./provider-runtime-controller'], './src/provider-runtime-controller.mjs');
  assert.equal(packageJson.dependencies['@narada2/agent-cli'], undefined);
  assert.equal(packageJson.dependencies['@narada2/carrier-terminal-projection'], 'workspace:*');
});

test('wrapper diagnostics preserve projection and control-input failure details', () => {
  const projectionFailure = {
    event: 'runtime_projection_failure',
    timestamp: '2026-07-13T12:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'diagnostics-session',
    request_id: 'health-request',
    projection: 'health',
    request_state: 'timed_out',
    error: 'session_health_timeout',
  };
  assert.equal(
    canonicalRuntimeEvents.formatRuntimeProjectionFailureSummary(projectionFailure),
    '[agent-runtime-server] Runtime projection failure health timed_out session_health_timeout',
  );
  assert.deepEqual(canonicalRuntimeEvents.formatRuntimeProjectionFailureEvent(projectionFailure), {
    schema: 'narada.agent_runtime_server.wrapper_event.v1',
    event: 'runtime_projection_failure',
    timestamp: '2026-07-13T12:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'diagnostics-session',
    request_id: 'health-request',
    projection: 'health',
    request_state: 'timed_out',
    terminal_state: null,
    error_code: null,
    error: 'session_health_timeout',
  });

  const bridgeFailure = {
    event: 'runtime_control_input_bridge_error',
    timestamp: '2026-07-13T12:00:01.000Z',
    agent_id: 'narada.test',
    session_id: 'diagnostics-session',
    control_path: 'D:/tmp/control.jsonl',
    error_code: 'control_input_line_too_large',
    error: 'control_input_line_too_large',
    error_at: '2026-07-13T12:00:01.000Z',
  };
  assert.equal(
    canonicalRuntimeEvents.formatControlInputBridgeErrorSummary(bridgeFailure),
    '[agent-runtime-server] Control-input bridge error control_input_line_too_large',
  );
  assert.deepEqual(canonicalRuntimeEvents.formatControlInputBridgeErrorEvent(bridgeFailure), {
    schema: 'narada.agent_runtime_server.wrapper_event.v1',
    event: 'control_input_bridge_error',
    timestamp: '2026-07-13T12:00:01.000Z',
    agent_id: 'narada.test',
    session_id: 'diagnostics-session',
    control_path: 'D:/tmp/control.jsonl',
    error_code: 'control_input_line_too_large',
    error: 'control_input_line_too_large',
    error_at: '2026-07-13T12:00:01.000Z',
  });
});

test('wrapper diagnostics surface runtime output failures and require a real terminal pair', () => {
  const outputFailure = {
    event: 'runtime_output_failure',
    timestamp: '2026-07-13T12:00:02.000Z',
    agent_id: 'narada.test',
    session_id: 'diagnostics-session',
    error_code: 'runtime_output_invalid_json',
    error: 'Unexpected token',
    line_length: 17,
  };
  assert.equal(
    canonicalRuntimeEvents.formatRuntimeOutputFailureSummary(outputFailure),
    '[agent-runtime-server] Runtime output failure runtime_output_invalid_json Unexpected token',
  );
  assert.deepEqual(canonicalRuntimeEvents.formatRuntimeOutputFailureEvent(outputFailure), {
    schema: 'narada.agent_runtime_server.wrapper_event.v1',
    event: 'runtime_output_failure',
    timestamp: '2026-07-13T12:00:02.000Z',
    agent_id: 'narada.test',
    session_id: 'diagnostics-session',
    error_code: 'runtime_output_invalid_json',
    error: 'Unexpected token',
    line_length: 17,
  });
  assert.equal(shouldUseInteractiveTerminalProjection({
    rawJsonl: false,
    operatorSurfaceKind: 'agent-cli',
    input: { isTTY: true },
    output: { isTTY: true },
  }), true);
  assert.equal(shouldUseInteractiveTerminalProjection({
    rawJsonl: false,
    operatorSurfaceKind: 'agent-cli',
    input: { isTTY: true },
    output: { isTTY: false },
  }), false);
});

test('spawned non-raw runtime uses the interactive terminal projection for a TTY pair', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-tty-e2e-'));
  const provider = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'tty response' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const providerAddress = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const launcher = [
      '--input-type=module',
      '--eval',
      [
        "import { pathToFileURL } from 'node:url';",
        "Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });",
        "Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });",
        "Object.defineProperty(process.stdin, 'setRawMode', { value: () => process.stdin, configurable: true });",
        'process.stdout.columns = 100;',
        'await import(pathToFileURL(process.argv[1]).href);',
      ].join(' '),
      binPath,
      '--no-health',
      '--no-events',
      '--identity', 'narada.test',
      '--session', 'tty-e2e',
    ];
    child = spawnTestChild(process.execPath, launcher, {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${providerAddress.port}/`,
        OPENAI_API_KEY: 'tty-e2e-key',
        NARADA_AGENT_CLI_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('operator >'));
    child.stdin.write('hello\r');
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('tty response'));
    child.kill('SIGTERM');
    const [exitCode] = await once(child, 'exit');
    assert.equal(exitCode, null, stderr);
    assert.equal(stderr.includes('runtime_output_failure'), false, stderr);
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned event projection rejects plain HTTP and malformed WebSocket upgrades', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-event-admission-e2e-'));
  const sessionId = 'event-admission-e2e';
  const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
  let child = null;
  try {
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--health-port', '0',
      '--event-host', '127.0.0.1',
      '--event-port', '0',
      '--identity', 'narada.test',
      '--session', sessionId,
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '1',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '1',
        NARADA_AGENT_RUNTIME_HEALTH_HOST: '127.0.0.1',
        NARADA_AGENT_RUNTIME_EVENTS_HOST: '127.0.0.1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'session_started'));
    const started = readJsonlFileFromText(stdout).find((event) => event.event === 'session_started');
    assert.ok(started?.event_endpoint);
    assert.equal(started.runtime_origin, 'local');
    assert.equal(started.authority_runtime_host, 'local');
    assert.equal(started.runtime_surface_contract?.quadrant, 'local/local');
    assert.equal(started.runtime_surface_contract?.authority?.authority_runtime_host, 'local');
    assert.equal(started.runtime_surface_contract?.authority?.canonicity, 'canonical');
    assert.equal(started.runtime_surface_contract?.projection, null);

    const plainHttpUrl = new URL(started.event_endpoint);
    plainHttpUrl.protocol = 'http:';
    const plainResponse = await fetch(plainHttpUrl);
    assert.equal(plainResponse.status, 426);
    assert.deepEqual(await plainResponse.json(), {
      error: 'upgrade_required',
      transport: 'websocket',
      path: '/events',
    });

    const wrongPathResponse = await readRawUpgradeResponse(started.event_endpoint, '/not-events');
    assert.match(wrongPathResponse, /^HTTP\/1\.1 404 Not Found\r\n/m);

    const missingKeyResponse = await readRawUpgradeResponse(started.event_endpoint, '/events');
    assert.match(missingKeyResponse, /^HTTP\/1\.1 400 Bad Request\r\n/m);

    child.stdin.end(`${JSON.stringify({ id: 'event-admission-close', method: 'session.close', params: {} })}\n`);
    const exitCode = await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0, stderr);
  } finally {
    if (child && child.exitCode === null) child.kill();
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('health projection tracks resolved, timed-out, and failed request lifecycles', { timeout: 10000 }, async () => {
  const resolvedTransitions = [];
  const resolvedInput = new PassThrough();
  let resolvedProjection;
  resolvedInput.setEncoding('utf8');
  resolvedInput.on('data', (chunk) => {
    const request = JSON.parse(String(chunk).trim());
    setTimeout(() => resolvedProjection.observe({
      event: 'session_health',
      request_id: request.id,
      status: 'healthy',
      runtime: 'narada-agent-runtime-server',
    }), 0);
  });
  resolvedProjection = await startHealthProjection({
    childStdin: resolvedInput,
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 100,
    onRequestTransition: (event) => resolvedTransitions.push(event),
  });
  try {
    const resolvedResponse = await fetch(resolvedProjection.url);
    assert.equal(resolvedResponse.status, 200);
    assert.equal((await resolvedResponse.json()).status, 'healthy');
    assert.deepEqual(resolvedTransitions.map((event) => event.request_state), [
      'requested', 'dispatched', 'awaiting_response', 'resolved',
    ]);
  } finally {
    resolvedInput.destroy();
    await new Promise((resolve) => resolvedProjection.server.close(resolve));
  }

  const timeoutTransitions = [];
  const timeoutInput = new PassThrough();
  const timeoutProjection = await startHealthProjection({
    childStdin: timeoutInput,
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 20,
    onRequestTransition: (event) => timeoutTransitions.push(event),
  });
  try {
    const timeoutResponse = await fetch(timeoutProjection.url);
    assert.equal(timeoutResponse.status, 503);
    assert.equal((await timeoutResponse.json()).status, 'unhealthy');
    assert.deepEqual(timeoutTransitions.map((event) => event.request_state), [
      'requested', 'dispatched', 'awaiting_response', 'timed_out',
    ]);
  } finally {
    timeoutInput.destroy();
    await new Promise((resolve) => timeoutProjection.server.close(resolve));
  }

  const failedTransitions = [];
  const failedInput = new PassThrough();
  failedInput.destroy();
  const failedProjection = await startHealthProjection({
    childStdin: failedInput,
    host: '127.0.0.1',
    port: 0,
    onRequestTransition: (event) => failedTransitions.push(event),
  });
  try {
    const failedResponse = await fetch(failedProjection.url);
    assert.equal(failedResponse.status, 503);
    assert.equal((await failedResponse.json()).status, 'unhealthy');
    assert.deepEqual(failedTransitions.map((event) => event.request_state), ['requested', 'failed']);
  } finally {
    await new Promise((resolve) => failedProjection.server.close(resolve));
  }
});

test('spawned health projection exposes a real supervisor transport failure', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/health-projection-failure-server.mjs', import.meta.url));
  const child = spawnTestChild(process.execPath, [fixturePath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0, stderr);
  const result = JSON.parse(stdout.trim());
  assert.deepEqual(result.body, {
    schema: 'narada.nars.health.v1',
    status: 'unhealthy',
    error: 'fixture_health_transport_failure',
  });
  assert.deepEqual(result.transitions.map((transition) => transition.request_state), [
    'requested', 'dispatched', 'awaiting_response', 'failed',
  ]);
});

test('spawned runtime enforces startup bindings, projection startup, disabled projections, and wrapper JSONL output', { timeout: 20000 }, async () => {
  const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
  const siteRoots = [];
  const createSiteRoot = (suffix) => {
    const siteRoot = mkdtempSync(join(tmpdir(), `narada-runtime-startup-${suffix}-`));
    siteRoots.push(siteRoot);
    return siteRoot;
  };
  const runStartupFailure = async (siteRoot, args, env) => {
    const child = spawnTestChild(process.execPath, [binPath, ...args], {
      env: { ...process.env, ...env, NARADA_SITE_ROOT: siteRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const [exitCode] = await once(child, 'exit');
    return { exitCode, stdout, stderr };
  };

  try {
    const missingProvider = await runStartupFailure(
      createSiteRoot('missing-provider'),
      ['--no-health', '--no-events', '--identity', 'narada.test', '--session', 'missing-provider'],
      {
        NARADA_INTELLIGENCE_PROVIDER: '',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '0',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
      },
    );
    assert.equal(missingProvider.exitCode, 1);
    assert.match(missingProvider.stderr, /intelligenceProvider is required|provider_runtime_provider_required/);

    const missingBinding = await runStartupFailure(
      createSiteRoot('missing-binding'),
      ['--no-health', '--no-events', '--identity', 'narada.test'],
      {
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_NARS_SESSION_ID: '',
        NARADA_RUNTIME_SESSION_ID: '',
        NARADA_CARRIER_SESSION_ID: '',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '0',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
      },
    );
    assert.equal(missingBinding.exitCode, 1);
    assert.match(missingBinding.stderr, /missing_nars_binding:session_id/);

    const occupied = createServer();
    await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const occupiedPort = occupied.address().port;
    const projectionStartupFailure = await runStartupFailure(
      createSiteRoot('projection-failure'),
      [
        '--health-host', '127.0.0.1',
        '--health-port', String(occupiedPort),
        '--no-events',
        '--identity', 'narada.test',
        '--session', 'projection-startup-failure',
      ],
      {
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '1',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
      },
    );
    await new Promise((resolve) => occupied.close(resolve));
    assert.equal(projectionStartupFailure.exitCode, 1);
    assert.match(projectionStartupFailure.stderr, /EADDRINUSE|address already in use/i);

    const disabledSiteRoot = createSiteRoot('disabled');
    const disabledChild = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--identity', 'narada.test',
      '--session', 'disabled-projections',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: disabledSiteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '0',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let disabledStdout = '';
    let disabledStderr = '';
    disabledChild.stdout.setEncoding('utf8');
    disabledChild.stderr.setEncoding('utf8');
    disabledChild.stdout.on('data', (chunk) => { disabledStdout += chunk; });
    disabledChild.stderr.on('data', (chunk) => { disabledStderr += chunk; });
    try {
      await waitForCapturedOutput(disabledChild, () => disabledStdout, (text) => text.includes('"event":"session_started"'));
      disabledChild.stdin.end(`${JSON.stringify({ id: 'disabled-close', method: 'session.close', params: {} })}\n`);
      assert.equal(await new Promise((resolve) => disabledChild.on('exit', resolve)), 0, disabledStderr);
      const disabledEvents = readJsonlFileFromText(disabledStdout);
      const disabledStarted = disabledEvents.find((event) => event.event === 'session_started');
      assert.equal(disabledStarted?.health_endpoint, null);
      assert.equal(disabledStarted?.event_endpoint, null);
      assert.equal(disabledEvents.some((event) => event.event === 'session_closed' && event.request_id === 'disabled-close'), true);
    } finally {
      if (disabledChild.exitCode === null) disabledChild.kill();
    }

    const wrapperSiteRoot = createSiteRoot('wrapper-events');
    const wrapperChild = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--wrapper-events-jsonl',
      '--identity', 'narada.test',
      '--session', 'wrapper-events',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: wrapperSiteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '0',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let wrapperStdout = '';
    let wrapperStderr = '';
    wrapperChild.stdout.setEncoding('utf8');
    wrapperChild.stderr.setEncoding('utf8');
    wrapperChild.stdout.on('data', (chunk) => { wrapperStdout += chunk; });
    wrapperChild.stderr.on('data', (chunk) => { wrapperStderr += chunk; });
    try {
      await waitForCapturedOutput(wrapperChild, () => wrapperStdout, (text) => text.includes('"event":"session_started"'));
      wrapperChild.stdin.end(`${JSON.stringify({ id: 'wrapper-close', method: 'session.close', params: {} })}\n`);
      assert.equal(await new Promise((resolve) => wrapperChild.on('exit', resolve)), 0, wrapperStderr);
      const wrapperEvents = wrapperStderr.split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed?.schema === 'narada.agent_runtime_server.wrapper_event.v1' ? [parsed] : [];
        } catch {
          return [];
        }
      });
      assert.equal(wrapperEvents.some((event) => event.event === 'session_status_snapshot' && event.source_event === 'session_started'), true);
      assert.equal(wrapperEvents.some((event) => event.event === 'session_status_snapshot' && event.source_event === 'session_closed'), true);
    } finally {
      if (wrapperChild.exitCode === null) wrapperChild.kill();
    }
  } finally {
    for (const siteRoot of siteRoots) rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime loads a lifecycle hook module and dispatches hooks through the canonical entrypoint', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-lifecycle-hook-e2e-'));
  const hookModulePath = join(siteRoot, 'lifecycle-hooks.mjs');
  const hookLogPath = join(siteRoot, 'lifecycle-hook-events.jsonl');
  writeFileSync(hookModulePath, [
    "import { appendFileSync } from 'node:fs';",
    "const record = (hook) => async (payload) => { appendFileSync(process.env.NARADA_TEST_HOOK_LOG, JSON.stringify({ hook, phase: 'start', payload }) + '\\n'); if (hook === 'afterSessionStarted') await new Promise((resolve) => setTimeout(resolve, 25)); appendFileSync(process.env.NARADA_TEST_HOOK_LOG, JSON.stringify({ hook, phase: 'end', payload }) + '\\n'); };",
    "export const hooks = [{ beforeSessionBind: record('beforeSessionBind'), afterSessionStarted: record('afterSessionStarted'), afterSessionClosed: record('afterSessionClosed') }];",
  ].join('\n'));
  const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
  let child = null;
  try {
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--lifecycle-hook-module', hookModulePath,
      '--identity', 'narada.test',
      '--session', 'lifecycle-hook-e2e',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_TEST_HOOK_LOG: hookLogPath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'session_started'));
    await waitForFileCondition(hookLogPath, (text) => text.includes('"hook":"afterSessionStarted"'));
    child.stdin.end(`${JSON.stringify({ id: 'hook-close', method: 'session.close', params: {} })}\n`);
    const exitCode = await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0, stderr);
    const hookEvents = readJsonlFile(hookLogPath);
    assert.deepEqual(hookEvents.map((entry) => `${entry.hook}:${entry.phase}`), [
      'beforeSessionBind:start',
      'beforeSessionBind:end',
      'afterSessionStarted:start',
      'afterSessionStarted:end',
      'afterSessionClosed:start',
      'afterSessionClosed:end',
    ]);
    assert.equal(hookEvents[0].payload.schema, 'narada.nars.lifecycle_hook.v1');
    assert.equal(hookEvents[0].payload.hook, 'beforeSessionBind');
    assert.equal(hookEvents[0].payload.agent_id, 'narada.test');
    assert.equal(hookEvents[2].payload.event_kind, 'session_started');
    assert.equal(hookEvents[4].payload.event_kind, 'session_closed');
  } finally {
    if (child && child.exitCode === null) child.kill();
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime projects a health timeout as HTTP 503 and cleans up after the blocked turn', { timeout: 20000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-projection-failure-e2e-'));
  const sessionId = 'projection-failure-e2e';
  let heldResponse = null;
  let requestReceived;
  const providerRequest = new Promise((resolve) => { requestReceived = resolve; });
  const provider = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      heldResponse = response;
      requestReceived();
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  let client = null;
  const releaseProvider = () => {
    if (!heldResponse) return;
    heldResponse.setHeader('content-type', 'application/json');
    heldResponse.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'projection fixture complete' } }] }));
    heldResponse = null;
  };
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--health-host', '127.0.0.1',
      '--health-port', '0',
      '--event-host',
      '127.0.0.1',
      '--event-port', '0',
      '--identity', 'narada.test',
      '--session', sessionId,
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'projection-failure-key',
        OPENAI_MODEL: 'fixture-openai',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '1',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '1',
        NARADA_AGENT_RUNTIME_HEALTH_HOST: '127.0.0.1',
        NARADA_AGENT_RUNTIME_EVENTS_HOST: '127.0.0.1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => text.split(/\r?\n/).some((line) => {
      try {
        return JSON.parse(line).event === 'session_started';
      } catch {
        return false;
      }
    }));
    const started = readJsonlFileFromText(stdout).find((event) => event.event === 'session_started');
    assert.match(started?.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.match(started?.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
    client = await connectWebSocket(started.event_endpoint);
    assert.equal((await nextWebSocketJson(client)).event, 'websocket_connected');
    client.sendJson({
      id: 'projection-failure-watch',
      method: 'session.events.subscribe',
      params: { include_replay: false, subscription_id: 'projection-failure-watch', view: 'diagnostics' },
    });
    assert.equal((await nextWebSocketJson(client)).event, 'session_events_subscription_started');

    child.stdin.write(`${JSON.stringify({ id: 'blocked-turn', method: 'session.submit', params: { content: 'hold the provider' } })}\n`);
    await providerRequest;
    child.stdin.write(`${JSON.stringify({ id: 'close-after-failure', method: 'session.close', params: {} })}\n`);
    const failurePromise = nextWebSocketUntil(client, (frame) => frame.event === 'session_event'
      && frame.payload?.event === 'runtime_projection_failure', 6000);
    const healthResponse = await fetch(started.health_endpoint);
    assert.equal(healthResponse.status, 503);
    const unhealthy = await healthResponse.json();
    assert.deepEqual(unhealthy, {
      schema: 'narada.nars.health.v1',
      status: 'unhealthy',
      error: 'session_health_timeout',
    });
    let failure;
    try {
      failure = await failurePromise;
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} stdout=${stdout} stderr=${stderr}`);
    }
    assert.equal(failure.subscription_id, 'projection-failure-watch');
    assert.equal(failure.payload.projection, 'health');
    assert.equal(failure.payload.request_state, 'timed_out');
    assert.equal(failure.payload.error, 'session_health_timeout');

    client.close();
    client = null;
    releaseProvider();
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"event":"carrier_turn_completed"'));
    let exitTimer;
    const exitCode = await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((_, reject) => {
        exitTimer = setTimeout(() => reject(new Error(`child_exit_timeout stdout=${stdout} stderr=${stderr}`)), 5000);
      }),
    ]).finally(() => clearTimeout(exitTimer));
    assert.equal(exitCode, 0, stderr);
    const durableEvents = readJsonlFile(resolveNaradaSitePaths({ siteRoot, sessionId }).narsEventsPath);
    assert.equal(durableEvents.some((event) => event.event === 'session_started'), true);
    assert.equal(durableEvents.some((event) => event.event === 'session_closed'), true);
  } finally {
    releaseProvider();
    client?.close();
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime switches providers, refuses invalid targets, and binds the next health and turn', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-provider-switch-e2e-'));
  const observedModels = [];
  const provider = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      observedModels.push(JSON.parse(body).model);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'switched provider fixture' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--identity', 'narada.test',
      '--session', 'provider-switch-e2e',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'provider-switch-openai-key',
        OPENAI_MODEL: 'fixture-openai',
        KIMI_API_BASE_URL: `http://127.0.0.1:${address.port}/`,
        KIMI_API_KEY: 'provider-switch-kimi-key',
        KIMI_MODEL: 'fixture-kimi',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"event":"session_started"'));

    child.stdin.write(`${JSON.stringify({
      id: 'invalid-target-request',
      method: 'runtime.intelligence.reconfigure',
      params: { request_id: 'invalid-target', provider: 'missing-provider' },
    })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'runtime_intelligence_reconfiguration'
      && event.request_id === 'invalid-target'
      && event.terminal_state === 'refused'));

    child.stdin.write(`${JSON.stringify({
      id: 'switch-provider-request',
      method: 'runtime.intelligence.reconfigure',
      params: { request_id: 'switch-provider', provider: 'kimi-api', model: 'fixture-kimi', thinking: 'low' },
    })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'runtime_intelligence_reconfiguration'
      && event.request_id === 'switch-provider'
      && event.terminal_state === 'active'));

    child.stdin.write(`${JSON.stringify({ id: 'turn-after-switch', method: 'session.submit', params: { content: 'use the switched provider' } })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"event":"carrier_turn_completed"'));
    child.stdin.write(`${JSON.stringify({ id: 'health-after-switch', method: 'session.health', params: {} })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"event":"session_health"') && text.includes('"request_id":"health-after-switch"'));
    child.stdin.end(`${JSON.stringify({ id: 'close-after-switch', method: 'session.close', params: {} })}\n`);
    const exitCode = await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0, stderr);

    const events = readJsonlFileFromText(stdout);
    const invalid = events.find((event) => event.event === 'runtime_intelligence_reconfiguration' && event.request_id === 'invalid-target');
    const switched = events.find((event) => event.event === 'runtime_intelligence_reconfiguration' && event.request_id === 'switch-provider');
    const health = events.find((event) => event.event === 'session_health' && event.request_id === 'health-after-switch');
    assert.equal(invalid?.terminal_state, 'refused');
    assert.equal(invalid?.reason, 'target_not_admitted');
    assert.deepEqual(events
      .filter((event) => event.event === 'provider_runtime_reconfiguration_state_transition' && event.request_id === 'switch-provider')
      .map((event) => event.reconfiguration_state), ['requested', 'validating', 'admitted', 'switching', 'active']);
    assert.equal(switched?.terminal_state, 'active');
    assert.equal(switched?.active?.provider, 'kimi-api');
    assert.equal(health?.intelligence?.provider, 'kimi-api');
    assert.equal(health?.intelligence?.model, 'fixture-kimi');
    assert.deepEqual(observedModels, ['fixture-kimi']);
    assert.equal(stdout.includes('provider-switch-openai-key'), false);
    assert.equal(stdout.includes('provider-switch-kimi-key'), false);
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime refuses provider reconfiguration across a busy turn boundary', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-provider-busy-e2e-'));
  let heldResponse = null;
  let requestReceived;
  const providerRequest = new Promise((resolve) => { requestReceived = resolve; });
  const provider = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      heldResponse = response;
      requestReceived();
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  const releaseProvider = () => {
    if (!heldResponse) return;
    heldResponse.setHeader('content-type', 'application/json');
    heldResponse.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'busy fixture complete' } }] }));
    heldResponse = null;
  };
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--identity', 'narada.test',
      '--session', 'provider-busy-e2e',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'provider-busy-openai-key',
        OPENAI_MODEL: 'fixture-openai',
        KIMI_API_BASE_URL: `http://127.0.0.1:${address.port}/`,
        KIMI_API_KEY: 'provider-busy-kimi-key',
        KIMI_MODEL: 'fixture-kimi',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"event":"session_started"'));
    child.stdin.write(`${JSON.stringify({ id: 'busy-turn', method: 'session.submit', params: { content: 'hold the turn' } })}\n`);
    await providerRequest;
    child.stdin.write(`${JSON.stringify({
      id: 'busy-reconfigure-request',
      method: 'runtime.intelligence.reconfigure',
      params: { request_id: 'busy-reconfigure', provider: 'kimi-api', model: 'fixture-kimi' },
    })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'runtime_intelligence_reconfiguration'
      && event.request_id === 'busy-reconfigure'
      && event.terminal_state === 'refused'));
    const busyEvents = readJsonlFileFromText(stdout);
    const busy = busyEvents.find((event) => event.event === 'runtime_intelligence_reconfiguration' && event.request_id === 'busy-reconfigure');
    assert.equal(busy?.terminal_state, 'refused', stdout);
    assert.equal(busy?.reason, 'runtime_not_at_clean_turn_boundary', stdout);

    releaseProvider();
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"event":"carrier_turn_completed"'));
    child.stdin.end(`${JSON.stringify({ id: 'close-after-busy', method: 'session.close', params: {} })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, stderr);
    assert.equal(readJsonlFileFromText(stdout).some((event) => event.event === 'session_closed'), true);
  } finally {
    releaseProvider();
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime serves the complete session-scoped artifact HTTP surface', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-artifact-e2e-'));
  const sessionId = 'artifact-e2e';
  const htmlPath = join(siteRoot, 'report.html');
  const audioPath = join(siteRoot, 'briefing.wav');
  const outsideRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-artifact-outside-'));
  const outsidePath = join(outsideRoot, 'outside.html');
  writeFileSync(htmlPath, '<!doctype html><h1>Spawned artifact</h1>', 'utf8');
  writeFileSync(audioPath, Buffer.from('RIFF____WAVEfmt data'));
  writeFileSync(outsidePath, '<!doctype html><h1>Outside</h1>', 'utf8');
  const providerBodies = [];
  const provider = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      providerBodies.push(JSON.parse(body));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'artifact follow-up complete' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const providerAddress = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--health-port', '0',
      '--no-events',
      '--identity', 'narada.test',
      '--session', sessionId,
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${providerAddress.port}/`,
        OPENAI_API_KEY: 'artifact-e2e-key',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => text.split(/\r?\n/).some((line) => {
      try {
        return JSON.parse(line).event === 'session_started';
      } catch {
        return false;
      }
    }));
    const started = readJsonlFileFromText(stdout).find((event) => event.event === 'session_started');
    const endpoint = started.health_endpoint;
    const register = async (payload) => fetch(new URL(`/sessions/${sessionId}/artifacts`, endpoint), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const htmlRegistration = await register({ source_path: htmlPath, kind: 'html', title: 'Spawned report' });
    assert.equal(htmlRegistration.status, 201);
    const htmlRegistered = await htmlRegistration.json();
    const htmlArtifactId = htmlRegistered.artifact.artifact_id;

    const indexResponse = await fetch(new URL(`/sessions/${sessionId}/artifacts`, endpoint));
    assert.equal(indexResponse.status, 200);
    const index = await indexResponse.json();
    assert.ok(index.artifacts.some((artifact) => artifact.artifact_id === htmlArtifactId));
    const metadataResponse = await fetch(new URL(`/sessions/${sessionId}/artifacts/${htmlArtifactId}`, endpoint));
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json();
    assert.equal(metadata.artifact.artifact_id, htmlArtifactId);
    assert.equal(metadata.artifact.render.sandbox.allow_top_navigation, false);

    const htmlContent = await fetch(new URL(`/sessions/${sessionId}/artifacts/${htmlArtifactId}/content`, endpoint));
    assert.equal(htmlContent.status, 200);
    assert.equal(htmlContent.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await htmlContent.text(), /Spawned artifact/);
    const presented = await fetch(new URL(`/sessions/${sessionId}/artifacts/${htmlArtifactId}/message`, endpoint), {
      method: 'POST',
      body: JSON.stringify({ text: 'The spawned report is ready.', request_id: 'artifact-message-1' }),
    });
    assert.equal(presented.status, 201);
    const presentedBody = await presented.json();
    assert.equal(presentedBody.event.event, 'assistant_message');
    assert.equal(presentedBody.event.request_id, 'artifact-message-1');
    assert.equal(presentedBody.event.content.at(-1).artifact_id, htmlArtifactId);

    child.stdin.write(`${JSON.stringify({ id: 'artifact-follow-up', method: 'session.submit', params: { content: 'Summarize the report artifact.' } })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'carrier_turn_completed'));
    const followUpRequest = providerBodies.at(-1);
    const presentedAssistantMessage = followUpRequest?.messages?.find((message) => message.role === 'assistant');
    assert.match(presentedAssistantMessage?.content ?? '', /The spawned report is ready\./);
    assert.match(presentedAssistantMessage?.content ?? '', new RegExp(htmlArtifactId));
    assert.equal((presentedAssistantMessage?.content ?? '').includes('[object Object]'), false);

    const audioRegistration = await register({ source_path: audioPath, kind: 'audio', title: 'Spawned briefing' });
    assert.equal(audioRegistration.status, 201);
    const audioRegistered = await audioRegistration.json();
    const audioArtifactId = audioRegistered.artifact.artifact_id;
    const audioContent = await fetch(new URL(`/sessions/${sessionId}/artifacts/${audioArtifactId}/content`, endpoint));
    assert.equal(audioContent.status, 200);
    assert.equal(audioContent.headers.get('content-type'), 'audio/wav');
    assert.equal(Buffer.from(await audioContent.arrayBuffer()).toString('utf8'), 'RIFF____WAVEfmt data');
    const audioMessage = await fetch(new URL(`/sessions/${sessionId}/artifacts/${audioArtifactId}/message`, endpoint), {
      method: 'POST',
      body: JSON.stringify({ text: 'The audio briefing is ready.' }),
    });
    assert.equal(audioMessage.status, 201);

    const mismatch = await fetch(new URL('/sessions/other-session/artifacts', endpoint));
    assert.equal(mismatch.status, 404);
    const missing = await fetch(new URL(`/sessions/${sessionId}/artifacts/missing-artifact`, endpoint));
    assert.equal(missing.status, 404);
    const traversal = await fetch(new URL(`/sessions/${sessionId}/artifacts/${encodeURIComponent('../outside')}/content`, endpoint));
    assert.equal(traversal.status, 404);
    const outside = await register({ source_path: outsidePath, kind: 'html', title: 'Outside root' });
    assert.equal(outside.status, 403);

    const revoke = await fetch(new URL(`/sessions/${sessionId}/artifacts/${htmlArtifactId}`, endpoint), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'revoked', reason: 'spawned_artifact_revoke' }),
    });
    assert.equal(revoke.status, 200);
    const archive = await fetch(new URL(`/sessions/${sessionId}/artifacts/${htmlArtifactId}`, endpoint), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'archived', reason: 'spawned_artifact_archive' }),
    });
    assert.equal(archive.status, 200);
    const invalidTransition = await fetch(new URL(`/sessions/${sessionId}/artifacts/${htmlArtifactId}`, endpoint), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'active', reason: 'spawned_artifact_invalid_transition' }),
    });
    assert.equal(invalidTransition.status, 409);

    const exited = once(child, 'exit');
    child.stdin.end(`${JSON.stringify({ id: 'close-artifact', method: 'session.close' })}\n`);
    const [exitCode] = await exited;
    assert.equal(exitCode, 0, stderr);
    const eventsPath = resolveNaradaSitePaths({ siteRoot, sessionId }).narsEventsPath;
    const events = readJsonlFile(eventsPath);
    assert.ok(events.some((event) => event.event === 'assistant_message' && event.artifact_id === htmlArtifactId));
    assert.ok(events.some((event) => event.event === 'session_artifact_lifecycle_transition' && event.artifact_id === htmlArtifactId));
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(outsideRoot, { recursive: true, force: true });
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime consumes the detached control sideband without raw JSONL', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-detached-control-e2e-'));
  const sessionId = 'detached-control-e2e';
  const paths = resolveNaradaSitePaths({ siteRoot, sessionId });
  mkdirSync(dirname(paths.narsControlPath), { recursive: true });
  writeFileSync(paths.narsControlPath, '', 'utf8');
  let providerCalls = 0;
  let providerBody = null;
  const provider = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      providerCalls += 1;
      providerBody = JSON.parse(body);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'sideband complete' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--identity', 'narada.test',
      '--session', sessionId,
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'detached-control-key',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '0',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForFileCondition(paths.narsEventsPath, (text) => text.includes('"event":"session_started"'));

    const createdAt = new Date().toISOString();
    const controlRecord = {
      schema: 'narada.carrier.control.input_event.v1',
      control_event_id: 'control_detached_1',
      input_event_id: 'input_detached_1',
      written_at: createdAt,
      input: {
        schema: 'narada.carrier.input_event.v1',
        event_id: 'input_detached_1',
        source_kind: 'operator',
        source_id: 'detached-control-test',
        transport: 'control_jsonl',
        delivery_mode: 'admit_for_current_turn',
        hold_condition: null,
        content: 'detached sideband input',
        created_at: createdAt,
        authority_ref: 'detached-control-authority',
        directive_id: null,
        metadata: {},
      },
    };
    const serialized = JSON.stringify(controlRecord);
    appendFileSync(paths.narsControlPath, serialized.slice(0, -1), 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(providerCalls, 0);
    appendFileSync(paths.narsControlPath, `${serialized.slice(-1)}\n`, 'utf8');
    await waitForCondition(() => providerCalls === 1, 5000);
    await waitForFileCondition(paths.narsEventsPath, (text) => text.includes('"event":"carrier_turn_completed"'));
    assert.equal(providerBody?.messages?.at(-1)?.content, 'detached sideband input');

    const exited = once(child, 'exit');
    appendFileSync(paths.narsControlPath, `${JSON.stringify({
      id: 'close-detached',
      method: 'session.close',
      params: { source: 'detached-control-test' },
    })}\n`, 'utf8');
    const [exitCode] = await exited;
    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, /Session/);
    const events = readJsonlFile(paths.narsEventsPath);
    assert.ok(events.some((event) => event.event === 'session_control_accepted' && event.request_id === 'input_detached_1'));
    assert.ok(events.some((event) => event.event === 'carrier_turn_completed'));
    assert.ok(events.some((event) => event.event === 'session_closed' && event.request_id === 'close-detached'));
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime handles WebSocket reads, controls, errors, and isolated subscriptions', { timeout: 20000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-websocket-control-e2e-'));
  const sessionId = 'websocket-control-e2e';
  let providerCalls = 0;
  const provider = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      providerCalls += 1;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'websocket complete' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  let first = null;
  let second = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--health-port', '0',
      '--event-host',
      '--event-port', '0',
      '--identity', 'narada.test',
      '--session', sessionId,
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'websocket-control-key',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '1',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '1',
        NARADA_AGENT_RUNTIME_HEALTH_HOST: '127.0.0.1',
        NARADA_AGENT_RUNTIME_EVENTS_HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await waitForCapturedOutput(child, () => stdout, (text) => text.split(/\r?\n/).some((line) => {
      try {
        const event = JSON.parse(line);
        return event.event === 'session_started';
      } catch {
        return false;
      }
    }));
    const started = readJsonlFileFromText(stdout).find((event) => event.event === 'session_started');
    assert.match(started?.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);

    first = await connectWebSocket(started.event_endpoint);
    second = await connectWebSocket(started.event_endpoint);
    assert.equal((await nextWebSocketJson(first)).event, 'websocket_connected');
    assert.equal((await nextWebSocketJson(second)).event, 'websocket_connected');
    for (const client of [first, second]) {
      client.sendJson({
        id: `subscribe-${client === first ? 'first' : 'second'}`,
        method: 'session.events.subscribe',
        params: { include_replay: false, subscription_id: 'shared-subscription' },
      });
    }
    for (const client of [first, second]) {
      const subscribed = await nextWebSocketJson(client);
      assert.equal(subscribed.event, 'session_events_subscription_started');
      assert.equal(subscribed.subscription_id, 'shared-subscription');
      assert.equal((await nextWebSocketJson(client)).event, 'session_events_replay_completed');
    }

    first.sendText('{');
    const invalidJson = await nextWebSocketUntil(first, (frame) => frame.event === 'websocket_error' && frame.code === 'invalid_json');
    assert.equal(invalidJson.code, 'invalid_json');
    first.sendJson({ id: 'bad-view', method: 'session.events.subscribe', params: { view: 'not-a-view' } });
    const malformedSubscription = await nextWebSocketUntil(first, (frame) => frame.request_id === 'bad-view');
    assert.equal(malformedSubscription.code, 'invalid_session_event_view');
    first.sendJson({ id: 'bad-params', method: 'session.events.subscribe', params: null });
    const malformedParams = await nextWebSocketUntil(first, (frame) => frame.request_id === 'bad-params');
    assert.equal(malformedParams.code, 'invalid_session_event_params');
    first.sendJson({ id: 'bad-page-size', method: 'session.events.read', params: { page_size: 'not-a-number' } });
    const malformedPageSize = await nextWebSocketUntil(first, (frame) => frame.request_id === 'bad-page-size');
    assert.equal(malformedPageSize.code, 'invalid_session_event_page_size');
    first.sendText('null');
    const invalidRequest = await nextWebSocketUntil(first, (frame) => frame.code === 'invalid_websocket_request');
    assert.equal(invalidRequest.code, 'invalid_websocket_request');
    first.sendJson({ id: 'read-1', method: 'session.events.read', params: { direction: 'backward', limit: 2 } });
    const readPage = await nextWebSocketUntil(first, (frame) => frame.event === 'session_events_read' && frame.request_id === 'read-1');
    assert.equal(readPage.source, 'events_jsonl');
    assert.equal(readPage.cursor.namespace, 'durable');
    assert.ok(readPage.events.some((event) => event.event === 'session_started'));

    first.sendJson({
      id: 'bad-carrier',
      method: 'carrier.input.deliver',
      params: { input: 'not-an-input-event' },
    });
    const badCarrier = await nextWebSocketUntil(first, (frame) => frame.request_id === 'bad-carrier');
    assert.equal(badCarrier.code, 'invalid_carrier_input');
    first.sendJson({ id: 'unsupported-1', method: 'legacy.mutate', params: {} });
    const unsupported = await nextWebSocketUntil(first, (frame) => frame.request_id === 'unsupported-1');
    assert.equal(unsupported.code, 'unsupported_session_control');

    first.sendJson({
      id: 'replace-first-subscription',
      method: 'session.events.subscribe',
      params: { include_replay: false, subscription_id: 'shared-subscription', view: 'conversation' },
    });
    assert.equal((await nextWebSocketJson(first)).event, 'session_events_subscription_started');
    assert.equal((await nextWebSocketJson(first)).event, 'session_events_replay_completed');
    first.close();
    first = null;

    second.sendJson({
      id: 'carrier-input-1',
      method: 'carrier.input.deliver',
      params: {
        input: {
          schema: 'narada.carrier.input_event.v1',
          event_id: 'input_websocket_1',
          source_kind: 'operator',
          source_id: 'websocket-control-test',
          transport: 'carrier_server_api',
          delivery_mode: 'admit_for_current_turn',
          hold_condition: null,
          content: 'websocket carrier input',
          created_at: '2026-07-16T00:00:00.000Z',
          authority_ref: null,
          directive_id: null,
          metadata: {},
        },
      },
    });
    const secondCompleted = await nextWebSocketUntil(second, (frame) => frame.event === 'session_event' && frame.payload?.event === 'carrier_turn_completed');
    assert.equal(secondCompleted.subscription_id, 'shared-subscription');
    assert.equal(providerCalls, 1);

    const exited = once(child, 'exit');
    second.sendJson({ id: 'close-websocket', method: 'session.close', params: {} });
    await nextWebSocketUntil(second, (frame) => frame.event === 'session_event' && frame.payload?.event === 'session_closed');
    second.close();
    const [exitCode] = await exited;
    assert.equal(exitCode, 0, stderr);
  } finally {
    first?.close();
    second?.close();
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime exposes active and completed FIFO queue state without provider overlap', { timeout: 10000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-fifo-e2e-'));
  let releaseFirst;
  let markFirstRequest;
  const firstRequest = new Promise((resolve) => { markFirstRequest = resolve; });
  const providerOrder = [];
  let providerCalls = 0;
  const provider = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      providerCalls += 1;
      if (providerCalls === 1) markFirstRequest();
      const parsed = JSON.parse(body);
      providerOrder.push(parsed.messages.filter((message) => message.role === 'user').at(-1)?.content);
      const complete = () => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `done-${providerCalls}` } }] }));
      };
      if (providerCalls === 1) {
        releaseFirst = complete;
      } else complete();
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'fifo-e2e'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'fifo-key' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'turn-first', method: 'session.submit', params: { content: 'first' } })}\n${JSON.stringify({ id: 'turn-second', method: 'session.submit', params: { content: 'second' } })}\n${JSON.stringify({ id: 'health-active', method: 'session.health' })}\n${JSON.stringify({ id: 'recovery-active', method: 'session.recovery' })}\n`);
    await firstRequest;
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('health-active') && text.includes('recovery-active'));
    assert.equal(providerCalls, 1);
    const activeEvents = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const activeHealth = activeEvents.find((event) => event.event === 'session_health' && event.request_id === 'health-active');
    assert.equal(activeHealth?.operator_input_queue?.pending_count, 2);
    assert.equal(activeHealth?.runtime_host_state?.runtime_host_state, 'serving');
    assert.equal(activeEvents.find((event) => event.event === 'session_started')?.runtime_host_state?.runtime_host_state, 'serving');
    assert.equal(activeEvents.find((event) => event.event === 'session_recovery' && event.request_id === 'recovery-active')?.operator_input_queue?.pending_count, 2);
    releaseFirst();
    await waitForCapturedOutput(child, () => stdout, (text) => (text.match(/carrier_turn_completed/g) ?? []).length === 2);
    child.stdin.end(`${JSON.stringify({ id: 'health-completed', method: 'session.health' })}\n${JSON.stringify({ id: 'recovery-completed', method: 'session.recovery' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(providerOrder, ['first', 'second']);
    assert.equal(providerCalls, 2);
    assert.equal(events.find((event) => event.event === 'session_health' && event.request_id === 'health-completed')?.operator_input_queue?.pending_count, 0);
    assert.equal(events.find((event) => event.event === 'session_recovery' && event.request_id === 'recovery-completed')?.operator_input_queue?.pending_count, 0);
    const requestStates = (requestId) => events
      .filter((event) => event.event === 'runtime_request_state_transition' && event.request_id === requestId)
      .map((event) => event.request_state);
    assert.deepEqual(requestStates('turn-first'), ['received', 'scheduled', 'running', 'completed']);
    assert.deepEqual(requestStates('turn-second'), ['received', 'scheduled', 'running', 'completed']);
    assert.deepEqual(requestStates('health-active'), []);
    assert.deepEqual(requestStates('recovery-active'), ['received', 'scheduled', 'running', 'completed']);
    assert.deepEqual(requestStates('health-completed'), []);
    assert.deepEqual(requestStates('recovery-completed'), ['received', 'scheduled', 'running', 'completed']);
    assert.deepEqual(requestStates('close-1'), ['received', 'scheduled', 'waiting', 'running', 'completed']);
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime keeps close request waiting until active request is settled', { timeout: 10000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-close-wait-e2e-'));
  let markRequestReceived;
  let releaseProvider;
  const requestReceived = new Promise((resolve) => { markRequestReceived = resolve; });
  const provider = createServer((request, response) => {
    request.resume();
    markRequestReceived();
    releaseProvider = () => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'released' } }] }));
    };
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'close-wait-e2e'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: 'http://127.0.0.1:' + address.port + '/', OPENAI_API_KEY: 'close-wait-key' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(JSON.stringify({ id: 'turn-active', method: 'session.submit', params: { content: 'hold' } }) + '\n');
    await requestReceived;
    child.stdin.write(JSON.stringify({ id: 'close-wait', method: 'session.close' }) + '\n');
    await waitForCapturedOutput(child, () => stdout, (text) => (
      text.includes('"request_id":"close-wait"')
      && text.includes('"request_state":"waiting"')
    ));
    assert.equal(typeof releaseProvider, 'function');
    releaseProvider();
    await waitForCapturedOutput(child, () => stdout, (text) => (
      text.includes('"request_id":"close-wait"')
      && text.includes('"request_state":"completed"')
    ));
    child.stdin.end();
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const closeStates = events
      .filter((event) => event.event === 'runtime_request_state_transition' && event.request_id === 'close-wait')
      .map((event) => event.request_state);
    assert.deepEqual(closeStates, ['received', 'scheduled', 'waiting', 'running', 'completed']);
    const closeCompleted = events.find((event) => (
      event.event === 'runtime_request_state_transition'
      && event.request_id === 'close-wait'
      && event.request_state === 'completed'
    ));
    const sessionClosed = events.find((event) => event.event === 'session_closed');
    assert.ok(closeCompleted?.event_sequence < sessionClosed?.event_sequence);
    assert.ok(events.some((event) => event.event === 'session_shutdown_state_transition' && event.shutdown_state === 'closed'));
  } finally {
    if (child && child.exitCode === null) child.kill();
    provider.closeAllConnections?.();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime exposes failed input as recoverable', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-failed-health-e2e-'));
  const provider = createServer((_request, response) => {
    response.statusCode = 500;
    response.end('provider fixture failure');
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'failed-health-e2e'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'failed-key' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'turn-failed', method: 'session.submit', params: { content: 'fail' } })}\n`);
    await waitForOutput(child, (text) => text.includes('session_control_rejected'));
    child.stdin.end(`${JSON.stringify({ id: 'health-failed', method: 'session.health' })}\n${JSON.stringify({ id: 'recovery-failed', method: 'session.recovery' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const failedHealth = events.find((event) => event.event === 'session_health' && event.request_id === 'health-failed');
    assert.equal(failedHealth?.operator_input_queue?.pending_count, 1);
    assert.equal(failedHealth?.operational_posture, 'request_runtime_failures');
    assert.equal(events.find((event) => event.event === 'session_recovery' && event.request_id === 'recovery-failed')?.operator_input_queue?.pending_count, 1);
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime handles SIGINT and SIGTERM by closing active provider and MCP children', { timeout: 20000 }, async () => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const siteRoot = mkdtempSync(join(tmpdir(), `narada-runtime-${signal.toLowerCase()}-e2e-`));
    mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
    const fixturePath = fileURLToPath(new URL('./fixtures/mcp-echo-server.mjs', import.meta.url));
    writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture.json'), JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [fixturePath], surface_id: 'fixture.surface' } } }), 'utf8');
    let providerCalls = 0;
    let markSecondRequest;
    const secondRequest = new Promise((resolve) => { markSecondRequest = resolve; });
    const provider = createServer((_request, response) => {
      providerCalls += 1;
      if (providerCalls === 1) {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls: [
          { id: 'call-signal', function: { name: 'fixture_echo', arguments: '{"text":"signal"}' } },
        ] } }] }));
      } else markSecondRequest();
    });
    await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
    const address = provider.address();
    try {
      const signalRelay = process.platform === 'win32';
      const entrypoint = fileURLToPath(new URL(signalRelay ? './fixtures/signal-relay-runtime.mjs' : '../bin/narada-agent-runtime-server.mjs', import.meta.url));
      const child = spawnTestChild(process.execPath, [entrypoint, '--raw-jsonl', '--identity', 'narada.test', '--session', `signal-${signal.toLowerCase()}`], {
        env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'signal-fixture-key' },
        stdio: signalRelay ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdin.write(`${JSON.stringify({ id: 'turn-signal', method: 'session.submit', params: { content: 'use tool then wait' } })}\n`);
      await secondRequest;
      const exited = once(child, 'exit');
      if (signalRelay) child.send({ signal });
      else assert.equal(child.kill(signal), true);
      const [exitCode] = await exited;
      assert.equal(exitCode, 0, `${signal}: ${stderr}`);
      const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      assert.ok(events.some((event) => event.event === 'tool_execution_completed' && event.tool_name === 'fixture_echo'), signal);
      assert.ok(events.some((event) => event.event === 'session_turn_cancel_requested'), signal);
      assert.ok(events.some((event) => event.event === 'carrier_turn_failed' && /abort/i.test(event.error)), signal);
      assert.ok(events.some((event) => event.event === 'session_closed' && event.request_id === `signal-close-${signal.toLowerCase()}`), signal);
    } finally {
      await new Promise((resolve) => provider.close(resolve));
      rmSync(siteRoot, { recursive: true, force: true });
    }
  }
});

test('spawned runtime handles Codex subprocess success, malformed JSONL, and non-zero exit', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/codex-exec-fixture.mjs', import.meta.url));
  for (const mode of ['success', 'malformed', 'exit']) {
    const siteRoot = mkdtempSync(join(tmpdir(), `narada-codex-${mode}-e2e-`));
    try {
      const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
      const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', `codex-${mode}`], {
        env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription', NARADA_CODEX_EXEC_COMMAND: process.execPath, NARADA_CODEX_EXEC_PREFIX_ARGS: JSON.stringify([fixturePath, mode]), CODEX_MODEL: 'fixture-codex' }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stdin.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'hello' } })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
      assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, mode);
      const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      if (mode === 'success') assert.ok(events.some((event) => event.event === 'carrier_turn_completed'));
      else assert.ok(events.some((event) => event.event === 'session_control_rejected' && event.request_id === 'turn-1'));
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  }
});

test('spawned runtime cancels a hanging Codex subprocess', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-codex-cancel-e2e-'));
  const fixturePath = fileURLToPath(new URL('./fixtures/codex-exec-fixture.mjs', import.meta.url));
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'codex-cancel'], { env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription', NARADA_CODEX_EXEC_COMMAND: process.execPath, NARADA_CODEX_EXEC_PREFIX_ARGS: JSON.stringify([fixturePath, 'hang']), CODEX_MODEL: 'fixture-codex' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'wait' } })}\n`);
    await waitForOutput(child, (text) => text.includes('carrier_turn_started'));
    child.stdin.write(`${JSON.stringify({ id: 'cancel-1', method: 'session.cancel' })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('carrier_turn_failed'));
    child.stdin.end(`${JSON.stringify({ id: 'health-cancelled', method: 'session.health' })}\n${JSON.stringify({ id: 'recovery-cancelled', method: 'session.recovery' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'session_cancel' && event.cancelled === true));
    assert.ok(events.some((event) => event.event === 'carrier_turn_failed' && /abort/i.test(event.error)));
    assert.equal(events.find((event) => event.event === 'session_health' && event.request_id === 'health-cancelled')?.operator_input_queue?.pending_count, 1);
    assert.equal(events.find((event) => event.event === 'session_recovery' && event.request_id === 'recovery-cancelled')?.operator_input_queue?.pending_count, 1);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime executes every HTTP provider adapter against local endpoints', async () => {
  let expectedCredentialHeader = null;
  let expectedCredentialValue = null;
  const provider = createServer((request, response) => {
    assert.equal(request.headers[expectedCredentialHeader], expectedCredentialValue);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url === '/v1/messages'
      ? { content: [{ type: 'text', text: 'anthropic fixture' }], stop_reason: 'end_turn' }
      : { choices: [{ message: { role: 'assistant', content: 'compatible fixture' } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  const cases = [
    ['kimi-api', 'authorization', 'Bearer SECRET_SENTINEL_KIMI', { KIMI_API_KEY: 'SECRET_SENTINEL_KIMI', KIMI_API_BASE_URL: baseUrl, KIMI_MODEL: 'fixture-kimi' }],
    ['kimi-code-api', 'authorization', 'Bearer SECRET_SENTINEL_KIMI_CODE', { KIMI_CODE_API_KEY: 'SECRET_SENTINEL_KIMI_CODE', KIMI_CODE_API_BASE_URL: baseUrl, KIMI_CODE_MODEL: 'fixture-kimi-code' }],
    ['deepseek-api', 'authorization', 'Bearer SECRET_SENTINEL_DEEPSEEK', { DEEPSEEK_API_KEY: 'SECRET_SENTINEL_DEEPSEEK', DEEPSEEK_API_BASE_URL: baseUrl, DEEPSEEK_MODEL: 'fixture-deepseek' }],
    ['glm-api', 'authorization', 'Bearer SECRET_SENTINEL_GLM', { GLM_API_KEY: 'SECRET_SENTINEL_GLM', GLM_API_BASE_URL: baseUrl, GLM_MODEL: 'fixture-glm' }],
    ['openrouter-api', 'authorization', 'Bearer SECRET_SENTINEL_OPENROUTER', { OPENROUTER_API_KEY: 'SECRET_SENTINEL_OPENROUTER', OPENROUTER_BASE_URL: baseUrl, OPENROUTER_MODEL: 'fixture-openrouter' }],
    ['anthropic-api', 'x-api-key', 'SECRET_SENTINEL_ANTHROPIC', { ANTHROPIC_API_KEY: 'SECRET_SENTINEL_ANTHROPIC', ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_MODEL: 'fixture-anthropic' }],
  ];
  try {
    for (const [providerId, credentialHeader, credentialValue, providerEnv] of cases) {
      expectedCredentialHeader = credentialHeader;
      expectedCredentialValue = credentialValue;
      const siteRoot = mkdtempSync(join(tmpdir(), `narada-${providerId}-e2e-`));
      try {
        const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
        const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', `${providerId}-e2e`], { env: {
          ...process.env,
          OPENAI_API_KEY: 'SECRET_SENTINEL_OPENAI_DECOY',
          OPENAI_BASE_URL: 'http://127.0.0.1:1/decoy',
          ...providerEnv,
          NARADA_SITE_ROOT: siteRoot,
          NARADA_INTELLIGENCE_PROVIDER: providerId,
          NARADA_AI_API_KEY: String(credentialValue).replace(/^Bearer /, ''),
          NARADA_AI_BASE_URL: baseUrl,
        }, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = ''; let stderr = '';
        child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.stdin.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'hello' } })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
        assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, providerId);
        const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
        assert.ok(events.some((event) => event.event === 'carrier_turn_completed'), providerId);
        const eventsPath = resolveNaradaSitePaths({ siteRoot, sessionId: `${providerId}-e2e` }).narsEventsPath;
        const durableEvents = readFileSync(eventsPath, 'utf8');
        const credential = String(credentialValue).replace(/^Bearer /, '');
        for (const rendered of [stdout, stderr, durableEvents, JSON.stringify(events[0])]) {
          assert.equal(rendered.includes(credential), false, `${providerId} leaked selected credential`);
          assert.equal(rendered.includes('SECRET_SENTINEL_OPENAI_DECOY'), false, `${providerId} leaked decoy credential`);
        }
      } finally {
        rmSync(siteRoot, { recursive: true, force: true });
      }
    }
  } finally {
    await new Promise((resolve) => provider.close(resolve));
  }
});

test('spawned runtime cancels an in-flight provider request through JSONL control', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-cancel-e2e-'));
  let requestReceived;
  const received = new Promise((resolve) => { requestReceived = resolve; });
  const provider = createServer(() => { requestReceived(); });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'cancel-e2e'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'fixture-key' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'wait' } })}\n`);
    await received;
    child.stdin.write(`${JSON.stringify({ id: 'cancel-1', method: 'session.cancel' })}\n`);
    await waitForOutput(child, (text) => text.includes('carrier_turn_failed'));
    child.stdin.end(`${JSON.stringify({ id: 'health-cancelled', method: 'session.health' })}\n${JSON.stringify({ id: 'recovery-cancelled', method: 'session.recovery' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'session_cancel' && event.cancelled === true));
    assert.ok(events.some((event) => event.event === 'carrier_turn_failed' && /abort/i.test(event.error)));
    const invocationEvents = events.filter((event) => event.event === 'provider_invocation_state_transition');
    assert.equal(invocationEvents.at(-1)?.invocation_state, 'interrupted');
    assert.ok(invocationEvents.every((event) => event.turn_id && event.turn_id === event.input_event_id));
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime recovers an in-flight queued turn exactly once after forced exit', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-recovery-e2e-'));
  let recover = false; let providerCalls = 0;
  let firstRequestReceived;
  const firstRequest = new Promise((resolve) => { firstRequestReceived = resolve; });
  const provider = createServer((_request, response) => {
    providerCalls += 1;
    if (!recover) { firstRequestReceived(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'recovered' } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
  const args = [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'recovery-e2e'];
  const options = { env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'fixture-key' }, stdio: ['pipe', 'pipe', 'pipe'] };
  try {
    const first = spawnTestChild(process.execPath, args, options);
    first.stdin.write(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'recover me' } })}\n`);
    await firstRequest;
    const firstExit = once(first, 'exit');
    first.kill();
    await firstExit;
    recover = true;
    const second = spawnTestChild(process.execPath, args, options);
    let secondStdout = '';
    second.stdout.setEncoding('utf8'); second.stdout.on('data', (chunk) => { secondStdout += chunk; });
    const recoveredOutput = await waitForOutput(second, (text) => text.includes('carrier_turn_completed'));
    second.stdin.end(`${JSON.stringify({ id: 'health-recovered', method: 'session.health' })}\n${JSON.stringify({ id: 'recovery-recovered', method: 'session.recovery' })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => second.on('exit', resolve)), 0);
    assert.equal(providerCalls, 2);
    assert.equal((recoveredOutput.match(/"event":"carrier_turn_completed"/g) ?? []).length, 1);
    const recoveredEvents = secondStdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(recoveredEvents.find((event) => event.event === 'session_health' && event.request_id === 'health-recovered')?.operator_input_queue?.pending_count, 0);
    assert.equal(recoveredEvents.find((event) => event.event === 'session_recovery' && event.request_id === 'recovery-recovered')?.operator_input_queue?.pending_count, 0);
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime records required MCP startup failure without calling the provider', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-mcp-failure-'));
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  const fixturePath = fileURLToPath(new URL('./fixtures/mcp-exit-server.mjs', import.meta.url));
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture.json'), JSON.stringify({ mcpServers: { broken: { command: process.execPath, args: [fixturePath], surface_id: 'broken.surface', startup_timeout_sec: 1 } } }), 'utf8');
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'mcp-failure'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: 'http://127.0.0.1:1/', OPENAI_API_KEY: 'unused', NARADA_AGENT_CLI_REQUIRE_MCP_FABRIC: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.end(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'hello' } })}\n${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'session_control_rejected' && event.request_id === 'turn-1' && /MCP|mcp/i.test(event.error)));
    assert.equal(events.some((event) => event.event === 'carrier_turn_started'), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime executes a provider-requested tool through the site MCP gateway', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-mcp-e2e-'));
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  const fixturePath = fileURLToPath(new URL('./fixtures/mcp-echo-server.mjs', import.meta.url));
  const disconnectMarker = join(siteRoot, 'mcp-disconnected-once.txt');
  const generatedArtifactPath = join(siteRoot, 'generated-by-mcp.html');
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture.json'), JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [fixturePath, disconnectMarker], surface_id: 'fixture.surface' } } }), 'utf8');
  let providerCalls = 0;
  const provider = createServer((_request, response) => {
    providerCalls += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(providerCalls === 1
      ? { choices: [{ message: { role: 'assistant', tool_calls: [
        { id: 'call-1', function: { name: 'fixture_echo', arguments: '{"text":"hello"}' } },
        { id: 'call-artifact', function: { name: 'fixture_artifact', arguments: JSON.stringify({ path: generatedArtifactPath, content: '<!doctype html><h1>Generated by MCP</h1>' }) } },
        { id: 'call-2', function: { name: 'fixture_denied', arguments: '{}' } },
      ] } }] }
      : { choices: [{ message: { role: 'assistant', content: 'done' } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--health-port', '0', '--identity', 'narada.test', '--session', 'mcp-e2e'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'fixture-key', NARADA_DENIED_CAPABILITY_TOOLS: 'fixture_denied' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'echo hello' } })}\n`);
    await waitForOutput(child, (text) => text.includes('carrier_turn_completed'));
    const started = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).find((event) => event.event === 'session_started');
    assert.match(started.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    const artifactRegistration = await fetch(new URL('/sessions/mcp-e2e/artifacts', started.health_endpoint), {
      method: 'POST',
      body: JSON.stringify({ source_path: generatedArtifactPath, kind: 'html', title: 'MCP generated report' }),
    });
    assert.equal(artifactRegistration.status, 201);
    const registeredArtifact = await artifactRegistration.json();
    const artifactContent = await fetch(new URL(`/sessions/mcp-e2e/artifacts/${registeredArtifact.artifact.artifact_id}/content`, started.health_endpoint));
    assert.equal(artifactContent.status, 200);
    assert.match(await artifactContent.text(), /Generated by MCP/);
    const revokeResponse = await fetch(new URL(`/sessions/mcp-e2e/artifacts/${registeredArtifact.artifact.artifact_id}`, started.health_endpoint), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'revoked', reason: 'runtime_test_revoke', requested_by: 'test' }),
    });
    assert.equal(revokeResponse.status, 200);
    const revokedArtifact = await revokeResponse.json();
    assert.equal(revokedArtifact.artifact_state, 'revoked');
    const archiveResponse = await fetch(new URL(`/sessions/mcp-e2e/artifacts/${registeredArtifact.artifact.artifact_id}`, started.health_endpoint), {
      method: 'PATCH',
      body: JSON.stringify({ lifecycle_state: 'archived', reason: 'runtime_test_archive' }),
    });
    assert.equal(archiveResponse.status, 200);
    const archivedArtifact = await archiveResponse.json();
    assert.equal(archivedArtifact.artifact.lifecycle.state, 'archived');
    child.stdin.end(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(providerCalls, 2);
    assert.equal(readFileSync(disconnectMarker, 'utf8'), 'disconnected-once');
    assert.ok(events.some((event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo'));
    assert.ok(events.some((event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_artifact'));
    assert.ok(events.some((event) => event.event === 'tool_execution_completed' && event.tool_name === 'fixture_echo'));
    const completedExecution = events.find((event) => event.event === 'tool_execution_completed' && event.tool_name === 'fixture_echo');
    assert.match(completedExecution.turn_id, /^input_/);
    assert.equal(completedExecution.input_event_id, completedExecution.turn_id);
    assert.ok(events.some((event) => event.event === 'tool_execution_state_transition'
      && event.execution_state === 'completed'
      && event.execution_id === completedExecution.execution_id
      && event.turn_id === completedExecution.turn_id));
    assert.ok(events.some((event) => event.event === 'session_artifact_registered' && event.artifact_id === registeredArtifact.artifact.artifact_id));
    assert.deepEqual(
      events.filter((event) => event.event === 'session_artifact_lifecycle_transition' && event.artifact_id === registeredArtifact.artifact.artifact_id).map((event) => [event.previous_state, event.artifact_state]),
      [['active', 'revoked'], ['revoked', 'archived']],
    );
    assert.ok(events.some((event) => event.event === 'tool_execution_refused' && event.tool_name === 'fixture_denied'));
    assert.deepEqual(events.filter((event) => event.event === 'carrier_tool_completed').map((event) => event.tool_name), ['fixture_echo', 'fixture_artifact', 'fixture_denied']);
    const eventsPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'mcp-e2e' }).narsEventsPath;
    const projection = await startEventStreamProjection({ childStdin: new PassThrough(), eventHub: createEventHub(), host: '127.0.0.1', port: 0, eventsPath });
    const client = await connectWebSocket(projection.url);
    try {
      await client.nextJson();
      client.sendJson({ id: 'replay-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 100 } });
      const started = await client.nextJson();
      assert.equal(started.replay_source, 'events_jsonl');
      const replay = [];
      for (let index = 0; index < started.replay_count; index += 1) replay.push((await client.nextJson()).payload);
      assert.ok(replay.some((event) => event.event === 'tool_execution_completed' && event.tool_name === 'fixture_echo'));
    } finally {
      client.close(); projection.server.close();
    }
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime submits a turn through the configured local provider endpoint', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-provider-e2e-'));
  const provider = createServer((request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer fixture-key');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'fixture response' } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [binPath, '--raw-jsonl', '--identity', 'narada.test', '--session', 'provider-e2e'], {
      env: { ...process.env, NARADA_SITE_ROOT: siteRoot, NARADA_INTELLIGENCE_PROVIDER: 'openai-api', OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`, OPENAI_API_KEY: 'fixture-key' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'hello' } })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'close-1', method: 'session.close' })}\n`);
    child.stdin.end();
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'carrier_turn_completed'));
    assert.ok(events.some((event) => event.event === 'session_control_response' && event.request_id === 'turn-1'));
    const invocationEvents = events.filter((event) => event.event === 'provider_invocation_state_transition');
    assert.deepEqual(invocationEvents.map((event) => event.invocation_state), ['requested', 'validated', 'shaped', 'dispatched', 'admitting', 'admitted', 'receiving', 'completed']);
    assert.equal(new Set(invocationEvents.map((event) => event.invocation_id)).size, 1);
    assert.ok(invocationEvents.every((event) => event.turn_id && event.turn_id === event.input_event_id));
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('default server path does not construct the legacy server runtime or legacy context', () => {
  const wrapperPath = new URL('../src/server-wrapper.mjs', import.meta.url);
  const source = readFileSync(wrapperPath, 'utf8');
  assert.equal(source.includes('createLegacyRuntimeService'), false);
  assert.equal(source.includes('createCarrierRuntimeContext'), false);
  assert.equal(source.includes('createLegacyProviderCall'), false);
  assert.equal(source.includes('createNarsProviderRuntimeController'), true);
});

test('WebSocket /events replays and reads durable events.jsonl beyond memory buffer', async () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-events-log-test-'));
  try {
    const eventsPath = join(root, 'events.jsonl');
    writeFileSync(eventsPath, `${[
      { event_sequence: 1, sequence: 1, event: 'session_started', session_id: 'runtime-package-test' },
      { event_sequence: 2, sequence: 2, event: 'assistant_message', content: 'durable-old' },
      { event_sequence: 3, sequence: 3, event: 'tool_call', tool_name: 'durable.tool' },
      { event_sequence: 4, sequence: 4, event: 'assistant_message', content: 'durable-new' },
    ].map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
    const childStdin = new PassThrough();
    const hub = createEventHub({ maxBuffer: 1 });
    hub.publish({ event_sequence: 99, event: 'memory_only' });
    const projection = await startEventStreamProjection({ childStdin, eventHub: hub, host: '127.0.0.1', port: 0, eventsPath });
    const client = await connectWebSocket(projection.url);
    try {
      assert.equal((await client.nextJson()).event, 'websocket_connected');
      client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10, since_sequence: 1 } });
      const started = await client.nextJson();
      assert.equal(started.event, 'session_events_subscription_started');
      assert.equal(started.replay_source, 'events_jsonl');
      assert.equal(started.replay_count, 3);
      assert.deepEqual([(await client.nextJson()).payload.event_sequence, (await client.nextJson()).payload.event_sequence, (await client.nextJson()).payload.event_sequence], [2, 3, 4]);
      assert.equal((await client.nextJson()).event, 'session_events_replay_completed');
      client.sendJson({ id: 'read-1', method: 'session.events.read', params: { before_sequence: 4, direction: 'backward', limit: 2 } });
      const read = await client.nextJson();
      assert.equal(read.event, 'session_events_read');
      assert.equal(read.source, 'events_jsonl');
      assert.deepEqual(read.events.map((event) => event.event_sequence), [2, 3]);
      client.sendJson({ id: 'conversation-read-1', method: 'session.events.read', params: { view: 'conversation', limit: 1 } });
      const conversationRead = await client.nextJson();
      assert.equal(conversationRead.event, 'session_events_read');
      assert.equal(conversationRead.view, 'conversation');
      assert.equal(conversationRead.has_more, true);
      assert.deepEqual(conversationRead.events.map((event) => event.event_sequence), [2]);
      const latestClient = await connectWebSocket(projection.url);
      try {
        await latestClient.nextJson();
        latestClient.sendJson({ id: 'latest-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 2 } });
        const latestStarted = await latestClient.nextJson();
        assert.equal(latestStarted.replay_count, 2);
        assert.deepEqual([(await latestClient.nextJson()).payload.event_sequence, (await latestClient.nextJson()).payload.event_sequence], [3, 4]);
      } finally {
        latestClient.close();
      }
      const operationsClient = await connectWebSocket(projection.url);
      try {
        await operationsClient.nextJson();
        operationsClient.sendJson({ id: 'operations-1', method: 'session.events.subscribe', params: { include_replay: true, page_size: 1, view: 'operations' } });
        const operationsStarted = await operationsClient.nextJson();
        assert.equal(operationsStarted.view, 'operations');
        assert.equal(operationsStarted.replay_count, 1);
        assert.equal((await operationsClient.nextJson()).payload.event_sequence, 4);
      } finally {
        operationsClient.close();
      }
    } finally {
      client.close();
      projection.server.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('conversation event streams carry input acknowledgment evidence through replay and live delivery', async () => {
  const root = mkdtempSync(join(tmpdir(), 'runtime-conversation-ack-test-'));
  try {
    const eventsPath = join(root, 'events.jsonl');
    writeFileSync(eventsPath, `${[
      { event_sequence: 1, sequence: 1, event: 'session_started', session_id: 'conversation-ack-test' },
      { event_sequence: 2, sequence: 2, event: 'session_control_accepted', request_id: 'request-1', method: 'session.submit', acceptance_state: 'accepted' },
      { event_sequence: 3, sequence: 3, event: 'input_event_started', request_id: 'request-1', input_event_id: 'input-1' },
      { event_sequence: 4, sequence: 4, event: 'session_control_response', request_id: 'request-1', method: 'session.submit', terminal_state: 'completed' },
    ].map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
    const hub = createEventHub({ maxBuffer: 1 });
    const projection = await startEventStreamProjection({
      childStdin: new PassThrough(),
      eventHub: hub,
      host: '127.0.0.1',
      port: 0,
      eventsPath,
    });
    const client = await connectWebSocket(projection.url);
    try {
      assert.equal((await client.nextJson()).event, 'websocket_connected');
      client.sendJson({
        id: 'conversation-ack-subscribe',
        method: 'session.events.subscribe',
        params: { include_replay: true, max_replay: 100, view: 'conversation' },
      });
      const started = await client.nextJson();
      assert.equal(started.view, 'conversation');
      assert.equal(started.replay_count, 3);
      const replay = [];
      for (let index = 0; index < started.replay_count; index += 1) replay.push((await client.nextJson()).payload);
      assert.deepEqual(replay.map((event) => event.event), [
        'session_control_accepted',
        'input_event_started',
        'session_control_response',
      ]);
      assert.equal((await client.nextJson()).event, 'session_events_replay_completed');

      hub.publish({
        event_sequence: 5,
        sequence: 5,
        event: 'runtime_request_state_transition',
        request_id: 'request-1',
        method: 'session.submit',
        request_state: 'completed',
        terminal_state: 'completed',
      });
      const live = await client.nextJson();
      assert.equal(live.event, 'session_event');
      assert.equal(live.payload.event, 'runtime_request_state_transition');
      assert.equal(live.payload.request_state, 'completed');
    } finally {
      client.close();
      projection.server.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('WebSocket /events isolates same subscription IDs across connections', async () => {
  const hub = createEventHub();
  const projection = await startEventStreamProjection({
    childStdin: new PassThrough(),
    eventHub: hub,
    host: '127.0.0.1',
    port: 0,
  });
  const firstClient = await connectWebSocket(projection.url);
  const secondClient = await connectWebSocket(projection.url);
  try {
    assert.equal((await firstClient.nextJson()).event, 'websocket_connected');
    assert.equal((await secondClient.nextJson()).event, 'websocket_connected');
    const params = { include_replay: false, subscription_id: 'shared' };
    firstClient.sendJson({ id: 'first-subscribe', method: 'session.events.subscribe', params });
    secondClient.sendJson({ id: 'second-subscribe', method: 'session.events.subscribe', params });
    assert.equal((await firstClient.nextJson()).subscription_id, 'shared');
    assert.equal((await secondClient.nextJson()).subscription_id, 'shared');
    assert.equal((await firstClient.nextJson()).event, 'session_events_replay_completed');
    assert.equal((await secondClient.nextJson()).event, 'session_events_replay_completed');
    assert.equal(hub.subscriberCount(), 2);
    firstClient.close();
    await waitForCondition(() => hub.subscriberCount() === 1);
    hub.publish({ event: 'session_status', session_id: 'second-client' });
    const delivered = await secondClient.nextJson();
    assert.equal(delivered.event, 'session_event');
    assert.equal(delivered.subscription_id, 'shared');
    assert.equal(delivered.payload.session_id, 'second-client');
  } finally {
    firstClient.close();
    secondClient.close();
    projection.server.close();
  }
});

test('carrier runtime package boundary forbids agent-cli adapter imports', () => {
  const runtimePackage = JSON.parse(readFileSync(new URL('../../carrier-runtime/package.json', import.meta.url), 'utf8'));
  assert.equal(runtimePackage.dependencies?.['@narada2/agent-cli'], undefined);
  assert.equal(runtimePackage.exports?.['./compat-agent-cli-runtime-adapter'], undefined);
  const runtimeRoot = fileURLToPath(new URL('../../carrier-runtime', import.meta.url));
  const offending = walkFiles(join(runtimeRoot, 'src'))
    .filter((path) => /\.mjs$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return /@narada2\/agent-cli|compat-agent-cli-runtime-adapter/.test(text) ? [path] : [];
    });
  assert.deepEqual(offending, [], 'carrier-runtime must not import agent-cli or reintroduce the retired adapter');
});
test('carrier runtime package boundary keeps client attach strings in projection registry', () => {
  const runtimeRoot = fileURLToPath(new URL('../../carrier-runtime', import.meta.url));
  const offending = walkFiles(join(runtimeRoot, 'src'))
    .filter((path) => /\.mjs$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return /narada-agent-web-ui|narada-agent-cli --attach|agent_web_ui:|agent_cli:/.test(text) ? [path] : [];
    });
  assert.deepEqual(offending, [], 'carrier-runtime must consume registry-backed attach commands instead of hardcoding client projection command strings');
});
test('runtime event helpers are exported from the canonical runtime-server helper module', () => {
  const fixtures = [
    null,
    {
      event: 'session_started',
      timestamp: '2026-06-23T00:00:00.000Z',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      mcp_operational_state: 'startup_degraded',
      mcp_startup_failure_count: 1,
      mcp_startup_failure_summary: '1 (fixture:mcp_stdout_pollution)',
      mcp_runtime_fault_count: 0,
      mcp_runtime_fault_summary: '0',
      mcp_preflight_recommended_action: 'repair_mcp',
      mcp_preflight_recommended_action_display: 'Repair MCP',
      mcp_preflight_recommended_command: 'narada mcp repair',
    },
    {
      event: 'carrier_diagnostic_recorded',
      timestamp: '2026-06-23T00:00:01.000Z',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      diagnostic_code: 'mcp_runtime_fault',
      server_name: 'filesystem',
      tool_name: 'fs_read_file',
      error_code: 'EACCES',
    },
    {
      event: 'session_status',
      timestamp: '2026-06-23T00:00:02.000Z',
      request_id: 'status-1',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      recommended_action: 'recover_session',
      recommended_action_display: 'Recover session',
      recommended_command: 'narada-agent-cli --session-recover',
      session_event_count: 2,
    },
    {
      event: 'session_operations',
      timestamp: '2026-06-23T00:00:03.000Z',
      request_id: 'ops-1',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      operation: { operation_event_summary: '1 active operation' },
      handoffs: { session_operations: 'narada-agent-cli --session-operations' },
    },
  ];
  for (const [helperName, canonicalHelper] of Object.entries(canonicalRuntimeEvents)) {
    for (const event of fixtures) {
      assert.notEqual(canonicalHelper(event), undefined, `${helperName} did not accept ${event?.event ?? 'null'}`);
    }
  }
});

test('agent-web-ui launch host renderer does not present agent-cli projection text', () => {
  const rendered = formatHostStatusEvent({
    event: 'session_started',
    agent_id: 'resident',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'sonar' },
      local_agent_id: 'resident',
      role: 'resident',
      canonical_agent_id: 'sonar.resident',
      display: 'sonar.resident',
      legacy_agent_id: 'resident',
    },
    session_id: 'runtime-web-ui-host-test',
    operator_surface_kind: 'agent-web-ui',
    provider: 'codex-subscription',
    model: 'gpt-5.5',
    mcp_server_count: 15,
    mcp_operational_state: 'healthy',
    health_endpoint: 'http://127.0.0.1:12345/health',
    event_endpoint: 'ws://127.0.0.1:12346/events',
  }).join('\n');
  assert.match(rendered, /agent-runtime-server: sonar\.resident/);
  assert.doesNotMatch(rendered, /agent-runtime-server: resident/);
  assert.match(rendered, /Surface agent-web-ui/);
  assert.match(rendered, /Launch   narada-agent-web-ui --event-endpoint ws:\/\/127\.0\.0\.1:12346\/events --health-endpoint http:\/\/127\.0\.0\.1:12345\/health/);
  assert.equal(rendered.includes('agent-cli:'), false);
  assert.equal(rendered.includes('operator >'), false);
});

test('runtime host renderer projects resolved provider and explicit MCP scope', () => {
  const rendered = formatHostStatusEvent({
    event: 'session_started',
    agent_id: 'resident',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'sonar' },
      local_agent_id: 'resident',
      role: 'resident',
      display: 'sonar.resident',
    },
    session_id: 'runtime-web-ui-metadata-test',
    operator_surface_kind: 'agent-web-ui',
    provider: 'kimi-code-api',
    model: 'kimi-k2.7',
    mcp_scope: 'none',
    mcp_server_count: 0,
    mcp_operational_state: 'disabled',
  }).join('\n');
  assert.match(rendered, /Provider kimi-code-api/);
  assert.match(rendered, /Model    kimi-k2\.7/);
  assert.match(rendered, /MCP      disabled \(scope=none\)/);
  assert.doesNotMatch(rendered, /unknown/);
});

function walkFiles(root) {
  const entries = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walkFiles(path));
    else entries.push(path);
  }
  return entries;
}

test('runtime server package boundary forbids direct agent-cli imports', () => {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  assert.equal(packageJson.dependencies['@narada2/agent-cli'], undefined);
  const offending = walkFiles(join(packageRoot, 'src'))
    .filter((path) => /\.mjs$/.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return /from ['"]@narada2\/agent-cli|import\(['"]@narada2\/agent-cli/.test(text) ? [path] : [];
    });
  assert.deepEqual(offending, [], 'agent-runtime-server must not import @narada2/agent-cli directly; use runtime-owned packages or explicit adapter packages');
});

test('runtime server creates a governed delegated authority handoff for the carrier substrate', () => {
  assert.deepEqual(createDelegatedAuthorityHandoff({
    args: ['--identity', 'narada.test', '--session', 'runtime-package-test'],
    env: {
      NARADA_SITE_ROOT: 'D:/code/narada.test',
      NARADA_AGENT_START_EVENT_ID: 'evt_test',
      NARADA_AUTHORITY_REF: 'task:1328',
    },
    generatedAt: '2026-06-23T00:00:00.000Z',
  }), {
    schema: 'narada.nars.delegated_authority_handoff.v1',
    crossing_regime: 'nars_runtime_server_to_carrier_substrate',
    source: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
    },
    target: {
      package: '@narada2/carrier-runtime',
      mode: 'in-process',
    },
    generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'narada' },
      local_agent_id: 'test',
      role: 'test',
      canonical_agent_id: 'narada.test',
      display: 'narada.test',
      legacy_agent_id: 'narada.test',
    },
    session_id: 'runtime-package-test',
    authority_ref: 'task:1328',
    authority_mode: null,
    evidence: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
      codex_admission_id: null,
      authority_source: 'env_ref',
    },
  });
});

test('lifecycle binding derives site-qualified identity ref for role-local launch identity', () => {
  const binding = lifecycleBindingFromArgs(['--identity', 'resident', '--session', 'runtime-package-test'], {
    NARADA_SITE_ROOT: 'D:/code/narada.sonar',
    NARADA_SITE_ID: 'sonar',
    NARADA_AGENT_ROLE: 'resident',
    NARADA_AGENT_START_EVENT_ID: 'evt_test',
  });
  assert.equal(binding.agent_identity_ref.schema, 'narada.agent_identity_ref.v2');
  assert.equal(binding.agent_identity_ref.identity_scope.site_id, 'sonar');
  assert.equal(binding.agent_identity_ref.local_agent_id, 'resident');
  assert.equal(binding.agent_identity_ref.canonical_agent_id, 'sonar.resident');
  assert.equal(binding.agent_identity_ref.legacy_agent_id, 'resident');
});

test('runtime server derives delegated write authority from worker argv when no env authority ref exists', () => {
  assert.deepEqual(createDelegatedAuthorityHandoff({
    args: ['--identity', 'narada.test', '--session', 'runtime-package-test', '--authority', 'write'],
    env: {
      NARADA_SITE_ROOT: 'D:/code/narada.test',
      NARADA_AGENT_START_EVENT_ID: 'evt_test',
    },
    generatedAt: '2026-06-23T00:00:00.000Z',
  }), {
    schema: 'narada.nars.delegated_authority_handoff.v1',
    crossing_regime: 'nars_runtime_server_to_carrier_substrate',
    source: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
    },
    target: {
      package: '@narada2/carrier-runtime',
      mode: 'in-process',
    },
    generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'narada' },
      local_agent_id: 'test',
      role: 'test',
      canonical_agent_id: 'narada.test',
      display: 'narada.test',
      legacy_agent_id: 'narada.test',
    },
    session_id: 'runtime-package-test',
    authority_ref: 'nars-delegated:write:runtime-package-test',
    authority_mode: 'write',
    evidence: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
      codex_admission_id: null,
      authority_source: 'argv_authority',
    },
  });
});

test('event hub supports replay, filtering, and bounded cursors', () => {
  const hub = createEventHub({ maxBuffer: 2 });
  hub.publish({ event: 'session_started', timestamp: '2026-06-23T00:00:00.000Z' });
  hub.publish({ event: 'assistant_message', request_id: 'input_1', timestamp: '2026-06-23T00:00:01.000Z' });
  hub.publish({ event: 'tool_call', request_id: 'input_1', timestamp: '2026-06-23T00:00:02.000Z' });
  assert.deepEqual(hub.replayFor({ maxReplay: 10 }).map((event) => event.event), ['assistant_message', 'tool_call']);
  assert.deepEqual(hub.replayFor({ maxReplay: 0 }), []);
  assert.deepEqual(hub.replayFor({ sinceSequence: 2 }).map((event) => event.event), ['tool_call']);
  assert.deepEqual(hub.replayFor({ filters: { event_kinds: ['assistant_message'] }, maxReplay: 10 }).map((event) => event.event), ['assistant_message']);
  assert.deepEqual(hub.cursor(), { last_sequence: 3, next_sequence: 4 });
});

test('event hub assigns monotonic sequences when incoming events collide with current cursor', () => {
  const hub = createEventHub({ maxBuffer: 10 });
  assert.equal(hub.publish({ event_sequence: 47, sequence: 47, event: 'assistant_message', content: 'artifact presented' }).event_sequence, 47);
  assert.equal(hub.publish({ event_sequence: 47, sequence: 47, event: 'tool_result', tool: 'artifact_present' }).event_sequence, 48);
  assert.equal(hub.publish({ event_sequence: 46, sequence: 46, event: 'assistant_message', content: 'late provider aggregate' }).event_sequence, 49);
  assert.deepEqual(hub.replayFor({ maxReplay: 10 }).map((event) => event.event_sequence), [47, 48, 49]);
  assert.deepEqual(hub.cursor(), { last_sequence: 49, next_sequence: 50 });
});

test('endpoint option parsing does not consume a following flag as a value', () => {
  assert.deepEqual(parseEventStreamOptions([
    '--event-host', '--event-port', '123', '--identity', 'agent',
  ], {}).events, {
    enabled: true,
    host: '127.0.0.1',
    port: 123,
  });
  assert.deepEqual(parseEventStreamOptions([
    '--event-host', '--event-port', '123', '--identity', 'agent',
  ], {}).forwardedArgs, ['--identity', 'agent']);
});

test('WebSocket /events subscribes with replay and forwards protocol frames', async () => {
  assert.deepEqual(parseEventStreamOptions(['--event-host', '127.0.0.1', '--event-port', '0', '--no-health']).events, {
    enabled: true,
    host: '127.0.0.1',
    port: 0,
  });
  const childStdin = new PassThrough();
  let written = '';
  childStdin.setEncoding('utf8');
  childStdin.on('data', (chunk) => { written += chunk; });
  const writtenFrameCount = () => written.trim().split(/\r?\n/).filter(Boolean).length;
  const waitForWrittenFrameCount = (count) => new Promise((resolve) => {
    if (writtenFrameCount() >= count) {
      resolve();
      return;
    }
    const onData = () => {
      if (writtenFrameCount() >= count) {
        childStdin.off('data', onData);
        resolve();
      }
    };
    childStdin.on('data', onData);
  });
  const hub = createEventHub();
  hub.publish({ event: 'session_started', agent_id: 'narada.test', session_id: 'runtime-package-test' });
  const projection = await startEventStreamProjection({ childStdin, eventHub: hub, host: '127.0.0.1', port: 0 });
  const client = await connectWebSocket(projection.url);
  try {
    assert.equal((await client.nextJson()).event, 'websocket_connected');
    client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10 } });
    const started = await client.nextJson();
    assert.equal(started.event, 'session_events_subscription_started');
    assert.equal(started.transport, 'websocket');
    assert.equal(started.replay_count, 1);
    const replay = await client.nextJson();
    assert.equal(replay.event, 'session_event');
    assert.equal(replay.payload.event, 'session_started');
    assert.equal((await client.nextJson()).event, 'session_events_replay_completed');
    hub.publish({ event: 'assistant_message', request_id: 'input_1', content: 'hello' });
    const live = await client.nextJson();
    assert.equal(live.payload.event, 'assistant_message');
    client.sendJson({ id: 'legacy-1', method: 'conversation.send', params: { message: 'legacy input' } });
    const rejected = await client.nextJson();
    assert.equal(rejected.event, 'websocket_error');
    assert.equal(rejected.code, 'unsupported_session_control');
    client.sendJson({
      id: 'carrier-input-1',
      method: 'carrier.input.deliver',
      params: {
        input: {
          schema: 'narada.carrier.input_event.v1',
          event_id: 'input_carrier_1',
          source_kind: 'operator',
          source_id: 'nars-session-mcp.test',
          transport: 'carrier_server_api',
          delivery_mode: 'admit_for_current_turn',
          hold_condition: null,
          content: 'carrier input',
          created_at: '2026-07-12T00:00:00.000Z',
          authority_ref: null,
          directive_id: null,
          metadata: {},
        },
        delivery_constructor: 'send',
      },
    });
    await waitForWrittenFrameCount(1);
    const carrierInputFrame = JSON.parse(written.trim().split(/\r?\n/).at(-1));
    assert.equal(carrierInputFrame.method, 'session.submit');
    assert.equal(carrierInputFrame.content, 'carrier input');
    assert.equal(carrierInputFrame.event_id, 'input_carrier_1');
    assert.equal(carrierInputFrame.carrier_input_method, 'carrier.input.deliver');
    client.sendJson({ id: 'status-1', method: 'session.health', params: {} });
    await waitForWrittenFrameCount(2);
    assert.equal(JSON.parse(written.trim().split(/\r?\n/).at(-1)).method, 'session.health');
    client.sendJson({ id: 'input-1', method: 'session.submit', params: { content: 'run startup sequence', source: 'manual_operator' } });
    await waitForWrittenFrameCount(3);
    const inputFrame = JSON.parse(written.trim().split(/\r?\n/).at(-1));
    assert.equal(inputFrame.method, 'session.submit');
    assert.deepEqual(inputFrame.params, { content: 'run startup sequence', source: 'manual_operator' });
    client.sendJson({ id: 'recovery-1', method: 'session.recovery', params: {} });
    await waitForWrittenFrameCount(4);
    const recoveryFrame = JSON.parse(written.trim().split(/\r?\n/).at(-1));
    assert.equal(recoveryFrame.method, 'session.recovery');
    assert.deepEqual(recoveryFrame.params, {});
  } finally {
    client.close();
    projection.server.close();
  }
});

test('wrapper event helpers preserve the existing runtime-server event contract', () => {
  const degraded = {
    event: 'session_started',
    timestamp: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    mcp_operational_state: 'startup_degraded',
    mcp_startup_failure_count: 1,
    mcp_startup_failure_summary: '1 (fixture:mcp_stdout_pollution)',
    mcp_runtime_fault_count: 0,
    mcp_runtime_fault_summary: '0',
  };
  assert.equal(
    formatStartupMcpSummary(degraded),
    '[agent-runtime-server] MCP state=startup_degraded | startup=1 (fixture:mcp_stdout_pollution)',
  );
  assert.deepEqual(formatStartupMcpEvent(degraded), {
    schema: 'narada.agent_runtime_server.wrapper_event.v1',
    event: 'mcp_startup_status',
    timestamp: '2026-06-23T00:00:00.000Z',
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
    mcp_operational_state: 'startup_degraded',
    mcp_startup_failure_count: 1,
    mcp_startup_failure_summary: '1 (fixture:mcp_stdout_pollution)',
    mcp_runtime_fault_count: 0,
    mcp_runtime_fault_summary: '0',
  });
  assert.equal(formatStartupMcpSummary({ event: 'session_started', mcp_operational_state: 'healthy' }), null);
  assert.equal(formatStartupMcpSummary({ event: 'session_started' }), null);
  assert.equal(formatStartupMcpEvent({ event: 'session_started' }), null);
});

test('wrapper status snapshots keep the wrapper schema stable', () => {
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
  };
  const snapshot = formatWrapperStatusEvent({
    event: 'session_status',
    request_id: 'status-1',
    agent_id: 'resident',
    agent_identity_ref: agentIdentityRef,
    session_id: 'runtime-package-test',
    request_posture: 'clean',
    operational_posture: 'healthy',
    session_event_count: 2,
  });
  assert.equal(snapshot.schema, 'narada.agent_runtime_server.wrapper_event.v1');
  assert.equal(snapshot.event, 'session_status_snapshot');
  assert.equal(snapshot.source_event, 'session_status');
  assert.equal(snapshot.request_id, 'status-1');
  assert.equal(snapshot.agent_id, 'resident');
  assert.deepEqual(snapshot.agent_identity_ref, agentIdentityRef);
  assert.equal(snapshot.session_id, 'runtime-package-test');
  assert.equal(snapshot.request_posture, 'clean');
  assert.equal(snapshot.operational_posture, 'healthy');
  assert.equal(snapshot.session_event_count, 2);
});

test('lifecycle dispatcher maps NARS events to ordered hook calls', async () => {
  const observed = [];
  const payloads = [];
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'sonar' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    legacy_agent_id: 'resident',
  };
  const handler = {};
  for (const hook of [
    'beforeSessionBind',
    'afterSessionStarted',
    'beforeDirectiveAccept',
    'afterDirectiveAccepted',
    'beforeTurnStart',
    'onToolCall',
    'onToolResult',
    'onCommandResult',
    'afterTurnComplete',
    'beforeSessionClose',
    'afterSessionClosed',
  ]) {
    handler[hook] = (payload) => {
      observed.push(`${hook}:${payload.event_kind ?? 'manual'}`);
      payloads.push(payload);
    };
  }
  const dispatcher = createNarsLifecycleHookDispatcher({ hooks: [handler], clock: () => '2026-06-23T00:00:00.000Z' });
  await dispatchNarsLifecycleHook(dispatcher, 'beforeSessionBind', {
    agent_id: 'narada.test',
    session_id: 'runtime-package-test',
  });
  const baseEvent = {
    agent_id: 'resident',
    agent_identity_ref: agentIdentityRef,
    session_id: 'runtime-package-test',
    request_id: 'input_test',
    turn_id: 'turn_test',
    timestamp: '2026-06-23T00:00:00.000Z',
  };
  for (const event of [
    { event: 'session_started', ...baseEvent },
    { event: 'directive_received', directive_id: 'dir_test', ...baseEvent },
    { event: 'directive_carrier_accepted_recorded', directive_id: 'dir_test', ...baseEvent },
    { event: 'turn_started', ...baseEvent },
    { event: 'tool_call', tool: 'fs_read_file', ...baseEvent },
    { event: 'tool_result', tool: 'fs_read_file', terminal_state: 'completed', ...baseEvent },
    { event: 'carrier_command_result', command: '/status', terminal_state: 'completed', ...baseEvent },
    { event: 'turn_complete', terminal_state: 'completed', ...baseEvent },
    { event: 'session_closed', terminal_state: 'closed', ...baseEvent },
  ]) {
    await dispatchNarsLifecycleHooksForEvent(dispatcher, event);
  }
  assert.deepEqual(observed, [
    'beforeSessionBind:manual',
    'afterSessionStarted:session_started',
    'beforeDirectiveAccept:directive_received',
    'afterDirectiveAccepted:directive_carrier_accepted_recorded',
    'beforeTurnStart:turn_started',
    'onToolCall:tool_call',
    'onToolResult:tool_result',
    'onCommandResult:command_result',
    'afterTurnComplete:turn_complete',
    'beforeSessionClose:session_closed',
    'afterSessionClosed:session_closed',
  ]);
  assert.equal(payloads[1].agent_id, 'resident');
  assert.deepEqual(payloads[1].agent_identity_ref, agentIdentityRef);
});

test('lifecycle dispatcher reports bounded redacted hook failures', async () => {
  const dispatcher = createNarsLifecycleHookDispatcher({
    hooks: [{ onToolCall: () => { throw new Error('API_KEY=abc123 failed'); } }],
    clock: () => '2026-06-23T00:00:00.000Z',
  });
  const result = await dispatchNarsLifecycleHooksForEvent(dispatcher, {
    event: 'tool_call',
    agent_id: 'resident',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'sonar' },
      local_agent_id: 'resident',
      role: 'resident',
      canonical_agent_id: 'sonar.resident',
      display: 'sonar.resident',
      legacy_agent_id: 'resident',
    },
    session_id: 'runtime-package-test',
    request_id: 'input_test',
    turn_id: 'turn_test',
    timestamp: '2026-06-23T00:00:00.000Z',
  });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].code, 'nars_lifecycle_hook_failed');
  assert.equal(result.failures[0].agent_identity_ref.canonical_agent_id, 'sonar.resident');
  assert.equal(result.failures[0].error.message.includes('abc123'), false);
  assert.equal(result.failures[0].error.message.includes('<redacted>'), true);
});

test('lifecycle binding is derived from runtime args before session bind', () => {
  const binding = lifecycleBindingFromArgs(['--identity', 'narada.test', '--session', 'runtime-package-test'], {
    NARADA_SITE_ROOT: 'D:/code/narada.test',
    NARADA_AGENT_START_EVENT_ID: 'evt_test',
  });
  assert.deepEqual({
    ...binding,
  }, {
    agent_id: 'narada.test',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'narada' },
      local_agent_id: 'test',
      role: 'test',
      canonical_agent_id: 'narada.test',
      display: 'narada.test',
      legacy_agent_id: 'narada.test',
    },
    session_id: 'runtime-package-test',
    metadata: {
      site_root: 'D:/code/narada.test',
      agent_start_event_id: 'evt_test',
    },
  });
  assert.equal(binding.agent_identity_ref.schema, 'narada.agent_identity_ref.v2');
  assert.equal(binding.agent_identity_ref.identity_scope.site_id, 'narada');
  assert.equal(binding.agent_identity_ref.local_agent_id, 'test');
  assert.equal(binding.agent_identity_ref.canonical_agent_id, 'narada.test');
  assert.equal(binding.agent_identity_ref.legacy_agent_id, 'narada.test');
});

test('lifecycle binding accepts canonical session environment aliases', () => {
  const baseEnvironment = {
    NARADA_AGENT_ID: 'narada.test',
    NARADA_SITE_ROOT: 'D:/code/narada.test',
  };
  for (const sessionEnvironmentName of ['NARADA_NARS_SESSION_ID', 'NARADA_RUNTIME_SESSION_ID', 'NARADA_CARRIER_SESSION_ID']) {
    const binding = lifecycleBindingFromArgs([], {
      ...baseEnvironment,
      [sessionEnvironmentName]: 'runtime-package-test',
    });
    assert.equal(binding.session_id, 'runtime-package-test');
  }
  assert.throws(
    () => lifecycleBindingFromArgs([], {
      ...baseEnvironment,
      NARADA_NARS_SESSION_ID: 'runtime-package-test',
      NARADA_CARRIER_SESSION_ID: 'different-session',
    }),
    /contradictory_nars_binding:session_id/,
  );
});

test('lifecycle binding refuses missing or contradictory launch binding', () => {
  assert.throws(
    () => lifecycleBindingFromArgs(['--identity', 'narada.test'], { NARADA_SITE_ROOT: 'D:/code/narada.test' }),
    /missing_nars_binding:session_id/,
  );
  assert.throws(
    () => lifecycleBindingFromArgs(['--identity', 'narada.test', '--session', 'runtime-package-test'], {}),
    /missing_nars_binding:site_root/,
  );
  assert.throws(
    () => lifecycleBindingFromArgs(['--identity', 'narada.test', '--session', 'runtime-package-test', '--site-root', 'D:/code/one'], {
      NARADA_SITE_ROOT: 'D:/code/two',
    }),
    /contradictory_nars_binding:site_root/,
  );
});

test('HTTP /health projects compact native session.health response by default', async () => {
  const childStdin = new PassThrough();
  let written = '';
  childStdin.setEncoding('utf8');
  childStdin.on('data', (chunk) => { written += chunk; });
  const waitForFrame = () => new Promise((resolve) => {
    if (written.trim()) {
      resolve();
      return;
    }
    childStdin.once('data', () => resolve());
  });
  const projection = await startHealthProjection({ childStdin, host: '127.0.0.1', port: 0, timeoutMs: 1000 });
  try {
    const responsePromise = new Promise((resolve, reject) => {
      const request = httpRequest(projection.url, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ statusCode: response.statusCode, body }));
      });
      request.on('error', reject);
      request.end();
    });
    await waitForFrame();
    const frame = JSON.parse(written.trim());
    assert.equal(frame.method, 'session.health');
    projection.observe({
      event: 'session_health',
      request_id: frame.id,
      schema: 'narada.nars.health.v1',
      status: 'healthy',
      agent_id: 'narada.test',
      session_id: 'runtime-package-test',
      mcp_tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      mcp: {
        operational_state: 'healthy',
        server_count: 1,
        tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      },
    });
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.schema, 'narada.nars.health.v1');
    assert.equal(body.status, 'healthy');
    assert.equal(body.agent_id, 'narada.test');
    assert.equal(body.mcp_tools, undefined);
    assert.equal(body.mcp.tools, undefined);
    assert.equal(body.mcp.server_count, 1);
  } finally {
    projection.server.close();
  }
});

test('HTTP /health?detail=full preserves native session.health diagnostic payload', async () => {
  const childStdin = new PassThrough();
  let written = '';
  childStdin.setEncoding('utf8');
  childStdin.on('data', (chunk) => { written += chunk; });
  const waitForFrame = () => new Promise((resolve) => {
    if (written.trim()) {
      resolve();
      return;
    }
    childStdin.once('data', () => resolve());
  });
  const projection = await startHealthProjection({ childStdin, host: '127.0.0.1', port: 0, timeoutMs: 1000 });
  try {
    const responsePromise = new Promise((resolve, reject) => {
      const request = httpRequest(`${projection.url}?detail=full`, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ statusCode: response.statusCode, body }));
      });
      request.on('error', reject);
      request.end();
    });
    await waitForFrame();
    const frame = JSON.parse(written.trim());
    projection.observe({
      event: 'session_health',
      request_id: frame.id,
      schema: 'narada.nars.health.v1',
      status: 'healthy',
      mcp_tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      mcp: {
        operational_state: 'healthy',
        server_count: 1,
        tools: [{ server_name: 'test', tool_name: 'large_tool_schema' }],
      },
    });
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.mcp_tools.length, 1);
    assert.equal(body.mcp.tools.length, 1);
  } finally {
    projection.server.close();
  }
});

test('HTTP artifact endpoints register and serve session-scoped HTML and audio artifacts', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-artifact-http-'));
  const sessionPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_artifact_http' }).narsSessionPath;
  const eventsPath = join(dirname(sessionPath), 'events.jsonl');
  const sourcePath = join(dirname(sessionPath), 'report.html');
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, '<!doctype html><h1>NARS Artifact</h1>', 'utf8');
  const childStdin = new PassThrough();
  const eventHub = createEventHub();
  let eventSequence = 0;
  const sessionCore = {
    registerArtifact: (options) => registerNarsArtifact(options),
    appendEvent: (event) => {
      const sequence = ++eventSequence;
      const published = { ...event, event_sequence: sequence, sequence };
      appendFileSync(eventsPath, `${JSON.stringify(published)}\n`, 'utf8');
      eventHub.publish(published);
      return published;
    },
  };
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v2',
    identity_scope: { kind: 'narada_site', site_id: 'carrier_artifact_http' },
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'carrier_artifact_http.resident',
    display: 'carrier_artifact_http.resident',
    legacy_agent_id: 'resident',
  };
  const projection = await startHealthProjection({
    childStdin,
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 1000,
    runtimeContext: {
      identity: 'resident',
      agentIdentityRef,
      session: 'carrier_artifact_http',
      siteRoot,
      sessionPath,
      eventsPath,
      eventHub,
      sessionCore,
    },
  });
  try {
    const registeredResponse = await fetch(new URL('/sessions/carrier_artifact_http/artifacts', projection.url), {
      method: 'POST',
      body: JSON.stringify({ source_path: sourcePath, kind: 'html', title: 'Artifact report' }),
    });
    assert.equal(registeredResponse.status, 201);
    const registered = await registeredResponse.json();
    assert.equal(registered.artifact.title, 'Artifact report');
    assert.equal(registered.artifact.source_path, undefined);
    const malformedSessionResponse = await fetch(new URL('/sessions/%E0%A4%A/artifacts', projection.url));
    assert.equal(malformedSessionResponse.status, 400);
    assert.equal((await malformedSessionResponse.json()).schema, 'narada.nars.artifact_error.v1');
    const artifactId = registered.artifact.artifact_id;

    const metadata = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${artifactId}`, projection.url)).then((response) => response.json());
    assert.equal(metadata.artifact.kind, 'html');
    assert.equal(metadata.artifact.render.sandbox.allow_top_navigation, false);

    const contentResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${artifactId}/content`, projection.url));
    assert.equal(contentResponse.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(contentResponse.headers.get('content-security-policy'), /sandbox/);
    assert.match(await contentResponse.text(), /NARS Artifact/);

    const presentedResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${artifactId}/message`, projection.url), {
      method: 'POST',
      body: JSON.stringify({ text: 'Here is the artifact.' }),
    });
    assert.equal(presentedResponse.status, 201);
    const presented = await presentedResponse.json();
    assert.equal(presented.status, 'presented');
    assert.equal(presented.event.event, 'assistant_message');
    assert.deepEqual(presented.event.agent_identity_ref, agentIdentityRef);
    assert.deepEqual(presented.event.content, [
      { type: 'text', text: 'Here is the artifact.' },
      { type: 'artifact_ref', artifact_id: artifactId, kind: 'html', title: 'Artifact report', render_hint: 'inline' },
    ]);
    assert.equal(eventHub.replayFor({ filters: { event_kinds: ['assistant_message'] }, maxReplay: 10 }).at(-1).artifact_id, artifactId);
    const durableEvents = readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(durableEvents.at(-1).artifact_id, artifactId);

    const audioPath = join(dirname(sessionPath), 'spoken.wav');
    writeFileSync(audioPath, Buffer.from('RIFF____WAVEfmt data'));
    const audioRegisteredResponse = await fetch(new URL('/sessions/carrier_artifact_http/artifacts', projection.url), {
      method: 'POST',
      body: JSON.stringify({ source_path: audioPath, kind: 'audio', title: 'Spoken briefing' }),
    });
    assert.equal(audioRegisteredResponse.status, 201);
    const audioRegistered = await audioRegisteredResponse.json();
    assert.equal(audioRegistered.artifact.kind, 'audio');
    assert.equal(audioRegistered.artifact.content_type, 'audio/wav');
    assert.equal(audioRegistered.artifact.source_path, undefined);
    assert.equal(audioRegistered.artifact.render.media_controls, true);
    const audioArtifactId = audioRegistered.artifact.artifact_id;

    const audioContentResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${audioArtifactId}/content`, projection.url));
    assert.equal(audioContentResponse.headers.get('content-type'), 'audio/wav');
    assert.equal(audioContentResponse.headers.has('content-security-policy'), false);
    assert.equal(Buffer.from(await audioContentResponse.arrayBuffer()).toString('utf8'), 'RIFF____WAVEfmt data');

    const audioPresentedResponse = await fetch(new URL(`/sessions/carrier_artifact_http/artifacts/${audioArtifactId}/message`, projection.url), {
      method: 'POST',
      body: JSON.stringify({ text: 'Spoken version is ready.' }),
    });
    assert.equal(audioPresentedResponse.status, 201);
    const audioPresented = await audioPresentedResponse.json();
    assert.deepEqual(audioPresented.event.content, [
      { type: 'text', text: 'Spoken version is ready.' },
      { type: 'artifact_ref', artifact_id: audioArtifactId, kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' },
    ]);
  } finally {
    projection.server.close();
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('HTTP artifact mutations refuse before session-core authority binding', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-artifact-authority-'));
  const sessionPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_artifact_unbound' }).narsSessionPath;
  const sourcePath = join(dirname(sessionPath), 'report.html');
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, '<!doctype html><h1>Unbound artifact</h1>', 'utf8');
  const projection = await startHealthProjection({
    childStdin: new PassThrough(),
    host: '127.0.0.1',
    port: 0,
    runtimeContext: {
      identity: 'resident',
      session: 'carrier_artifact_unbound',
      siteRoot,
      sessionPath,
      eventsPath: join(dirname(sessionPath), 'events.jsonl'),
    },
  });
  try {
    const response = await fetch(new URL('/sessions/carrier_artifact_unbound/artifacts', projection.url), {
      method: 'POST',
      body: JSON.stringify({ source_path: sourcePath, kind: 'html', title: 'Unbound artifact' }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'session_core_unavailable');
  } finally {
    projection.server.close();
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('narada-owned entrypoint runs the session-core control runtime in process', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-runtime-server-package-'));
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    const child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--identity', 'narada.test',
      '--session', 'runtime-package-test',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AUTHORITY_REF: 'task:1328',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'health-1', method: 'session.health', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'recovery-1', method: 'session.recovery', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'legacy-1', method: 'session.resume', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
    child.stdin.end();
    const exitCode = await new Promise((resolveExit) => child.on('exit', resolveExit));
    assert.equal(exitCode, 0, stderr);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(events[0].event, 'session_started');
    assert.equal(events[0].agent_id, 'narada.test');
    assert.equal(events[0].provider, 'codex-subscription');
    assert.equal(events[0].mcp_scope, 'none');
    assert.equal(events[0].mcp_operational_state, 'disabled');
    assert.equal(events[0].delegated_authority_handoff?.schema, 'narada.nars.delegated_authority_handoff.v1');
    assert.equal(events[0].delegated_authority_handoff?.crossing_regime, 'nars_runtime_server_to_carrier_substrate');
    assert.equal(events[0].delegated_authority_handoff?.target?.package, '@narada2/carrier-runtime');
    assert.equal(events[0].delegated_authority_handoff?.target?.mode, 'in-process');
    assert.equal(events[0].delegated_authority_handoff?.agent_id, 'narada.test');
    assert.equal(events[0].delegated_authority_handoff?.agent_identity_ref?.schema, 'narada.agent_identity_ref.v2');
    assert.equal(events[0].delegated_authority_handoff?.session_id, 'runtime-package-test');
    assert.equal(events[0].delegated_authority_ref, 'task:1328');
    assert.match(events[0].health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.match(events[0].event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
    assert.equal(events.some((event) => event.event === 'session_health' && event.request_id === 'health-1'), true);
    assert.equal(events.some((event) => event.event === 'session_recovery' && event.request_id === 'recovery-1'), true);
    assert.equal(events.some((event) => event.event === 'session_control_rejected' && event.request_id === 'legacy-1'), true);
    assert.equal(events.some((event) => event.event === 'session_closed' && event.request_id === 'close-1'), true);
    assert.equal(stderr.includes('Fatal error'), false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime serves health and durable/live events through advertised projections', { timeout: 15000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-projection-e2e-'));
  const sessionId = 'projection-e2e';
  let child = null;
  let client = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--health-port', '0',
      '--event-host',
      '--event-port', '0',
      '--identity', 'narada.test',
      '--session', sessionId,
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
        NARADA_AUTHORITY_REF: 'task:projection-e2e',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '1',
        NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '1',
        NARADA_AGENT_RUNTIME_HEALTH_HOST: '127.0.0.1',
        NARADA_AGENT_RUNTIME_EVENTS_HOST: '127.0.0.1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const readEvents = () => stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    await waitForCapturedOutput(child, () => stdout, (text) => text
      .split(/\r?\n/)
      .filter(Boolean)
      .some((line) => {
        try {
          return JSON.parse(line).event === 'session_started';
        } catch {
          return false;
        }
      }));
    const started = readEvents().find((event) => event.event === 'session_started');
    assert.match(started?.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
    assert.match(started?.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);

    const healthResponse = await fetch(started.health_endpoint);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.schema, 'narada.nars.health.v1');
    assert.equal(health.status, 'healthy');
    assert.equal(health.mcp_tools, undefined);
    assert.equal(health.mcp?.tools, undefined);

    client = await connectWebSocket(started.event_endpoint);
    assert.equal((await nextWebSocketJson(client)).event, 'websocket_connected');
    client.sendJson({
      id: 'events-1',
      method: 'session.events.subscribe',
      params: { include_replay: true, max_replay: 50, subscription_id: 'events-1' },
    });
    const subscriptionStarted = await nextWebSocketJson(client);
    assert.equal(subscriptionStarted.event, 'session_events_subscription_started');
    assert.equal(subscriptionStarted.replay_source, 'events_jsonl');
    assert.ok(subscriptionStarted.replay_count > 0);
    const replayEvents = [];
    for (let index = 0; index < subscriptionStarted.replay_count; index += 1) {
      const replay = await nextWebSocketJson(client);
      assert.equal(replay.event, 'session_event');
      assert.equal(replay.subscription_id, 'events-1');
      replayEvents.push(replay.payload);
    }
    const replayCompleted = await nextWebSocketJson(client);
    assert.equal(replayCompleted.event, 'session_events_replay_completed');
    assert.equal(replayCompleted.subscription_id, 'events-1');
    assert.equal(replayCompleted.cursor.namespace, 'durable');
    assert.ok(replayEvents.some((event) => event?.event === 'session_started'));

    child.stdin.write(`${JSON.stringify({ id: 'live-health', method: 'session.health', params: {} })}\n`);
    let liveEvent = null;
    for (let index = 0; index < 10; index += 1) {
      const frame = await nextWebSocketJson(client);
      if (frame.event === 'session_event' && frame.payload?.request_id === 'live-health') {
        liveEvent = frame;
        break;
      }
    }
    assert.equal(liveEvent?.subscription_id, 'events-1');
    assert.equal(liveEvent?.payload?.event, 'session_health');
    assert.equal(liveEvent?.cursor?.namespace, 'live');
    assert.equal(liveEvent?.cursor?.sequence, null);
    assert.equal(liveEvent?.payload?.event_sequence, undefined);

    client.close();
    client = await connectWebSocket(started.event_endpoint);
    assert.equal((await nextWebSocketJson(client)).event, 'websocket_connected');
    client.sendJson({
      id: 'events-reconnect',
      method: 'session.events.subscribe',
      params: {
        include_replay: true,
        since_sequence: liveEvent.cursor.sequence,
        subscription_id: 'events-reconnect',
      },
    });
    const reconnectStarted = await nextWebSocketJson(client);
    const reconnectEvents = [];
    for (let index = 0; index < reconnectStarted.replay_count; index += 1) {
      reconnectEvents.push((await nextWebSocketJson(client)).payload);
    }
    await nextWebSocketJson(client);
    assert.equal(reconnectEvents.some((event) => event.event === 'session_started'), true);

    client.close();
    client = null;
    child.stdin.end(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, stderr);
    const durableEvents = readFileSync(resolveNaradaSitePaths({ siteRoot, sessionId }).narsEventsPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(durableEvents.some((event) => event.event === 'session_started'));
    assert.ok(durableEvents.some((event) => event.event === 'session_closed'));
    assert.equal(durableEvents.some((event) => event.event === 'session_health' && event.request_id === 'live-health'), false);
  } finally {
    client?.close();
    if (child && child.exitCode === null) child.kill();
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime exposes bounded terminal request retention and preserves active request readback', { timeout: 60000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-request-retention-e2e-'));
  let holdResponse = null;
  const provider = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      const content = payload.messages?.filter((message) => message.role === 'user').at(-1)?.content;
      if (content === 'hold-active-request') {
        holdResponse = response;
        return;
      }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'retention-ok' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--health-port', '0',
      '--identity', 'narada.test',
      '--session', 'runtime-request-retention-e2e',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'retention-key',
        NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const readEvents = () => stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'session_started'));
    const started = readEvents().find((event) => event.event === 'session_started');
    assert.match(started?.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);

    const terminalRequestIds = Array.from({ length: 101 }, (_, index) => `retention-${index + 1}`);
    child.stdin.write(terminalRequestIds.map((requestId) => `${JSON.stringify({
      id: requestId,
      method: 'session.submit',
      params: { content: requestId },
    })}\n`).join(''));
    await waitForCapturedOutput(child, () => stdout, (text) => {
      const completed = new Set(readEvents()
        .filter((event) => event.event === 'input_event_completed' && event.terminal_state === 'completed')
        .map((event) => event.request_id));
      return terminalRequestIds.every((requestId) => completed.has(requestId));
    }, 30000);

    const health = async () => {
      const response = await fetch(started.health_endpoint);
      assert.equal(response.status, 200);
      return response.json();
    };
    const completedHealth = await health();
    const completedRequests = completedHealth.runtime_requests;
    assert.equal(completedRequests.retention_limit, 100);
    assert.equal(completedRequests.retention_scope, 'terminal_requests_only');
    assert.equal(completedRequests.terminal_request_count, 100);
    assert.ok(completedRequests.retained_request_count >= completedRequests.terminal_request_count);
    assert.equal(completedRequests.state_counts.completed, 100);
    assert.equal(completedRequests.request_refs.some((ref) => ref.request_id === 'retention-1'), false);
    assert.equal(completedRequests.request_refs.some((ref) => ref.request_id === 'retention-101'), true);

    child.stdin.write(`${JSON.stringify({
      id: 'retention-active',
      method: 'session.submit',
      params: { content: 'hold-active-request' },
    })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'input_event_started' && event.request_id === 'retention-active'));
    assert.ok(holdResponse);

    const activeHealth = await health();
    const activeRequests = activeHealth.runtime_requests;
    assert.equal(activeRequests.retention_limit, 100);
    assert.equal(activeRequests.retention_scope, 'terminal_requests_only');
    assert.equal(activeRequests.terminal_request_count, 100);
    assert.ok(activeRequests.active_request_count >= 1);
    const activeRef = activeRequests.request_refs.find((ref) => ref.request_id === 'retention-active');
    assert.ok(activeRef);
    assert.equal(activeRef.terminal_state, null);
    assert.ok(['scheduled', 'running'].includes(activeRef.request_state));

    holdResponse.setHeader('content-type', 'application/json');
    holdResponse.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'active-completed' } }] }));
    await waitForCapturedOutput(child, () => stdout, (text) => hasCapturedJsonEvent(text, (event) => event.event === 'input_event_completed' && event.request_id === 'retention-active' && event.terminal_state === 'completed'));
    child.stdin.end(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
    assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, stderr);
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('spawned runtime applies provider reconfiguration before the next turn', { timeout: 10000 }, async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-provider-reconfigure-e2e-'));
  const observedModels = [];
  const provider = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      observedModels.push(payload.model);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'provider switched' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  let child = null;
  try {
    const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));
    child = spawnTestChild(process.execPath, [
      binPath,
      '--raw-jsonl',
      '--identity', 'narada.test',
      '--session', 'provider-reconfigure-e2e',
    ], {
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${address.port}/`,
        OPENAI_API_KEY: 'provider-reconfigure-key',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.write(`${JSON.stringify({ id: 'reconfigure-1', method: 'runtime.intelligence.reconfigure', params: { model: 'new-model' } })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 'turn-1', method: 'session.submit', params: { content: 'use the new model' } })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('runtime_intelligence_reconfiguration') && text.includes('carrier_turn_completed'));
    child.stdin.write(`${JSON.stringify({ id: 'health-1', method: 'session.health', params: {} })}\n`);
    await waitForCapturedOutput(child, () => stdout, (text) => text.includes('"request_id":"health-1"'));
    child.stdin.end(`${JSON.stringify({ id: 'close-1', method: 'session.close', params: {} })}\n`);
    const exitCode = await new Promise((resolveExit) => child.on('exit', resolveExit));
    assert.equal(exitCode, 0, stderr);
    const events = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const reconfiguration = events.find((event) => event.event === 'runtime_intelligence_reconfiguration');
    const health = events.find((event) => event.event === 'session_health' && event.request_id === 'health-1');
    assert.deepEqual(events
      .filter((event) => event.event === 'provider_runtime_reconfiguration_state_transition')
      .map((event) => event.reconfiguration_state), ['requested', 'validating', 'admitted', 'switching', 'active']);
    assert.equal(reconfiguration?.terminal_state, 'active');
    assert.equal(health?.intelligence?.model, 'new-model');
    assert.deepEqual(observedModels, ['new-model']);
    assert.equal(stdout.includes('provider-reconfigure-key'), false);
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => provider.close(resolve));
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
