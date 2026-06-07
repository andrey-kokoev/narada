#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const workerUrl = option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL;
if (!workerUrl) {
  throw new Error('live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
}
const bearerToken = await resolveBearerToken();
if (!bearerToken) {
  throw new Error('live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
}

const sessionSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const carrierSessionId = option('--session') ?? `carrier_session_live_smoke_${sessionSuffix}`;
const agentId = option('--agent') ?? 'narada.live.smoke';
const siteId = option('--site') ?? 'site_live_smoke';
const goalWords = option('--goal')?.split(/\s+/).filter(Boolean) ?? ['prove', 'live', 'cloudflare', 'carrier'];
const expectedGoal = goalWords.join(' ');
const expectedToolEffectPosture = option('--expect-tool-effect-posture') ?? process.env.CLOUDFLARE_CARRIER_EXPECT_TOOL_EFFECT_POSTURE ?? null;
const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));
const consoleCheck = await getConsole();
assert.equal(consoleCheck.http_status, 200);
assert.match(consoleCheck.body, /Narada Cloudflare Carrier/);
assert.match(consoleCheck.body, /naradaCloudflareCarrierClient/);
assert.match(consoleCheck.body, /\/api\/carrier/);

const providerRefusalInput = {
  ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
  event_id: `input_live_smoke_${sessionSuffix}`,
  content: 'Live smoke input requiring provider refusal evidence.',
};

const start = await post({
  operation: 'session.start',
  request_id: `live_smoke_start_${sessionSuffix}`,
  params: {
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    site_id: siteId,
    site_root: `cloudflare://${siteId}`,
  },
});
assert.equal(start.http_status, 200);
assert.equal(start.body.ok, true);
assertAuthenticatedPrincipal(start.body.principal);
assert.equal(start.body.event.event_kind, 'carrier_session_started');
assert.deepEqual(start.body.event.payload.principal, start.body.principal);

const command = await post({
  operation: 'carrier.command.execute',
  request_id: `live_smoke_goal_${sessionSuffix}`,
  carrier_session_id: carrierSessionId,
  params: {
    command: '/goal',
    args: goalWords,
  },
});
assert.equal(command.http_status, 200);
assert.equal(command.body.ok, true);
assertAuthenticatedPrincipal(command.body.principal);
assert.equal(command.body.event.event_kind, 'carrier_command_executed');

const inputDelivery = await post({
  operation: 'carrier.input.deliver',
  request_id: `live_smoke_input_${sessionSuffix}`,
  carrier_session_id: carrierSessionId,
  params: {
    input: providerRefusalInput,
  },
});
assert.equal(inputDelivery.http_status, 200);
assert.equal(inputDelivery.body.ok, true);
assertAuthenticatedPrincipal(inputDelivery.body.principal);
assert.equal(inputDelivery.body.input_event_id, providerRefusalInput.event_id);
assert.equal(inputDelivery.body.terminal_state, 'completed');
const inputEventKinds = inputDelivery.body.events.map((event) => event.event_kind);
for (const eventKind of ['input_admitted_to_turn', 'turn_started', 'provider_request_recorded', 'provider_text_delta_recorded', 'turn_completed', 'input_completed']) {
  assert.ok(inputEventKinds.includes(eventKind), eventKind);
}
const providerRequest = inputDelivery.body.events.find((event) => event.event_kind === 'provider_request_recorded');
assert.equal(providerRequest.payload.provider_request_status, 'dispatched');
assert.equal(providerRequest.payload.provider_execution_enabled, true);
assert.equal(providerRequest.payload.provider_runtime_status, 'available');
assert.equal(providerRequest.payload.provider_adapter_admission_status, 'admitted');
assert.equal(providerRequest.payload.provider_adapter_kind, 'cloudflare-workers-ai');
const providerOutput = inputDelivery.body.events.find((event) => event.event_kind === 'provider_text_delta_recorded');
assert.equal(typeof providerOutput.payload.text_delta, 'string');
assert.ok(providerOutput.payload.text_delta.length > 0);
const turnCompleted = inputDelivery.body.events.find((event) => event.event_kind === 'turn_completed');
assert.equal(turnCompleted.payload.provider_request_status, 'completed');
assert.equal(turnCompleted.payload.terminal_status, 'completed');
const inputCompleted = inputDelivery.body.events.find((event) => event.event_kind === 'input_completed');
assert.equal(inputCompleted.payload.input_event_id, providerRefusalInput.event_id);
assert.equal(inputCompleted.payload.terminal_state, 'completed');

const taskCreate = await post({
  operation: 'carrier.command.execute',
  request_id: `live_smoke_task_create_${sessionSuffix}`,
  carrier_session_id: carrierSessionId,
  params: {
    command: '/task',
    args: ['create', 'live', 'cloudflare', 'task'],
  },
});
assert.equal(taskCreate.http_status, 200);
assert.equal(taskCreate.body.ok, true);
const taskCreateResult = taskCreate.body.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(taskCreateResult.payload.status, 'ok');
assert.equal(taskCreateResult.payload.admission_action, 'admit');
assert.equal(taskCreateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
assert.equal(taskCreateResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
const createdTask = JSON.parse(taskCreateResult.payload.result_summary).task;
assert.equal(createdTask.title, 'live cloudflare task');

const taskUpdate = await post({
  operation: 'carrier.command.execute',
  request_id: `live_smoke_task_update_${sessionSuffix}`,
  carrier_session_id: carrierSessionId,
  params: {
    command: '/task',
    args: ['update', createdTask.task_id, 'done', 'live-smoke'],
  },
});
assert.equal(taskUpdate.http_status, 200);
assert.equal(taskUpdate.body.ok, true);
const taskUpdateResult = taskUpdate.body.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(taskUpdateResult.payload.status, 'ok');
assert.equal(taskUpdateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-update:v1');
const updatedTask = JSON.parse(taskUpdateResult.payload.result_summary).task;
assert.equal(updatedTask.status, 'done');
assert.equal(updatedTask.note, 'live-smoke');

const status = await post({
  operation: 'session.status',
  carrier_session_id: carrierSessionId,
});
assert.equal(status.http_status, 200);
assert.equal(status.body.ok, true);
assert.equal(status.body.carrier_session_id, carrierSessionId);
assert.equal(status.body.agent_id, agentId);
assert.equal(status.body.carrier_host, 'cloudflare-durable-object');
assert.equal(status.body.provider_adapter_posture, 'cloudflare-workers-ai');
assertToolEffectStatus(status.body, expectedToolEffectPosture);
assertAuthenticatedPrincipal(status.body.reader_principal);
assert.deepEqual(status.body.goal, { text: expectedGoal, state: 'active' });
assert.ok(status.body.next_event_sequence >= 13);
assert.ok(Array.isArray(status.body.tasks));
assert.ok(status.body.tasks.some((task) => task.task_id === createdTask.task_id && task.status === 'done' && task.note === 'live-smoke'));

const events = await post({
  operation: 'session.events.read',
  carrier_session_id: carrierSessionId,
  params: {
    after_sequence: 0,
    limit: 20,
  },
});
assert.equal(events.http_status, 200);
assert.equal(events.body.ok, true);
assertAuthenticatedPrincipal(events.body.reader_principal);
const liveEventKinds = events.body.events.map((event) => event.event_kind);
for (const eventKind of ['carrier_session_started', 'carrier_command_executed', 'provider_request_recorded', 'provider_text_delta_recorded', 'tool_call_requested', 'tool_result_received']) {
  assert.ok(liveEventKinds.includes(eventKind), eventKind);
}
assert.ok(events.body.next_cursor >= 12);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  console_surface_checked: true,
  api_client_path: apiUrl().toString(),
  carrier_session_id: carrierSessionId,
  agent_id: agentId,
  carrier_host: status.body.carrier_host,
  provider_adapter_posture: status.body.provider_adapter_posture,
  tool_effect_posture: status.body.tool_effect_posture,
  tool_effect_adapter_kind: status.body.tool_effect_adapter_kind,
  tool_effect_supported_tools: status.body.tool_effect_supported_tools,
  tool_effect_capabilities: status.body.tool_effect_capabilities,
  tool_effect_outcomes_checked: false,
  tool_effect_outcome_check_reason: 'live_smoke_uses_real_provider_output; deterministic_tool_effect_outcomes_are_checked_by_deploy_check',
  principal_id: status.body.reader_principal.principal_id,
  principal_email: status.body.reader_principal.email,
  goal: status.body.goal,
  input_event_id: providerRefusalInput.event_id,
  input_terminal_state: inputDelivery.body.terminal_state,
  provider_request_status: providerRequest.payload.provider_request_status,
  provider_execution_enabled: providerRequest.payload.provider_execution_enabled,
  provider_text_preview: providerOutput.payload.text_delta.slice(0, 120),
  turn_terminal_status: turnCompleted.payload.terminal_status,
  task_create_status: taskCreateResult.payload.status,
  task_update_status: taskUpdateResult.payload.status,
  persisted_tasks: status.body.tasks,
  event_kinds: events.body.events.map((event) => event.event_kind),
  sequences: events.body.events.map((event) => event.sequence),
  next_cursor: events.body.next_cursor,
}, null, 2)}\n`);

function assertAuthenticatedPrincipal(principal) {
  assert.ok(principal && typeof principal === 'object');
  assert.ok(['admin', 'service'].includes(principal.principal_id), principal.principal_id);
  assert.ok(['user', 'service'].includes(principal.auth_type), principal.auth_type);
  assert.ok(Array.isArray(principal.controlled_actions));
  assert.ok(principal.controlled_actions.includes('*'));
  if (principal.principal_id === 'admin') assert.equal(principal.email, 'admin@system');
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function assertToolEffectStatus(body, expectedPosture) {
  assert.ok(['unconfigured', 'configured'].includes(body.tool_effect_posture), body.tool_effect_posture);
  if (expectedPosture) assert.equal(body.tool_effect_posture, expectedPosture);
  if (body.tool_effect_posture === 'configured') {
    assert.equal(body.tool_effect_adapter_kind, 'cloudflare-tool-effect-boundary');
    assert.ok(Array.isArray(body.tool_effect_supported_tools) && body.tool_effect_supported_tools.length > 0);
    assert.ok(Array.isArray(body.tool_effect_capabilities) && body.tool_effect_capabilities.length > 0);
    assert.deepEqual(body.tool_effect_supported_tools, body.tool_effect_capabilities.map((capability) => capability.tool_name));
    for (const capability of body.tool_effect_capabilities) assertKnownToolCapability(capability);
  } else {
    assert.equal(body.tool_effect_adapter_kind, null);
    assert.deepEqual(body.tool_effect_supported_tools, []);
    assert.deepEqual(body.tool_effect_capabilities, []);
  }
}

function assertKnownToolCapability(capability) {
  if (capability.tool_name === 'cloudflare_carrier_runtime_metadata_read') {
    assert.deepEqual(capability, {
      capability_ref: 'cloudflare-carrier:capability/runtime-metadata-read:v1',
      effect_scope: 'cloudflare-carrier/runtime-metadata:read-only',
      tool_name: 'cloudflare_carrier_runtime_metadata_read',
      access: 'read_only',
      substrate: 'cloudflare-worker-runtime',
    });
    return;
  }
  if (capability.tool_name === 'cloudflare_carrier_task_create') {
    assert.deepEqual(capability, {
      capability_ref: 'cloudflare-carrier:capability/task-create:v1',
      effect_scope: 'cloudflare-narada-task:write:create',
      tool_name: 'cloudflare_carrier_task_create',
      access: 'write',
      substrate: 'cloudflare-d1-task-store',
    });
    return;
  }
  if (capability.tool_name === 'cloudflare_carrier_task_update') {
    assert.deepEqual(capability, {
      capability_ref: 'cloudflare-carrier:capability/task-update:v1',
      effect_scope: 'cloudflare-narada-task:write:update',
      tool_name: 'cloudflare_carrier_task_update',
      access: 'write',
      substrate: 'cloudflare-d1-task-store',
    });
    return;
  }
  if (capability.tool_name === 'cloudflare_carrier_task_list') {
    assert.deepEqual(capability, {
      capability_ref: 'cloudflare-carrier:capability/task-list:v1',
      effect_scope: 'cloudflare-narada-task:read:list',
      tool_name: 'cloudflare_carrier_task_list',
      access: 'read_only',
      substrate: 'cloudflare-d1-task-store',
    });
    return;
  }
  if (capability.tool_name === 'cloudflare_carrier_kv_get') {
    assert.deepEqual(capability, {
      capability_ref: 'cloudflare-carrier:capability/kv-get:v1',
      effect_scope: 'cloudflare-kv:read-only:get',
      tool_name: 'cloudflare_carrier_kv_get',
      access: 'read_only',
      substrate: 'cloudflare-kv',
    });
    return;
  }
  if (capability.tool_name === 'cloudflare_carrier_kv_put') {
    assert.deepEqual(capability, {
      capability_ref: 'cloudflare-carrier:capability/kv-put:v1',
      effect_scope: 'cloudflare-kv:write:put',
      tool_name: 'cloudflare_carrier_kv_put',
      access: 'write',
      substrate: 'cloudflare-kv',
    });
    return;
  }
  assert.fail(`unknown_tool_effect_capability:${String(capability.tool_name)}`);
}

async function getConsole() {
  const response = await fetch(workerUrl);
  return {
    http_status: response.status,
    body: await response.text(),
  };
}

async function post(body) {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken.value}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return {
    http_status: response.status,
    body: parsed,
  };
}

function apiUrl() {
  return new URL('/api/carrier', withTrailingSlash(workerUrl));
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

async function resolveBearerToken() {
  const flagToken = option('--token');
  if (flagToken) return { value: flagToken, source: 'flag:--token' };
  const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { value: readFileSync(tokenFile, 'utf8').trim(), source: 'token-file' };
  if (process.env.CLOUDFLARE_CARRIER_TOKEN) return { value: process.env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}
