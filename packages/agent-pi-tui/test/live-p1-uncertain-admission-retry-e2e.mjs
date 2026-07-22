#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  attachClient,
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
import { buildControlFrame } from '../dist/nars-client/protocol.js';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui uncertain-admission live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();
let dropFirstResponse = true;
const provider = await startFixtureProvider({
  dropResponseFor: ({ prompt }) => prompt === 'GAP_UNCERTAIN' && dropFirstResponse && (dropFirstResponse = false, true),
  responseFor: ({ prompt }) => ({
    choices: [{ message: { role: 'assistant', content: prompt === 'GAP_UNCERTAIN'
      ? 'GAP_UNCERTAIN_RECOVERY_ASSISTANT'
      : `fixture:${prompt}` } }],
  }),
});

let site = null;
let runtime = null;
let pi = null;
let retryClient = null;
let result = { status: 'failed' };

try {
  site = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-uncertain-${Date.now()}`,
    agentId: `agent-pi-tui-uncertain-${Date.now()}.resident`,
  });
  runtime = await startRuntime(site, { direct: !productionLaunch });
  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-uncertain' });
  await pi.waitForText(['live', 'connected', 'replaying'], 'uncertain_attach');

  await pi.submit('GAP_UNCERTAIN');
  await provider.waitForRequest((request) => request.prompt === 'GAP_UNCERTAIN', 'uncertain_provider_write');
  const firstTerminal = await waitForEvent(
    site.eventsPath,
    (event) => event.event === 'invokable_intelligence_terminal' && event.outcome_kind === 'admission-unknown',
    'uncertain_terminal_outcome',
  );
  await waitForEvent(site.eventsPath, (event) => event.event === 'turn_failed' && event.terminal_status === 'failed', 'uncertain_turn_failed');
  await waitFor(() => provider.requests.filter((request) => request.prompt === 'GAP_UNCERTAIN').length === 1, 'uncertain_no_auto_retry');
  assert.equal(readEvents(site.eventsPath).filter((event) => event.event === 'assistant_message' && event.content === 'GAP_UNCERTAIN_RECOVERY_ASSISTANT').length, 0);

  retryClient = await attachClient(runtime, {
    reconnect: false,
    subscriptionId: `gap-uncertain-retry-${Date.now()}`,
  });
  const retryFrame = buildControlFrame('session.submit', {
    content: 'GAP_UNCERTAIN',
    idempotency_key: 'gap-uncertain-key',
    intelligence_invocation: {
      schema: 'narada.invokable-intelligence.invocation-control.v1',
      intent_id: firstTerminal.intent_id,
      operation_id: 'operation:agent-pi-tui-uncertain:retry-1',
      mode: 'retry',
      allow_replan: false,
    },
  });
  const retryTransport = await retryClient.client.sendOperatorFrame(retryFrame, 'GAP_UNCERTAIN');
  assert.equal(retryTransport.transport, 'written');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_UNCERTAIN_RECOVERY_ASSISTANT', 'explicit_retry_assistant');
  await waitFor(() => provider.requests.filter((request) => request.prompt === 'GAP_UNCERTAIN').length === 2, 'explicit_retry_provider_call');

  const events = readEvents(site.eventsPath);
  assert.equal(events.filter((event) => event.event === 'assistant_message' && event.content === 'GAP_UNCERTAIN_RECOVERY_ASSISTANT').length, 1);
  const retryTerminal = events.find((event) => event.event === 'invokable_intelligence_terminal'
    && event.intent_id === firstTerminal.intent_id
    && event.attempt_id !== firstTerminal.attempt_id
    && event.outcome_kind === 'success');
  assert.ok(retryTerminal, 'explicit retry must create a new lineage attempt for the same intent');

  result = {
    schema: 'narada.agent_pi_tui.uncertain_admission_retry_e2e.v1',
    status: 'passed',
    checks: [
      'provider_request_written_then_response_dropped',
      'uncertain_outcome_is_durable',
      'uncertain_admission_does_not_auto_retry',
      'explicit_retry_creates_new_lineage_attempt',
      'one_terminal_assistant_projection_after_retry',
    ],
    provider_requests: provider.requests.length,
    evidence: await recordLiveEvidence({
      scenario: 'p1-uncertain-admission-retry',
      site,
      runtime,
      clients: [pi, retryClient?.client ?? retryClient],
      durableOracle: site.eventsPath,
      externalOracles: [
        'fixture-provider-request-log',
        'dropped-response-boundary',
        'lineage-attempt-records',
        ...(productionLaunch ? ['production-launch-binding'] : []),
      ],
      negativeAssertions: [
        'uncertain-outcome-is-not-automatically-retried',
        'explicit-retry-creates-new-attempt-for-same-intent',
        'assistant-projection-is-emitted-once-after-retry',
      ],
      sameSessionAfterFault: true,
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    site_root: site?.siteRoot,
    events: site ? readEvents(site.eventsPath).slice(-30) : [],
    intelligence_terminals: site ? readEvents(site.eventsPath)
      .filter((event) => event.event === 'invokable_intelligence_terminal')
      .map((event) => ({ intent_id: event.intent_id, attempt_id: event.attempt_id, outcome_kind: event.outcome_kind })) : [],
    submit_controls: site ? readEvents(site.eventsPath)
      .filter((event) => event.event === 'session_control_accepted' && event.method === 'session.submit')
      .map((event) => ({ request_id: event.request_id, idempotency_key: event.idempotency_key, intelligence_invocation: event.intelligence_invocation })) : [],
    provider_requests: provider.requests.map((request) => ({
      prompt: request.prompt,
      messages: request.body?.messages?.map((message) => ({ role: message.role, content: message.content })),
      dropped: request.dropped,
      aborted: request.aborted,
      completed: request.completed,
    })),
    runtime_output: runtime?.output?.(),
    pi_text: pi?.text?.(),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await retryClient?.client.disconnect?.().catch(() => {});
  await pi?.kill?.().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
