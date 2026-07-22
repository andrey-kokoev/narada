import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { NarsAttachClient } from '../dist/nars-client/attach-client.js';
import {
  buildCanonicalLocalTestSeed,
  CANONICAL_LOCAL_TEST_IDS,
  canonicalSha256,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { assertLiveEvidenceContract } from '../../agent-runtime-server/src/live-evidence-contract.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const PI_ENTRYPOINT = join(REPO_ROOT, 'packages', 'agent-pi-tui', 'bin', 'narada-agent-pi-tui.mjs');
export const RUNTIME_ENTRYPOINT = join(REPO_ROOT, 'packages', 'agent-runtime-server', 'bin', 'narada-agent-runtime-server.mjs');
export const CLI_ENTRYPOINT = join(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js');
export const MCP_FIXTURE = join(REPO_ROOT, 'packages', 'agent-runtime-server', 'test', 'fixtures', 'mcp-echo-server.mjs');

export const DEFAULT_TIMEOUT_MS = Number(process.env.NARADA_AGENT_PI_TUI_LIVE_E2E_TIMEOUT_MS ?? 30_000);
export const PRODUCTION_LAUNCH_TIMEOUT_MS = Number(
  process.env.NARADA_AGENT_PI_TUI_PRODUCTION_LAUNCH_TIMEOUT_MS ?? 90_000,
);

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function waitFor(check, label, timeoutMs = DEFAULT_TIMEOUT_MS, { failFastErrors = false } = {}) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      if (failFastErrors || error?.code === 'ERR_ASSERTION' || error?.name === 'AssertionError') throw error;
      lastError = error;
    }
    await sleep(40);
  }
  throw new Error(`${label}_timeout${lastError ? `:${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`);
}

export function readEvents(eventsPath) {
  if (!eventsPath || !existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, 'utf8').split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch (error) {
      throw new Error(`malformed_event_jsonl:${eventsPath}:${index + 1}:${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function eventKind(event) {
  return event?.event ?? event?.kind ?? event?.event_kind ?? null;
}

export function eventSequence(event) {
  return Number(event?.event_sequence ?? event?.sequence ?? event?.durable_event_sequence ?? 0) || 0;
}

export async function waitForEvent(eventsPath, predicate, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return waitFor(() => readEvents(eventsPath).find(predicate), label, timeoutMs);
}

export async function waitForNewEvent(eventsPath, previousCount, predicate, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return waitFor(() => readEvents(eventsPath).slice(previousCount).find(predicate), label, timeoutMs);
}

function canonicalAdapterProtocol(providerId) {
  return providerId === 'anthropic-api'
    ? { family: 'anthropic', operation: 'messages', version: '1' }
    : providerId === 'codex-subscription'
      ? { family: 'codex-subscription', operation: 'responses', version: '1' }
      : { family: 'openai', operation: 'chat-completions', version: '1' };
}

function canonicalCredentialReference(providerId) {
  return {
    'kimi-api': 'KIMI_API_KEY',
    'kimi-code-api': 'KIMI_CODE_API_KEY',
    'deepseek-api': 'DEEPSEEK_API_KEY',
    'glm-api': 'GLM_API_KEY',
    'openrouter-api': 'OPENROUTER_API_KEY',
    'anthropic-api': 'ANTHROPIC_API_KEY',
    'openai-api': 'OPENAI_API_KEY',
  }[providerId] ?? 'OPENAI_API_KEY';
}

function rewriteCanonicalProvider(value, providerId) {
  if (typeof value === 'string') {
    return value === 'inference-provider:remote-api' ? `inference-provider:${providerId}` : value;
  }
  if (Array.isArray(value)) return value.map((entry) => rewriteCanonicalProvider(entry, providerId));
  if (!value || typeof value !== 'object') return value;
  const rewritten = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, rewriteCanonicalProvider(entry, providerId)]),
  );
  if (rewritten.schema === 'narada.invokable-intelligence.adapter.v1') rewritten.protocol = canonicalAdapterProtocol(providerId);
  if (rewritten.schema === 'narada.invokable-intelligence.access-grant.v1') {
    rewritten.scope = { ...rewritten.scope, purposes: [...new Set([...(rewritten.scope?.purposes ?? []), 'agent-session'])] };
  }
  if (rewritten.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
    rewritten.purposes = [...new Set([...(rewritten.purposes ?? []), 'agent-session'])];
  }
  return rewritten;
}

export async function seedIntelligenceRegistry(siteRoot, { providerId = 'kimi-code-api', endpointBaseUrl }) {
  const dbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endpointUrl = `${endpointBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const seed = rewriteCanonicalProvider(buildCanonicalLocalTestSeed({
    endpointBaseUrl,
    endpointUrl,
    adapterProtocol: canonicalAdapterProtocol(providerId),
    credentialStore: 'env',
    credentialReference: canonicalCredentialReference(providerId),
    now,
    validUntil,
  }), providerId);
  for (const record of seed.records) {
    record.record_id = record.document.id;
    if (record.document?.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
      record.document.topology.nodes = record.document.topology.nodes.map((node) => ({ ...node, required_feasibility: [] }));
      record.document.topology.edges = record.document.topology.edges.map((edge) => ({ ...edge, required_feasibility: [] }));
    }
    record.source.digest = canonicalSha256(record.document);
  }
  const store = await SqliteRegistryStore.open(dbPath);
  try {
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }
  const principalBinding = {
    schema: 'narada.intelligence.principal_binding.v1',
    actor: { principal_id: CANONICAL_LOCAL_TEST_IDS.principal, auth_type: 'user-site-session' },
    memberships: [{
      registry: 'site-roster',
      site_id: CANONICAL_LOCAL_TEST_IDS.targetSite,
      role: 'resident',
      evidence_ref: 'evidence:agent-pi-tui-live-gap-e2e',
    }],
    evidence_refs: ['evidence:agent-pi-tui-live-gap-e2e'],
  };
  return { dbPath, principalBinding };
}

export async function startFixtureProvider({ responseFor, holdPrompts = [], dropResponseFor = null } = {}) {
  const requests = [];
  const holds = new Map();
  const aborts = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'HEAD') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_json' }));
      return;
    }
    const latestUser = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
    const promptContent = latestUser?.content;
    const prompt = typeof promptContent === 'string'
      ? promptContent
      : Array.isArray(promptContent)
        ? promptContent.map((part) => typeof part === 'string'
          ? part
          : typeof part?.text === 'string'
            ? part.text
            : typeof part?.content === 'string' ? part.content : '').join('')
        : JSON.stringify(promptContent ?? '');
    const record = { body, prompt, aborted: false, completed: false };
    requests.push(record);
    const abort = () => {
      if (record.aborted) return;
      record.aborted = true;
      aborts.push(record);
      holds.get(prompt)?.resolve?.();
    };
    request.once('aborted', abort);
    // IncomingMessage.close also fires after the request body has been fully
    // consumed.  That is normal for a completed POST, not an upstream abort.
    // Observe the response socket instead so held requests are released only
    // when the runtime actually cancels or dies.
    response.once('close', () => {
      if (!response.writableEnded && !record.completed) abort();
    });

    if (holdPrompts.some((value) => typeof value === 'function' ? value(prompt) : prompt.includes(value))) {
      let resolveHold;
      const hold = new Promise((resolvePromise) => { resolveHold = resolvePromise; });
      holds.set(prompt, { promise: hold, resolve: resolveHold });
      await hold;
      holds.delete(prompt);
      if (record.aborted) return;
    }

    if (await dropResponseFor?.({ prompt, body, record, requests })) {
      record.dropped = true;
      response.destroy();
      return;
    }

    const payload = await responseFor?.({ prompt, body, record, requests }) ?? {
      choices: [{ message: { role: 'assistant', content: `fixture:${prompt}` } }],
    };
    if (record.aborted || response.destroyed) return;
    response.writeHead(payload.status ?? 200, { 'content-type': 'application/json' });
    if (Object.prototype.hasOwnProperty.call(payload, 'rawBody')) {
      response.end(String(payload.rawBody));
      record.completed = true;
      return;
    }
    response.end(JSON.stringify(payload.body ?? payload));
    record.completed = true;
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    aborts,
    async waitForRequest(predicate, label = 'provider_request') {
      return waitFor(() => requests.find(predicate), label);
    },
    release(prompt) { holds.get(prompt)?.resolve?.(); },
    async close() {
      for (const hold of holds.values()) hold.resolve?.();
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

export async function createLiveSite({
  provider,
  sessionId = `agent-pi-tui-gap-${Date.now()}`,
  agentId = `agent-pi-tui-gap-${Date.now()}.resident`,
  // This harness exercises the Pi cognition path by default. Native-kernel
  // comparisons are explicit scenarios owned by the runtime-server tests.
  kernelKind = 'pi-sdk',
  mcp = false,
  deniedTools = '',
  mcpToolDelayMs = 0,
  mcpDisconnectMarker = null,
  mcpCommand = process.execPath,
  mcpStartupTimeoutSec = null,
  mcpRequestTimeoutMs = null,
  mcpMalformedResponse = false,
  mcpMalformedMarker = null,
  deniedSideEffectPath = null,
  kernelEnv = {},
} = {}) {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-agent-pi-tui-gap-'));
  await mkdir(join(siteRoot, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  await mkdir(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  await mkdir(join(siteRoot, '.ai', 'runtime'), { recursive: true });
  const liveTempDir = join(REPO_ROOT, '.ai', 'tmp', 'agent-pi-tui-live-e2e');
  await mkdir(liveTempDir, { recursive: true });
  const intelligence = await seedIntelligenceRegistry(siteRoot, { endpointBaseUrl: provider.baseUrl });
  const intelligenceContextPath = join(siteRoot, '.ai', 'intelligence-launch-context.json');
  await writeFile(intelligenceContextPath, JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    intelligence_kernel_kind: kernelKind,
    registry_db_path: intelligence.dbPath,
    user_site_id: CANONICAL_LOCAL_TEST_IDS.userSite,
    host_site_id: CANONICAL_LOCAL_TEST_IDS.hostSite,
    principal_id: CANONICAL_LOCAL_TEST_IDS.principal,
    principal_binding: intelligence.principalBinding,
  }, null, 2));
  const env = processEnv({
    NARADA_SITE_ROOT: siteRoot,
    NARADA_PC_SITE_ROOT: siteRoot,
    NARADA_TARGET_SITE_ID: CANONICAL_LOCAL_TEST_IDS.targetSite,
    NARADA_WORKSPACE_ROOT: siteRoot,
    NARADA_USER_SITE_ROOT: siteRoot,
    NARADA_INTELLIGENCE_CONTEXT_PATH: intelligenceContextPath,
    NARADA_INTELLIGENCE_KERNEL: kernelKind,
    NARADA_INTELLIGENCE_REGISTRY_DB: intelligence.dbPath,
    NARADA_INTELLIGENCE_TARGET_SITE: CANONICAL_LOCAL_TEST_IDS.targetSite,
    NARADA_INTELLIGENCE_USER_SITE: CANONICAL_LOCAL_TEST_IDS.userSite,
    NARADA_INTELLIGENCE_HOST_SITE: CANONICAL_LOCAL_TEST_IDS.hostSite,
    NARADA_INTELLIGENCE_PRINCIPAL_ID: CANONICAL_LOCAL_TEST_IDS.principal,
    NARADA_INTELLIGENCE_PRINCIPAL_BINDING: JSON.stringify(intelligence.principalBinding),
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    NARADA_AI_API_KEY: 'agent-pi-tui-gap-fixture-key',
    NARADA_AI_BASE_URL: provider.baseUrl,
    NARADA_AI_MODEL: 'agent-pi-tui-gap-fixture-model',
    KIMI_CODE_API_KEY: 'agent-pi-tui-gap-fixture-key',
    KIMI_CODE_API_BASE_URL: provider.baseUrl,
    KIMI_CODE_MODEL: 'agent-pi-tui-gap-fixture-model',
    NARADA_MCP_SCOPE: mcp ? 'local-site' : 'none',
    NARADA_DENIED_CAPABILITY_TOOLS: deniedTools,
    NARADA_MCP_FIXTURE_TOOL_DELAY_MS: String(mcpToolDelayMs),
    NARADA_MCP_FIXTURE_MALFORMED: mcpMalformedResponse ? '1' : '0',
    ...(mcpMalformedMarker ? { NARADA_MCP_FIXTURE_MALFORMED_MARKER: mcpMalformedMarker } : {}),
    TEMP: liveTempDir,
    TMP: liveTempDir,
    NO_COLOR: '1',
    NARADA_AGENT_CLI_COLOR: '0',
    ...kernelEnv,
  });
  if (mcp) {
    await writeFile(join(siteRoot, '.ai', 'mcp', 'fixture.json'), JSON.stringify({
      mcpServers: {
        'narada-gap-fixture': {
          command: mcpCommand,
          args: [
            MCP_FIXTURE,
            ...(mcpDisconnectMarker || mcpToolDelayMs > 0 ? [mcpDisconnectMarker ?? ''] : []),
            ...(mcpToolDelayMs > 0 ? [String(mcpToolDelayMs)] : []),
          ],
          ...(mcpStartupTimeoutSec == null ? {} : { startup_timeout_sec: mcpStartupTimeoutSec }),
          ...(mcpRequestTimeoutMs == null ? {} : { request_timeout_ms: mcpRequestTimeoutMs }),
          ...(mcpMalformedResponse || mcpMalformedMarker ? {
            env: {
              ...(mcpMalformedResponse ? { NARADA_MCP_FIXTURE_MALFORMED: '1' } : {}),
              ...(mcpMalformedMarker ? { NARADA_MCP_FIXTURE_MALFORMED_MARKER: mcpMalformedMarker } : {}),
              ...(deniedSideEffectPath ? { NARADA_MCP_FIXTURE_DENIED_MARKER: deniedSideEffectPath } : {}),
            },
          } : deniedSideEffectPath ? {
            env: { NARADA_MCP_FIXTURE_DENIED_MARKER: deniedSideEffectPath },
          } : {}),
        },
      },
    }, null, 2));
  }
  const eventsPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId, 'events.jsonl');
  const sessionDir = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId);
  return { siteRoot, sessionId, agentId, env, eventsPath, sessionDir, intelligenceContextPath };
}
export async function startRuntime(site, {
  direct = true,
  allowDegraded = false,
  bindingPath = null,
  resumeSessionId = null,
} = {}) {
  const effectiveBindingPath = bindingPath ?? join(site.siteRoot, '.ai', 'runtime', 'agent-pi-tui-live-launch-binding.json');
  const startupTimeoutMs = direct ? DEFAULT_TIMEOUT_MS : PRODUCTION_LAUNCH_TIMEOUT_MS;
  const previousProductionSessionPaths = new Set(site.productionSessionPaths ?? []);
  const commandArgs = direct
    ? [
      RUNTIME_ENTRYPOINT,
      '--operator-surface', 'agent-pi-tui',
      '--identity', site.agentId,
      '--session', site.sessionId,
      '--site-root', site.siteRoot,
    ]
    : [
      CLI_ENTRYPOINT,
      'operator-surface',
      'runtime',
      'start',
      'agent-pi-tui',
      '--site-root', site.siteRoot,
      '--target-site-id', CANONICAL_LOCAL_TEST_IDS.targetSite,
      '--workspace-root', site.siteRoot,
      '--agent', site.agentId,
      '--runtime', 'narada-agent-runtime-server',
      '--mcp-scope', site.env.NARADA_MCP_SCOPE ?? 'none',
      '--launch-binding', effectiveBindingPath,
      ...(resumeSessionId ? ['--resume-session', resumeSessionId] : []),
      '--exec',
      '--format', 'human',
    ];
  const child = spawnTestChild(process.execPath, commandArgs, {
    cwd: REPO_ROOT,
    env: site.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.setEncoding?.('utf8');
  child.stderr?.setEncoding?.('utf8');
  child.stdout?.on('data', (chunk) => { output += String(chunk); });
  child.stderr?.on('data', (chunk) => { output += String(chunk); });
  let startup;
  let sessionRecord = null;
  try {
    if (direct) {
      const previousEventCount = readEvents(site.eventsPath).length;
      startup = await waitFor(() => {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`runtime_exited:${child.exitCode ?? 'null'}:${child.signalCode ?? 'null'}:${output.slice(-4000)}`);
        }
        return readEvents(site.eventsPath).slice(previousEventCount)
          .find((event) => event.event === 'session_started' && event.event_endpoint);
      }, 'runtime_session_started', startupTimeoutMs);
    } else {
      // The canonical operator-surface launcher is a handoff boundary: its
      // CLI process normally exits 0 after it has spawned the detached runtime
      // child.  The durable session-index record, not the wrapper's stdio or
      // the harness's guessed session id, is therefore the launch oracle.
      const previousEventCount = readEvents(site.eventsPath).length;
      sessionRecord = await waitFor(async () => {
        if (child.signalCode !== null || (child.exitCode !== null && child.exitCode !== 0)) {
          throw new Error(`runtime_launcher_exited:${child.exitCode ?? 'null'}:${child.signalCode ?? 'null'}:${output.slice(-4000)}`);
        }
        const candidates = listSessionRecords(site.siteRoot)
          .filter((record) => record.agent_id === site.agentId)
          .filter((record) => record.event_endpoint && record.events_path)
          .filter((record) => !previousProductionSessionPaths.has(record.path)
            || (resumeSessionId && record.session_id === resumeSessionId))
          .sort((left, right) => String(right.started_at ?? '').localeCompare(String(left.started_at ?? '')));
        for (const candidate of candidates) {
          try {
            const response = await fetch(candidate.health_endpoint, { signal: AbortSignal.timeout(500) });
            if (!response.ok) continue;
            return candidate;
          } catch {
            // The durable record can precede HTTP readiness by a few ticks.
          }
        }
        return false;
      }, 'runtime_session_index_record', startupTimeoutMs);
      site.sessionId = sessionRecord.session_id ?? sessionRecord.runtime_session_id ?? site.sessionId;
      site.eventsPath = sessionRecord.events_path;
      site.sessionDir = sessionRecord.session_dir ?? site.sessionDir;
      site.productionSessionPaths = [...previousProductionSessionPaths, sessionRecord.path];
      startup = await waitFor(() => readEvents(site.eventsPath).slice(previousEventCount)
        .find((event) => event.event === 'session_started' && event.event_endpoint), 'runtime_session_started', startupTimeoutMs);
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}:runtime_output=${output.slice(-6000)}`);
  }
  let launchBinding = null;
  let launchBindingEvidence = null;
  if (!direct) {
    launchBinding = await waitFor(() => {
      try {
        const binding = JSON.parse(readFileSync(effectiveBindingPath, 'utf8'));
        return binding?.status === 'ready' ? binding : null;
      } catch {
        return false;
      }
    }, 'runtime_launch_binding_ready', startupTimeoutMs);
    const bindingSessionId = launchBinding.nars_session_id
      ?? launchBinding.runtime_session_id
      ?? launchBinding.carrier_session_id
      ?? launchBinding.launch_session_id
      ?? null;
    const recordSessionId = sessionRecord?.session_id ?? sessionRecord?.runtime_session_id ?? null;
    if (launchBinding.schema !== 'narada.operator_projection_launch_binding.v1') throw new Error('runtime_launch_binding_schema_invalid');
    if (launchBinding.site_root !== site.siteRoot) throw new Error('runtime_launch_binding_site_root_mismatch');
    if (launchBinding.workspace_root !== site.siteRoot) throw new Error('runtime_launch_binding_workspace_root_mismatch');
    if (launchBinding.agent !== site.agentId) throw new Error('runtime_launch_binding_agent_mismatch');
    if (launchBinding.operator_surface_kind !== 'agent-pi-tui') throw new Error('runtime_launch_binding_surface_mismatch');
    if (launchBinding.runtime_host_kind !== 'narada-agent-runtime-server') throw new Error('runtime_launch_binding_host_mismatch');
    if (!bindingSessionId || bindingSessionId !== site.sessionId || (recordSessionId && recordSessionId !== bindingSessionId)) {
      throw new Error('runtime_launch_binding_session_mismatch');
    }
    launchBindingEvidence = {
      ...launchBinding,
      path: effectiveBindingPath,
      session_id: bindingSessionId,
      runtime_pid: Number(sessionRecord?.process_ownership?.pid ?? launchBinding.process_ownership?.pid ?? 0) || null,
    };
  }
  const runtime = {
    child,
    pid: Number(sessionRecord?.process_ownership?.pid ?? 0) || null,
    output: () => output,
    eventEndpoint: startup.event_endpoint,
    healthEndpoint: startup.health_endpoint,
    startup,
    sessionRecord,
    bindingPath: direct ? null : effectiveBindingPath,
    launchBinding,
    launchBindingEvidence,
    productionLaunchBinding: !direct,
  };
  await waitFor(async () => {
    const response = await fetch(runtime.healthEndpoint);
    if (!response.ok) return false;
    const body = await response.json();
    return body.status === 'healthy' || (allowDegraded && body.status === 'degraded') ? body : false;
  }, 'runtime_healthy', startupTimeoutMs);
  return runtime;
}

export async function stopRuntime(runtime, { hard = false } = {}) {
  const signal = hard ? 'SIGKILL' : 'SIGTERM';
  const runtimePid = Number(runtime?.pid ?? 0) || null;
  if (runtimePid && runtimePid !== process.pid) {
    try { process.kill(runtimePid, signal); } catch {}
    await sleep(300);
    if (!hard) {
      try { process.kill(runtimePid, 0); } catch { return; }
      try { process.kill(runtimePid, 'SIGKILL'); } catch {}
    }
  }
  if (!runtime?.child || runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;
  try { runtime.child.kill(signal); } catch {}
  await Promise.race([once(runtime.child, 'exit').catch(() => {}), sleep(3000)]);
  if (runtime.child.exitCode === null && runtime.child.signalCode === null) {
    try { runtime.child.kill('SIGKILL'); } catch {}
  }
}

function stripAnsi(value) {
  return String(value ?? '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[()][0-2A-Z]/g, '');
}

export function spawnPi(site, runtime, { name = 'agent-pi-tui', cursorPath = null, bindingPath = null, sessionId = site.sessionId } = {}) {
  const effectiveCursorPath = cursorPath ?? join(site.siteRoot, '.ai', 'runtime', `${name}-cursors.json`);
  const args = bindingPath
    ? [PI_ENTRYPOINT, '--launch-binding', bindingPath]
    : [PI_ENTRYPOINT, '--attach', runtime.eventEndpoint, '--session', sessionId];
  const terminal = requirePty().spawn(process.execPath, args, {
    name: 'xterm-256color',
    cols: 140,
    rows: 42,
    ...(process.platform === 'win32' ? { useConptyDll: true } : {}),
    cwd: site.siteRoot,
    env: processEnv({ ...site.env, NARADA_AGENT_PI_TUI_CURSOR_PATH: effectiveCursorPath }),
  });
  let output = '';
  let exited = false;
  let resolveExit;
  const exit = new Promise((resolvePromise) => { resolveExit = resolvePromise; });
  terminal.onData((chunk) => { output += String(chunk); });
  terminal.onExit((event) => { exited = true; resolveExit(event); });
  return {
    name,
    terminal,
    cursorPath: effectiveCursorPath,
    text: () => stripAnsi(output),
    raw: () => output,
    exited: () => exited,
    write(value) { terminal.write(String(value)); },
    resize(cols, rows) { terminal.resize(cols, rows); },
    async submit(value) { terminal.write(String(value)); terminal.write('\r'); await sleep(120); },
    async waitForText(needles, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
      const list = Array.isArray(needles) ? needles : [needles];
      return waitFor(() => {
        if (exited) throw new Error(`${name}_exited:${this.text().slice(-4000)}`);
        return list.some((needle) => this.text().includes(needle));
      }, label, timeoutMs);
    },
    async kill() {
      if (!exited) {
        try { terminal.kill(); } catch {}
        await Promise.race([exit, sleep(2000)]);
      }
      // node-pty's Windows ConPTY worker can retain native handles after the
      // child has exited.  Release those handles explicitly so a live test
      // cannot hang during teardown.
      if (process.platform === 'win32') {
        try { terminal._agent?._inSocket?.destroy?.(); } catch {}
        try { terminal._agent?._outSocket?.destroy?.(); } catch {}
        try { terminal._agent?._conoutSocketWorker?.dispose?.(); } catch {}
      }
    },
  };
}

let ptyModule = null;
function requirePty() {
  if (!ptyModule) throw new Error('node-pty must be imported before spawnPi');
  return ptyModule;
}

export async function loadPty() {
  ptyModule = await import('node-pty');
  ptyModule = ptyModule.default ?? ptyModule;
  return ptyModule;
}

export async function attachClient(runtime, options = {}) {
  const client = new NarsAttachClient({
    endpoint: runtime.eventEndpoint,
    sessionId: options.sessionId ?? null,
    reconnect: options.reconnect ?? true,
    reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 20,
    reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 100,
    maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    subscriptionId: options.subscriptionId ?? `agent-pi-tui-gap-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    cursorKey: options.cursorKey,
    WebSocketImpl: options.WebSocketImpl,
  });
  const events = [];
  client.onEvent(({ event }) => events.push(event));
  await client.connect();
  await waitFor(() => client.getState().phase === 'live', 'attach_client_live');
  return { client, events };
}

export function readCursor(cursorPath, sessionId) {
  if (!existsSync(cursorPath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(cursorPath, 'utf8'));
    return Number(parsed[`${sessionId}::agent-pi-tui`] ?? 0) || 0;
  } catch { return 0; }
}

export async function cleanupSite(site) {
  await rm(site?.siteRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

export function processEnv(overrides = {}) {
  return Object.fromEntries(Object.entries({ ...process.env, ...overrides })
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]));
}

function resourcePid(resource) {
  const pid = resource?.pid ?? resource?.child?.pid ?? resource?.terminal?.pid ?? null;
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Persist one machine-readable result envelope for every opt-in live probe.
 * The gap probes deliberately use the direct runtime fixture boundary; that
 * posture is recorded instead of being mistaken for workspace-launch proof.
 */
export async function recordLiveEvidence({
  scenario,
  site = null,
  sites = [],
  runtime = null,
  runtimes = [],
  client = null,
  clients = [],
  inputBoundary = 'agent-pi-tui-pty',
  durableOracle = null,
  externalOracles = [],
  negativeAssertions = [],
  sameSessionAfterFault = false,
  productionLaunchBinding = false,
  productionLaunchBindingEvidence = null,
  sessionIds = [],
  status = 'passed',
  posture = 'fixture-boundary',
} = {}) {
  const allSites = [site, ...sites].filter(Boolean);
  const allRuntimes = [runtime, ...runtimes].filter(Boolean);
  const allClients = [client, ...clients].filter(Boolean);
  const runtimePids = allRuntimes.map(resourcePid).filter(Boolean);
  const clientPids = allClients.map(resourcePid).filter(Boolean);
  const evidence = {
    schema: 'narada.agent.live_evidence.v2',
    scenario,
    status,
    posture,
    runtime_pid: runtimePids[0] ?? null,
    runtime_pids: runtimePids,
    client_pids: clientPids,
    input_boundary: inputBoundary,
    durable_oracle: durableOracle ?? allSites[0]?.eventsPath ?? null,
    external_oracles: [...new Set([
      ...externalOracles,
      ...(productionLaunchBinding ? ['production-launch-binding'] : []),
    ])],
    negative_assertions: [...negativeAssertions],
    same_session_after_fault: sameSessionAfterFault,
    production_launch_binding: productionLaunchBinding,
    production_launch_binding_evidence: productionLaunchBindingEvidence
      ?? allRuntimes.map((entry) => entry.launchBindingEvidence).find(Boolean)
      ?? null,
    session_ids: [...new Set([
      ...allSites.map((entry) => entry.sessionId).filter(Boolean),
      ...sessionIds.filter(Boolean),
    ])],
  };
  assertLiveEvidenceContract(evidence);
  const safeScenario = String(scenario ?? 'unknown').replace(/[^0-9A-Za-z_.-]+/g, '-');
  const evidenceDir = join(REPO_ROOT, '.ai', 'tmp', 'agent-pi-tui-live-e2e', 'evidence');
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `${safeScenario}-${Date.now()}-${process.pid}.json`);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { ...evidence, evidence_path: evidencePath };
}

export function listSessionRecords(siteRoot) {
  const roots = [join(siteRoot, '.narada', 'crew', 'nars-sessions'), join(siteRoot, 'crew', 'nars-sessions')];
  return roots.flatMap((root) => {
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'session-index-record.json'))
        .filter(existsSync)
        .map((path) => ({ path, ...JSON.parse(readFileSync(path, 'utf8')) }));
    } catch { return []; }
  });
}
