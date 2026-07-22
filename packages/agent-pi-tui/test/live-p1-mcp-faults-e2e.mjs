#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanupSite,
  createLiveSite,
  loadPty,
  readEvents,
  spawnPi,
  startFixtureProvider,
  startRuntime,
  stopRuntime,
  waitFor,
  waitForEvent,
  recordLiveEvidence,
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui MCP-fault live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();
const provider = await startFixtureProvider({
  responseFor: ({ prompt, body }) => {
    const hasToolResult = (body.messages ?? []).some((message) => message?.role === 'tool' || message?.role === 'toolResult');
    if (!hasToolResult && ['GAP_MCP_STARTUP', 'GAP_MCP_DISCONNECT', 'GAP_MCP_TIMEOUT', 'GAP_MCP_MALFORMED'].some((marker) => prompt === marker)) {
      return {
        choices: [{ message: { role: 'assistant', content: null, tool_calls: [{
          id: `mcp-fault-${prompt}`,
          type: 'function',
          function: { name: 'fixture_echo', arguments: JSON.stringify({ text: prompt }) },
        }] } }],
      };
    }
    if (!hasToolResult && prompt === 'GAP_MCP_CANCEL') {
      return {
        choices: [{ message: { role: 'assistant', content: null, tool_calls: [{
          id: `mcp-fault-${prompt}`,
          type: 'function',
          function: { name: 'fixture_echo', arguments: JSON.stringify({ text: prompt }) },
        }] } }],
      };
    }
    if (prompt === 'GAP_MCP_CANCEL_RECOVERY') return { choices: [{ message: { role: 'assistant', content: 'fixture:GAP_MCP_CANCEL_RECOVERY' } }] };
    if (prompt === 'GAP_MCP_TIMEOUT_RECOVERY') return { choices: [{ message: { role: 'assistant', content: 'fixture:GAP_MCP_TIMEOUT_RECOVERY' } }] };
    if (prompt === 'GAP_MCP_MALFORMED_RECOVERY') return { choices: [{ message: { role: 'assistant', content: 'fixture:GAP_MCP_MALFORMED_RECOVERY' } }] };
    if (prompt.includes('GAP_MCP_STARTUP')) return { choices: [{ message: { role: 'assistant', content: 'GAP_MCP_STARTUP_ASSISTANT' } }] };
    if (prompt.includes('GAP_MCP_DISCONNECT')) return { choices: [{ message: { role: 'assistant', content: 'GAP_MCP_DISCONNECT_ASSISTANT' } }] };
    if (prompt.includes('GAP_MCP_TIMEOUT')) return { choices: [{ message: { role: 'assistant', content: 'GAP_MCP_TIMEOUT_ASSISTANT' } }] };
    if (prompt.includes('GAP_MCP_CANCEL')) return { choices: [{ message: { role: 'assistant', content: 'GAP_MCP_CANCEL_ASSISTANT' } }] };
    return { choices: [{ message: { role: 'assistant', content: `fixture:${prompt}` } }] };
  },
});

const invalidMcpCommand = `narada-mcp-missing-${Date.now()}`;
const disconnectMarker = join(process.env.TEMP ?? process.cwd(), `agent-pi-tui-mcp-disconnect-${Date.now()}.marker`);
const malformedMarker = join(process.env.TEMP ?? process.cwd(), `agent-pi-tui-mcp-malformed-${Date.now()}.marker`);
let sites = [];
let runtimes = [];
let pis = [];
let result = { status: 'failed' };

const eventName = (event) => event?.event ?? event?.kind ?? event?.event_kind ?? null;

function isToolFailureEvent(event) {
  const kind = eventName(event);
  return (
    (kind === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status !== 'completed')
    || (['tool_execution_failed', 'tool_execution_interrupted'].includes(kind) && event.tool_name === 'fixture_echo')
    || (kind === 'tool_execution_state_transition'
      && event.tool_name === 'fixture_echo'
      && ['failed', 'interrupted', 'refused'].includes(event.execution_state ?? event.terminal_state))
    || (kind === 'turn_failed' && event.error)
  );
}

async function closeCase(site, runtime, pi) {
  await pi?.kill?.().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
}
try {
  // A configured child that cannot start must degrade the gateway and remain
  // fail-closed: the unavailable tool must not be advertised or dispatched.
  const startupSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-mcp-startup-${Date.now()}`,
    agentId: `agent-pi-tui-mcp-startup-${Date.now()}.resident`,
    mcp: true,
    mcpCommand: invalidMcpCommand,
  });
  sites.push(startupSite);
  if (!productionLaunch) {
    const startupRuntime = await startRuntime(startupSite, { allowDegraded: true, direct: true });
    runtimes.push(startupRuntime);
    const startupPi = spawnPi(startupSite, startupRuntime, { name: 'agent-pi-tui-mcp-startup' });
    pis.push(startupPi);
    await startupPi.waitForText(['live', 'connected', 'replaying'], 'mcp_startup_attach');
    await startupPi.submit('GAP_MCP_STARTUP');
    await waitForEvent(startupSite.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_MCP_STARTUP_ASSISTANT', 'mcp_startup_assistant');
    const startupEvents = readEvents(startupSite.eventsPath);
    const eventName = (event) => event.event ?? event.kind;
    assert.equal(startupEvents.some((event) => eventName(event) === 'carrier_tool_requested' && event.tool_name === 'fixture_echo'), false, 'an unavailable startup tool must not be advertised or dispatched');
    assert.equal(startupEvents.some((event) => eventName(event) === 'tool_execution_completed' && event.tool_name === 'fixture_echo'), false);
    assert.equal(startupEvents.some((event) => eventName(event) === 'tool_execution_refused' && event.tool_name === 'fixture_echo'), false);
    const startupFailure = await waitForEvent(startupSite.eventsPath, (event) => eventName(event) === 'capability_gateway_lifecycle_transition' && event.lifecycle_state === 'degraded' && Number(event.startup_failure_count) > 0, 'mcp_startup_degraded');
    assert.equal(startupFailure.operational_state, 'startup_degraded');
    const startupHealth = await waitFor(async () => {
      const response = await fetch(startupRuntime.healthEndpoint);
      if (!response.ok) return false;
      const health = await response.json();
      return health.mcp_operational_state === 'startup_degraded' ? health : false;
    }, 'mcp_startup_health_degraded');
    assert.equal(startupHealth.mcp_operational_state, 'startup_degraded');
    await closeCase(startupSite, startupRuntime, startupPi);
  } else {
    // The governed production launcher rejects a missing MCP executable before
    // it materializes a runtime session; that is a launcher refusal, not the
    // direct runtime's startup-degraded posture. Assert the refusal explicitly
    // and continue with production-bound fault cases below.
    let startupRefusal = null;
    let startupRuntime = null;
    try {
      startupRuntime = await startRuntime(startupSite, { allowDegraded: true, direct: false });
    } catch (error) {
      startupRefusal = error;
    } finally {
      await stopRuntime(startupRuntime, { hard: false }).catch(() => {});
      await cleanupSite(startupSite).catch(() => {});
    }
    assert.ok(startupRefusal, 'production launch must refuse a missing MCP executable');
    assert.match(String(startupRefusal), /runtime_session_index_record_timeout|runtime_launcher_exited/);
    assert.equal(readEvents(startupSite.eventsPath).some((event) => event.event === 'session_started'), false);
  }

  // The child exits after receiving a real tools/call. The production gateway
  // must restart it and complete the same invocation once, without Pi or the
  // carrier fabricating a second tool request.
  const disconnectSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-mcp-disconnect-${Date.now()}`,
    agentId: `agent-pi-tui-mcp-disconnect-${Date.now()}.resident`,
    mcp: true,
    mcpDisconnectMarker: disconnectMarker,
  });
  sites.push(disconnectSite);
  const disconnectRuntime = await startRuntime(disconnectSite, { direct: !productionLaunch });
  runtimes.push(disconnectRuntime);
  const disconnectPi = spawnPi(disconnectSite, disconnectRuntime, { name: 'agent-pi-tui-mcp-disconnect' });
  pis.push(disconnectPi);
  await disconnectPi.waitForText(['live', 'connected', 'replaying'], 'mcp_disconnect_attach');
  await disconnectPi.submit('GAP_MCP_DISCONNECT');
  await waitFor(() => existsSync(disconnectMarker), 'mcp_child_disconnect_observed');
  await waitForEvent(disconnectSite.eventsPath, (event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status === 'completed', 'mcp_disconnect_tool_recovered');
  await waitForEvent(disconnectSite.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_MCP_DISCONNECT_ASSISTANT', 'mcp_disconnect_assistant');
  assert.equal(readEvents(disconnectSite.eventsPath).filter((event) => event.event === 'carrier_tool_requested' && event.tool_name === 'fixture_echo').length, 1);
  assert.equal(readEvents(disconnectSite.eventsPath).filter((event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo').length, 1);
  await closeCase(disconnectSite, disconnectRuntime, disconnectPi);

  // A bounded MCP request timeout must settle the real invocation without
  // turning a delayed child response into a successful tool completion. The
  // later Pi turn proves the session remains usable after the timeout.
  const timeoutSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-mcp-timeout-${Date.now()}`,
    agentId: `agent-pi-tui-mcp-timeout-${Date.now()}.resident`,
    mcp: true,
    mcpToolDelayMs: 1000,
    mcpRequestTimeoutMs: 100,
  });
  sites.push(timeoutSite);
  const timeoutRuntime = await startRuntime(timeoutSite, { direct: !productionLaunch });
  runtimes.push(timeoutRuntime);
  const timeoutPi = spawnPi(timeoutSite, timeoutRuntime, { name: 'agent-pi-tui-mcp-timeout' });
  pis.push(timeoutPi);
  await timeoutPi.waitForText(['live', 'connected', 'replaying'], 'mcp_timeout_attach');
  await timeoutPi.submit('GAP_MCP_TIMEOUT');
  const timeoutFailure = await waitForEvent(timeoutSite.eventsPath, isToolFailureEvent, 'mcp_request_timeout');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  const timeoutEvents = readEvents(timeoutSite.eventsPath);
  assert.equal(timeoutEvents.some((event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status === 'completed'), false);
  assert.equal(timeoutEvents.filter((event) => event.event === 'carrier_tool_requested' && event.tool_name === 'fixture_echo').length, 1);
  await timeoutPi.submit('GAP_MCP_TIMEOUT_RECOVERY');
  await waitForEvent(timeoutSite.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'fixture:GAP_MCP_TIMEOUT_RECOVERY', 'mcp_timeout_recovery_assistant');
  await closeCase(timeoutSite, timeoutRuntime, timeoutPi);

  // Malformed JSON-RPC stdout is a distinct child-boundary failure from a
  // child that is absent or exits. The gateway must not admit the malformed
  // response as a successful tool result, and a later turn must recover.
  const malformedSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-mcp-malformed-${Date.now()}`,
    agentId: `agent-pi-tui-mcp-malformed-${Date.now()}.resident`,
    mcp: true,
    mcpMalformedResponse: true,
    mcpMalformedMarker: malformedMarker,
    mcpRequestTimeoutMs: 100,
  });
  sites.push(malformedSite);
  const malformedRuntime = await startRuntime(malformedSite, { direct: !productionLaunch });
  runtimes.push(malformedRuntime);
  const malformedPi = spawnPi(malformedSite, malformedRuntime, { name: 'agent-pi-tui-mcp-malformed' });
  pis.push(malformedPi);
  await malformedPi.waitForText(['live', 'connected', 'replaying'], 'mcp_malformed_attach');
  await malformedPi.submit('GAP_MCP_MALFORMED');
  await waitFor(() => existsSync(malformedMarker), 'mcp_malformed_stdout_observed');
  const malformedFailure = await waitForEvent(malformedSite.eventsPath, isToolFailureEvent, 'mcp_malformed_response');
  const malformedEvents = readEvents(malformedSite.eventsPath);
  assert.equal(malformedEvents.some((event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status === 'completed'), false);
  await malformedPi.submit('GAP_MCP_MALFORMED_RECOVERY');
  await waitForEvent(malformedSite.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'fixture:GAP_MCP_MALFORMED_RECOVERY', 'mcp_malformed_recovery_assistant');
  await closeCase(malformedSite, malformedRuntime, malformedPi);

  // A slow MCP response is cancelled from the real Pi PTY. The child call is
  // interrupted, no assistant completion is admitted, and a later ordinary
  // Pi turn remains usable.
  const cancelSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-mcp-cancel-${Date.now()}`,
    agentId: `agent-pi-tui-mcp-cancel-${Date.now()}.resident`,
    mcp: true,
    mcpToolDelayMs: 1500,
    mcpRequestTimeoutMs: 5000,
  });
  sites.push(cancelSite);
  const cancelRuntime = await startRuntime(cancelSite, { direct: !productionLaunch });
  runtimes.push(cancelRuntime);
  const cancelPi = spawnPi(cancelSite, cancelRuntime, { name: 'agent-pi-tui-mcp-cancel' });
  pis.push(cancelPi);
  await cancelPi.waitForText(['live', 'connected', 'replaying'], 'mcp_cancel_attach');
  await cancelPi.submit('GAP_MCP_CANCEL');
  await waitForEvent(cancelSite.eventsPath, (event) => eventName(event) === 'carrier_tool_requested' && event.tool_name === 'fixture_echo', 'mcp_cancel_tool_requested');
  await cancelPi.submit('/interrupt');
  await waitForEvent(cancelSite.eventsPath, (event) => eventName(event) === 'tool_execution_interrupted' && event.tool_name === 'fixture_echo', 'mcp_cancel_tool_interrupted');
  await waitForEvent(cancelSite.eventsPath, (event) => eventName(event) === 'carrier_tool_completed' && event.tool_name === 'fixture_echo' && event.status === 'interrupted', 'mcp_cancel_tool_completed');
  await waitForEvent(cancelSite.eventsPath, (event) => eventName(event) === 'turn_interrupted', 'mcp_cancel_turn_interrupted');
  assert.equal(readEvents(cancelSite.eventsPath).some((event) => eventName(event) === 'assistant_message' && event.content === 'GAP_MCP_CANCEL_ASSISTANT'), false);
  await cancelPi.submit('GAP_MCP_CANCEL_RECOVERY');
  await waitForEvent(cancelSite.eventsPath, (event) => eventName(event) === 'assistant_message' && event.content === 'fixture:GAP_MCP_CANCEL_RECOVERY', 'mcp_cancel_recovery_assistant');

  result = {
    schema: 'narada.agent_pi_tui.mcp_faults_e2e.v1',
    status: 'passed',
    checks: [
      ...(productionLaunch
        ? ['production_launch_missing_mcp_is_refused_before_session_materialization']
        : ['mcp_startup_failure_degrades_and_hides_unavailable_tool']),
      'mcp_child_disconnect_restarts_without_duplicate_tool_event',
      'mcp_request_timeout_fails_without_successful_tool_completion',
      'mcp_malformed_stdout_fails_without_successful_tool_completion',
      'pi_originated_mcp_cancellation',
      'post_cancel_pi_turn_recovers',
    ],
    evidence: await recordLiveEvidence({
      scenario: 'p1-mcp-faults',
      sites,
      runtimes,
      clients: pis,
      durableOracle: cancelSite?.eventsPath ?? sites.at(-1)?.eventsPath ?? null,
      externalOracles: [
        'fixture-provider-request-log',
        'mcp-child-process',
        'mcp-child-restart-marker',
        'mcp-malformed-stdout',
        ...(productionLaunch ? ['production-launch-binding'] : []),
      ],
      negativeAssertions: [
        'mcp-startup-failure-does-not-create-tool-side-effect',
        'child-disconnect-does-not-duplicate-tool-event',
        'timeout-and-malformed-tool-do-not-publish-success',
        'cancelled-tool-does-not-publish-assistant-completion',
      ],
      sameSessionAfterFault: true,
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    sites: sites.map((site) => ({ site_root: site.siteRoot, events: readEvents(site.eventsPath).slice(-60) })),
    runtimes: runtimes.map((runtime) => runtime.output?.()),
    pis: pis.map((pi) => pi.text?.()),
    provider_requests: provider.requests.map((request) => ({ prompt: request.prompt, body: request.body })),
  }, null, 2));
  process.exitCode = 1;
} finally {
  for (const pi of pis.reverse()) await pi?.kill?.().catch(() => {});
  for (const runtime of runtimes.reverse()) await stopRuntime(runtime, { hard: false }).catch(() => {});
  for (const site of sites.reverse()) await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
