#!/usr/bin/env node

import assert from 'node:assert/strict';
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
  waitForNewEvent,
  recordLiveEvidence,
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui provider/auth faults live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');
let authFailureActive = true;
let malformedResponseActive = true;

const provider = await startFixtureProvider({
  responseFor: ({ prompt }) => {
    if (prompt === 'GAP_AUTH_FAILURE' && authFailureActive) {
      return {
        status: 401,
        body: { error: { code: 'invalid_api_key', message: 'fixture authentication rejected' } },
      };
    }
    if (prompt === 'GAP_PROVIDER_MALFORMED' && malformedResponseActive) {
      return { status: 200, rawBody: '{malformed-provider-response' };
    }
    const content = prompt === 'GAP_AUTH_RECOVERY'
      ? 'GAP_AUTH_RECOVERY_ASSISTANT'
      : prompt === 'GAP_MALFORMED_RECOVERY'
        ? 'GAP_MALFORMED_RECOVERY_ASSISTANT'
        : `fixture:${prompt}`;
    return { choices: [{ message: { role: 'assistant', content } }] };
  },
});

let site = null;
let runtime = null;
let pi = null;
let result = { status: 'failed' };

function isTurnFailure(event) {
  return (event.event === 'carrier_turn_failed' || event.event === 'turn_failed')
    && (event.error || event.terminal_status === 'failed' || event.terminal_state === 'failed');
}

try {
  await loadPty();
  site = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-provider-faults-${Date.now()}`,
    agentId: `agent-pi-tui-provider-faults-${Date.now()}.resident`,
  });
  runtime = await startRuntime(site, { direct: !productionLaunch });
  pi = spawnPi(site, runtime, { name: 'agent-pi-tui-provider-faults' });
  await pi.waitForText(['live', 'connected', 'replaying'], 'provider_faults_attach');

  let previousEventCount = readEvents(site.eventsPath).length;
  await pi.submit('GAP_AUTH_FAILURE');
  await waitForNewEvent(site.eventsPath, previousEventCount, isTurnFailure, 'auth_failure_durable');
  assert.equal(readEvents(site.eventsPath).some((event) => event.event === 'assistant_message' && event.content === 'GAP_AUTH_FAILURE_ASSISTANT'), false);
  assert.equal(provider.requests.filter((request) => request.prompt === 'GAP_AUTH_FAILURE').length >= 1, true);

  authFailureActive = false;
  previousEventCount = readEvents(site.eventsPath).length;
  await pi.submit('GAP_AUTH_RECOVERY');
  await waitForNewEvent(site.eventsPath, previousEventCount, (event) => event.event === 'assistant_message' && event.content === 'GAP_AUTH_RECOVERY_ASSISTANT', 'auth_recovery_assistant');

  previousEventCount = readEvents(site.eventsPath).length;
  await pi.submit('GAP_PROVIDER_MALFORMED');
  await waitForNewEvent(site.eventsPath, previousEventCount, isTurnFailure, 'malformed_provider_failure');
  assert.equal(readEvents(site.eventsPath).some((event) => event.event === 'assistant_message' && event.content === 'GAP_PROVIDER_MALFORMED_ASSISTANT'), false);
  assert.equal(provider.requests.filter((request) => request.prompt === 'GAP_PROVIDER_MALFORMED').length >= 1, true);

  malformedResponseActive = false;
  previousEventCount = readEvents(site.eventsPath).length;
  await pi.submit('GAP_MALFORMED_RECOVERY');
  await waitForNewEvent(site.eventsPath, previousEventCount, (event) => event.event === 'assistant_message' && event.content === 'GAP_MALFORMED_RECOVERY_ASSISTANT', 'malformed_recovery_assistant');

  const failureEvents = readEvents(site.eventsPath).filter(isTurnFailure);
  assert.ok(failureEvents.length >= 2);
  result = {
    schema: 'narada.agent_pi_tui.provider_auth_faults_e2e.v1',
    status: 'passed',
    checks: [
      'external-provider-authentication-rejection-is-durable',
      'external-provider-malformed-response-is-durable',
      'auth-recovery-uses-a-new-admitted-turn',
      'malformed-response-recovery-uses-a-new-admitted-turn',
      'failed-provider-turns-do-not-project-success-assistants',
    ],
    provider_requests: provider.requests.length,
    evidence: await recordLiveEvidence({
      scenario: 'p1-provider-auth-faults',
      site,
      runtime,
      clients: [pi],
      durableOracle: site.eventsPath,
      externalOracles: ['fixture-provider-request-log', 'http-401-auth-boundary', 'malformed-provider-response-boundary'],
      negativeAssertions: [
        'auth-failure-does-not-project-success-assistant',
        'malformed-provider-response-does-not-project-success-assistant',
      ],
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({
    site_root: site?.siteRoot,
    events: site ? readEvents(site.eventsPath).slice(-40) : [],
    provider_requests: provider.requests.map((request) => ({ prompt: request.prompt, completed: request.completed, aborted: request.aborted })),
    runtime_output: runtime?.output?.(),
    pi_text: pi?.text?.(),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pi?.kill?.().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
