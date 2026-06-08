import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  TOOL_EFFECT_ADMISSION_CASES_SCHEMA,
  validateSessionEvent,
} from '../../carrier-protocol/src/carrier-protocol.mjs';
import worker, {
  authenticateCarrierRequest,
  classifyCloudflareToolEffectAdmission,
  CloudflareCarrierDurableObject,
  createCloudflareToolEffectAdapter,
} from './cloudflare-worker.mjs';
import {
  CloudflareCarrierRouter,
  CloudflareCarrierSession,
  classifyCloudflareCarrierControl,
  expectedObserverEventKindsForInput,
  isTerminalState,
} from './cloudflare-carrier.mjs';

const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));
const toolEffectAdmissionCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/tool-effect-admission-cases.json', import.meta.url), 'utf8'));

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
  assert.equal(status.tool_effect_posture, 'unconfigured');
  assert.equal(status.tool_effect_adapter_kind, null);
  assert.deepEqual(status.tool_effect_supported_tools, []);
  assert.deepEqual(status.tool_effect_capabilities, []);
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

test('worker validates session.start site binding through configured Cloudflare site registry', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_registry_bound_start' }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.event.payload.site_binding_evidence.schema, 'narada.cloudflare_site_registry.v1');
  assert.equal(startBody.event.payload.site_binding_evidence.action, 'admit');
  assert.equal(startBody.event.payload.site_binding_evidence.site_id, 'site_fixture');
  assert.equal(startBody.event.payload.site_authority_decision.action, 'admit');
  assert.equal(startBody.event.payload.site_authority_decision.mutation_class, 'hosted_carrier_session_events');
  assert.equal(startBody.event.payload.site_authority_decision.authority_locus_kind, 'cloudflare_carrier_session_event_store');
  assert.equal(siteDb.dump().carrierSessions[0].carrier_session_id, 'carrier_session_cloudflare_fixture');
});

test('worker rejects session.start when configured site registry denies binding', async () => {
  const siteDb = fakeD1SiteRegistryDatabase();
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_registry_denied_start' }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 403);
  const startBody = await start.json();
  assert.equal(startBody.code, 'carrier_site_binding_denied');
  assert.equal(startBody.site_registry_code, 'site_not_found');
  assert.equal(startBody.principal.email, 'admin@system');
  assert.equal(siteDb.dump().authorityEvents[0].event_kind, 'carrier_site_binding_rejected');
  assert.equal(siteDb.dump().authorityEvents[0].action, 'deny');
});

test('worker site.read composes site sessions tasks authority events and carrier evidence', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: taskDb };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb, CLOUDFLARE_CARRIER_TASK_DB: taskDb });

  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_site_read_start' }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  const taskCreate = await worker.fetch(jsonRequest(commandRequest('/task', ['create', 'site', 'read', 'task'], { request_id: 'request_site_read_task_create' }), { token: 'test-admin-token' }), env);
  assert.equal(taskCreate.status, 200);

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_overview',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.site.site_id, 'site_fixture');
  assert.equal(body.membership.role, 'owner');
  assert.equal(body.sessions[0].carrier_session_id, 'carrier_session_cloudflare_fixture');
  assert.equal(body.tasks[0].title, 'site read task');
  assert.equal(body.authority_events.some((event) => event.event_kind === 'carrier_site_binding_admitted'), true);
  assert.equal(body.carrier_evidence[0].carrier_session_id, 'carrier_session_cloudflare_fixture');
  assert.equal(body.carrier_evidence[0].events.some((event) => event.event_kind === 'carrier_session_started'), true);
  assert.equal(body.reader_principal.email, 'admin@system');
  assert.equal(body.site_authority.map.schema, 'narada.site_authority_map.v1');
  assert.equal(body.site_authority.map.site_id, 'site_fixture');
  const membershipDecision = body.site_authority.decisions.find((decision) => decision.mutation_class === 'hosted_site_membership');
  assert.equal(membershipDecision.action, 'admit');
  assert.equal(membershipDecision.authority_locus_kind, 'cloudflare_site_registry');
  const localFilesystemDecision = body.site_authority.decisions.find((decision) => decision.mutation_class === 'local_repository_filesystem_mutation');
  assert.equal(localFilesystemDecision.action, 'refuse');
  assert.equal(localFilesystemDecision.reason, 'site_authority_embodiment_not_authoritative');
  assert.equal(body.site_continuity.binding.schema, 'narada.site_continuity_binding.v1');
  assert.equal(body.site_continuity.binding.site_id, 'site_fixture');
  const identityContinuity = body.site_continuity.decisions.find((decision) => decision.exchange_class === 'site_identity_binding');
  assert.equal(identityContinuity.action, 'admit');
  assert.equal(identityContinuity.relation_kind, 'same_site_embodiment');
  assert.equal(body.site_continuity.exchange_packet.schema, 'narada.site_continuity_exchange_packet.v1');
  assert.equal(body.site_continuity.exchange_packet.source_embodiment_kind, 'cloudflare_carrier');
  assert.equal(body.site_continuity.exchange_packet.target_embodiment_kind, 'local_windows');
  assert.equal(body.site_continuity.exchange_packet_admission.action, 'projection_only');
  const mutationExecutionContinuity = body.site_continuity.decisions.find((decision) => decision.exchange_class === 'cross_embodiment_mutation_execution');
  assert.equal(mutationExecutionContinuity.action, 'refuse');
  assert.equal(mutationExecutionContinuity.reason, 'site_continuity_cross_embodiment_mutation_execution_refused');

  const packetPut = await worker.fetch(jsonRequest({
    operation: 'site.continuity.packet.put',
    request_id: 'request_site_read_continuity_packet_put',
    params: { site_id: 'site_fixture', packet: body.site_continuity.exchange_packet },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(packetPut.status, 200);
  const packetPutBody = await packetPut.json();
  assert.equal(packetPutBody.status, 'imported');
  assert.equal(packetPutBody.site_continuity_packet_admission.action, 'projection_only');

  const refusedPacketPut = await worker.fetch(jsonRequest({
    operation: 'site.continuity.packet.put',
    request_id: 'request_site_read_continuity_packet_refused',
    params: {
      site_id: 'site_fixture',
      packet: {
        ...body.site_continuity.exchange_packet,
        executable_mutation_requests: [{ mutation_class: 'local_repository_filesystem_mutation' }],
      },
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedPacketPut.status, 403);
  const refusedPacketPutBody = await refusedPacketPut.json();
  assert.equal(refusedPacketPutBody.status, 'refused');
  assert.equal(refusedPacketPutBody.site_continuity_packet_admission.reason, 'site_continuity_exchange_packet_executable_mutation_refused');

  const readAfterPacketPut = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_after_continuity_packet_put',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(readAfterPacketPut.status, 200);
  const readAfterPacketPutBody = await readAfterPacketPut.json();
  assert.equal(readAfterPacketPutBody.site_continuity_packets.length, 1);
  assert.equal(readAfterPacketPutBody.site_continuity_packets[0].admission_action, 'projection_only');
});

test('worker serves minimal authenticated web console shell', async () => {
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace);
  const response = await worker.fetch(new Request('https://carrier.test/'), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /Narada Cloudflare Carrier/);
  assert.match(html, /naradaCloudflareCarrierClient/);
  assert.match(html, /\/api\/carrier/);
  assert.match(html, /Sign in with Microsoft/);
  assert.match(html, /\/auth\/microsoft\/login/);
  assert.match(html, /\/auth\/session/);
  assert.match(html, /Bearer token/);
  assert.match(html, /Provider/);
  assert.match(html, /Effects/);
  assert.match(html, /Site Product/);
  assert.match(html, /Site Membership/);
  assert.match(html, /Last Authority/);
  assert.match(html, /authoritySummary/);
  assert.match(html, /renderLastAuthority/);
  assert.match(html, /actor_role/);
  assert.match(html, /Product Overview|productOverview/);
  assert.match(html, /Memberships/);
  assert.match(html, /Sessions/);
  assert.match(html, /Authority Events/);
  assert.match(html, /Authority Routing/);
  assert.match(html, /authorityRouteSummary/);
  assert.match(html, /site_authority/);
  assert.match(html, /Site Continuity/);
  assert.match(html, /continuitySummary/);
  assert.match(html, /site_continuity/);
  assert.match(html, /Carrier Evidence/);
  assert.match(html, /Task State/);
  assert.match(html, /site\.read/);
  assert.match(html, /site\.membership\.put/);
  assert.match(html, /putMembership/);
  assert.match(html, /readSite/);
  assert.match(html, /createTask/);
});

test('worker site.membership.put admits owner and exposes membership through site.read', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: taskDb };
  const env = authEnv(fakeDurableObjectNamespace(durableEnv), { CLOUDFLARE_SITE_REGISTRY_DB: siteDb, CLOUDFLARE_CARRIER_TASK_DB: taskDb, CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1' });
  const put = await worker.fetch(jsonRequest({
    operation: 'site.membership.put',
    request_id: 'request_site_membership_put',
    params: {
      site_id: 'site_fixture',
      member_principal_id: 'microsoft:tenant:operator',
      role: 'viewer',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(put.status, 200);
  const putBody = await put.json();
  assert.equal(putBody.membership.principal_id, 'microsoft:tenant:operator');
  assert.equal(putBody.membership.role, 'viewer');
  assert.equal(putBody.principal.email, 'admin@system');
  assert.equal(putBody.site_authority_decision.action, 'admit');
  assert.equal(putBody.site_authority_decision.authority_locus_kind, 'cloudflare_site_registry');

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_membership_read',
    params: { site_id: 'site_fixture' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  const readBody = await read.json();
  assert.equal(readBody.memberships.some((membership) => (
    membership.principal_id === 'microsoft:tenant:operator'
    && membership.role === 'viewer'
    && membership.status === 'active'
  )), true);
  assert.equal(readBody.authority_events.some((event) => event.event_kind === 'site_membership_updated'), true);
});

test('worker operation.create read and list route through site registry authority', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: taskDb };
  const env = authEnv(fakeDurableObjectNamespace(durableEnv), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
    CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1',
    CLOUDFLARE_CARRIER_TASK_DB: taskDb,
  });

  const created = await worker.fetch(jsonRequest({
    operation: 'operation.create',
    request_id: 'request_operation_create',
    params: {
      site_id: 'site_fixture',
      operation_id: 'operation_control',
      display_name: 'Control Operation',
      operation_kind: 'control',
      status: 'active',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.equal(createdBody.operation.operation_id, 'operation_control');
  assert.equal(createdBody.operation.status, 'active');
  assert.equal(createdBody.principal.email, 'admin@system');

  const start = await worker.fetch(jsonRequest(startRequest({
    request_id: 'request_operation_session_start',
    params: {
      carrier_session_id: 'carrier_session_operation_fixture',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
      operation_id: 'operation_control',
    },
  }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  assert.equal(siteDb.dump().carrierSessions.some((session) => session.operation_id === 'operation_control'), true, JSON.stringify(siteDb.dump().carrierSessions));
  const directOperationSessions = await siteDb.prepare('SELECT * FROM cloudflare_site_carrier_sessions WHERE operation_id = ? ORDER BY created_at DESC LIMIT ?').bind('operation_control', 10).all();
  assert.equal(directOperationSessions.results.length, 1, JSON.stringify(directOperationSessions.results));

  const taskCreate = await worker.fetch(jsonRequest(commandRequest('/task', ['create', 'operation', 'task'], {
    request_id: 'request_operation_task_create',
    carrier_session_id: 'carrier_session_operation_fixture',
  }), { token: 'test-admin-token' }), env);
  const taskCreateBody = await taskCreate.json();
  assert.equal(taskCreate.status, 200, JSON.stringify(taskCreateBody));
  const taskCreateResult = taskCreateBody.events?.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(taskCreateResult?.payload?.status, 'ok', JSON.stringify(taskCreateBody));
  const taskCreateSummary = JSON.parse(taskCreateResult.payload.result_summary);
  assert.ok(taskCreateSummary.task?.task_id, JSON.stringify(taskCreateSummary));
  const directSiteTasks = await taskDb.prepare('SELECT * FROM narada_tasks WHERE site_id = ? ORDER BY task_number ASC').bind('site_fixture').all();
  assert.equal(directSiteTasks.results.some((task) => task.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(directSiteTasks.results));

  const read = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_control' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.operation.display_name, 'Control Operation');
  assert.equal(readBody.sessions.some((session) => session.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(readBody.sessions));
  assert.equal(readBody.tasks.some((task) => task.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(readBody.tasks));
  assert.equal(readBody.carrier_evidence.some((entry) => entry.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(readBody.carrier_evidence));
  assert.equal(readBody.operation_product_surface.operation_id, 'operation_control');
  assert.equal(readBody.operation_product_surface.session_count, 1);
  assert.equal(readBody.operation_product_surface.task_count, 1);
  assert.equal(readBody.reader_principal.email, 'admin@system');

  const listed = await worker.fetch(jsonRequest({
    operation: 'operation.list',
    request_id: 'request_operation_list',
    params: { site_id: 'site_fixture' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.deepEqual(listedBody.operations.map((operation) => operation.operation_id), ['operation_control']);

  const siteRead = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_operation_site_read',
    params: { site_id: 'site_fixture' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(siteRead.status, 200);
  const siteReadBody = await siteRead.json();
  assert.equal(siteReadBody.operations.some((operation) => operation.operation_id === 'operation_control'), true);
});

test('worker starts Microsoft login with PKCE and signed pending cookie', async () => {
  const env = authEnv(fakeDurableObjectNamespace(), microsoftAuthEnv());
  const response = await worker.fetch(new Request('https://carrier.test/auth/microsoft/login'), env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://login.microsoftonline.com');
  assert.equal(location.pathname, '/tenant-fixture/oauth2/v2.0/authorize');
  assert.equal(location.searchParams.get('client_id'), 'microsoft-client-fixture');
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://carrier.test/auth/microsoft/callback');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.match(response.headers.get('set-cookie'), /narada_microsoft_oidc_pending=/);
});

test('worker Microsoft callback creates operator session and cookie principal can read site', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'microsoft:tenant-fixture:object-fixture',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { ...microsoftAuthEnv(), CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const login = await worker.fetch(new Request('https://carrier.test/auth/microsoft/login'), env);
  const pendingCookie = login.headers.get('set-cookie').split(';')[0];
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await worker.fetch(new Request(`https://carrier.test/auth/microsoft/callback?code=code-fixture&state=${state}`, {
    headers: { cookie: pendingCookie },
  }), env);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/console');
  const operatorCookie = callback.headers.get('set-cookie').split(';')[0];
  assert.match(operatorCookie, /narada_operator_session=/);

  const session = await worker.fetch(new Request('https://carrier.test/auth/session', { headers: { cookie: operatorCookie } }), env);
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody.principal.auth_type, 'microsoft_oidc');
  assert.equal(sessionBody.principal.principal_id, 'microsoft:tenant-fixture:object-fixture');

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_microsoft_site_read',
    params: { site_id: 'site_fixture' },
  }, { path: '/api/carrier', cookie: operatorCookie }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.reader_principal.auth_type, 'microsoft_oidc');
  assert.equal(readBody.reader_principal.principal_id, 'microsoft:tenant-fixture:object-fixture');
  assert.equal(readBody.membership.role, 'owner');
});

test('worker captures Microsoft operator session cookie for loopback helper only', async () => {
  const siteDb = fakeD1SiteRegistryDatabase();
  const env = authEnv(fakeDurableObjectNamespace(), { ...microsoftAuthEnv(), CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const returnTo = 'http://127.0.0.1:38441/capture';
  const captureUrl = `https://carrier.test/auth/operator/session-capture?return_to=${encodeURIComponent(returnTo)}`;

  const unauthenticatedCapture = await worker.fetch(new Request(captureUrl), env);
  assert.equal(unauthenticatedCapture.status, 302);
  const loginLocation = new URL(unauthenticatedCapture.headers.get('location'));
  assert.equal(loginLocation.pathname, '/auth/microsoft/login');
  assert.equal(loginLocation.searchParams.get('return_to'), `/auth/operator/session-capture?return_to=${encodeURIComponent(returnTo)}`);

  const login = await worker.fetch(new Request(loginLocation.toString()), env);
  const pendingCookie = login.headers.get('set-cookie').split(';')[0];
  const authorize = new URL(login.headers.get('location'));
  const state = authorize.searchParams.get('state');
  const callback = await worker.fetch(new Request(`https://carrier.test/auth/microsoft/callback?code=code-fixture&state=${state}`, {
    headers: { cookie: pendingCookie },
  }), env);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), `/auth/operator/session-capture?return_to=${encodeURIComponent(returnTo)}`);
  const operatorCookie = callback.headers.get('set-cookie').split(';')[0];

  const authenticatedCapture = await worker.fetch(new Request(captureUrl, { headers: { cookie: operatorCookie } }), env);
  assert.equal(authenticatedCapture.status, 302);
  const localRedirect = new URL(authenticatedCapture.headers.get('location'));
  assert.equal(localRedirect.origin, 'http://127.0.0.1:38441');
  assert.equal(localRedirect.pathname, '/capture');
  assert.match(localRedirect.searchParams.get('cookie'), /^[^.]+\.[^.]+$/);
  assert.equal(localRedirect.searchParams.get('principal_id'), 'microsoft:tenant-fixture:object-fixture');

  const invalidCapture = await worker.fetch(new Request('https://carrier.test/auth/operator/session-capture?return_to=https%3A%2F%2Fevil.example%2Fcapture', {
    headers: { cookie: operatorCookie },
  }), env);
  assert.equal(invalidCapture.status, 400);
  assert.equal((await invalidCapture.json()).code, 'operator_capture_return_to_must_be_loopback_http');
});

test('worker Microsoft cookie principal is denied without site membership', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { ...microsoftAuthEnv(), CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const login = await worker.fetch(new Request('https://carrier.test/auth/microsoft/login'), env);
  const pendingCookie = login.headers.get('set-cookie').split(';')[0];
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await worker.fetch(new Request(`https://carrier.test/auth/microsoft/callback?code=code-fixture&state=${state}`, {
    headers: { cookie: pendingCookie },
  }), env);
  const operatorCookie = callback.headers.get('set-cookie').split(';')[0];
  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_microsoft_site_denied',
    params: { site_id: 'site_fixture' },
  }, { path: '/api/carrier', cookie: operatorCookie }), env);
  assert.equal(read.status, 403);
  assert.equal((await read.json()).code, 'site_authority_denied');
});

test('worker browser API alias starts resumes sends input and reads evidence events', async () => {
  const durableEnv = {
    AI: fakeAiBinding('Console provider response.'),
    CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1',
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_console_start' }), {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.event.event_kind, 'carrier_session_started');

  const resumed = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_console_start' }), {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(resumed.status, 200);
  const resumedBody = await resumed.json();
  assert.equal(resumedBody.carrier_session_id, 'carrier_session_cloudflare_fixture');

  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_console_api_1',
    content: 'Render this through the Cloudflare console API.',
  };
  const delivered = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_console_input' }), {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(delivered.status, 200);
  const deliveredBody = await delivered.json();
  assert.deepEqual(eventKinds(deliveredBody), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);

  const read = await worker.fetch(jsonRequest({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 0 },
  }, {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.reader_principal.email, 'admin@system');
  assert.equal(readBody.events[0].event_kind, 'carrier_session_started');
  assert.ok(readBody.events.some((event) => event.event_kind === 'provider_request_recorded'));
  const providerEvent = readBody.events.find((event) => event.event_kind === 'provider_request_recorded');
  assert.equal(providerEvent.payload.provider_adapter_kind, 'cloudflare-workers-ai');
  assert.equal(providerEvent.payload.provider_request_status, 'dispatched');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.provider_adapter_posture, 'cloudflare-workers-ai');
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_runtime_metadata_read']);
});

test('configured Cloudflare task tools admit command-triggered task create update and persisted readback', async () => {
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: fakeD1TaskDatabase() };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_task_command' }), { token: 'test-admin-token' }), env);

  const created = await worker.fetch(jsonRequest(commandRequest('/task', ['create', 'ship', 'Cloudflare', 'task', 'adapter'], {
    request_id: 'request_task_create_command',
  }), { token: 'test-admin-token' }), env);
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.deepEqual(eventKinds(createdBody), ['tool_call_requested', 'tool_result_received']);
  const createResult = createdBody.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(createResult.payload.status, 'ok', createResult.payload.result_summary);
  assert.equal(createResult.payload.admission_action, 'admit');
  assert.equal(createResult.payload.admission_reason, 'write_tool_effect_admitted');
  assert.equal(createResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
  assert.equal(createResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
  assert.equal(createResult.payload.authority_ref, 'principal:admin');
  assert.equal(createResult.payload.result_ref, null);
  const createSummary = JSON.parse(createResult.payload.result_summary);
  assert.equal(createSummary.task.title, 'ship Cloudflare task adapter');
  assert.equal(createSummary.task.status, 'open');
  assert.equal(createSummary.site_authority_decision.action, 'admit');
  assert.equal(createSummary.site_authority_decision.mutation_class, 'task_artifact_mutation');

  const updated = await worker.fetch(jsonRequest(commandRequest('/task', ['update', 'cloudflare-task-1', 'done', 'verified'], {
    request_id: 'request_task_update_command',
  }), { token: 'test-admin-token' }), env);
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  const updateResult = updatedBody.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(updateResult.payload.status, 'ok');
  assert.equal(updateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-update:v1');
  assert.equal(updateResult.payload.effect_scope, 'cloudflare-narada-task:write:update');
  const updateSummary = JSON.parse(updateResult.payload.result_summary);
  assert.equal(updateSummary.task.status, 'done');
  assert.equal(updateSummary.task.note, 'verified');
  assert.equal(updateSummary.site_authority_decision.action, 'admit');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, [
    'cloudflare_carrier_task_create',
    'cloudflare_carrier_task_update',
    'cloudflare_carrier_task_list',
  ]);
  assert.equal(statusBody.tasks.length, 1);
  assert.equal(statusBody.tasks[0].task_id, 'cloudflare-task-1');
  assert.equal(statusBody.tasks[0].status, 'done');

  const persisted = await worker.fetch(jsonRequest({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 0 },
  }, { token: 'test-admin-token' }), env);
  const persistedBody = await persisted.json();
  assert.deepEqual(persistedBody.events.map((event) => event.event_kind), [
    'carrier_session_started',
    'tool_call_requested',
    'tool_result_received',
    'tool_call_requested',
    'tool_result_received',
  ]);
  assertValidEvents(persistedBody);
});

test('provider tool call can create a Cloudflare Narada task through admitted task effect', async () => {
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Creating a task.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_task_create',
          arguments_summary: JSON.stringify({ title: 'provider created task' }),
          arguments_ref: null,
        }],
      },
      { response: 'Task created.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1',
    CLOUDFLARE_CARRIER_TASK_DB: fakeD1TaskDatabase(),
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_provider_task' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_provider_task_worker_1',
    content: 'Create a Narada task for provider tool coverage.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_provider_task' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(eventKinds(body), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'provider_tool_call_requested',
    'tool_call_requested',
    'tool_result_received',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok', toolResult.payload.result_summary);
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
  const resultSummary = JSON.parse(toolResult.payload.result_summary);
  assert.equal(resultSummary.task.title, 'provider created task');
  assert.equal(resultSummary.site_authority_decision.action, 'admit');
  assert.equal(resultSummary.site_authority_decision.authority_locus_kind, 'declared_task_artifact_authority');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tasks.length, 1);
  assert.equal(statusBody.tasks[0].title, 'provider created task');
  assertValidEvents(body);
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
  assert.equal(durableEnv.AI.calls.length, 1);
  assert.equal(durableEnv.AI.calls[0].model, '@cf/meta/llama-3.1-8b-instruct');
  assert.deepEqual(durableEnv.AI.calls[0].request.tools, []);
  const output = body.events.find((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(output.payload.text_delta, 'Cloudflare AI response from test.');
  assertValidEvents(body);
});

test('provider tool calls are denied when the Cloudflare effect adapter is not configured', async () => {
  const durableEnv = { AI: fakeAiBinding([
    {
      response: 'Need a tool result.',
      tool_calls: [{
        tool_name: 'cloudflare_carrier_runtime_metadata_read',
        arguments_summary: '{}',
        arguments_ref: null,
      }],
    },
    { response: 'The carrier denied that tool effect.' },
  ]) };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_denied' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'unconfigured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, []);
  assert.deepEqual(statusBody.tool_effect_capabilities, []);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_denied_worker_1',
    content: 'Try a Cloudflare carrier tool call.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_denied' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  assert.deepEqual(eventKinds(body), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'provider_tool_call_requested',
    'tool_call_requested',
    'tool_result_received',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'denied');
  assert.equal(toolResult.payload.admission_action, 'deny');
  assert.equal(toolResult.payload.admission_reason, 'tool_effect_adapter_unconfigured');
  assert.equal(toolResult.payload.capability_ref, undefined);
  assert.equal(toolResult.payload.effect_scope, undefined);
  assert.equal(toolResult.payload.result_summary, 'tool_effect_adapter_unconfigured');
  assert.equal(durableEnv.AI.calls.length, 2);
  assert.deepEqual(durableEnv.AI.calls[0].request.tools, []);
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /tool_effect_adapter_unconfigured/);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'The carrier denied that tool effect.');
  assertValidEvents(body);
});

test('configured Cloudflare tool adapter admits only runtime metadata read effects', async () => {
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Reading runtime metadata.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_runtime_metadata_read',
          arguments_summary: '{}',
          arguments_ref: null,
        }],
      },
      { response: 'Runtime metadata read completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1',
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_ok' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.equal(statusBody.tool_effect_adapter_kind, 'cloudflare-tool-effect-boundary');
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_runtime_metadata_read']);
  assert.deepEqual(statusBody.tool_effect_capabilities, [{
    capability_ref: 'cloudflare-carrier:capability/runtime-metadata-read:v1',
    effect_scope: 'cloudflare-carrier/runtime-metadata:read-only',
    tool_name: 'cloudflare_carrier_runtime_metadata_read',
    access: 'read_only',
    substrate: 'cloudflare-worker-runtime',
  }]);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_ok_worker_1',
    content: 'Read Cloudflare carrier runtime metadata.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_ok' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const toolCall = body.events.find((event) => event.event_kind === 'provider_tool_call_requested');
  assert.equal(toolCall.payload.tool_name, 'cloudflare_carrier_runtime_metadata_read');
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'read_only_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/runtime-metadata-read:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-carrier/runtime-metadata:read-only');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.match(toolResult.payload.result_summary, /cloudflare-workers/);
  assert.equal(durableEnv.AI.calls.length, 2);
  assert.equal(durableEnv.AI.calls[0].request.tools[0].name, 'cloudflare_carrier_runtime_metadata_read');
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /read_only_tool_effect_admitted/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/runtime-metadata-read:v1/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /principal:admin/);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'Runtime metadata read completed.');
  assertValidEvents(body);
});

test('configured Cloudflare KV tool adapter admits read-only key gets', async () => {
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Reading KV.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_get',
          arguments_summary: JSON.stringify({ key: 'alpha' }),
          arguments_ref: null,
        }],
      },
      { response: 'KV read completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS: '1',
    CLOUDFLARE_CARRIER_KV: fakeKvBinding({ alpha: 'value-alpha' }),
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_kv_get']);
  assert.deepEqual(statusBody.tool_effect_capabilities, [{
    capability_ref: 'cloudflare-carrier:capability/kv-get:v1',
    effect_scope: 'cloudflare-kv:read-only:get',
    tool_name: 'cloudflare_carrier_kv_get',
    access: 'read_only',
    substrate: 'cloudflare-kv',
  }]);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_worker_1',
    content: 'Read alpha from configured KV.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'read_only_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-get:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-kv:read-only:get');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.match(toolResult.payload.result_summary, /value-alpha/);
  assert.equal(durableEnv.AI.calls.length, 2);
  assert.deepEqual(durableEnv.AI.calls[0].request.tools.map((tool) => tool.name), ['cloudflare_carrier_kv_get']);
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/kv-get:v1/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /principal:admin/);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'KV read completed.');
  assertValidEvents(body);
});

test('configured Cloudflare KV write tool requires write flag and principal authority', async () => {
  const kv = fakeKvBinding({});
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Writing KV.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_put',
          arguments_summary: JSON.stringify({ key: 'beta', value: 'value-beta' }),
          arguments_ref: null,
        }],
      },
      { response: 'KV write completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES: '1',
    CLOUDFLARE_CARRIER_KV: kv,
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv_put' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_kv_put']);
  assert.deepEqual(statusBody.tool_effect_capabilities, [{
    capability_ref: 'cloudflare-carrier:capability/kv-put:v1',
    effect_scope: 'cloudflare-kv:write:put',
    tool_name: 'cloudflare_carrier_kv_put',
    access: 'write',
    substrate: 'cloudflare-kv',
  }]);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_put_worker_1',
    content: 'Write beta into configured KV.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv_put' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'write_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-kv:write:put');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.deepEqual(kv.dump(), { beta: 'value-beta' });
  assert.deepEqual(durableEnv.AI.calls[0].request.tools.map((tool) => tool.name), ['cloudflare_carrier_kv_put']);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /write_tool_effect_admitted/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/kv-put:v1/);
  assertValidEvents(body);
});

test('configured Cloudflare KV write tool records admitted execution failure separately from denial', async () => {
  const kv = fakeKvBinding({});
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Writing KV without a key.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_put',
          arguments_summary: JSON.stringify({ value: 'value-without-key' }),
          arguments_ref: null,
        }],
      },
      { response: 'KV write failed after admission.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES: '1',
    CLOUDFLARE_CARRIER_KV: kv,
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv_put_failed' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_put_failed_worker_1',
    content: 'Try to write KV without a key.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv_put_failed' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'failed');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'write_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-kv:write:put');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.equal(toolResult.payload.result_summary, 'cloudflare_kv_put_requires_key');
  assert.deepEqual(kv.dump(), {});
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /\"status\":\"failed\"/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare_kv_put_requires_key/);
  assertValidEvents(body);
});

test('provider follow-up tool calls are processed in bounded batches', async () => {
  const kv = fakeKvBinding({ first: 'one', second: 'two' });
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Reading first key.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_get',
          arguments_summary: JSON.stringify({ key: 'first' }),
          arguments_ref: null,
        }],
      },
      {
        response: 'Reading second key.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_get',
          arguments_summary: JSON.stringify({ key: 'second' }),
          arguments_ref: null,
        }],
      },
      { response: 'Both KV reads completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS: '1',
    CLOUDFLARE_CARRIER_KV: kv,
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv_loop' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_loop_worker_1',
    content: 'Read two keys from configured KV.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv_loop' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  const toolResults = body.events.filter((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResults.length, 2);
  assert.match(toolResults[0].payload.result_summary, /one/);
  assert.match(toolResults[1].payload.result_summary, /two/);
  assert.equal(durableEnv.AI.calls.length, 3);
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.equal(durableEnv.AI.calls[2].request.tools, undefined);
  const providerToolCalls = body.events.filter((event) => event.event_kind === 'provider_tool_call_requested');
  assert.deepEqual(providerToolCalls.map((event) => event.payload.sequence), [2, 3]);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.deepEqual(textDeltas.map((event) => event.payload.text_delta), [
    'Reading first key.',
    'Reading second key.',
    'Both KV reads completed.',
  ]);
  assertValidEvents(body);
});

test('malformed tool effect result fails turn before invalid evidence append', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_malformed_tool_effect',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      async run() {
        return {
          text: 'Requesting malformed tool result.',
          tool_calls: [{
            tool_name: 'fixture_malformed_tool',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: {
      posture: 'configured',
      adapter_kind: 'fixture-malformed-tool-effect-boundary',
      supported_tools: ['fixture_malformed_tool'],
      capabilities: [],
      async execute() {
        return {
          status: 'ok',
          admission_action: 'admit',
          result_summary: 'malformed missing admission reason',
          result_ref: null,
        };
      },
    },
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_malformed_tool_effect_1',
    content: 'Try a malformed tool result.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_malformed_tool_effect',
    principal: { principal_id: 'operator.fixture', controlled_actions: ['*'] },
    params: { input },
  });
  assert.equal(response.terminal_state, 'failed');
  assert.equal(response.events.some((event) => event.event_kind === 'tool_result_received'), false);
  const failed = response.events.find((event) => event.event_kind === 'turn_failed');
  assert.match(failed.payload.error_summary, /cloudflare_carrier_invalid_session_event/);
  assert.match(failed.payload.error_summary, /payload\.missing_admission_reason/);
  assert.deepEqual(
    response.events.map((event) => event.sequence),
    response.events.map((_, index) => index + 1),
  );
  assertValidEvents(response);
});

test('plain tool effect adapter result remains valid without admission evidence', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_plain_tool_effect',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      async run({ tool_results = [] }) {
        if (tool_results.length > 0) return { text: 'Observed plain tool effect.' };
        return {
          text: 'Requesting plain tool.',
          tool_calls: [{
            tool_name: 'fixture_plain_tool',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: {
      posture: 'configured',
      adapter_kind: 'fixture-plain-tool-effect-boundary',
      supported_tools: ['fixture_plain_tool'],
      capabilities: [],
      async execute() {
        return {
          status: 'ok',
          result_summary: 'plain tool completed',
          result_ref: null,
        };
      },
    },
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_plain_tool_effect_1',
    content: 'Try a plain tool result.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_plain_tool_effect',
    principal: { principal_id: 'operator.fixture', controlled_actions: ['*'] },
    params: { input },
  });
  assert.equal(response.terminal_state, 'completed');
  const toolResult = response.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, undefined);
  assert.equal(toolResult.payload.admission_reason, undefined);
  assert.equal(toolResult.payload.result_summary, 'plain tool completed');
  assertValidEvents(response);
});

test('throwing tool effect adapter records failed tool result and provider follow-up', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_tool_effect_throw',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      calls: [],
      async run({ tool_results = [] }) {
        this.calls.push({ tool_results });
        if (tool_results.length > 0) return { text: 'Observed failed tool effect.' };
        return {
          text: 'Requesting throwing tool.',
          tool_calls: [{
            tool_name: 'fixture_throwing_tool',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: {
      posture: 'configured',
      adapter_kind: 'fixture-throwing-tool-effect-boundary',
      supported_tools: ['fixture_throwing_tool'],
      capabilities: [{
        capability_ref: 'fixture:capability/throwing-tool:v1',
        effect_scope: 'fixture:throwing-tool',
        tool_name: 'fixture_throwing_tool',
        access: 'write',
        substrate: 'fixture',
      }],
      async execute() {
        throw new Error('fixture_tool_effect_threw');
      },
    },
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_effect_throw_1',
    content: 'Try a tool whose adapter throws.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_tool_effect_throw',
    principal: { principal_id: 'operator.fixture', controlled_actions: ['*'] },
    params: { input },
  });
  assert.equal(response.terminal_state, 'completed');
  const toolResult = response.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'failed');
  assert.equal(toolResult.payload.admission_action, undefined);
  assert.equal(toolResult.payload.admission_reason, undefined);
  assert.equal(toolResult.payload.result_summary, 'fixture_tool_effect_threw');
  const textDeltas = response.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'Observed failed tool effect.');
  assert.equal(session.providerAdapter.calls.length, 2);
  assert.equal(session.providerAdapter.calls[1].tool_results[0].status, 'failed');
  assertValidEvents(response);
});

test('configured Cloudflare tool adapter denies admitted effects without principal authority', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_tool_authority_denied',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      async run({ tool_results = [] }) {
        if (tool_results.length > 0) return { text: 'Denied by authority.' };
        return {
          text: 'Requesting metadata.',
          tool_calls: [{
            tool_name: 'cloudflare_carrier_runtime_metadata_read',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: createCloudflareToolEffectAdapter({ CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1' }),
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_authority_denied_1',
    content: 'Try runtime metadata without authority.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_tool_authority_denied',
    principal: { principal_id: 'limited-user', controlled_actions: [] },
    params: { input },
  });
  const toolResult = response.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'denied');
  assert.equal(toolResult.payload.admission_action, 'deny');
  assert.equal(toolResult.payload.admission_reason, 'tool_effect_authority_denied');
  assert.equal(toolResult.payload.authority_ref, undefined);
  assert.equal(toolResult.payload.capability_ref, undefined);
  assert.equal(toolResult.payload.effect_scope, undefined);
  assert.equal(toolResult.payload.result_summary, 'tool_effect_authority_denied');
  assertValidEvents(response);
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

test('tool effect classifier is deny-by-default and admits only configured Cloudflare capabilities', () => {
  assert.equal(toolEffectAdmissionCases.schema, TOOL_EFFECT_ADMISSION_CASES_SCHEMA);
  for (const fixtureCase of toolEffectAdmissionCases.cases) {
    assert.deepEqual(classifyCloudflareToolEffectAdmission(fixtureCase.tool_call, fixtureCase.state), fixtureCase.expected, fixtureCase.name);
  }
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
    NARADA_OPERATOR_SESSION_SECRET: 'test-operator-session-secret',
    ...extra,
  };
}

function microsoftAuthEnv(extraClaims = {}) {
  return {
    MICROSOFT_OIDC_TENANT_ID: 'tenant-fixture',
    MICROSOFT_OIDC_CLIENT_ID: 'microsoft-client-fixture',
    MICROSOFT_OIDC_CLIENT_SECRET: 'microsoft-secret-fixture',
    MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD: {
      iss: 'https://login.microsoftonline.com/tenant-fixture/v2.0',
      aud: 'microsoft-client-fixture',
      tid: 'tenant-fixture',
      oid: 'object-fixture',
      sub: 'subject-fixture',
      nonce: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
      preferred_username: 'operator@example.com',
      name: 'Operator Fixture',
      ...extraClaims,
    },
  };
}

function fakeAiBinding(response) {
  const responses = Array.isArray(response) ? [...response] : [response];
  const calls = [];
  return {
    calls,
    async run(model, request) {
      calls.push({ model, request });
      const next = responses.length > 1 ? responses.shift() : responses[0];
      return typeof next === 'object' && next !== null ? next : { response: next };
    },
  };
}

function fakeKvBinding(values = {}) {
  const state = { ...values };
  return {
    async get(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
    },
    async put(key, value) {
      state[key] = value;
    },
    dump() {
      return { ...state };
    },
  };
}

function fakeD1TaskDatabase() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return fakeD1Statement(rows, String(sql));
    },
  };
}

function fakeD1SiteRegistryDatabase(initial = {}) {
  const state = {
    sites: clone(initial.sites ?? []),
    memberships: clone(initial.memberships ?? []),
    settings: clone(initial.settings ?? []),
    operations: clone(initial.operations ?? []),
    carrierSessions: clone(initial.carrierSessions ?? []),
    authorityEvents: clone(initial.authorityEvents ?? []),
    operatorSessions: clone(initial.operatorSessions ?? []),
    continuityPackets: clone(initial.continuityPackets ?? []),
  };
  return {
    prepare(sql) {
      return fakeD1SiteRegistryStatement(state, String(sql));
    },
    dump() {
      return clone(state);
    },
  };
}

function fakeD1SiteRegistryStatement(state, sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  let bindings = [];
  return {
    bind(...values) {
      bindings = values;
      return this;
    },
    async run() {
      if (normalized.startsWith('insert into cloudflare_site_memberships')) {
        const [site_id, principal_id, role, status, created_at, updated_at] = bindings;
        const existing = state.memberships.find((entry) => entry.site_id === site_id && entry.principal_id === principal_id);
        if (existing) Object.assign(existing, { role, status, updated_at });
        else state.memberships.push({ site_id, principal_id, role, status, created_at, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_site_operations')) {
        const [operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at] = bindings;
        const existing = state.operations.find((entry) => entry.operation_id === operation_id);
        if (existing) Object.assign(existing, { display_name, operation_kind, status, updated_at });
        else state.operations.push({ operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at });
      } else if (normalized.startsWith('update cloudflare_site_carrier_sessions set operation_id')) {
        const [operation_id, updated_at, carrier_session_id] = bindings;
        const existing = state.carrierSessions.find((entry) => entry.carrier_session_id === carrier_session_id);
        if (existing) Object.assign(existing, { operation_id, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_site_carrier_sessions')) {
        const hasOperationId = bindings.length === 8;
        const [carrier_session_id, site_id, maybe_operation_id, maybe_agent_id, maybe_bound_by_principal_id, maybe_binding_status, maybe_created_at, maybe_updated_at] = bindings;
        const operation_id = hasOperationId ? maybe_operation_id : null;
        const agent_id = hasOperationId ? maybe_agent_id : maybe_operation_id;
        const bound_by_principal_id = hasOperationId ? maybe_bound_by_principal_id : maybe_agent_id;
        const binding_status = hasOperationId ? maybe_binding_status : maybe_bound_by_principal_id;
        const created_at = hasOperationId ? maybe_created_at : maybe_binding_status;
        const updated_at = hasOperationId ? maybe_updated_at : maybe_created_at;
        if (!state.carrierSessions.some((entry) => entry.carrier_session_id === carrier_session_id)) {
          state.carrierSessions.push({ carrier_session_id, site_id, operation_id, agent_id, bound_by_principal_id, binding_status, created_at, updated_at });
        }
      } else if (normalized.startsWith('insert into cloudflare_site_authority_events')) {
        const [event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at] = bindings;
        state.authorityEvents.push({ event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at });
      } else if (normalized.startsWith('insert into cloudflare_operator_sessions')) {
        const [operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at] = bindings;
        state.operatorSessions.push({ operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at });
      } else if (normalized.startsWith('insert into cloudflare_site_continuity_packets')) {
        const [packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind, admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at] = bindings;
        state.continuityPackets.push({ packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind, admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at });
      }
      return { success: true };
    },
    async first() {
      if (normalized.includes('from cloudflare_sites where site_id = ?')) {
        const [siteId] = bindings;
        return clone(state.sites.find((site) => site.site_id === siteId));
      }
      if (normalized.includes('from cloudflare_site_memberships where site_id = ? and principal_id = ?')) {
        const [siteId, principalId] = bindings;
        return clone(state.memberships.find((membership) => membership.site_id === siteId && membership.principal_id === principalId));
      }
      if (normalized.includes('from cloudflare_site_carrier_sessions where carrier_session_id = ?')) {
        const [carrierSessionId] = bindings;
        return clone(state.carrierSessions.find((entry) => entry.carrier_session_id === carrierSessionId));
      }
      if (normalized.includes('from cloudflare_site_operations where operation_id = ?')) {
        const [operationId] = bindings;
        return clone(state.operations.find((entry) => entry.operation_id === operationId));
      }
      if (normalized.includes('from cloudflare_operator_sessions')) {
        const [operatorSessionId, now] = bindings;
        return clone(state.operatorSessions.find((entry) => (
          entry.operator_session_id === operatorSessionId
          && entry.revoked_at == null
          && entry.expires_at > now
        )));
      }
      return null;
    },
    async all() {
      if (normalized.includes('from cloudflare_site_carrier_sessions')) {
        if (normalized.includes('where operation_id = ?')) {
          const [operationId, limit] = bindings;
          return {
            results: state.carrierSessions
              .filter((entry) => entry.operation_id === operationId)
              .sort((left, right) => right.created_at.localeCompare(left.created_at))
              .slice(0, Number(limit))
              .map((entry) => clone(entry)),
          };
        }
        const [siteId, limit] = bindings;
        return {
          results: state.carrierSessions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_authority_events')) {
        const [siteId, limit] = bindings;
        return {
          results: state.authorityEvents
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_settings')) {
        const [siteId] = bindings;
        return { results: state.settings.filter((entry) => entry.site_id === siteId).map((entry) => clone(entry)) };
      }
      if (normalized.includes('from cloudflare_site_operations')) {
        const [siteId, limit] = bindings;
        return {
          results: state.operations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_continuity_packets')) {
        const [siteId, limit] = bindings;
        return {
          results: state.continuityPackets
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.imported_at.localeCompare(left.imported_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_memberships')) {
        const [siteId, limit] = bindings;
        return {
          results: state.memberships
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      return { results: [] };
    },
  };
}

function fakeD1Statement(rows, sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  let bindings = [];
  return {
    bind(...values) {
      bindings = values;
      return this;
    },
    async run() {
      if (normalized.startsWith('insert into narada_tasks')) {
        const [site_id, task_id, task_number, title, description, status, source, note, created_at, updated_at, carrier_session_id, agent_id, site_root] = bindings;
        rows.push({ site_id, task_id, task_number, title, description, status, source, note, created_at, updated_at, carrier_session_id, agent_id, site_root });
      } else if (normalized.startsWith('update narada_tasks set')) {
        const [status, note, updated_at, siteId, taskId] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        if (row) Object.assign(row, { status, note, updated_at });
      }
      return { success: true };
    },
    async first() {
      if (normalized.startsWith('select coalesce(max(task_number)')) {
        const [siteId] = bindings;
        const max = rows.filter((entry) => entry.site_id === siteId).reduce((value, entry) => Math.max(value, Number(entry.task_number)), 0);
        return { next_task_number: max + 1 };
      }
      if (normalized.includes('where site_id = ? and task_id = ?')) {
        const [siteId, taskId] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        return row ? clone(row) : null;
      }
      if (normalized.includes('where site_id = ? and task_number = ?')) {
        const [siteId, taskNumber] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && Number(entry.task_number) === Number(taskNumber));
        return row ? clone(row) : null;
      }
      return null;
    },
    async all() {
      if (normalized.includes('where site_id = ? order by task_number')) {
        const [siteId] = bindings;
        return {
          results: rows
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => Number(left.task_number) - Number(right.task_number))
            .map((entry) => clone(entry)),
        };
      }
      return { results: [] };
    },
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function jsonRequest(body, { token = null, cookie = null, path = '/control' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  return new Request(`https://carrier.test${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
