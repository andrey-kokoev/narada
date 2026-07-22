#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  attachClient,
  cleanupSite,
  createLiveSite,
  eventSequence,
  readEvents,
  startFixtureProvider,
  startRuntime,
  stopRuntime,
  waitFor,
  waitForEvent,
  recordLiveEvidence,
} from './live-test-harness.mjs';

if (!process.argv.includes('--enable-live-e2e') && process.env.NARADA_AGENT_PI_TUI_LIVE_E2E !== '1') {
  console.log('agent-pi-tui transport/idempotency live e2e skipped (pass --enable-live-e2e)');
  process.exit(0);
}

const productionLaunch = process.argv.includes('--production-launch');

class CloseAfterMarkerWebSocket {
  static marker = null;
  static closeAfterFirstSubmit = false;
  static submitted = false;

  constructor(url) {
    this.inner = new globalThis.WebSocket(url);
    this.closedAfterMarker = false;
  }

  get readyState() { return this.inner.readyState; }

  addEventListener(type, listener, options) {
    this.inner.addEventListener(type, (event) => {
      listener(event);
      if (type === 'message' && !this.closedAfterMarker && CloseAfterMarkerWebSocket.marker
        && String(event.data).includes(CloseAfterMarkerWebSocket.marker)) {
        this.closedAfterMarker = true;
        setTimeout(() => this.inner.close(), 0);
      }
    }, options);
  }

  removeEventListener(type, listener, options) {
    this.inner.removeEventListener(type, listener, options);
  }

  send(data) {
    this.inner.send(data);
    const frame = JSON.parse(String(data));
    if (CloseAfterMarkerWebSocket.closeAfterFirstSubmit
      && !CloseAfterMarkerWebSocket.submitted
      && frame.method === 'session.submit') {
      CloseAfterMarkerWebSocket.submitted = true;
      // The frame has crossed the real WebSocket boundary, but the client is
      // told that the write outcome is ambiguous. This is the failure window
      // the production adapter must not automatically resend.
      this.inner.close();
      throw new Error('synthetic_proxy_disconnect_after_forwarded_write');
    }
  }

  close() { this.inner.close(); }
}

const provider = await startFixtureProvider({
  responseFor: ({ prompt }) => ({
    choices: [{ message: { role: 'assistant', content: prompt.includes('GAP_OVERLAP_DURING')
      ? 'GAP_OVERLAP_DURING_ASSISTANT'
      : prompt.includes('GAP_OVERLAP_FIRST')
        ? 'GAP_OVERLAP_FIRST_ASSISTANT'
      : prompt.includes('GAP_IDEMPOTENT')
        ? 'GAP_IDEMPOTENT_ASSISTANT'
        : 'GAP_AMBIGUOUS_ASSISTANT' } }],
  }),
});
let site = null;
let runtime = null;
const clients = [];
let result = { status: 'failed' };

try {
  site = await createLiveSite({
    provider,
    sessionId: `agent-pi-tui-transport-${Date.now()}`,
    agentId: `agent-pi-tui-transport-${Date.now()}.resident`,
  });
  runtime = await startRuntime(site, { direct: !productionLaunch });

  CloseAfterMarkerWebSocket.closeAfterFirstSubmit = true;
  const ambiguous = await attachClient(runtime, {
    WebSocketImpl: CloseAfterMarkerWebSocket,
    reconnect: true,
    cursorKey: `${site.sessionId}::ambiguous`,
    subscriptionId: `gap-ambiguous-${Date.now()}`,
  });
  clients.push(ambiguous);
  const ambiguousResult = await ambiguous.client.submit('GAP_AMBIGUOUS', { idempotencyKey: 'gap-ambiguous-key' });
  assert.equal(ambiguousResult.transport, 'ambiguous');
  assert.equal(ambiguousResult.retryAllowed, false);
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_AMBIGUOUS_ASSISTANT', 'ambiguous_forwarded_completion');
  const ambiguousProviderCount = provider.requests.filter((request) => request.prompt.includes('GAP_AMBIGUOUS')).length;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
  assert.equal(provider.requests.filter((request) => request.prompt.includes('GAP_AMBIGUOUS')).length, ambiguousProviderCount, 'ambiguous transport must not auto-resend');
  const stable = await attachClient(runtime, { reconnect: false, subscriptionId: `gap-stable-${Date.now()}` });
  clients.push(stable);
  const explicitRetry = await stable.client.submit('GAP_AMBIGUOUS', { idempotencyKey: 'gap-ambiguous-key' });
  assert.equal(explicitRetry.transport, 'written');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
  assert.equal(provider.requests.filter((request) => request.prompt.includes('GAP_AMBIGUOUS')).length, ambiguousProviderCount, 'same-key explicit retry must reuse the durable operation');

  const first = await attachClient(runtime, {
    reconnect: true,
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 30,
    maxReconnectAttempts: 8,
    subscriptionId: `gap-overlap-${Date.now()}`,
    cursorKey: `${site.sessionId}::gap-overlap`,
    WebSocketImpl: class extends CloseAfterMarkerWebSocket {},
  });
  clients.push(first);
  // Configure this instance after construction so the same production client
  // path is used without changing the runtime endpoint.
  CloseAfterMarkerWebSocket.marker = 'GAP_OVERLAP_FIRST_ASSISTANT';
  const writer = await attachClient(runtime, { reconnect: false, subscriptionId: `gap-writer-${Date.now()}` });
  clients.push(writer);
  await writer.client.submit('GAP_OVERLAP_FIRST', { idempotencyKey: 'gap-overlap-first-key' });
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_OVERLAP_FIRST_ASSISTANT', 'overlap_first_durable');
  await waitFor(() => first.client.getState().phase === 'reconnect_wait' || first.client.getState().phase === 'connecting' || first.client.getState().phase === 'replaying', 'overlap_socket_reconnect');
  await writer.client.submit('GAP_OVERLAP_DURING', { idempotencyKey: 'gap-overlap-during-key' });
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_OVERLAP_DURING_ASSISTANT', 'overlap_during_durable');
  await waitFor(() => first.client.getState().phase === 'live', 'overlap_reconnected');
  await waitFor(() => first.events.filter((event) => event.content === 'GAP_OVERLAP_DURING_ASSISTANT').length === 1, 'overlap_event_replayed_once');
  assert.equal(first.events.filter((event) => event.content === 'GAP_OVERLAP_FIRST_ASSISTANT').length, 1);
  assert.equal(first.events.filter((event) => event.content === 'GAP_OVERLAP_DURING_ASSISTANT').length, 1);

  const raceA = await attachClient(runtime, { reconnect: false, subscriptionId: `gap-race-a-${Date.now()}` });
  const raceB = await attachClient(runtime, { reconnect: false, subscriptionId: `gap-race-b-${Date.now()}` });
  clients.push(raceA, raceB);
  const [raceResultA, raceResultB] = await Promise.all([
    raceA.client.submit('GAP_IDEMPOTENT', { idempotencyKey: 'gap-same-key' }),
    raceB.client.submit('GAP_IDEMPOTENT', { idempotencyKey: 'gap-same-key' }),
  ]);
  assert.equal(raceResultA.transport, 'written');
  assert.equal(raceResultB.transport, 'written');
  await waitForEvent(site.eventsPath, (event) => event.event === 'assistant_message' && event.content === 'GAP_IDEMPOTENT_ASSISTANT', 'idempotency_assistant');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  const durableRaceInputs = readEvents(site.eventsPath).filter((event) => event.event === 'user_message' && event.content === 'GAP_IDEMPOTENT');
  assert.equal(durableRaceInputs.length, 1, 'same-key concurrent submissions must admit one durable input');
  assert.equal(provider.requests.filter((request) => request.prompt.includes('GAP_IDEMPOTENT')).length, 1, 'same-key concurrent submissions must invoke provider once');
  assert.equal(readEvents(site.eventsPath).filter((event) => event.event === 'assistant_message' && event.content === 'GAP_IDEMPOTENT_ASSISTANT').length, 1);

  result = {
    schema: 'narada.agent_pi_tui.transport_idempotency_e2e.v1',
    status: 'passed',
    checks: [
      'ambiguous_write_does_not_auto_resend',
      'same_key_explicit_retry_reuses_operation',
      'replay_live_overlap_deduplicated',
      'concurrent_same_key_admission_is_singleton',
    ],
    event_sequences: readEvents(site.eventsPath).map(eventSequence).filter(Boolean),
    evidence: await recordLiveEvidence({
      scenario: 'p1-transport-idempotency',
      site,
      runtime,
      clients: clients.map((entry) => entry.client ?? entry),
      durableOracle: site.eventsPath,
      externalOracles: [
        'fixture-provider-request-log',
        'websocket-reconnect-boundary',
        'idempotency-key-race',
        ...(productionLaunch ? ['production-launch-binding'] : []),
      ],
      negativeAssertions: [
        'ambiguous-write-is-not-automatically-resubmitted',
        'same-key-concurrent-submit-admits-one-user-message',
        'replay-overlap-does-not-duplicate-assistant-message',
      ],
      sameSessionAfterFault: true,
      productionLaunchBinding: productionLaunch,
      posture: productionLaunch ? 'partial-production-launch' : 'fixture-boundary',
    }),
  };
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  for (const entry of clients.reverse()) await entry.client.disconnect().catch(() => {});
  await stopRuntime(runtime, { hard: false }).catch(() => {});
  await cleanupSite(site).catch(() => {});
  await provider.close().catch(() => {});
}

console.log(JSON.stringify(result, null, 2));
