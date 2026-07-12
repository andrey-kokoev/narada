import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');

const TEST_ID = 'agent-web-ui-live-delegated-task-launcher-e2e';
const NARADA_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MCP_SURFACES_ROOT = resolve(process.env.NARADA_E2E_MCP_SURFACES_ROOT ?? 'D:/code/mcp-surfaces');
const timeoutMs = Number(process.env.NARADA_E2E_L5_TIMEOUT_MS ?? 90_000);
const siteRoot = mkdtempSync(join(tmpdir(), `${TEST_ID}-`));
const siteId = 'delegation-l5';
const agentId = 'delegation-l5.operator';
const taskRoot = join(siteRoot, '.ai', 'delegated-tasks');
const outputRoot = join(siteRoot, '.ai', 'output');
const workerRunRoot = join(siteRoot, '.ai', 'runtime', 'worker-delegation');
const policyPath = join(siteRoot, '.narada', 'worker-policy.toml');
const delegatedTaskServerPath = join(MCP_SURFACES_ROOT, 'packages', 'delegated-task-mcp', 'dist', 'src', 'main.js');
const narsSessionServerPath = join(MCP_SURFACES_ROOT, 'packages', 'nars-session-mcp', 'dist', 'src', 'main.js');
const runtimeServerPath = join(NARADA_ROOT, 'packages', 'agent-runtime-server', 'bin', 'narada-agent-runtime-server.mjs');
const cliPath = join(NARADA_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js');
const resultPath = join(NARADA_ROOT, 'packages', 'agent-web-ui', '.tmp', 'e2e-results', `${TEST_ID}.json`);
const keepFailureRoot = process.env.NARADA_E2E_KEEP_FAILURE_ROOT === '1';

let provider = null;
let launcherProcess = null;
let sessionMcpProcess = null;
let sessionMcpClient = null;
let sessionRecord = null;
let status = 'failed';
let failureReason = null;
let cleanupStatus = 'passed';

try {
  const missing = [cliPath, runtimeServerPath, delegatedTaskServerPath, narsSessionServerPath].find((path) => !existsSync(path));
  if (missing) {
    status = 'not_run';
    failureReason = `built prerequisite missing: ${missing}`;
    process.exitCode = 2;
  } else {
    await prepareSite();
    provider = await startProviderFixture();
    launcherProcess = spawnTestChild(process.execPath, [
      cliPath,
      'operator-surface',
      'runtime',
      'start',
      'agent-web-ui',
      '--site-root', siteRoot,
      '--target-site-id', siteId,
      '--workspace-root', NARADA_ROOT,
      '--agent', agentId,
      '--runtime', 'narada-agent-runtime-server',
      '--intelligence-provider', 'kimi-code-api',
      '--mcp-scope', 'local-site',
      '--exec',
      '--format', 'human',
    ], {
      cwd: NARADA_ROOT,
      env: {
        ...process.env,
        NARADA_PROVIDER_SECRET_STORE: 'disabled',
        NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
        NARADA_AI_API_KEY: 'l5-fixture-key',
        NARADA_AI_BASE_URL: provider.baseUrl,
        NARADA_AI_MODEL: 'l5-fixture-model',
        NARADA_AI_THINKING: 'low',
        KIMI_CODE_API_KEY: 'l5-fixture-key',
        KIMI_CODE_API_BASE_URL: provider.baseUrl,
        KIMI_CODE_MODEL: 'l5-fixture-model',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const launcherOutput = collectOutput(launcherProcess);
    sessionRecord = await waitFor(() => findSessionRecord(siteRoot, agentId), 'launcher_session_record');
    assert.equal(sessionRecord.launch_operator_surface_kind, 'agent-web-ui');
    assert.equal(sessionRecord.runtime_kind, 'narada-agent-runtime-server');
    const startupEvent = await waitFor(() => readJsonl(sessionRecord.events_path).find((event) => event.event === 'session_started'), 'carrier_start_event');
    assert.equal(startupEvent.mcp_scope, 'local-site', JSON.stringify(startupEvent));
    sessionMcpProcess = spawn(process.execPath, [narsSessionServerPath], {
      cwd: siteRoot,
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_SITE_ID: siteId,
        NARADA_NARS_SESSION_SOURCE_KIND: 'operator',
        NARADA_OPERATOR_ID: agentId,
        NARADA_NARS_SESSION_REQUEST_TIMEOUT_MS: '10000',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    sessionMcpClient = createJsonlClient(sessionMcpProcess, 15000);
    const initialized = await sessionMcpClient.request(1, 'initialize', { protocolVersion: '2024-11-05' });
    assert.equal(initialized.error, undefined, JSON.stringify(initialized));
    const listed = structured(await sessionMcpClient.request(2, 'tools/call', {
      name: 'nars_session_list',
      arguments: { site_id: siteId, limit: 10, include_health: true },
    }));
    const listedSessions = Array.isArray(listed.sessions) ? listed.sessions : [];
    assert.equal(listedSessions.some((entry) => asRecord(entry).session_id === sessionRecord.session_id), true, JSON.stringify(listed));
    const delivered = structured(await sessionMcpClient.request(3, 'tools/call', {
      name: 'nars_session_input_deliver',
      arguments: {
        site_id: siteId,
        session_id: sessionRecord.session_id,
        delivery: 'send',
        idempotency_key: `${TEST_ID}-operator-input`,
        content: 'Run exactly one delegated task through the projected Site MCP. L5_OUTER_MARKER=delegation-l5. Do not perform any other work.',
      },
    }));
    assert.equal(delivered.status, 'admitted', JSON.stringify(delivered));

    await waitFor(() => {
      const events = readJsonl(sessionRecord.events_path);
      return events.some((event) => event.event === 'carrier_tool_completed' && String(event.tool_name ?? event.name ?? '') === 'delegated_task_run')
        && events.some((event) => event.event === 'carrier_turn_completed');
    }, 'delegated_task_carrier_turn');
    const mcpReadyHealth = await waitFor(async () => {
      try {
        const response = await fetch(sessionRecord.health_endpoint);
        if (!response.ok) return false;
        const health = await response.json();
        return health.mcp_operational_state === 'healthy' ? health : false;
      } catch {
        return false;
      }
    }, 'carrier_mcp_ready_health');
    assert.equal(mcpReadyHealth.mcp_operational_state, 'healthy', JSON.stringify(mcpReadyHealth));
    assert.equal(provider.requests.length >= 2, true, JSON.stringify(provider.requests));
    const carrierEvents = readJsonl(sessionRecord.events_path);
    assert.equal(carrierEvents.some((event) => event.event === 'carrier_tool_requested' && String(event.tool_name ?? event.name ?? '') === 'delegated_task_run'), true, JSON.stringify(carrierEvents));
    assert.equal(carrierEvents.some((event) => event.event === 'carrier_tool_completed' && String(event.tool_name ?? event.name ?? '') === 'delegated_task_run'), true, JSON.stringify(carrierEvents));
    assert.equal(carrierEvents.some((event) => event.event === 'mcp_startup_status' && event.mcp_operational_state !== 'healthy'), false, JSON.stringify(carrierEvents));

    const tasks = boundedDirectories(join(taskRoot, 'tasks'), 20);
    assert.equal(tasks.length, 1, `expected one durable delegated task, found ${tasks.length}`);
    const task = JSON.parse(readFileSync(join(tasks[0], 'task.json'), 'utf8'));
    assert.equal(task.status, 'completed', JSON.stringify(task));
    assert.equal(String(task.objective).includes('L5'), true, JSON.stringify(task));
    const taskEvents = readJsonl(join(tasks[0], 'events.jsonl'));
    assert.equal(taskEvents.length >= 2, true, JSON.stringify(taskEvents));
    const taskResult = asRecord(task.result);
    const workerRefs = Array.isArray(taskResult.worker_refs) ? taskResult.worker_refs.map(asRecord) : [];
    assert.equal(workerRefs.length, 1, JSON.stringify(task));
    const workerRunDirs = workerRefs
      .map((ref) => typeof ref.run_dir === 'string' ? ref.run_dir : null)
      .filter((runDir) => runDir !== null);
    assert.equal(workerRunDirs.length, 1, JSON.stringify(task));
    assert.equal(pathInside(workerRunDirs[0], siteRoot), true, JSON.stringify(workerRefs));
    assert.equal(existsSync(join(workerRunDirs[0], 'last_message.json')), true, JSON.stringify(workerRefs));
    assert.equal(existsSync(join(workerRunDirs[0], 'events.jsonl')), true, JSON.stringify(workerRefs));
    assert.equal(provider.requests.some((request) => JSON.stringify(request.messages ?? '').includes('L5_WORKER_MARKER')), true, 'worker carrier request was not observed');
    status = 'passed';
    console.log(JSON.stringify({
      schema: 'narada.agent_web_ui.live_delegated_task_e2e.result.v1',
      test_id: TEST_ID,
      status,
      site_id: siteId,
      agent_id: agentId,
      session_id: sessionRecord.session_id,
      mcp_scope: 'local-site',
      operator_input_surface: 'nars-session-mcp',
      delegated_task_surface: 'narada-delegated-task',
      provider_request_count: provider.requests.length,
      durable_task_verified: true,
      carrier_events_verified: true,
    }));
  }
} catch (error) {
  failureReason = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (sessionRecord?.event_endpoint) {
    try { await closeNarsSession(sessionRecord.event_endpoint); } catch { cleanupStatus = 'failed'; }
  }
  if (sessionMcpClient) {
    try { await sessionMcpClient.close(); } catch { cleanupStatus = 'failed'; }
  }
  if (sessionMcpProcess && sessionMcpProcess.exitCode === null) {
    try { sessionMcpProcess.kill(); } catch { cleanupStatus = 'failed'; }
  }
  if (launcherProcess) {
    try { await stopProcess(launcherProcess); } catch { cleanupStatus = 'failed'; }
  }
  if (provider) {
    try { await provider.close(); } catch { cleanupStatus = 'failed'; }
  }
  const eventTail = sessionRecord?.events_path ? readJsonl(sessionRecord.events_path).slice(-20) : [];
  if (!keepFailureRoot && !removeRoot(siteRoot)) cleanupStatus = 'failed';
  if (cleanupStatus === 'failed') {
    status = 'failed';
    failureReason ??= 'cleanup_failed';
    process.exitCode = 1;
  }
  mkdirSync(dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, JSON.stringify({
    schema: 'narada.agent_web_ui.live_delegated_task_e2e.result.v1',
    test_id: TEST_ID,
    status,
    finished_at: new Date().toISOString(),
    site_id: siteId,
    session_id: sessionRecord?.session_id ?? null,
    mcp_scope: 'local-site',
    site_root: keepFailureRoot ? siteRoot : null,
    carrier_event_tail: eventTail,
    cleanup: { status: cleanupStatus },
    failure_reason: failureReason,
  }, null, 2), 'utf8');
}

async function prepareSite() {
  mkdirSync(join(siteRoot, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  mkdirSync(join(siteRoot, '.narada'), { recursive: true });
  writeFileSync(policyPath, [
    '[worker]',
    'default_runtime = "narada-agent-runtime-server"',
    'default_authority = "read"',
    'default_cognition = "low"',
    `run_root = "${tomlPath(workerRunRoot)}"`,
    '',
    '[worker.policy]',
    'allowed_runtimes = ["narada-agent-runtime-server"]',
    'allowed_authorities = ["read"]',
    'allowed_sandboxes = ["read-only"]',
    'max_run_ms = 45000',
    'max_output_bytes = 200000',
    '',
    '[worker.runtimes.narada_agent_runtime_server]',
    `command = "${tomlPath(process.execPath)}"`,
    `command_args = ["${tomlPath(runtimeServerPath)}"]`,
    'default_sandbox = "read-only"',
    'ephemeral = true',
    'json_events = true',
  ].join('\n'), 'utf8');
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'narada-delegated-task.json'), JSON.stringify({
    mcpServers: {
      'narada-delegated-task': {
        command: process.execPath,
        args: [
          delegatedTaskServerPath,
          '--task-root', taskRoot,
          '--output-root', outputRoot,
          '--site-root', siteRoot,
          '--allowed-root', siteRoot,
          '--worker-policy-config', policyPath,
        ],
      },
    },
  }, null, 2), 'utf8');
}

async function startProviderFixture() {
  const requests = [];
  let toolCallSent = false;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const body = JSON.parse(await readRequestBody(request));
    requests.push(body);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const serialized = JSON.stringify(messages);
    const workerTurn = serialized.includes('L5_WORKER_MARKER');
    const hasToolResult = messages.some((message) => message && typeof message === 'object' && message.role === 'tool');
    const toolCall = !toolCallSent && !workerTurn && !hasToolResult;
    if (toolCall) toolCallSent = true;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id: `l5-fixture-${requests.length}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: String(body.model ?? 'l5-fixture-model'),
      choices: [{
        index: 0,
        finish_reason: toolCall ? 'tool_calls' : 'stop',
        message: toolCall ? {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'l5-delegated-task-call',
            type: 'function',
            function: {
              name: 'delegated_task_run',
              arguments: JSON.stringify({
                objective: 'L5 delegated task through launcher and Site fabric',
                intent: { instruction: 'Complete one bounded delegated task. L5_WORKER_MARKER=delegation-l5-worker.', mode: 'plan_only' },
                constraints: {
                  authority: 'read',
                  cognition: 'low',
                  cwd: siteRoot,
                  site_root: siteRoot,
                  provider: 'kimi-code-api',
                  wait_for_completion: true,
                  overrides: { runtime: 'narada-agent-runtime-server', model: 'l5-fixture-model', reasoning_effort: 'low' },
                },
                workflow: { steps: [{ id: 'l5-worker', kind: 'review', instruction: 'L5_WORKER_MARKER=delegation-l5-worker.' }] },
                acceptance: { review_quorum: { min_passed: 1, max_failed: 0 } },
                execution: { wait_for_completion: true, timeout_ms: 45000, poll_ms: 100 },
                result_policy: { include_diagnostics_by_default: true },
              }),
            },
          }],
        } : {
          role: 'assistant',
          content: workerTurn
            ? JSON.stringify({ summary: 'L5 worker carrier completed', deliverables: [], open_questions: [], next_actions: [], edits_performed: false, target_state_changed: false, changes: [], verification: [{ tool: 'l5-fixture', command: null, status: 'passed', summary: 'worker carrier completed', command_classification: 'not_applicable' }], verification_budget_respected: true, broad_unrelated_failures: [], exit_interview: null, review_verdict: 'accepted', acceptance_verdict: 'passed', completion_state: 'complete' })
            : 'L5 delegated task completed through the Site fabric.',
        },
      }],
    }));
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('l5_provider_address_missing');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests, close: () => closeServer(server) };
}

function createJsonlClient(child, responseTimeoutMs) {
  let buffer = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const entry = message.id === undefined ? undefined : pending.get(String(message.id));
      if (!entry) continue;
      pending.delete(String(message.id));
      clearTimeout(entry.timer);
      entry.resolve(message);
    }
  });
  const rejectAll = (error) => {
    for (const [id, entry] of pending) {
      pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(error);
    }
  };
  child.on('error', rejectAll);
  child.on('close', (code) => { if (code !== 0) rejectAll(new Error(`nars-session MCP exited with code ${code}`)); });
  return {
    request(id, method, params) {
      return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => { pending.delete(String(id)); reject(new Error(`nars-session response timeout: ${id}`)); }, responseTimeoutMs);
        pending.set(String(id), { resolve: resolvePromise, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    async close() {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      if (child.exitCode !== null) return;
      await Promise.race([once(child, 'close'), new Promise((resolvePromise) => setTimeout(resolvePromise, 3000))]);
    },
  };
}

function findSessionRecord(root, identity) {
  const sessionRoot = join(root, '.narada', 'crew', 'nars-sessions');
  if (!existsSync(sessionRoot)) return false;
  try {
    const aggregate = readNarsSessionIndex({ sessionsRoot: sessionRoot, siteRoot: root });
    const entries = Array.isArray(aggregate?.sessions) ? aggregate.sessions : [];
    for (const entry of entries) {
      if (entry?.agent_id !== identity) continue;
      const recordPath = entry.record_path ?? (entry.session_dir ? join(entry.session_dir, 'session-index-record.json') : null);
      if (!recordPath || !existsSync(recordPath)) continue;
      const record = JSON.parse(readFileSync(recordPath, 'utf8'));
      if (record.event_endpoint && record.health_endpoint) return record;
    }
  } catch {}
  return false;
}

function collectOutput(child) {
  let output = '';
  child.stdout.on('data', (chunk) => { output = `${output}${String(chunk)}`.slice(-8000); });
  child.stderr.on('data', (chunk) => { output = `${output}${String(chunk)}`.slice(-8000); });
  return { all: () => output };
}

async function waitFor(check, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${label}_timeout:${lastError instanceof Error ? lastError.message : ''}`);
}

function structured(response) {
  assert.equal(response.error, undefined, JSON.stringify(response));
  const result = response.result && typeof response.result === 'object' ? response.result : {};
  return result.structuredContent && typeof result.structuredContent === 'object' ? result.structuredContent : result;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function boundedDirectories(path, limit) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).slice(0, limit).map((entry) => join(path, entry.name));
}

function pathInside(candidate, root) {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function readRequestBody(request) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function closeServer(server) { return new Promise((resolvePromise) => server.close(() => resolvePromise())); }
function tomlPath(path) { return path.replaceAll('\\', '/').replaceAll('"', '\\"'); }
function asRecord(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function removeRoot(path) { try { rmSync(path, { recursive: true, force: true }); return true; } catch { return false; } }

async function closeNarsSession(eventEndpoint) {
  const socket = new WebSocket(eventEndpoint);
  await once(socket, 'open');
  socket.send(JSON.stringify({ id: `l5-close-${Date.now()}`, method: 'session.close', params: {} }));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  socket.close();
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolvePromise) => setTimeout(resolvePromise, 3000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}
