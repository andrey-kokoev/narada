import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  validateSessionEvent,
} from '../../carrier-protocol/src/carrier-protocol.mjs';
import worker, { authenticateCarrierRequest, CloudflareCarrierDurableObject } from './cloudflare-worker.mjs';
import {
  CloudflareCarrierRouter,
  CloudflareCarrierSession,
  classifyCloudflareCarrierControl,
  expectedObserverEventKindsForInput,
  isTerminalState,
} from './cloudflare-carrier.mjs';

const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));

function clock() {
  return '2026-06-06T00:00:00.000Z';
}

function startRequest(extra = {}) {
  return {
    operation: 'session.start',
    request_id: 'request_start_1',
    principal: { principal_id: 'operator.fixture' },
    params: {
      carrier_session_id: 'carrier_session_cloudflare_fixture',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
    },
    ...extra,
  };
}

function inputRequest(input, extra = {}) {
  return {
    operation: 'carrier.input.deliver',
    request_id: `request_${input.event_id}`,
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { input },
    ...extra,
  };
}

function commandRequest(command, args = [], extra = {}) {
  return {
    operation: 'carrier.command.execute',
    request_id: `request_command_${String(command).replace(/[^a-z0-9]+/gi, '_')}_${args.join('_')}`,
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    principal: { principal_id: 'operator.fixture' },
    params: { command, args },
    ...extra,
  };
}

function startedSession() {
  const router = new CloudflareCarrierRouter({ now: clock });
  const start = router.handle(startRequest());
  assert.equal(start.ok, true);
  return { router, session: router.sessions.get('carrier_session_cloudflare_fixture') };
}

function eventKinds(response) {
  return (response.events ?? [response.event]).filter(Boolean).map((event) => event.event_kind);
}

function assertValidEvents(response) {
  for (const event of (response.events ?? [response.event]).filter(Boolean)) {
    assert.deepEqual(validateSessionEvent(event), [], event.event_kind);
  }
}

test('session.start creates one durable session with identity and version evidence', () => {
  const router = new CloudflareCarrierRouter({ now: clock });
  const response = router.handle(startRequest());
  assert.equal(response.ok, true);
  assert.equal(response.carrier_session_id, 'carrier_session_cloudflare_fixture');
  assert.equal(response.event.sequence, 1);
  assert.equal(response.event.event_kind, 'carrier_session_started');
  assert.equal(response.event.agent_id, 'narada.fixture.agent');
  assert.equal(response.event.payload.protocol_version, 'narada.carrier.v1');
  assert.equal(response.event.payload.runtime_contract_version, 'narada.carrier.runtime.v1');
  assertValidEvents(response);

  const status = router.handle({ operation: 'session.status', carrier_session_id: 'carrier_session_cloudflare_fixture' });
  assert.equal(status.carrier_kind, 'cloudflare-carrier');
  assert.equal(status.carrier_host, 'cloudflare-durable-object');
  assert.equal(status.provider_adapter_posture, 'refused');
  assert.equal(status.schema_fixture_compatibility, 'carrier-input-pipeline-cases.v1');
});

test('session.start and input delivery are idempotent by request id', () => {
  const { router } = startedSession();
  const firstStartEventCount = router.sessions.get('carrier_session_cloudflare_fixture').events.length;
  const repeatedStart = router.handle(startRequest());
  assert.equal(repeatedStart.ok, true);
  assert.equal(router.sessions.get('carrier_session_cloudflare_fixture').events.length, firstStartEventCount);

  const input = inputPipelineCases.cases[0].input;
  const first = router.handle(inputRequest(input));
  const afterFirst = router.sessions.get('carrier_session_cloudflare_fixture').events.length;
  const second = router.handle(inputRequest(input));
  assert.deepEqual(second, first);
  assert.equal(router.sessions.get('carrier_session_cloudflare_fixture').events.length, afterFirst);
});

test('observer fixture cases produce shared pipeline event kinds plus terminal completion', () => {
  for (const fixtureCase of inputPipelineCases.cases.filter((entry) => entry.expected.admission_event_kinds.some((kind) => kind.startsWith('observer_')))) {
    const { router } = startedSession();
    if (fixtureCase.state.observerMuted) router.handle(commandRequest('/observer mute', [], { request_id: `request_mute_${fixtureCase.name}` }));
    const response = router.handle(inputRequest(fixtureCase.input, { request_id: `request_${fixtureCase.name}` }));
    assert.equal(response.ok, true, fixtureCase.name);
    assertValidEvents(response);
    const expected = [
      ...expectedObserverEventKindsForInput(fixtureCase.input, fixtureCase.state),
      'input_completed',
    ];
    assert.deepEqual(eventKinds(response), expected, fixtureCase.name);
    assert.equal(isTerminalState(response.terminal_state), true, fixtureCase.name);
  }
});

test('goal command supports show set pause resume and clear', () => {
  const { router } = startedSession();
  let response = router.handle(commandRequest('/goal', ['stabilize', 'carrier']));
  assert.equal(response.ok, true);
  assert.equal(response.event.payload.details.goal.text, 'stabilize carrier');
  assert.equal(response.event.payload.details.goal.state, 'active');

  response = router.handle(commandRequest('/goal', ['pause']));
  assert.equal(response.event.payload.details.goal.state, 'paused');

  response = router.handle(commandRequest('/goal', ['resume']));
  assert.equal(response.event.payload.details.goal.state, 'active');

  response = router.handle(commandRequest('/goal', ['show']));
  assert.equal(response.event.payload.details.goal.text, 'stabilize carrier');

  response = router.handle(commandRequest('/goal', ['clear']));
  assert.equal(response.event.payload.details.goal.text, null);
  assert.equal(response.event.payload.details.goal.state, 'unset');
});

test('observer mute command suppresses interjections but record-only remains observation evidence', () => {
  const { router } = startedSession();
  router.handle(commandRequest('/observer mute'));
  assert.equal(router.handle({ operation: 'session.status', carrier_session_id: 'carrier_session_cloudflare_fixture' }).observer_interjections_muted, true);

  const mutedVisible = inputPipelineCases.cases.find((entry) => entry.name === 'muted_conversation_observer_suppressed');
  const visibleResponse = router.handle(inputRequest(mutedVisible.input, { request_id: 'request_muted_visible' }));
  assert.deepEqual(eventKinds(visibleResponse), [
    'input_queued_for_turn_boundary',
    'observer_observation_recorded',
    'observer_interjection_proposed',
    'observer_interjection_suppressed',
    'input_completed',
  ]);

  const recordOnlyInput = {
    ...mutedVisible.input,
    event_id: 'input_record_only_cloudflare_1',
    metadata: {
      observer: {
        role: 'observer',
        rule_id: 'record-only-check',
        visibility: 'record_only',
      },
    },
  };
  const recordOnlyResponse = router.handle(inputRequest(recordOnlyInput, { request_id: 'request_record_only' }));
  assert.deepEqual(eventKinds(recordOnlyResponse), [
    'input_queued_for_turn_boundary',
    'observer_observation_recorded',
    'input_completed',
  ]);
});

test('unsupported host command emits rejection evidence', () => {
  const { router } = startedSession();
  const response = router.handle(commandRequest('host.command', [], {
    request_id: 'request_host_unsupported',
    params: {
      command: 'host.command',
      target: 'native_shell',
      command_text: 'rm -rf /',
    },
  }));
  assert.equal(response.terminal_state, 'rejected');
  assert.deepEqual(eventKinds(response), ['carrier_host_command_requested', 'carrier_host_command_rejected']);
  assert.equal(response.events[1].payload.admission_reason, 'unsupported_cloudflare_host_command_target');
});

test('provider-unavailable posture records terminal failure evidence', () => {
  const { router } = startedSession();
  const input = inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input;
  const response = router.handle(inputRequest(input, { request_id: 'request_provider_refused' }));
  assert.equal(response.terminal_state, 'failed');
  assert.deepEqual(eventKinds(response), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'turn_failed',
    'input_completed',
  ]);
  const providerEvent = response.events.find((event) => event.event_kind === 'provider_request_recorded');
  assert.equal(providerEvent.payload.provider_execution_enabled, false);
  assert.equal(providerEvent.payload.provider_request_status, 'refused');
  assertValidEvents(response);
});

test('event reads return ordered events by sequence cursor', () => {
  const { router } = startedSession();
  router.handle(commandRequest('/goal', ['stabilize']));
  router.handle(commandRequest('/observer mute'));
  const read = router.handle({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 1, limit: 2 },
  });
  assert.equal(read.ok, true);
  assert.deepEqual(read.events.map((event) => event.sequence), [2, 3]);
  assert.equal(read.next_cursor, 3);
});

test('status reconstructs compact state from durable session object', () => {
  const { router } = startedSession();
  router.handle(commandRequest('/goal', ['stabilize']));
  router.handle(commandRequest('/observer mute'));
  const session = router.sessions.get('carrier_session_cloudflare_fixture');
  const reconstructed = CloudflareCarrierSession.fromSnapshot(session.snapshot(), { now: clock });
  assert.equal(session.status().goal.text, 'stabilize');
  assert.equal(session.status().observer_interjections_muted, true);
  assert.equal(reconstructed.status().goal.text, 'stabilize');
  assert.equal(reconstructed.status().observer_interjections_muted, true);
  assert.deepEqual(reconstructed.readEvents({ after_sequence: 0 }).events, session.readEvents({ after_sequence: 0 }).events);
});

test('durable object facade stores and reloads session snapshot', async () => {
  const storage = fakeStorage();
  const firstObject = new CloudflareCarrierDurableObject({ storage });
  const start = await firstObject.handle(startRequest());
  assert.equal(start.ok, true);
  await firstObject.handle(commandRequest('/goal', ['stabilize']));

  const secondObject = new CloudflareCarrierDurableObject({ storage });
  const status = await secondObject.handle({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  });
  assert.equal(status.goal.text, 'stabilize');
  assert.equal(status.next_event_sequence, 3);
});

test('worker export routes requests by carrier session durable object binding', async () => {
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace);
  const start = await worker.fetch(jsonRequest(startRequest(), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.principal.email, 'admin@system');
  assert.equal(startBody.event.payload.principal.email, 'admin@system');

  const goal = await worker.fetch(jsonRequest(commandRequest('/goal', ['route', 'through', 'worker']), { token: 'test-admin-token' }), env);
  assert.equal(goal.status, 200);
  const goalBody = await goal.json();
  assert.equal(goalBody.principal.email, 'admin@system');
  assert.equal(goalBody.event.payload.principal.email, 'admin@system');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.goal.text, 'route through worker');
  assert.equal(statusBody.reader_principal.email, 'admin@system');
});

test('worker provider adapter completes turns through Cloudflare AI binding', async () => {
  const durableEnv = { AI: fakeAiBinding('Cloudflare AI response from test.') };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_ai' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_ai_worker_1',
    content: 'Run a Cloudflare AI provider turn.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_ai_provider' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  assert.deepEqual(eventKinds(body), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);
  const providerRequest = body.events.find((event) => event.event_kind === 'provider_request_recorded');
  assert.equal(providerRequest.payload.provider_execution_enabled, true);
  assert.equal(providerRequest.payload.provider_adapter_kind, 'cloudflare-workers-ai');
  assert.equal(providerRequest.payload.provider_request_status, 'dispatched');
  const output = body.events.find((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(output.payload.text_delta, 'Cloudflare AI response from test.');
  assertValidEvents(body);
});

test('worker export rejects unauthenticated and invalid bearer requests', async () => {
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace);

  let response = await worker.fetch(jsonRequest(startRequest()), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'unauthorized');

  response = await worker.fetch(jsonRequest(startRequest(), { token: 'wrong-token' }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'unauthorized');

  response = await worker.fetch(jsonRequest(startRequest(), { token: 'test-admin-token' }), { CLOUDFLARE_CARRIER_SESSIONS: namespace });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, 'auth_not_configured');
});

test('carrier auth classifier matches revolution bearer token principal shapes', () => {
  const admin = authenticateCarrierRequest(jsonRequest({}, { token: 'test-admin-token' }), { ADMIN_BEARER_TOKEN: 'test-admin-token' });
  assert.equal(admin.ok, true);
  assert.equal(admin.principal.auth_type, 'user');
  assert.equal(admin.principal.email, 'admin@system');
  assert.deepEqual(admin.principal.roles, [1]);
  assert.deepEqual(admin.principal.controlled_actions, ['*']);

  const service = authenticateCarrierRequest(jsonRequest({}, { token: 'test-service-token' }), { SERVICE_TOKEN: 'test-service-token' });
  assert.equal(service.ok, true);
  assert.equal(service.principal.auth_type, 'service');
  assert.equal(service.principal.principal_id, 'service');
});

test('evidence rejects obvious secret values', () => {
  const { router } = startedSession();
  assert.throws(() => router.handle(commandRequest('host.command', [], {
    request_id: 'request_secret_leak',
    params: {
      command: 'host.command',
      target: 'diagnostic_read',
      command_text: 'print secret_value',
    },
  })), /evidence_contains_secret_value/);
});

test('control classifier marks cloudflare supported and mutating operations', () => {
  assert.equal(classifyCloudflareCarrierControl({ operation: 'carrier.input.deliver' }).cloudflare_supported, true);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'carrier.input.deliver' }).mutates_session, true);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'session.events.read' }).mutates_session, false);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'unknown' }).cloudflare_supported, false);
});

function fakeStorage() {
  const values = new Map();
  return {
    async get(key) {
      const value = values.get(key);
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    },
    async put(key, value) {
      values.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
}

function fakeDurableObjectNamespace(durableEnv = {}) {
  const objects = new Map();
  return {
    idFromName(name) {
      return name;
    },
    get(id) {
      if (!objects.has(id)) {
        const storage = fakeStorage();
        objects.set(id, {
          async fetch(request) {
            return new CloudflareCarrierDurableObject({ storage }, durableEnv).fetch(request);
          },
        });
      }
      return objects.get(id);
    },
  };
}

function authEnv(namespace, extra = {}) {
  return {
    CLOUDFLARE_CARRIER_SESSIONS: namespace,
    ADMIN_BEARER_TOKEN: 'test-admin-token',
    SERVICE_TOKEN: 'test-service-token',
    ...extra,
  };
}

function fakeAiBinding(response) {
  return {
    async run() {
      return { response };
    },
  };
}

function jsonRequest(body, { token = null } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('https://carrier.test/control', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
