#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createLiveSite,
  cleanupSite,
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
  console.log('agent-pi-tui authority-negative live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();
const deniedMarker = join(process.env.TEMP ?? process.cwd(), `agent-pi-tui-denied-${Date.now()}.marker`);
const provider = await startFixtureProvider({
  responseFor: ({ prompt, body }) => {
    const hasToolResult = (body.messages ?? []).some((message) => message?.role === 'tool' || message?.role === 'toolResult');
    if (prompt.includes('GAP_DENIED_TOOL') && !hasToolResult) {
      return {
        choices: [{ message: { role: 'assistant', content: null, tool_calls: [{
          id: 'gap-denied-call',
          type: 'function',
          function: { name: 'fixture_denied', arguments: '{}' },
        }] } }],
      };
    }
    return { choices: [{ message: { role: 'assistant', content: 'GAP_DENIED_TOOL_ASSISTANT' } }] };
  },
});

let site = null;
let runtime = null;
let pi = null;
let invalidPi = null;
let result = { status: 'failed' };
try {
  site = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-authority-negative-${Date.now()}`,
    agentId: `agent-pi-tui-authority-negative-${Date.now()}.resident`,
    mcp: true,
    deniedTools: 'fixture_denied',
    deniedSideEffectPath: deniedMarker,
  });
  runtime = await startRuntime(site, { direct: !productionLaunch });
  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-authority-negative' });
  await pi.waitForText(['live', 'connected', 'replaying'], 'authority_negative_attach');
  await waitForEvent(site.eventsPath, (event) => event.event === 'session_started' && (event.mcp_operational_state === 'starting' || event.mcp_operational_state === 'ready'), 'mcp_startup_event');
  // The launcher may expose a short-lived health projection race while the
  // capability gateway is transitioning from `starting` to `healthy`. The
  // durable lifecycle event is the authoritative startup oracle; startRuntime
  // has already separately admitted the runtime's HTTP health endpoint.
  await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'capability_gateway_lifecycle_transition'
      && ['healthy', 'degraded'].includes(event.lifecycle_state),
    'mcp_fixture_startup',
  );

  const beforeUnknownEvents = readEvents(site.eventsPath).length;
  const beforeUnknownProviderCalls = provider.requests.length;
  await pi.submit('/not-a-real-command');
  await pi.submit('!not-a-shell-command');
  await waitFor(() => pi.text().includes('Unknown command') && pi.text().includes('Shell escapes are unavailable'), 'local_negative_notices');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  const afterUnknownEvents = readEvents(site.eventsPath).slice(beforeUnknownEvents);
  assert.equal(provider.requests.length, beforeUnknownProviderCalls, 'local unknown/shell input must not reach the provider');
  assert.equal(afterUnknownEvents.some((event) => event.event === 'user_message' && (event.content === '/not-a-real-command' || event.content === '!not-a-shell-command')), false, 'local unknown/shell input must not become a durable user message');

  await pi.submit('GAP_DENIED_TOOL');
  await waitForEvent(site.eventsPath, (event) => event.event === 'carrier_tool_requested' && event.tool_name === 'fixture_denied', 'denied_tool_requested');
  await waitForEvent(site.eventsPath, (event) => event.event === 'carrier_tool_completed' && event.tool_name === 'fixture_denied' && event.status === 'refused', 'denied_tool_refused');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_DENIED_TOOL_ASSISTANT', 'denied_followup');
  const refusalEvidence = await waitForEvent(site.eventsPath, (event) => event.event === 'tool_execution_refused' && event.tool_name === 'fixture_denied', 'denied_tool_admission_evidence');
  assert.equal(refusalEvidence.admission?.admitted, false);
  assert.equal(refusalEvidence.admission?.reason, 'denied_by_runtime_policy');
  assert.equal(existsSync(deniedMarker), false, 'a refused tool must not execute its child-side effect');
  assert.equal(provider.requests.some((request) => JSON.stringify(request.body).includes('denied-fixture-reached')), false);

  const beforeBindingEvents = readEvents(site.eventsPath).length;
  const bindingPath = join(site.siteRoot, '.ai', 'runtime', 'invalid-pi-binding.json');
  const resultPath = join(site.siteRoot, '.ai', 'runtime', 'wrong-binding-agent-start-result.json');
  await writeFile(resultPath, JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    identity: site.agentId,
    runtime: 'narada-agent-runtime-server',
    target_site_root: site.siteRoot,
    session_id: site.sessionId,
    nars_session_id: site.sessionId,
    handoff: { session_ref: { id: site.sessionId, kind: 'nars' } },
  }));
  await writeFile(bindingPath, JSON.stringify({
    schema: 'narada.operator_projection_launch_binding.v1',
    status: 'ready',
    site_root: site.siteRoot,
    workspace_root: site.siteRoot,
    agent: site.agentId,
    operator_surface_kind: 'agent-pi-tui',
    runtime_host_kind: 'narada-agent-runtime-server',
    agent_start_result_file: resultPath,
    nars_session_id: 'wrong-session',
    launch_session_id: site.sessionId,
    event_endpoint: runtime.eventEndpoint,
    health_endpoint: runtime.healthEndpoint,
  }));
  invalidPi = spawnPi(site, runtime, { name: 'agent-pi-tui-invalid-binding', bindingPath });
  await waitFor(() => invalidPi.exited(), 'invalid_binding_rejected');
  assert.match(invalidPi.text(), /launch_binding_session_mismatch/i);
  assert.equal(readEvents(site.eventsPath).length, beforeBindingEvents, 'invalid launch binding must not mutate the live session');

  result = {
    schema: 'narada.agent_pi_tui.authority_negative_e2e.v1',
    status: 'passed',
    checks: [
      'unknown_slash_is_local',
      'shell_escape_is_local',
      'refused_tool_has_no_child_side_effect',
      'stale_launch_binding_identity_rejected',
    ],
    evidence: await recordLiveEvidence({
      scenario: 'p1-authority-negative',
      site,
      runtime,
      clients: [pi, invalidPi],
      durableOracle: site.eventsPath,
      externalOracles: ['fixture-provider-request-log', deniedMarker, resultPath, 'invalid-binding-process-exit'],
      negativeAssertions: [
        'unknown-local-input-does-not-reach-provider',
        'refused-tool-does-not-create-child-side-effect',
        'stale-binding-identity-does-not-mutate-session',
      ],
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    site_root: site?.siteRoot,
    events: site ? readEvents(site.eventsPath).slice(-80) : [],
    runtime_output: runtime?.output?.(),
    pi_text: pi?.text?.(),
    health: runtime?.healthEndpoint ? await fetch(runtime.healthEndpoint).then((response) => response.json()).catch((healthError) => String(healthError)) : null,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await invalidPi?.kill?.().catch(() => {});
  await pi?.kill?.().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
