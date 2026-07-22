#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createLiveSite,
  attachClient,
  cleanupSite,
  eventSequence,
  loadPty,
  readEvents,
  readCursor,
  spawnPi,
  startFixtureProvider,
  startRuntime,
  stopRuntime,
  waitFor,
  waitForEvent,
  recordLiveEvidence,
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui P0 live gaps skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

await loadPty();

let restartHoldOpen = true;
let cancelHoldOpen = true;
const provider = await startFixtureProvider({
  holdPrompts: [
    (prompt) => prompt === 'GAP_RESTART_PENDING' && restartHoldOpen && (restartHoldOpen = false, true),
    (prompt) => prompt === 'GAP_CANCEL' && cancelHoldOpen && (cancelHoldOpen = false, true),
  ],
  responseFor: ({ prompt, requests }) => ({
    choices: [{ message: { role: 'assistant', content: prompt.includes('GAP_RESTART_COMPLETED')
      ? 'GAP_RESTART_COMPLETED_ASSISTANT'
      : prompt.includes('GAP_RESTART_PENDING')
        ? 'GAP_RESTART_PENDING_ASSISTANT'
        : prompt.includes('GAP_CANCEL_RECOVERY') || (prompt === 'GAP_CANCEL' && requests.filter((request) => request.prompt === 'GAP_CANCEL').length > 1)
          ? 'GAP_CANCEL_RECOVERY_ASSISTANT'
          : 'GAP_P0_ASSISTANT' } }],
  }),
});

let result = { status: 'failed' };
const resources = [];
let pendingSite = null;
let activeSite = null;
let recoveryObserver = null;

try {
  pendingSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-restart-pending-${Date.now()}`,
    agentId: `agent-pi-tui-restart-pending-${Date.now()}.resident`,
  });
  activeSite = pendingSite;
  resources.push(pendingSite);
  const pendingRuntime = await startRuntime(pendingSite, { direct: !productionLaunch });
  resources.push(pendingRuntime);
  const cursorPath = `${pendingSite.siteRoot}/.ai/runtime/restart-cursor.json`;
  const pendingPi = spawnPi(pendingSite, pendingRuntime, { cursorPath, name: 'agent-pi-tui-restart-pending' });
  resources.push(pendingPi);
  await pendingPi.waitForText(['live', 'connected', 'replaying'], 'restart_pending_attach');
  await pendingPi.submit('GAP_RESTART_PENDING');
  await provider.waitForRequest((request) => request.prompt.includes('GAP_RESTART_PENDING'), 'restart_pending_provider_call');
  await waitForEvent(pendingSite.eventsPath, (event) => event.event === 'turn_started' && event.content === undefined, 'restart_pending_turn_started');
  const beforeCrash = readEvents(pendingSite.eventsPath);
  assert.equal(beforeCrash.some((event) => event.event === 'session_closed'), false, 'the crash window must not close the session');
  await pendingPi.kill();
  await stopRuntime(pendingRuntime, { hard: true });
  assert.equal(readEvents(pendingSite.eventsPath).some((event) => event.event === 'session_closed'), false, 'hard runtime crash must not append session_closed');

  const restartedPendingRuntime = await startRuntime(pendingSite, {
    direct: !productionLaunch,
    resumeSessionId: productionLaunch ? pendingSite.sessionId : null,
  });
  resources.push(restartedPendingRuntime);
  const restartedPi = spawnPi(pendingSite, restartedPendingRuntime, { cursorPath, name: 'agent-pi-tui-restart-recovered' });
  resources.push(restartedPi);
  await restartedPi.waitForText(['live', 'connected', 'replaying'], 'restart_recovered_attach');
  await waitForEvent(pendingSite.eventsPath, (event) => event.event === 'session_recovery_drain_failed', 'restart_recovery_state');
  // `/recovery` is a control response delivered over the live attach
  // transport, not a durable journal event. Observe it with a second real
  // attach client instead of incorrectly polling events.jsonl for the reply.
  recoveryObserver = await attachClient(restartedPendingRuntime, {
    sessionId: pendingSite.sessionId,
    subscriptionId: `agent-pi-tui-recovery-observer-${Date.now()}`,
  });
  await restartedPi.submit('/recovery');
  const recoverySnapshot = await waitFor(
    () => recoveryObserver.events.find((event) => event.event === 'session_recovery' && event.request_id),
    'explicit_same_session_recovery',
  );
  assert.equal(recoverySnapshot.session_id, pendingSite.sessionId);
  assert.ok((recoverySnapshot.operator_input_queue?.pending_count ?? 0) >= 1, 'failed recovery must remain explicitly queued');
  const pendingEvents = readEvents(pendingSite.eventsPath);
  assert.equal(pendingEvents.filter((event) => event.event === 'user_message' && event.content === 'GAP_RESTART_PENDING').length, 1);
  assert.equal(pendingEvents.filter((event) => event.event === 'assistant_message' && event.content === 'GAP_RESTART_PENDING_ASSISTANT').length, 0, 'an ambiguous in-flight provider attempt must not be silently duplicated');
  assert.ok(pendingEvents.every((event, index, all) => index === 0 || eventSequence(event) > eventSequence(all[index - 1])), 'restart recovery must preserve strict durable ordering');
  const recoveredCursor = await waitFor(() => readCursor(cursorPath, pendingSite.sessionId) >= Math.max(...pendingEvents.map(eventSequence)), 'restart_cursor_advanced');
  assert.ok(recoveredCursor > 0);

  // A failed recovery leaves the ambiguous turn durably visible for an
  // explicit operator decision. The separate P1 uncertain-admission probe
  // proves the explicit retry lineage; the completed-turn restart assertion
  // below proves that a committed turn is not redispatched.
  await restartedPi.kill();
  await stopRuntime(restartedPendingRuntime, { hard: false });

  const completedSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-restart-completed-${Date.now()}`,
    agentId: `agent-pi-tui-restart-completed-${Date.now()}.resident`,
  });
  activeSite = completedSite;
  resources.push(completedSite);
  const completedRuntime = await startRuntime(completedSite, { direct: !productionLaunch });
  resources.push(completedRuntime);
  const completedCursorPath = `${completedSite.siteRoot}/.ai/runtime/completed-cursor.json`;
  const completedPi = spawnPi(completedSite, completedRuntime, { cursorPath: completedCursorPath, name: 'agent-pi-tui-completed' });
  resources.push(completedPi);
  await completedPi.waitForText(['live', 'connected', 'replaying'], 'completed_attach');
  await completedPi.submit('GAP_RESTART_COMPLETED');
  await waitForEvent(completedSite.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_RESTART_COMPLETED_ASSISTANT', 'restart_completed_assistant');
  const providerCallsBeforeCompletedCrash = provider.requests.filter((request) => request.prompt.includes('GAP_RESTART_COMPLETED')).length;
  await completedPi.kill();
  await stopRuntime(completedRuntime, { hard: true });
  const completedRestartRuntime = await startRuntime(completedSite, {
    direct: !productionLaunch,
    resumeSessionId: productionLaunch ? completedSite.sessionId : null,
  });
  resources.push(completedRestartRuntime);
  await waitFor(() => provider.requests.filter((request) => request.prompt.includes('GAP_RESTART_COMPLETED')).length === providerCallsBeforeCompletedCrash, 'completed_turn_not_redispatched');
  // Use a fresh projection cursor: this is a durable replay assertion, not a
  // reconnect assertion from a cursor already advanced past the assistant.
  const completedReplayCursorPath = `${completedSite.siteRoot}/.ai/runtime/completed-replay-cursor.json`;
  const completedRestartPi = spawnPi(completedSite, completedRestartRuntime, { cursorPath: completedReplayCursorPath, name: 'agent-pi-tui-restart-completed' });
  resources.push(completedRestartPi);
  await completedRestartPi.waitForText('GAP_RESTART_COMPLETED_ASSISTANT', 'completed_restart_projection');
  assert.equal(readEvents(completedSite.eventsPath).filter((event) => event.event === 'assistant_message' && event.content === 'GAP_RESTART_COMPLETED_ASSISTANT').length, 1);

  const cancelSite = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-cancel-${Date.now()}`,
    agentId: `agent-pi-tui-cancel-${Date.now()}.resident`,
  });
  activeSite = cancelSite;
  resources.push(cancelSite);
  const cancelRuntime = await startRuntime(cancelSite, { direct: !productionLaunch });
  resources.push(cancelRuntime);
  const cancelPi = spawnPi(cancelSite, cancelRuntime, { name: 'agent-pi-tui-cancel' });
  resources.push(cancelPi);
  await cancelPi.waitForText(['live', 'connected', 'replaying'], 'cancel_attach');
  await cancelPi.submit('GAP_CANCEL');
  const cancelProviderRequest = await provider.waitForRequest((request) => request.prompt.includes('GAP_CANCEL'), 'cancel_provider_call');
  const cancelRequestCountBefore = provider.requests.length;
  await waitForEvent(cancelSite.eventsPath, (event) => event.event === 'turn_started', 'cancel_turn_started');
  await cancelPi.submit('/interrupt');
  await waitForEvent(cancelSite.eventsPath, (event) => event.event === 'session_turn_cancel_requested' || event.event === 'interrupt_requested', 'cancel_control_admitted');
  await waitForEvent(cancelSite.eventsPath, (event) => event.event === 'turn_interrupted', 'cancel_turn_interrupted');
  await waitFor(() => cancelProviderRequest.aborted || provider.aborts.includes(cancelProviderRequest), 'provider_abort_observed');
  const cancelledEvents = readEvents(cancelSite.eventsPath);
  assert.equal(cancelledEvents.some((event) => event.event === 'assistant_message' && event.content === 'GAP_CANCEL_ASSISTANT'), false, 'cancelled turn must not publish an assistant completion');
  assert.equal(provider.requests.length, cancelRequestCountBefore, 'cancellation must not auto-retry the provider');
  await cancelPi.submit('GAP_CANCEL_RECOVERY');
  await waitForEvent(cancelSite.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_CANCEL_RECOVERY_ASSISTANT', 'post_cancel_submission');
  await cancelPi.submit('\u0003');
  await waitFor(() => cancelPi.exited(), 'ctrl_c_detaches_pi');
  assert.equal(readEvents(cancelSite.eventsPath).some((event) => event.event === 'session_closed'), false, 'Ctrl+C is projection detach, not session close');

  result = {
    schema: 'narada.agent_pi_tui.p0_durability_cancellation_e2e.v1',
    status: 'passed',
    checks: [
      'runtime_crash_restart_recovery',
      'completed_turn_not_redispatched_after_restart',
      'durable_cursor_replay',
      'pi_originated_cancellation',
      'provider_abort_observed',
      'ctrl_c_detach_without_session_close',
    ],
    provider_requests: provider.requests.length,
    evidence: await recordLiveEvidence({
      scenario: 'p0-durability-cancellation',
      sites: resources.filter((resource) => resource?.eventsPath),
      runtimes: resources.filter((resource) => resource?.healthEndpoint),
      clients: resources.filter((resource) => resource?.terminal),
      durableOracle: activeSite?.eventsPath ?? pendingSite?.eventsPath,
      externalOracles: [
        'fixture-provider-request-log',
        'runtime-child-exit-and-restart',
        'cursor-file',
        'session-recovery-response',
        ...(productionLaunch ? ['production-launch-binding'] : []),
      ],
      negativeAssertions: [
        'hard-runtime-crash-does-not-close-session',
        'ambiguous-provider-attempt-is-not-silently-duplicated',
        'completed-turn-is-not-redispatched',
        'ctrl-c-does-not-close-session',
      ],
      sameSessionAfterFault: true,
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (pendingSite) {
    console.error(JSON.stringify({
      site_root: pendingSite.siteRoot,
      events: readEvents(pendingSite.eventsPath).slice(-40),
      provider_requests: provider.requests.map((request) => ({ prompt: request.prompt, aborted: request.aborted, completed: request.completed })),
      runtime_output: resources.filter((resource) => resource?.output).map((resource) => resource.output()).slice(-2),
      active_site_root: activeSite?.siteRoot,
      active_events: activeSite && readEvents(activeSite.eventsPath).slice(-60),
      active_terminal_text: resources.filter((resource) => resource?.text).map((resource) => ({ name: resource.name, text: resource.text().slice(-3000) })),
    }, null, 2));
  }
  process.exitCode = 1;
} finally {
  await recoveryObserver?.client?.disconnect?.().catch(() => {});
  for (const resource of resources.reverse()) {
    if (resource?.terminal) await resource.kill?.().catch(() => {});
    else if (resource?.child) await stopRuntime(resource, { hard: false }).catch(() => {});
    else if (resource?.siteRoot) await cleanupSite(resource).catch(() => {});
  }
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'passed' ? 0 : 1);
