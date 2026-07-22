#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NarsAttachClient } from '../dist/nars-client/attach-client.js';
import {
  buildCanonicalLocalTestSeed,
  CANONICAL_LOCAL_TEST_IDS,
  canonicalSha256,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { recordLiveEvidence } from './live-test-harness.mjs';

const liveEnabled = process.argv.includes('--enable-live-e2e')
  || process.env.NARADA_AGENT_PI_TUI_LIVE_E2E === '1';

if (!liveEnabled) {
  console.log('agent-pi-tui four-surface live e2e skipped (pass --enable-live-e2e or set NARADA_AGENT_PI_TUI_LIVE_E2E=1)');
  process.exit(0);
}

const { readNarsSessionIndex } = await import('../../nars-session-core/src/session-index.mjs');
const ptyModule = await import('node-pty');
const pty = ptyModule.default ?? ptyModule;

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CLI_ENTRYPOINT = join(REPO_ROOT, 'packages', 'layers', 'cli', 'dist', 'main.js');
const PI_ENTRYPOINT = join(REPO_ROOT, 'packages', 'agent-pi-tui', 'bin', 'narada-agent-pi-tui.mjs');
const AGENT_CLI_ENTRYPOINT = process.env.NARADA_AGENT_CLI_BIN
  ? resolve(process.env.NARADA_AGENT_CLI_BIN)
  : resolve(REPO_ROOT, '..', 'agent-cli', 'bin', 'narada-agent-cli.mjs');
const AGENT_TUI_ENTRYPOINT = process.env.NARADA_AGENT_TUI_BIN
  ? resolve(process.env.NARADA_AGENT_TUI_BIN)
  : resolve(REPO_ROOT, '..', 'agent-tui', 'target', 'debug', process.platform === 'win32' ? 'narada-agent-tui.exe' : 'narada-agent-tui');
const MCP_FIXTURE = join(REPO_ROOT, 'packages', 'agent-runtime-server', 'test', 'fixtures', 'mcp-echo-server.mjs');
const PI_RPC_FIXTURE = join(REPO_ROOT, 'packages', 'agent-pi-tui', 'test', 'fixtures', 'pi-rpc-four-surface.mjs');
const TIMEOUT_MS = Number(process.env.NARADA_AGENT_PI_TUI_LIVE_E2E_TIMEOUT_MS ?? 120_000);
const LIVE_TEMP_DIR = process.env.NARADA_LIVE_E2E_TEMP_DIR
  ?? (process.platform === 'win32' ? join(REPO_ROOT, '.ai', 'tmp', 'live-e2e-temp') : tmpdir());
const piRpcMode = process.argv.includes('--pi-rpc');
const kernelKind = piRpcMode ? 'pi-rpc' : 'pi-sdk';

for (const requiredPath of [CLI_ENTRYPOINT, PI_ENTRYPOINT, AGENT_CLI_ENTRYPOINT, AGENT_TUI_ENTRYPOINT, MCP_FIXTURE, ...(piRpcMode ? [PI_RPC_FIXTURE] : [])]) {
  if (!existsSync(requiredPath)) throw new Error(`live_e2e_required_path_missing:${requiredPath}`);
}

const browserPath = findHeadlessBrowser();
if (!browserPath) throw new Error('live_e2e_headless_chromium_required: set NARADA_LIVE_BROWSER_PATH or install Edge/Chrome');

let siteRoot = null;
let provider = null;
let runtimeProcess = null;
let webUiProcess = null;
let webPage = null;
let controlClient = null;
let scenarioExitCode = 1;
const ptySurfaces = [];

try {
  siteRoot = await mkdtemp(join(tmpdir(), 'narada-agent-pi-tui-four-surface-'));
  await mkdir(LIVE_TEMP_DIR, { recursive: true });
  const siteId = `live-agent-pi-tui-${Date.now()}`;
  // agent-start resolves intelligence against an explicit, complete catalog.
  // The ephemeral site remains the filesystem/runtime locus; the canonical
  // local fixture supplies the admitted target/user/host authority records.
  const targetSiteId = CANONICAL_LOCAL_TEST_IDS.targetSite;
  const agentId = `${siteId}.resident`;
  const sessionWorkspace = join(siteRoot, '.ai');
  await mkdir(join(siteRoot, '.narada', 'crew', 'nars-sessions'), { recursive: true });
  await mkdir(join(sessionWorkspace, 'mcp'), { recursive: true });
  await mkdir(join(sessionWorkspace, 'runtime'), { recursive: true });

  const generatedArtifactPath = join(siteRoot, 'pi-live-generated.html');
  const piRpcRequestLogPath = join(sessionWorkspace, 'runtime', 'pi-rpc-requests.jsonl');
  const piRpcHoldReleasePath = join(sessionWorkspace, 'runtime', 'pi-rpc-hold-release');
  await writeFile(
    join(sessionWorkspace, 'mcp', 'fixture.json'),
    JSON.stringify({
      mcpServers: {
        "narada-live-fixture": {
          command: process.execPath,
          args: [MCP_FIXTURE, '', '1000'],
          surface_id: 'live-e2e.fixture',
        },
      },
    }),
    'utf8',
  );

  provider = await startFixtureProvider({ generatedArtifactPath });
  const intelligence = await seedIntelligenceRegistry(siteRoot, {
    providerId: 'kimi-code-api',
    endpointBaseUrl: provider.baseUrl,
    credentialReference: 'KIMI_CODE_API_KEY',
    disableTopologyRequirements: true,
  });
  const intelligenceContextPath = join(sessionWorkspace, 'intelligence-launch-context.json');
  await writeFile(intelligenceContextPath, JSON.stringify({
    schema: 'narada.intelligence.launch_context.v1',
    // The default matrix proves the real Pi SDK path; --pi-rpc swaps only
    // the admitted cognition kernel while retaining the same four surfaces.
    intelligence_kernel_kind: kernelKind,
    registry_db_path: intelligence.dbPath,
    user_site_id: CANONICAL_LOCAL_TEST_IDS.userSite,
    host_site_id: CANONICAL_LOCAL_TEST_IDS.hostSite,
    principal_id: CANONICAL_LOCAL_TEST_IDS.principal,
    principal_binding: intelligence.principalBinding,
  }, null, 2), 'utf8');
  const providerEnv = {
    NARADA_SITE_ROOT: siteRoot,
    NARADA_PC_SITE_ROOT: siteRoot,
    NARADA_TARGET_SITE_ID: targetSiteId,
    NARADA_WORKSPACE_ROOT: siteRoot,
    NARADA_USER_SITE_ROOT: siteRoot,
    NARADA_INTELLIGENCE_CONTEXT_PATH: intelligenceContextPath,
    NARADA_INTELLIGENCE_KERNEL: kernelKind,
    NARADA_INTELLIGENCE_REGISTRY_DB: intelligence.dbPath,
    NARADA_INTELLIGENCE_TARGET_SITE: targetSiteId,
    NARADA_INTELLIGENCE_USER_SITE: CANONICAL_LOCAL_TEST_IDS.userSite,
    NARADA_INTELLIGENCE_HOST_SITE: CANONICAL_LOCAL_TEST_IDS.hostSite,
    NARADA_INTELLIGENCE_PRINCIPAL_ID: CANONICAL_LOCAL_TEST_IDS.principal,
    NARADA_INTELLIGENCE_PRINCIPAL_BINDING: JSON.stringify(intelligence.principalBinding),
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    NARADA_AI_API_KEY: 'live-e2e-fixture-key',
    NARADA_AI_BASE_URL: provider.baseUrl,
    NARADA_AI_MODEL: 'live-e2e-fixture-model',
    KIMI_CODE_API_KEY: 'live-e2e-fixture-key',
    KIMI_CODE_API_BASE_URL: provider.baseUrl,
    KIMI_CODE_MODEL: 'live-e2e-fixture-model',
    DEEPSEEK_API_KEY: 'live-e2e-fixture-key',
    DEEPSEEK_API_BASE_URL: provider.baseUrl,
    DEEPSEEK_MODEL: 'live-e2e-fixture-model',
    NARADA_MCP_SCOPE: 'local-site',
    NARADA_DENIED_CAPABILITY_TOOLS: 'fixture_denied',
    // Keep the real MCP call open long enough for the Rust TUI to render the
    // admitted tool request before the provider follow-up turn arrives. This
    // is still the production event path; the delay only makes the projection
    // observation deterministic on fast local machines.
    NARADA_MCP_FIXTURE_TOOL_DELAY_MS: '500',
    NO_COLOR: '1',
    NARADA_AGENT_CLI_COLOR: '0',
    // The packaged pnpm launcher used by the web UI resolves its temporary
    // directory while rebuilding a launch artifact. Keep that build inside
    // the managed writable workspace on Windows rather than the restricted
    // user profile temp directory.
    TEMP: LIVE_TEMP_DIR,
    TMP: LIVE_TEMP_DIR,
    ...(piRpcMode ? {
      NARADA_PI_RPC_COMMAND: process.execPath,
      NARADA_PI_RPC_ARGS: JSON.stringify([PI_RPC_FIXTURE, generatedArtifactPath, piRpcRequestLogPath, piRpcHoldReleasePath]),
      NARADA_PI_VERSION: 'pi-four-surface-1.0.0',
    } : {}),
  };

  const launchBindingPath = join(sessionWorkspace, 'runtime', 'agent-pi-tui-live-launch-binding.json');
  console.log(`live-e2e: starting real NARS runtime for ${agentId}`);
  runtimeProcess = spawnTestChild(process.execPath, [
    CLI_ENTRYPOINT,
    'operator-surface',
    'runtime',
    'start',
    'agent-pi-tui',
    '--site-root', siteRoot,
    '--target-site-id', targetSiteId,
    '--workspace-root', siteRoot,
    '--agent', agentId,
    '--runtime', 'narada-agent-runtime-server',
    '--mcp-scope', 'local-site',
    '--launch-binding', launchBindingPath,
    '--exec',
    '--format', 'human',
  ], {
    cwd: REPO_ROOT,
    env: processEnv(providerEnv),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const runtimeOutput = captureProcessOutput(runtimeProcess);

  // Start the browser projection before the binding becomes ready. The
  // production web launcher uses the observed waiting -> ready transition to
  // reject stale binding files; starting it here proves that discovery path
  // instead of silently falling back to an explicit session id.
  webUiProcess = spawnTestChild(process.execPath, [
    CLI_ENTRYPOINT,
    'agent-web-ui',
    'attach',
    '--launch-binding', launchBindingPath,
    '--site-root', siteRoot,
    '--host', '127.0.0.1',
    '--port', '0',
    '--no-open',
    '--health-timeout-ms', '3000',
    '--wait-for-session-ms', '60000',
    '--onboarding',
    '--format', 'human',
  ], { cwd: REPO_ROOT, env: processEnv(providerEnv), stdio: ['ignore', 'pipe', 'pipe'] });
  const webUiOutput = captureProcessOutput(webUiProcess);

  const record = await waitForSessionRecord({ siteRoot, agentId, runtimeProcess, runtimeOutput });
  assert.equal(record.agent_id, agentId);
  assert.equal(record.runtime_kind, 'narada-agent-runtime-server');
  assert.equal(record.launch_operator_surface_kind ?? record.operator_surface_kind, 'agent-pi-tui');
  assert.match(record.event_endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/events$/);
  assert.match(record.health_endpoint, /^http:\/\/127\.0\.0\.1:\d+\/health$/);
  assert.ok(record.events_path, 'the live acceptance must use the real events.jsonl path');
  assert.ok(existsSync(record.events_path), `events_path_not_found:${record.events_path}`);

  const startup = await waitForEvent(record.events_path, (event) => event.event === 'session_started', 'session_started');
  assert.equal(startup.runtime, 'narada-agent-runtime-server');
  assert.equal(startup.mcp_scope, 'local-site');
  assert.equal(startup.mcp_operational_state === 'starting' || startup.mcp_operational_state === 'ready', true);
  const health = await waitForHealthy(record.health_endpoint);
  assert.equal(health.status, 'healthy');
  // The durable startup event is a canonical NARS/client projection. Kernel
  // selection is intentionally absent there; only the separate health/
  // diagnostic projection may expose implementation identity.
  assert.equal(startup.intelligence?.intelligence_kernel_kind, undefined);
  assert.equal(startup.intelligence?.kernel, undefined);
  assert.equal(startup.intelligence?.kernel_start_evidence, undefined);

  console.log(`live-e2e: attaching agent-cli, agent-tui, agent-web-ui, and agent-pi-tui to ${record.session_id}`);
  const clientRoot = join(siteRoot, '.ai', 'runtime', 'four-surface-clients');
  await mkdir(clientRoot, { recursive: true });
  const cursorPath = join(clientRoot, 'agent-pi-tui-cursors.json');

  const launchBinding = await waitFor(() => {
    const binding = readJson(launchBindingPath);
    return binding?.status === 'ready' ? binding : null;
  }, 'launch_binding_ready');
  assert.equal(launchBinding.schema, 'narada.operator_projection_launch_binding.v1');
  assert.equal(launchBinding.site_root, siteRoot);
  assert.equal(launchBinding.operator_surface_kind, 'agent-pi-tui');
  assert.equal(launchBinding.nars_session_id ?? launchBinding.runtime_session_id, record.session_id);
  assert.equal(launchBinding.event_endpoint, undefined, 'binding must resolve endpoints through the session record, not embed an arbitrary endpoint');

  const pi = spawnPtySurface('agent-pi-tui', process.execPath, [PI_ENTRYPOINT, '--launch-binding', launchBindingPath], {
    cwd: clientRoot,
    env: processEnv({ ...providerEnv, NARADA_AGENT_PI_TUI_CURSOR_PATH: cursorPath }),
  });
  ptySurfaces.push(pi);
  const agentCli = spawnPtySurface('agent-cli', process.execPath, [AGENT_CLI_ENTRYPOINT, '--launch-binding', launchBindingPath], {
    cwd: clientRoot,
    env: processEnv(providerEnv),
  });
  ptySurfaces.push(agentCli);
  const agentTui = spawnPtySurface('agent-tui', AGENT_TUI_ENTRYPOINT, ['--launch-binding', launchBindingPath, '--identity', `${agentId}.agent-tui`], {
    cwd: clientRoot,
    env: processEnv(providerEnv),
  });
  ptySurfaces.push(agentTui);

  let webUrlMatch;
  try {
    webUrlMatch = await waitForTextMatch(webUiOutput.all, /agent-web-ui:\s+(http:\/\/127\.0\.0\.1:\d+)/, 'agent_web_ui_url');
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}:${webUiOutput.all().slice(-8000)}`);
  }
  webPage = await openCdpPage({ browserPath, url: webUrlMatch[1], workDir: siteRoot });
  await webPage.waitForExpression("document.querySelector('#events') !== null", TIMEOUT_MS);
  await webPage.waitForText(record.session_id, TIMEOUT_MS, 'web_session_identity');
  await Promise.all([
    // Pi's compact status indicator renders the protocol live phase as
    // "live" rather than echoing transport URLs/session metadata.
    waitForPtySurface(pi, ['live', 'connected', 'replaying'], 'pi_attachment'),
    waitForPtySurface(agentCli, [record.session_id, 'operator', 'connected'], 'agent_cli_attachment'),
    // agent-tui's diagnostic header is the stable attach evidence exposed by
    // the current binary; it intentionally does not print the raw endpoint.
    waitForPtySurface(agentTui, ['carrier diagnostic', 'mediated', 'connected'], 'agent_tui_attachment'),
  ]);

  const observedControlEvents = [];
  controlClient = new NarsAttachClient({
    endpoint: record.event_endpoint,
    sessionId: record.session_id,
    reconnect: true,
    reconnectBaseDelayMs: 25,
    reconnectMaxDelayMs: 250,
    maxReconnectAttempts: 8,
    subscriptionId: `live-e2e-control-${Date.now()}`,
  });
  controlClient.onEvent(({ event }) => observedControlEvents.push(event));
  await controlClient.connect();
  await waitFor(() => controlClient.getState().phase === 'live', 'control_client_live');

  // The real runtime owns MCP discovery, tool admission, execution evidence,
  // and the provider follow-up round. The clients only project the results.
  // Run this before the ordinary transcript grows so the PTY observation also
  // catches agent-tui's live tool-request frame rather than only its final
  // follow-up row.
  const agentTuiToolDiagnosticBaseline = countOccurrences(agentTui.text(), 'carrier diagnostic');
  await submitPty(pi, 'PI_LIVE_TOOL');
  await waitForEvent(record.events_path, (event) => event.event === 'carrier_tool_requested' && event.tool_name === 'fixture_echo', 'tool_requested');
  await waitForEvent(record.events_path, (event) => (
    (event.event === 'tool_execution_completed' && event.tool_name === 'fixture_echo')
      || (event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status === 'completed')
  ), 'tool_execution_completed');
  await waitForEvent(record.events_path, (event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_denied' && event.status === 'refused', 'tool_refused');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_TOOL_ASSISTANT', 'tool_assistant_message');
  assert.ok(existsSync(generatedArtifactPath), 'the admitted fixture_artifact tool must create its real file');
  await setProjectionView(webPage, 'operations');
  await Promise.all([
    // The Pi TUI conversation projection presents the provider follow-up
    // rather than duplicating the durable tool row; the exact tool lifecycle
    // is asserted from NARS events and the operations-capable surfaces.
    waitForPtySurface(pi, ['PI_LIVE_TOOL_ASSISTANT'], 'tool_projection:agent-pi-tui'),
    waitForPtySurface(agentCli, ['fixture_echo'], 'tool_projection:agent-cli'),
    // The current Rust TUI deliberately renders the tool lifecycle as a
    // mediated carrier diagnostic without copying the tool name into its
    // compact row.  The durable event assertions above carry the exact tool
    // identity; this proves that a fresh tool diagnostic reached the TUI.
    waitFor(() => countOccurrences(agentTui.text(), 'carrier diagnostic') > agentTuiToolDiagnosticBaseline, 'tool_projection:agent-tui'),
    webPage.waitForText('fixture_echo', TIMEOUT_MS, 'tool_projection:agent-web-ui'),
  ]);
  // The Pi substrate owns the editor input path; use its admitted local slash
  // command instead of relying on a raw control character being forwarded by
  // the editor widget.
  await submitPty(pi, '/view operations');

  // Pi-RPC admits inline artifact candidates through the NARS-owned registrar.
  // The default Pi SDK path does not expose that extension field, so its
  // artifact coverage remains the real MCP fixture_artifact file assertion
  // above; the Pi-RPC matrix carries the durable registration assertion.
  await setProjectionView(webPage, 'conversation');
  await submitPty(pi, '/view conversation');
  if (piRpcMode) {
    const agentTuiArtifactDiagnosticBaseline = countOccurrences(agentTui.text(), 'carrier diagnostic');
    const artifactRegistration = await waitForEvent(
      record.events_path,
      (event) => event.event === 'session_artifact_registered' && event.artifact?.title === 'PI_LIVE_ARTIFACT',
      'artifact_registered',
    );
    const artifactId = artifactRegistration.artifact_id;
    assert.match(String(artifactId), /^art_/);
    const artifactContentResponse = await fetch(new URL(`/sessions/${record.session_id}/artifacts/${encodeURIComponent(artifactId)}/content`, record.health_endpoint));
    assert.equal(artifactContentResponse.status, 200);
    assert.match(await artifactContentResponse.text(), /PI live generated artifact/);
    assert.equal(artifactRegistration.artifact?.kind, 'html');
    // Artifact identity is rendered by each surface's own presentation grammar:
    // Pi and the browser expose the title, agent-cli exposes the admitted
    // registration notice, and agent-tui exposes the raw registration payload.
    // The durable artifact id/content assertions above are the authority-level
    // equivalence check; these surface-specific markers only prove delivery.
    await Promise.all([
      waitForPtySurface(pi, ['PI_LIVE_ARTIFACT'], 'artifact_projection:agent-pi-tui'),
      waitForPtySurface(agentCli, ['Artifact registered'], 'artifact_projection:agent-cli'),
      waitFor(() => countOccurrences(agentTui.text(), 'carrier diagnostic') > agentTuiArtifactDiagnosticBaseline, 'artifact_projection:agent-tui'),
      webPage.waitForText('PI_LIVE_ARTIFACT', TIMEOUT_MS, 'artifact_projection:agent-web-ui'),
    ]);
  }

  // Ordinary submission is driven through the actual Pi binary, not a test
  // event hub or a synthetic client.
  await submitPty(pi, 'PI_LIVE_ORDINARY');
  await waitForEvent(record.events_path, (event) => event.event === 'user_message' && event.content === 'PI_LIVE_ORDINARY', 'ordinary_user_message');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_ORDINARY_ASSISTANT', 'ordinary_assistant_message');
  await waitForAllSurfaces([pi, agentCli, agentTui], webPage, 'PI_LIVE_ORDINARY_ASSISTANT', 'ordinary_projection');

  // The fixture provider returns explicit incremental chunks. The chunks are
  // admitted by the real runtime and persisted into the same events.jsonl.
  await submitPty(pi, 'PI_LIVE_STREAM');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message_stream' && event.content === 'PI_LIVE_STREAM_PARTIAL' && event.done === false, 'stream_partial');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message_stream' && event.content === 'PI_LIVE_STREAM_FINAL' && event.done === true, 'stream_final_chunk');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_STREAM_FINAL', 'stream_assistant_message');
  await waitForAllSurfaces([pi, agentCli, agentTui], webPage, 'PI_LIVE_STREAM_FINAL', 'stream_projection');

  const readRequest = await controlClient.readEvents({ limit: 40, view: 'conversation' });
  assert.equal(readRequest.transport, 'written');
  await waitFor(() => controlClient.getState().phase === 'live', 'durable_events_read');

  // agent-cli is the second real surface driving active-turn steering. The
  // provider fixture holds the first request open so queue admission is
  // observed before the next turn begins.
  await setProjectionView(webPage, 'conversation');
  await submitPty(agentCli, 'PI_LIVE_HOLD');
  const holdUser = await waitForEvent(record.events_path, (event) => event.event === 'user_message' && event.content === 'PI_LIVE_HOLD', 'hold_user_message');
  if (piRpcMode) {
    await waitFor(() => existsSync(piRpcRequestLogPath)
      && readFileSync(piRpcRequestLogPath, 'utf8').includes('PI_LIVE_HOLD'), 'pi_rpc_hold_observed');
  } else {
    await provider.waitForHold();
  }
  const holdTurn = await waitForEvent(
    record.events_path,
    (event) => event.event === 'turn_started' && event.input_event_id === holdUser.input_event_id,
    'hold_turn_started',
  );
  await waitForPtySurface(agentCli, ['thinking...'], 'agent_cli_active_hold');
  await submitPty(agentCli, 'PI_LIVE_STEER');
  const queued = await waitForEvent(
    record.events_path,
    (event) => event.event === 'input_event_queued'
      && event.source === 'operator_steering'
      && event.source_kind === 'operator',
    'steering_queued',
  );
  const steeringUser = await waitForEvent(
    record.events_path,
    (event) => event.event === 'user_message'
      && event.input_event_id === queued.event_id
      && event.source === 'operator_steering'
      && event.source_kind === 'operator'
      && event.delivery_mode === 'admit_after_active_turn',
    'steering_user_message',
  );
  assert.equal(steeringUser.delivery_mode, 'admit_after_active_turn');
  await waitForEvent(
    record.events_path,
    (event) => eventKind(event) === 'input_queued_for_turn_boundary'
      && (event.request_id === queued.request_id || event.payload?.input_event_id === queued.event_id),
    'steering_boundary_queue',
  );
  if (piRpcMode) writeFileSync(piRpcHoldReleasePath, 'release\\n', 'utf8');
  else provider.releaseHold();
  await waitForEvent(
    record.events_path,
    (event) => eventKind(event) === 'input_admitted_to_turn'
      && (event.input_event_id === queued.event_id || event.payload?.input_event_id === queued.event_id),
    'steering_admitted',
  );
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_HOLD_ASSISTANT', 'hold_assistant_message');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_STEER_ASSISTANT', 'steer_assistant_message');
  assert.ok(holdTurn.turn_id, 'active turn must have a durable turn id');
  await waitForAllSurfaces([pi, agentCli, agentTui], webPage, 'PI_LIVE_STEER_ASSISTANT', 'steering_projection');

  // Exercise provider failure and the admitted recovery query without
  // allowing a local projection to manufacture recovery state.
  const agentTuiFailureBaseline = countOccurrences(agentTui.text(), 'failed');
  await submitPty(agentCli, 'PI_LIVE_FAILURE');
  const failure = await waitForEvent(record.events_path, (event) => event.event === 'carrier_turn_failed' && event.error, 'provider_failure');
  await waitFor(
    () => countOccurrences(agentTui.text(), 'failed') > agentTuiFailureBaseline,
    'agent_tui_failure_projection',
  );
  await submitPty(pi, '/recovery');
  await waitFor(() => observedControlEvents.some((event) => event.event === 'session_recovery'), 'recovery_response');
  const recovery = observedControlEvents.find((event) => event.event === 'session_recovery');
  assert.ok(recovery?.session_id === record.session_id || recovery?.request_id, 'recovery response must identify the live session or request');
  const degradedAfterFailure = await waitForRuntimeHealth(record.health_endpoint);
  assert.equal(degradedAfterFailure.status, 'degraded');
  assert.equal(degradedAfterFailure.operational_posture, 'request_runtime_failures');

  // Local detach is intentionally not a session close. The next real Pi
  // process uses the same JsonCursorStore and must replay only the durable
  // suffix generated while it was detached.
  const beforeDetachEvents = readEvents(record.events_path);
  const beforeDetachSequence = Math.max(...beforeDetachEvents.map(eventSequence), 0);
  const beforeDetachCursor = await waitFor(() => {
    if (!existsSync(cursorPath)) return false;
    const cursor = readCursor(cursorPath, record.session_id);
    return cursor >= beforeDetachSequence ? cursor : false;
  }, 'pi_cursor_before_detach');
  assert.ok(beforeDetachCursor >= beforeDetachSequence, `Pi cursor did not persist its durable attach position: ${beforeDetachCursor}/${beforeDetachSequence}`);
  await pi.kill();
  const afterDetachEvents = readEvents(record.events_path);
  assert.equal(afterDetachEvents.some((event) => event.event === 'session_closed'), false, 'local Pi detach must not send session.close');
  assert.equal((await (await fetch(record.health_endpoint)).json()).status, 'degraded');

  await submitPty(agentCli, 'PI_LIVE_RECONNECT');
  const reconnectUser = await waitForEvent(record.events_path, (event) => event.event === 'user_message' && event.content === 'PI_LIVE_RECONNECT', 'reconnect_user_message');
  const agentTuiRecoveryCompletionBaseline = countOccurrences(agentTui.text(), 'completed');
  // The second provider request is a bounded NARS-admitted provider retry,
  // not Pi automatic resend or client replay. There must still be exactly one
  // canonical assistant row for the failed turn.
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_FAILURE_RECOVERED', 'failed_turn_provider_retry_completion');
  const failureAssistantEvents = readEvents(record.events_path).filter((event) => (
    event.event === 'assistant_message'
    && event.turn_id === failure.turn_id
    && event.content === 'PI_LIVE_FAILURE_RECOVERED'
  ));
  assert.equal(failureAssistantEvents.length, 1, 'provider retry must not duplicate the canonical assistant row');
  assert.equal(readEvents(record.events_path).some((event) => (
    event.event === 'pi_event_observed'
    && event.payload?.source_event_type === 'auto_retry_start'
  )), false, 'Pi automatic provider retry must remain disabled; retry admission belongs to NARS');
  await waitForEvent(record.events_path, (event) => event.event === 'assistant_message' && event.content === 'PI_LIVE_RECONNECT_ASSISTANT', 'reconnect_assistant_message');
  await waitFor(
    () => countOccurrences(agentTui.text(), 'completed') > agentTuiRecoveryCompletionBaseline,
    'agent_tui_recovery_projection',
  );
  const piReattached = spawnPtySurface('agent-pi-tui-reattached', process.execPath, [PI_ENTRYPOINT, '--launch-binding', launchBindingPath], {
    cwd: clientRoot,
    env: processEnv({ ...providerEnv, NARADA_AGENT_PI_TUI_CURSOR_PATH: cursorPath }),
  });
  ptySurfaces.push(piReattached);
  await waitForPtySurface(piReattached, ['PI_LIVE_RECONNECT', 'PI_LIVE_RECONNECT_ASSISTANT'], 'pi_durable_cursor_replay');
  const afterReattachCursor = await waitFor(() => {
    const cursor = readCursor(cursorPath, record.session_id);
    return cursor >= eventSequence(reconnectUser) ? cursor : false;
  }, 'pi_cursor_after_reattach');
  assert.ok(afterReattachCursor >= eventSequence(reconnectUser));
  const reconnectEvents = readEvents(record.events_path).filter((event) => event.content === 'PI_LIVE_RECONNECT_ASSISTANT');
  assert.equal(reconnectEvents.length, 1, 'reconnect must not execute the persisted turn twice');

  // Compare durable semantic evidence, rather than terminal escape sequences:
  // every actual surface must expose the same canonical conversation markers,
  // while the event log remains the authoritative operation projection.
  const evidence = {
    'agent-pi-tui': `${pi.text()}\n${piReattached.text()}`,
    'agent-cli': agentCli.text(),
    'agent-tui': agentTui.text(),
    'agent-web-ui': await webPage.bodyText(),
  };
  const semanticMarkers = [
    'PI_LIVE_ORDINARY_ASSISTANT',
    'PI_LIVE_STREAM_FINAL',
    'PI_LIVE_TOOL_ASSISTANT',
    'PI_LIVE_STEER_ASSISTANT',
    'PI_LIVE_RECONNECT_ASSISTANT',
  ];
  for (const [surface, text] of Object.entries(evidence)) {
    for (const marker of semanticMarkers) {
      assert.ok(text.includes(marker), `${surface} did not project canonical marker ${marker}`);
    }
  }

  const finalEventsBeforeClose = readEvents(record.events_path);
  const requiredEventKinds = [
    'session_started',
    'user_message',
    'assistant_message',
    'assistant_message_stream',
    'carrier_tool_requested',
    'carrier_tool_completed',
    'input_event_queued',
    'input_queued_for_turn_boundary',
    'input_admitted_to_turn',
    'carrier_turn_failed',
    ...(piRpcMode ? ['session_artifact_registered'] : []),
  ];
  for (const kind of requiredEventKinds) assert.ok(finalEventsBeforeClose.some((event) => eventKind(event) === kind), `missing durable live scenario event ${kind}`);
  assert.ok(finalEventsBeforeClose.some((event) => (
    (event.event === 'tool_execution_completed' && event.tool_name === 'fixture_echo')
      || (event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status === 'completed')
  )), 'missing durable live scenario event tool_execution_completed');

  // An explicit, admitted close is driven from a real attached client. Switch
  // operation projections on before closing so all four surfaces display the
  // durable terminal event instead of treating it as local process shutdown.
  await setProjectionView(webPage, 'operations');
  const agentTuiCloseProjectionBaseline = agentTui.text();
  piReattached.write('\u000f');
  await submitPty(agentCli, '/exit');
  await waitForEvent(record.events_path, (event) => event.event === 'session_closed', 'admitted_session_close');
  await Promise.all([
    waitFor(() => piReattached.text().toLowerCase().includes('closed') || piReattached.exited(), 'pi_closed_projection'),
    waitFor(() => agentCli.text().toLowerCase().includes('closed') || agentCli.exited(), 'agent_cli_closed_projection'),
    // agent-tui's current renderer may close its transport before rendering a
    // literal lifecycle label. The durable close event above is authoritative;
    // for this surface require either its terminal marker, process exit, or a
    // post-close redraw rather than inventing a client-side close event.
    waitFor(() => {
      const text = agentTui.text();
      return agentTui.exited()
        || text.toLowerCase().includes('closed')
        || text.length > agentTuiCloseProjectionBaseline.length;
    }, 'agent_tui_closed_projection', Math.min(TIMEOUT_MS, 10_000)),
    webPage.waitForText('closed', TIMEOUT_MS, 'web_closed_projection'),
  ]);
  const closeEvents = readEvents(record.events_path).filter((event) => event.event === 'session_closed');
  assert.equal(closeEvents.length, 1, 'admitted session close must produce one durable session_closed event');

  const liveEvidence = await recordLiveEvidence({
    scenario: 'baseline-live-acceptance',
    runtimes: [runtimeProcess],
    clients: [...ptySurfaces, webUiProcess],
    inputBoundary: 'four-surface-real-process',
    durableOracle: record.events_path,
    externalOracles: [
      'session-index-record',
      'fixture-provider-request-log',
      'mcp-child-process',
      'browser-cdp',
      'four-surface-semantic-markers',
      'production-launch-binding',
    ],
    negativeAssertions: [
      'pi-detach-does-not-close-session',
      'only-admitted-close-produces-session-closed',
      'canonical-event-log-rejects-malformed-lines',
      'pi-automatic-provider-retry-is-absent',
    ],
    sameSessionAfterFault: true,
    productionLaunchBinding: true,
    productionLaunchBindingEvidence: {
      ...launchBinding,
      path: launchBindingPath,
      session_id: launchBinding.nars_session_id ?? launchBinding.runtime_session_id ?? record.session_id,
      runtime_pid: Number(record.process_ownership?.pid ?? launchBinding.process_ownership?.pid ?? 0) || null,
    },
    sessionIds: [record.session_id],
    status: 'passed',
    posture: 'production-launch',
  });

  console.log(JSON.stringify({
    schema: 'narada.agent_pi_tui.baseline_live_acceptance_e2e.v1',
    status: 'passed',
    session_id: record.session_id,
    site_id: record.site_id ?? siteId,
    events_path: record.events_path,
    surfaces: Object.keys(evidence),
    semantic_markers: semanticMarkers,
    durable_event_kinds: [...new Set(readEvents(record.events_path).map(eventKind).filter(Boolean))],
    cursor: { before_detach: beforeDetachCursor, after_reattach: afterReattachCursor },
    evidence: liveEvidence,
  }, null, 2));
  scenarioExitCode = 0;
} catch (error) {
  console.error(`agent-pi-tui four-surface live e2e failed: ${error instanceof Error ? error.stack : String(error)}`);
  for (const surface of ptySurfaces) {
    console.error(`live-e2e ${surface.name} output:\n${surface.text().slice(-4000)}`);
  }
  if (webPage) {
    console.error(`live-e2e agent-web-ui body:\n${(await webPage.bodyText().catch(() => '')).slice(-8000)}`);
  }
  if (siteRoot) console.error(`live-e2e site root: ${siteRoot}`);
  process.exitCode = 1;
} finally {
  await cleanupStep('fixture_provider', () => provider?.close?.());
  await cleanupStep('control_client', () => controlClient?.disconnect?.());
  await cleanupStep('browser', () => webPage?.close?.());
  for (const surface of [...ptySurfaces].reverse()) await cleanupStep(surface.name, () => surface.kill());
  await cleanupStep('agent_web_ui_process', () => terminateProcess(webUiProcess));
  await cleanupStep('runtime_launcher_process', () => terminateProcess(runtimeProcess));
  if (siteRoot && process.env.NARADA_KEEP_LIVE_E2E_ARTIFACTS !== '1') {
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
  // node-pty and the headless browser can leave native Windows handles alive
  // after their logical close. The scenario has already asserted the durable
  // outcome; make the gated test process exit deterministically instead of
  // allowing an orphaned native handle to hold CI open indefinitely.
  process.exit(scenarioExitCode);
}

function processEnv(overrides = {}) {
  return Object.fromEntries(Object.entries({ ...process.env, ...overrides })
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]));
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function cleanupStep(label, action, timeoutMs = 5_000) {
  await Promise.race([
    Promise.resolve().then(action).catch(() => {}),
    sleep(timeoutMs),
  ]);
}

async function waitFor(check, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      if (error?.code === 'ERR_ASSERTION' || error?.name === 'AssertionError') throw error;
      lastError = error;
    }
    await sleep(50);
  }
  throw new Error(`${label}_timeout${lastError ? `:${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}`);
}

function readEvents(eventsPath) {
  if (!eventsPath || !existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, 'utf8').split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch (error) {
      throw new Error(`malformed_event_jsonl:${eventsPath}:${index + 1}:${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function eventSequence(event) {
  return Number(event?.event_sequence ?? event?.sequence ?? 0) || 0;
}

function eventKind(event) {
  return event?.event ?? event?.event_kind ?? null;
}

async function waitForEvent(eventsPath, predicate, label) {
  return waitFor(() => readEvents(eventsPath).find(predicate), label);
}

async function waitForSessionRecord({ siteRoot, agentId, runtimeProcess: child, runtimeOutput }) {
  return waitFor(() => {
    // The agent-start CLI intentionally exits after handing a detached real
    // runtime child to the process launcher. A zero exit is therefore not a
    // runtime failure; only a non-zero launcher exit or signal is terminal.
    if (child.signalCode !== null || (child.exitCode !== null && child.exitCode !== 0)) {
      throw new Error(`runtime_exited:${child.exitCode ?? 'null'}:${child.signalCode ?? 'null'}:${runtimeOutput.all().slice(-6000)}`);
    }
    for (const sessionsRoot of [
      join(siteRoot, '.narada', 'crew', 'nars-sessions'),
      join(siteRoot, 'crew', 'nars-sessions'),
    ]) {
      let aggregate;
      try { aggregate = readNarsSessionIndex({ sessionsRoot, siteRoot }); } catch { aggregate = null; }
      for (const entry of aggregate?.sessions ?? []) {
        const path = entry.record_path ?? (entry.session_dir ? join(entry.session_dir, 'session-index-record.json') : null);
        const record = readJson(path);
        if (record?.agent_id === agentId && record.event_endpoint && record.events_path) return record;
      }
      // The aggregate index is eventually consistent with the durable record.
      // During the launch boundary the real runtime can write the record first,
      // so inspect session directories as a read-only fallback rather than
      // making the test depend on index update timing.
      let entries = [];
      try { entries = readdirSync(sessionsRoot, { withFileTypes: true }); } catch { entries = []; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const record = readJson(join(sessionsRoot, entry.name, 'session-index-record.json'));
        if (record?.agent_id === agentId && record.event_endpoint && record.events_path) return record;
      }
    }
    return null;
  }, 'session_index_record');
}

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

async function waitForHealthy(endpoint) {
  return waitFor(async () => {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const body = await response.json();
    return body.status === 'healthy' ? body : null;
  }, 'runtime_healthy');
}

async function waitForRuntimeHealth(endpoint) {
  return waitFor(async () => {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const body = await response.json();
    return ['healthy', 'degraded', 'closing'].includes(body.status) ? body : null;
  }, 'runtime_health_response');
}

function captureProcessOutput(child) {
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding?.('utf8');
  child.stderr?.setEncoding?.('utf8');
  child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  return { stdout: () => stdout, stderr: () => stderr, all: () => `${stdout}\n${stderr}` };
}

async function terminateProcess(child) {
  if (!child || (child.exitCode !== null && child.signalCode !== null)) return;
  if (child.exitCode === null && child.signalCode === null) {
    try { child.kill(); } catch {}
    await Promise.race([once(child, 'exit').catch(() => {}), sleep(1500)]);
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch {}
    }
  }
}

function stripAnsi(value) {
  return String(value ?? '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[()][0-2A-Z]/g, '');
}

function countOccurrences(value, needle) {
  const text = String(value ?? '');
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function spawnPtySurface(name, command, args, options) {
  const terminal = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols: 140,
    rows: 42,
    ...(process.platform === 'win32' ? { useConptyDll: true } : {}),
    cwd: options.cwd,
    env: options.env,
  });
  let output = '';
  let exited = false;
  let resolveExit;
  const exitPromise = new Promise((resolvePromise) => { resolveExit = resolvePromise; });
  terminal.onData((chunk) => { output += String(chunk); });
  terminal.onExit((event) => { exited = true; resolveExit(event); });
  return {
    name,
    terminal,
    write(value) { terminal.write(String(value)); },
    text() { return stripAnsi(output); },
    raw() { return output; },
    exited() { return exited; },
    async kill() {
      if (!exited) {
        try { terminal.kill(); } catch {}
        await Promise.race([exitPromise, sleep(1500)]);
      }
    },
  };
}

async function waitForPtySurface(surface, needles, label) {
  return waitFor(() => {
    if (surface.exited()) throw new Error(`${surface.name}_exited:${surface.text().slice(-4000)}`);
    const text = surface.text();
    return needles.some((needle) => text.includes(needle));
  }, label);
}

async function submitPty(surface, content) {
  surface.write(content);
  surface.write('\r');
  await sleep(100);
}

async function waitForAllSurfaces(ptyClients, page, marker, label) {
  await Promise.all([
    ...ptyClients.map((surface) => waitForPtySurface(surface, [marker], `${label}:${surface.name}`)),
    page.waitForText(marker, TIMEOUT_MS, `${label}:agent-web-ui`),
  ]);
}

function findHeadlessBrowser() {
  return [
    process.env.NARADA_LIVE_BROWSER_PATH,
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) ?? null;
}

async function openCdpPage({ browserPath: executable, url, workDir }) {
  const userDataDir = join(workDir, 'runtime', `pi-tui-live-browser-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(userDataDir, { recursive: true });
  const browser = spawnTestChild(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-position=-32000,-32000',
    '--window-size=1400,1000',
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.setEncoding('utf8');
  const browserWsUrl = await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(`browser_cdp_timeout:${stderr.slice(-1000)}`)), 15_000);
    browser.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolvePromise(match[1]); }
    });
    browser.on('error', (error) => { clearTimeout(timer); rejectPromise(error); });
    browser.on('exit', (code) => { clearTimeout(timer); rejectPromise(new Error(`browser_exited:${code}:${stderr.slice(-1000)}`)); });
  });
  const debugUrl = new URL(browserWsUrl);
  const pages = await fetch(`http://${debugUrl.host}/json/list`).then((response) => response.json());
  const target = pages.find((entry) => entry.type === 'page') ?? pages[0];
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(JSON.stringify(payload.error)));
    else waiter.resolve(payload.result);
  });
  const send = (method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(900);
  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result?.exceptionDetails) throw new Error(`cdp_evaluate_failed:${JSON.stringify(result.exceptionDetails)}`);
      return result?.result?.value;
    },
    async bodyText() { return this.evaluate('document.body?.textContent ?? ""'); },
    async waitForText(text, timeoutMs = TIMEOUT_MS, label = 'web_text') {
      return waitFor(async () => (await this.bodyText()).includes(text), label, timeoutMs);
    },
    async waitForExpression(expression, timeoutMs = TIMEOUT_MS) {
      return waitFor(() => this.evaluate(expression), 'web_expression', timeoutMs);
    },
    async click(selector) {
      const point = await this.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!(e instanceof HTMLElement)) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
      if (!point) throw new Error(`cdp_click_target_missing:${selector}`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    },
    async selectProjectionView(value) {
      await this.evaluate(`(() => { const e = document.querySelector('#projection-verbosity'); if (!(e instanceof HTMLSelectElement)) return false; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { socket.close(); } catch {}
      await Promise.race([once(browser, 'exit').catch(() => {}), sleep(3000)]);
      if (browser.exitCode === null && browser.signalCode === null) {
        try { browser.kill(); } catch {}
      }
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    },
  };
}

async function setProjectionView(page, value) {
  await page.selectProjectionView(value);
  await page.waitForExpression(`document.querySelector('#projection-verbosity')?.value === ${JSON.stringify(value)}`, TIMEOUT_MS);
}

async function waitForTextMatch(readText, regex, label) {
  let match = null;
  await waitFor(() => {
    match = readText().match(regex);
    return match;
  }, label);
  return match;
}

function readCursor(path, sessionId) {
  const parsed = readJson(path) ?? {};
  const key = `${sessionId}::agent-pi-tui`;
  return Number(parsed[key] ?? 0) || 0;
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
  if (rewritten.schema === 'narada.invokable-intelligence.adapter.v1') {
    rewritten.protocol = canonicalAdapterProtocol(providerId);
  }
  if (rewritten.schema === 'narada.invokable-intelligence.access-grant.v1') {
    rewritten.scope = {
      ...rewritten.scope,
      purposes: [...new Set([...(rewritten.scope?.purposes ?? []), 'agent-session'])],
    };
  }
  if (rewritten.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
    rewritten.purposes = [...new Set([...(rewritten.purposes ?? []), 'agent-session'])];
  }
  return rewritten;
}

async function seedIntelligenceRegistry(siteRoot, {
  providerId,
  endpointBaseUrl,
  credentialReference = canonicalCredentialReference(providerId),
  disableTopologyRequirements = false,
}) {
  const dbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endpointUrl = `${endpointBaseUrl.endsWith('/') ? endpointBaseUrl.slice(0, -1) : endpointBaseUrl}/v1/chat/completions`;
  const seed = rewriteCanonicalProvider(buildCanonicalLocalTestSeed({
    endpointBaseUrl,
    endpointUrl,
    adapterProtocol: canonicalAdapterProtocol(providerId),
    credentialStore: 'env',
    credentialReference,
    now,
    validUntil,
  }), providerId);
  for (const record of seed.records) {
    record.record_id = record.document.id;
    record.source.digest = canonicalSha256(record.document);
    if (disableTopologyRequirements
      && record.document?.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
      record.document.topology.nodes = record.document.topology.nodes.map((node) => ({
        ...node,
        required_feasibility: [],
      }));
      record.document.topology.edges = record.document.topology.edges.map((edge) => ({
        ...edge,
        required_feasibility: [],
      }));
      record.source.digest = canonicalSha256(record.document);
    }
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
      evidence_ref: 'evidence:agent-pi-tui-four-surface-live-e2e',
    }],
    evidence_refs: ['evidence:agent-pi-tui-four-surface-live-e2e'],
  };
  return { dbPath, principalBinding };
}

async function startFixtureProvider({ generatedArtifactPath }) {
  const requests = [];
  let toolResponseIssued = false;
  let failureResponseIssued = false;
  let holdObserved = false;
  let holdReleased = false;
  let holdPromise = null;
  let releaseHoldPromise = null;
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
    requests.push(body);
    const messagesText = (body.messages ?? []).map((message) => typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '')).join('\n');
    const latestUserMessage = [...(body.messages ?? [])].reverse().find((message) => message?.role === 'user');
    const latestUserContent = typeof latestUserMessage?.content === 'string'
      ? latestUserMessage.content
      : Array.isArray(latestUserMessage?.content)
        ? latestUserMessage.content
          .map((part) => typeof part === 'string' ? part : part?.type === 'text' ? part.text : '')
          .filter(Boolean)
          .join('')
        : '';
    // Pi reconstructs canonical history into provider-shaped content parts.
    // Route fixture branches from the latest admitted user input rather than
    // matching an older prompt that remains in the disposable context.
    const promptText = latestUserContent || messagesText;
    if (promptText.includes('PI_LIVE_HOLD') && !holdReleased) {
      holdObserved = true;
      holdPromise ??= new Promise((resolvePromise) => { releaseHoldPromise = resolvePromise; });
      await holdPromise;
    }
    if (promptText.includes('PI_LIVE_FAILURE') && !failureResponseIssued) {
      failureResponseIssued = true;
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'PI_LIVE_PROVIDER_FAILURE' } }));
      return;
    }
    let payload;
    if (promptText.includes('PI_LIVE_TOOL') && !toolResponseIssued) {
      toolResponseIssued = true;
      payload = {
        choices: [{ message: { role: 'assistant', tool_calls: [
          { id: 'pi-live-echo', type: 'function', function: { name: 'fixture_echo', arguments: JSON.stringify({ text: 'PI_LIVE_TOOL_ECHO' }) } },
          { id: 'pi-live-artifact', type: 'function', function: { name: 'fixture_artifact', arguments: JSON.stringify({ path: generatedArtifactPath, content: '<!doctype html><h1>PI live generated artifact</h1>' }) } },
          { id: 'pi-live-denied', type: 'function', function: { name: 'fixture_denied', arguments: '{}' } },
        ] } }],
      };
    } else if (promptText.includes('PI_LIVE_STREAM')) {
      payload = {
        narada_stream: [
          { content: 'PI_LIVE_STREAM_PARTIAL', done: false, stream_id: 'pi-live-stream' },
          { content: 'PI_LIVE_STREAM_FINAL', done: true, stream_id: 'pi-live-stream' },
        ],
        choices: [{ message: { role: 'assistant', content: 'PI_LIVE_STREAM_FINAL' } }],
      };
    } else if (promptText.includes('PI_LIVE_ORDINARY')) {
      payload = { choices: [{ message: { role: 'assistant', content: 'PI_LIVE_ORDINARY_ASSISTANT' } }] };
    } else if (promptText.includes('PI_LIVE_TOOL')) {
      payload = {
        narada_artifacts: [{
          kind: 'html',
          title: 'PI_LIVE_ARTIFACT',
          content: '<!doctype html><h1>PI live generated artifact</h1>',
        }],
        choices: [{ message: { role: 'assistant', content: 'PI_LIVE_TOOL_ASSISTANT' } }],
      };
    } else if (promptText.includes('PI_LIVE_HOLD')) {
      payload = { choices: [{ message: { role: 'assistant', content: 'PI_LIVE_HOLD_ASSISTANT' } }] };
    } else if (promptText.includes('PI_LIVE_STEER')) {
      payload = { choices: [{ message: { role: 'assistant', content: 'PI_LIVE_STEER_ASSISTANT' } }] };
    } else if (promptText.includes('PI_LIVE_FAILURE')) {
      payload = { choices: [{ message: { role: 'assistant', content: 'PI_LIVE_FAILURE_RECOVERED' } }] };
    } else if (promptText.includes('PI_LIVE_RECONNECT')) {
      payload = { choices: [{ message: { role: 'assistant', content: 'PI_LIVE_RECONNECT_ASSISTANT' } }] };
    } else {
      payload = { choices: [{ message: { role: 'assistant', content: 'PI_LIVE_DEFAULT_ASSISTANT' } }] };
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => { server.off('error', rejectPromise); resolvePromise(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture_provider_address_missing');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    requests,
    async waitForHold() { await waitFor(() => holdObserved, 'provider_hold_observed'); },
    releaseHold() {
      holdReleased = true;
      releaseHoldPromise?.();
      releaseHoldPromise = null;
    },
    async close() {
      holdReleased = true;
      releaseHoldPromise?.();
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}
