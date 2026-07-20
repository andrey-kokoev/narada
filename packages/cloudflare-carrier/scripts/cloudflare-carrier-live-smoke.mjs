#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);

export function parseLiveSmokeArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_LIVE_SMOKE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env) ?? resolveBearerToken(args, env);
  if (!workerUrl) throw new Error('live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('live_smoke_requires_bearer_token_or_operator_session');

  const sessionSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const siteId = option(args, '--site') ?? 'site_live_smoke';
  const goalWords = option(args, '--goal')?.split(/\s+/).filter(Boolean) ?? ['prove', 'live', 'cloudflare', 'carrier'];

  return {
    workerUrl,
    format,
    auth,
    carrierSessionId: option(args, '--session') ?? `carrier_session_live_smoke_${sessionSuffix}`,
    agentId: option(args, '--agent') ?? 'narada.live.smoke',
    siteId,
    intelligenceSiteId: option(args, '--intelligence-site') ?? 'site:narada-cloudflare',
    siteRoot: option(args, '--site-root') ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? `cloudflare://${siteId}`,
    operationId: option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null,
    goalWords,
    expectedGoal: goalWords.join(' '),
    expectedToolEffectPosture: option(args, '--expect-tool-effect-posture') ?? env.CLOUDFLARE_CARRIER_EXPECT_TOOL_EFFECT_POSTURE ?? null,
    sessionSuffix,
  };
}

async function postIntelligence(config, body, fetchImpl) {
  const response = await fetchImpl(new URL('/api/intelligence', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
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
  return { http_status: response.status, body: parsed };
}

export function formatLiveSmokeText(result) {
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const hasOperationId = typeof result.operation_id === 'string' && result.operation_id.length > 0;
  const hasCarrierSessionId = typeof result.carrier_session_id === 'string' && result.carrier_session_id.length > 0;
  const lines = [
    `Live Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Session: ${result.carrier_session_id}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id ?? 'none'}`,
    `Agent: ${result.agent_id}`,
    `Goal: ${result.goal?.text ?? 'unknown'} state=${result.goal?.state ?? 'unknown'}`,
    `Provider: posture=${result.provider_adapter_posture ?? 'unknown'} request=${result.provider_request_status ?? 'unknown'} execution=${String(result.provider_execution_enabled)}`,
    `Intelligence: attempt=${result.intelligence_attempt_id ?? 'none'} outcome=${result.intelligence_outcome_kind ?? 'unknown'} evidence_readback=${String(result.intelligence_evidence_readback)}`,
    `Tool Effect: posture=${result.tool_effect_posture ?? 'unknown'} adapter=${result.tool_effect_adapter_kind ?? 'none'}`,
    `Task Mutation: create=${result.task_create_status ?? 'unknown'} update=${result.task_update_status ?? 'unknown'} persisted=${Array.isArray(result.persisted_tasks) ? result.persisted_tasks.length : 0}`,
  ];
  if (hasSiteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && hasCarrierSessionId) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${result.carrier_session_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${result.carrier_session_id} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${result.carrier_session_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  if (hasSiteId && hasOperationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));
  const consoleCheck = await getConsole(config, fetchImpl);
  assert.equal(consoleCheck.http_status, 200);
  assert.match(consoleCheck.body, /Narada Cloudflare Carrier/);
  assert.match(consoleCheck.body, /naradaCloudflareCarrierClient/);
  assert.match(consoleCheck.body, /\/api\/carrier/);

  const providerRefusalInput = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: `input_live_smoke_${config.sessionSuffix}`,
    content: 'Live smoke input requiring provider refusal evidence.',
  };

  const start = await post(config, {
    operation: 'session.start',
    request_id: `live_smoke_start_${config.sessionSuffix}`,
    params: {
      carrier_session_id: config.carrierSessionId,
      agent_id: config.agentId,
      site_id: config.siteId,
      ...(config.operationId ? { operation_id: config.operationId } : {}),
      site_root: config.siteRoot,
    },
  }, fetchImpl);
  assert.equal(start.http_status, 200);
  assert.equal(start.body.ok, true);
  assertAuthenticatedPrincipal(start.body.principal);
  assert.equal(start.body.event.event_kind, 'carrier_session_started');
  assert.deepEqual(start.body.event.payload.principal, start.body.principal);

  const command = await post(config, {
    operation: 'carrier.command.execute',
    request_id: `live_smoke_goal_${config.sessionSuffix}`,
    carrier_session_id: config.carrierSessionId,
    params: {
      command: '/goal',
      args: config.goalWords,
    },
  }, fetchImpl);
  assert.equal(command.http_status, 200);
  assert.equal(command.body.ok, true);
  assertAuthenticatedPrincipal(command.body.principal);
  assert.equal(command.body.event.event_kind, 'carrier_command_executed');

  const inputDelivery = await post(config, {
    operation: 'carrier.input.deliver',
    request_id: `live_smoke_input_${config.sessionSuffix}`,
    carrier_session_id: config.carrierSessionId,
    params: {
      input: providerRefusalInput,
    },
  }, fetchImpl);
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
  const intelligence = turnCompleted.payload.intelligence;
  assert.ok(intelligence && typeof intelligence === 'object');
  assert.equal(typeof intelligence.intent_id, 'string');
  assert.equal(typeof intelligence.plan_id, 'string');
  assert.equal(typeof intelligence.attempt_id, 'string');
  assert.equal(intelligence.outcome_kind, 'success');
  const executionRead = await postIntelligence(config, {
    schema: 'narada.cloudflare.invokable-intelligence.management-api-request.v1',
    owning_site: { kind: 'site', id: config.intelligenceSiteId },
    request: { operation: 'execution.read', attempt_id: intelligence.attempt_id },
  }, fetchImpl);
  assert.equal(executionRead.http_status, 200);
  assert.equal(executionRead.body.ok, true);
  assert.equal(executionRead.body.result.schema, 'narada.cloudflare.invokable-intelligence.execution-read.v1');
  assert.equal(executionRead.body.result.data.intent.id, intelligence.intent_id);
  assert.equal(executionRead.body.result.data.plan.id, intelligence.plan_id);
  assert.equal(executionRead.body.result.data.attempt.id, intelligence.attempt_id);
  assert.equal(executionRead.body.result.data.terminal_outcome.id, intelligence.outcome_id);
  assert.equal(executionRead.body.result.data.terminal_outcome.kind, 'success');
  assert.deepEqual(executionRead.body.result.data.transitions.map(({ state }) => state), [
    'dispatching', 'provider-pending', 'terminal',
  ]);
  assert.ok(executionRead.body.result.data.results.length >= 1);
  assert.ok(executionRead.body.result.data.observations.length >= 3);
  assert.ok(executionRead.body.result.data.audit_evidence.length >= 4);
  assert.ok(executionRead.body.result.data.telemetry.length >= 1);
  assert.equal(executionRead.body.result.data.provenance.route_authority.site_id, config.intelligenceSiteId);
  assert.ok(executionRead.body.result.data.provenance.materializations.length >= 1);
  assert.ok(executionRead.body.result.data.provenance.materializations.every(({ destination }) =>
    destination.site_id === config.intelligenceSiteId));
  const inputCompleted = inputDelivery.body.events.find((event) => event.event_kind === 'input_completed');
  assert.equal(inputCompleted.payload.input_event_id, providerRefusalInput.event_id);
  assert.equal(inputCompleted.payload.terminal_state, 'completed');

  const taskCreate = await post(config, {
    operation: 'carrier.command.execute',
    request_id: `live_smoke_task_create_${config.sessionSuffix}`,
    carrier_session_id: config.carrierSessionId,
    params: {
      command: '/task',
      args: ['create', 'live', 'cloudflare', 'task'],
    },
  }, fetchImpl);
  assert.equal(taskCreate.http_status, 200);
  assert.equal(taskCreate.body.ok, true);
  const taskCreateResult = taskCreate.body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(taskCreateResult.payload.status, 'ok');
  assert.equal(taskCreateResult.payload.admission_action, 'admit');
  assert.equal(taskCreateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
  assert.equal(taskCreateResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
  const createdTask = JSON.parse(taskCreateResult.payload.result_summary).task;
  assert.equal(createdTask.title, 'live cloudflare task');

  const taskUpdate = await post(config, {
    operation: 'carrier.command.execute',
    request_id: `live_smoke_task_update_${config.sessionSuffix}`,
    carrier_session_id: config.carrierSessionId,
    params: {
      command: '/task',
      args: ['update', createdTask.task_id, 'done', 'live-smoke'],
    },
  }, fetchImpl);
  assert.equal(taskUpdate.http_status, 200);
  assert.equal(taskUpdate.body.ok, true);
  const taskUpdateResult = taskUpdate.body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(taskUpdateResult.payload.status, 'ok');
  assert.equal(taskUpdateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-update:v1');
  const updatedTask = JSON.parse(taskUpdateResult.payload.result_summary).task;
  assert.equal(updatedTask.status, 'done');
  assert.equal(updatedTask.note, 'live-smoke');

  const status = await post(config, {
    operation: 'session.status',
    carrier_session_id: config.carrierSessionId,
  }, fetchImpl);
  assert.equal(status.http_status, 200);
  assert.equal(status.body.ok, true);
  assert.equal(status.body.carrier_session_id, config.carrierSessionId);
  assert.equal(status.body.agent_id, config.agentId);
  if (config.operationId) assert.equal(status.body.operation_id, config.operationId);
  assert.equal(status.body.carrier_host, 'cloudflare-durable-object');
  assert.equal(status.body.provider_adapter_posture, 'cloudflare-workers-ai');
  assertToolEffectStatus(status.body, config.expectedToolEffectPosture);
  assertAuthenticatedPrincipal(status.body.reader_principal);
  assert.deepEqual(status.body.goal, { text: config.expectedGoal, state: 'active' });
  assert.ok(status.body.next_event_sequence >= 13);
  assert.ok(Array.isArray(status.body.tasks));
  assert.ok(status.body.tasks.some((task) => task.task_id === createdTask.task_id && task.status === 'done' && task.note === 'live-smoke'));

  const events = await post(config, {
    operation: 'session.events.read',
    carrier_session_id: config.carrierSessionId,
    params: {
      after_sequence: 0,
      limit: 20,
    },
  }, fetchImpl);
  assert.equal(events.http_status, 200);
  assert.equal(events.body.ok, true);
  assertAuthenticatedPrincipal(events.body.reader_principal);
  const liveEventKinds = events.body.events.map((event) => event.event_kind);
  for (const eventKind of ['carrier_session_started', 'carrier_command_executed', 'provider_request_recorded', 'provider_text_delta_recorded', 'tool_call_requested', 'tool_result_received']) {
    assert.ok(liveEventKinds.includes(eventKind), eventKind);
  }
  assert.ok(events.body.next_cursor >= 12);

  return {
    schema: 'narada.cloudflare_carrier.live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    console_surface_checked: true,
    api_client_path: apiUrl(config).toString(),
    carrier_session_id: config.carrierSessionId,
    agent_id: config.agentId,
    site_id: config.siteId,
    operation_id: config.operationId,
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
    intelligence_site_id: config.intelligenceSiteId,
    intelligence_attempt_id: intelligence.attempt_id,
    intelligence_outcome_id: intelligence.outcome_id,
    intelligence_outcome_kind: intelligence.outcome_kind,
    intelligence_evidence_readback: true,
    intelligence_transition_states: executionRead.body.result.data.transitions.map(({ state }) => state),
    intelligence_observation_count: executionRead.body.result.data.observations.length,
    intelligence_audit_evidence_count: executionRead.body.result.data.audit_evidence.length,
    intelligence_telemetry_count: executionRead.body.result.data.telemetry.length,
    intelligence_materialization_count: executionRead.body.result.data.provenance.materializations.length,
    provider_text_preview: providerOutput.payload.text_delta.slice(0, 120),
    turn_terminal_status: turnCompleted.payload.terminal_status,
    task_create_status: taskCreateResult.payload.status,
    task_update_status: taskUpdateResult.payload.status,
    persisted_tasks: status.body.tasks,
    event_kinds: events.body.events.map((event) => event.event_kind),
    sequences: events.body.events.map((event) => event.sequence),
    next_cursor: events.body.next_cursor,
  };
}

function assertAuthenticatedPrincipal(principal) {
  assert.ok(principal && typeof principal === 'object');
  assert.ok(['admin', 'service'].includes(principal.principal_id), principal.principal_id);
  assert.ok(['user', 'service'].includes(principal.auth_type), principal.auth_type);
  assert.ok(Array.isArray(principal.controlled_actions));
  assert.ok(principal.controlled_actions.includes('*'));
  if (principal.principal_id === 'admin') assert.equal(principal.email, 'admin@system');
}

function option(args, name) {
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

async function getConsole(config, fetchImpl) {
  const response = await fetchImpl(config.workerUrl);
  return {
    http_status: response.status,
    body: await response.text(),
  };
}

async function post(config, body, fetchImpl) {
  const response = await fetchImpl(apiUrl(config), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
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

function apiUrl(config) {
  return new URL('/api/carrier', withTrailingSlash(config.workerUrl));
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function resolveBearerToken(args, env) {
  const flagToken = option(args, '--token');
  if (flagToken) return { kind: 'bearer', value: flagToken, source: 'flag:--token' };
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { kind: 'bearer', value: readFileSync(tokenFile, 'utf8').trim(), source: 'token-file' };
  if (env.CLOUDFLARE_CARRIER_TOKEN) return { kind: 'bearer', value: env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const config = parseLiveSmokeArgs(argv, env);
  const result = await runLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  await main();
}
