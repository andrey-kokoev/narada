#!/usr/bin/env node

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
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
  console.log('agent-pi-tui controls/launch-binding live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();
const provider = await startFixtureProvider({
  responseFor: ({ prompt }) => ({
    choices: [{ message: { role: 'assistant', content: prompt.includes('GAP_CONTROL_TURN')
      ? 'GAP_CONTROL_TURN_ASSISTANT'
      : `fixture:${prompt}` } }],
  }),
});

let site = null;
let runtime = null;
let pi = null;
let outsideArtifact = null;
let result = { status: 'failed' };

try {
  site = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-controls-${Date.now()}`,
    agentId: `agent-pi-tui-controls-${Date.now()}.resident`,
  });
  runtime = await startRuntime(site, { direct: !productionLaunch });
  const bindingPath = join(site.siteRoot, '.ai', 'runtime', 'valid-pi-binding.json');
  await writeFile(bindingPath, JSON.stringify({
    schema: 'narada.operator_projection_launch_binding.v1',
    status: 'ready',
    site_root: site.siteRoot,
    workspace_root: site.siteRoot,
    agent: site.agentId,
    operator_surface_kind: 'agent-pi-tui',
    runtime_host_kind: 'narada-agent-runtime-server',
    nars_session_id: site.sessionId,
    runtime_session_id: site.sessionId,
    carrier_session_id: site.sessionId,
    launch_session_id: site.sessionId,
    event_endpoint: runtime.eventEndpoint,
    health_endpoint: runtime.healthEndpoint,
  }, null, 2));

  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-controls', bindingPath });
  await pi.waitForText(['live', 'connected', 'replaying'], 'controls_launch_binding_attach');

  const beforeControls = readEvents(site.eventsPath).length;
  await pi.submit('/status');
  await pi.submit('/health');
  await pi.submit('/events');
  await waitFor(() => readEvents(site.eventsPath).length >= beforeControls, 'controls_read_only_frames');
  const afterReadOnlyControls = readEvents(site.eventsPath).slice(beforeControls);
  assert.equal(afterReadOnlyControls.some((event) => event.event === 'user_message'), false, 'read-only controls must not become conversation input');

  await pi.submit('/model model:kimi-k2-thinking');
  const modelReconfiguration = await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'runtime_intelligence_reconfiguration'
      && event.active?.requestedModel?.id === 'model:kimi-k2-thinking',
    'model_reconfiguration',
  );
  assert.equal(modelReconfiguration.reconfiguration_state, 'active');

  await pi.submit('/thinking high');
  const thinkingReconfiguration = await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'runtime_intelligence_reconfiguration'
      && event.active?.requestedOptions?.thinking === 'high',
    'thinking_reconfiguration',
  );
  assert.equal(thinkingReconfiguration.reconfiguration_state, 'active');

  // `/provider` is retained as a visible Pi command, but the NARS runtime
  // rejects legacy provider selection rather than allowing a client to bypass
  // the admitted model/route plan.
  await pi.submit('/provider kimi-code-api');
  const providerRefusal = await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'runtime_intelligence_reconfiguration'
      && event.reconfiguration_state === 'refused'
      && event.requested_options === undefined,
    'provider_reconfiguration_refused',
  );
  assert.equal(providerRefusal.reason, 'target_not_admitted');

  await pi.submit('GAP_CONTROL_TURN');
  await waitForEvent(site.eventsPath, (event) => event.event === 'user_message' && event.content === 'GAP_CONTROL_TURN', 'control_turn_user');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_CONTROL_TURN_ASSISTANT', 'control_turn_assistant');

  outsideArtifact = join(site.siteRoot, '..', `agent-pi-tui-outside-${Date.now()}.txt`);
  await writeFile(outsideArtifact, 'must not be admitted', 'utf8');
  const artifactBefore = readEvents(site.eventsPath).filter((event) => event.event === 'session_artifact_registered').length;
  const outsideResponse = await fetch(new URL(`/sessions/${site.sessionId}/artifacts`, runtime.healthEndpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_path: outsideArtifact, kind: 'text', title: 'outside-root' }),
  });
  assert.equal(outsideResponse.status, 403);
  const outsideBody = await outsideResponse.json();
  assert.equal(outsideBody.error, 'artifact_path_outside_admitted_roots');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  assert.equal(readEvents(site.eventsPath).filter((event) => event.event === 'session_artifact_registered').length, artifactBefore);

  result = {
    schema: 'narada.agent_pi_tui.controls_launch_binding_e2e.v1',
    status: 'passed',
    checks: [
      'valid_launch_binding_attach',
      'status_health_events_controls_are_non_conversation',
      'admitted_model_reconfiguration',
      'admitted_thinking_reconfiguration',
      'legacy_provider_reconfiguration_refused',
      'ordinary_turn_after_controls',
      'artifact_outside_root_refused',
    ],
    evidence: await recordLiveEvidence({
      scenario: 'p1-controls-launch-binding',
      site,
      runtime,
      client: pi,
      durableOracle: site.eventsPath,
      externalOracles: ['fixture-provider-request-log', bindingPath, outsideArtifact],
      negativeAssertions: [
        'read-only-controls-do-not-become-user-messages',
        'legacy-provider-selection-is-refused',
        'outside-root-artifact-is-not-registered',
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
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pi?.kill?.().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await rm(outsideArtifact, { force: true }).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
