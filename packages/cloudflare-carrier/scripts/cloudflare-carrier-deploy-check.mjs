#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudflareCarrierSession } from '../src/cloudflare-carrier.mjs';
import worker, { classifyCloudflareToolEffectAdmission, CloudflareCarrierDurableObject } from '../src/cloudflare-worker.mjs';

const configText = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));
const manualOperatorInput = inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input;

assert.match(configText, /^name = "narada-cloudflare-carrier"$/m);
assert.match(configText, /^main = "src\/cloudflare-worker\.mjs"$/m);
assert.match(configText, /^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
assert.match(configText, /^name = "CLOUDFLARE_CARRIER_SESSIONS"$/m);
assert.match(configText, /^class_name = "CloudflareCarrierDurableObject"$/m);
assert.match(configText, /^new_sqlite_classes = \["CloudflareCarrierDurableObject"\]$/m);
assert.match(configText, /^binding = "AI"$/m);
assert.match(configText, /^CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS = "1"$/m);
assert.match(configText, /^binding = "CLOUDFLARE_CARRIER_TASK_DB"$/m);
assert.match(configText, /^database_name = "narada-cloudflare-carrier-tasks"$/m);
assert.equal(configText.includes('account_id'), false);
assert.equal(classifyCloudflareToolEffectAdmission({ tool_name: 'cloudflare_carrier_runtime_metadata_read' }).action, 'deny');
assert.equal(classifyCloudflareToolEffectAdmission({ tool_name: 'cloudflare_carrier_runtime_metadata_read' }, { runtimeReadsEnabled: true }).action, 'admit');
assert.equal(classifyCloudflareToolEffectAdmission({ tool_name: 'native_shell' }, { runtimeReadsEnabled: true }).reason, 'unsupported_tool_effect');

const durableEnv = { AI: fakeAiBinding([
  {
    response: 'Deploy check Cloudflare AI response.',
    tool_calls: [{
      tool_name: 'cloudflare_carrier_runtime_metadata_read',
      arguments_summary: '{}',
      arguments_ref: null,
    }],
  },
  { response: 'Deploy check denied tool effect response.' },
]) };
const namespace = fakeDurableObjectNamespace(durableEnv);
const env = {
  CLOUDFLARE_CARRIER_SESSIONS: namespace,
  ADMIN_BEARER_TOKEN: 'deploy-check-admin-token',
  ...durableEnv,
};
const consoleResponse = await worker.fetch(new Request('https://carrier.deploy-check.example/'), env);
assert.equal(consoleResponse.status, 200);
assert.match(consoleResponse.headers.get('content-type'), /text\/html/);
const consoleHtml = await consoleResponse.text();
assert.match(consoleHtml, /Narada Cloudflare Carrier/);
assert.match(consoleHtml, /naradaCloudflareCarrierClient/);
assert.match(consoleHtml, /\/api\/carrier/);
assert.match(consoleHtml, /Sign in with Microsoft/);
assert.match(consoleHtml, /\/auth\/microsoft\/login/);
assert.match(consoleHtml, /\/auth\/session/);
assert.match(consoleHtml, /Task State/);

const apiClientStartResponse = await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_api_client_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check_api_client',
    agent_id: 'narada.deploy.check.api_client',
    site_id: 'site_deploy_check_api_client',
    site_root: 'cloudflare://site_deploy_check_api_client',
  },
}, { path: '/api/carrier' }), env);
assert.equal(apiClientStartResponse.status, 200);
const apiClientStart = await apiClientStartResponse.json();
assert.equal(apiClientStart.event.event_kind, 'carrier_session_started');
assert.equal(apiClientStart.principal.email, 'admin@system');

const apiClientStatusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check_api_client',
}, { path: '/api/carrier' }), env);
assert.equal(apiClientStatusResponse.status, 200);
const apiClientStatus = await apiClientStatusResponse.json();
assert.equal(apiClientStatus.carrier_session_id, 'carrier_session_deploy_check_api_client');
assert.equal(apiClientStatus.reader_principal.email, 'admin@system');

const taskDb = fakeD1TaskDatabase();
const taskDurableEnv = {
  CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1',
  CLOUDFLARE_CARRIER_TASK_DB: taskDb,
};
const taskEnv = {
  CLOUDFLARE_CARRIER_SESSIONS: fakeDurableObjectNamespace(taskDurableEnv),
  ADMIN_BEARER_TOKEN: 'deploy-check-admin-token',
  ...taskDurableEnv,
};
await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_task_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check_task',
    agent_id: 'narada.deploy.check.task',
    site_id: 'site_deploy_check_task',
    site_root: 'cloudflare://site_deploy_check_task',
  },
}), taskEnv);
const taskCreateResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.command.execute',
  request_id: 'deploy_check_task_create',
  carrier_session_id: 'carrier_session_deploy_check_task',
  params: {
    command: '/task',
    args: ['create', 'deploy', 'checked', 'task'],
  },
}), taskEnv);
assert.equal(taskCreateResponse.status, 200);
const taskCreate = await taskCreateResponse.json();
const taskCreateResult = taskCreate.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(taskCreateResult.payload.status, 'ok');
assert.equal(taskCreateResult.payload.admission_action, 'admit');
assert.equal(taskCreateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
assert.equal(taskCreateResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
assert.equal(JSON.parse(taskCreateResult.payload.result_summary).task.title, 'deploy checked task');
const taskUpdateResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.command.execute',
  request_id: 'deploy_check_task_update',
  carrier_session_id: 'carrier_session_deploy_check_task',
  params: {
    command: '/task',
    args: ['update', 'cloudflare-task-1', 'done', 'deploy-check'],
  },
}), taskEnv);
assert.equal(taskUpdateResponse.status, 200);
const taskStatusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check_task',
}), taskEnv);
const taskStatus = await taskStatusResponse.json();
assert.equal(taskStatus.tasks.length, 1);
assert.equal(taskStatus.tasks[0].status, 'done');
assert.equal(taskStatus.tasks[0].note, 'deploy-check');
assert.deepEqual(taskStatus.tool_effect_supported_tools, [
  'cloudflare_carrier_task_create',
  'cloudflare_carrier_task_update',
  'cloudflare_carrier_task_list',
]);

const startResponse = await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check',
    agent_id: 'narada.deploy.check',
    site_id: 'site_deploy_check',
    site_root: 'cloudflare://site_deploy_check',
  },
}), env);
assert.equal(startResponse.status, 200);
const start = await startResponse.json();
assert.equal(start.principal.email, 'admin@system');
assert.equal(start.event.payload.principal.email, 'admin@system');

const commandResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.command.execute',
  request_id: 'deploy_check_goal',
  carrier_session_id: 'carrier_session_deploy_check',
  params: {
    command: '/goal',
    args: ['prove', 'cloudflare', 'carrier', 'boundary'],
  },
}), env);
assert.equal(commandResponse.status, 200);

const statusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check',
}), env);
const status = await statusResponse.json();
assert.equal(status.goal.text, 'prove cloudflare carrier boundary');
assert.equal(status.carrier_host, 'cloudflare-durable-object');
assert.equal(status.provider_adapter_posture, 'cloudflare-workers-ai');
assert.equal(status.tool_effect_posture, 'unconfigured');
assert.deepEqual(status.tool_effect_supported_tools, []);
assert.deepEqual(status.tool_effect_capabilities, []);
assert.equal(status.reader_principal.email, 'admin@system');

const inputResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.input.deliver',
  request_id: 'deploy_check_tool_effect_boundary',
  carrier_session_id: 'carrier_session_deploy_check',
  params: {
    input: {
      ...manualOperatorInput,
      event_id: 'input_deploy_check_tool_effect_boundary',
      content: 'Exercise the Cloudflare carrier tool effect boundary.',
    },
  },
}), env);
assert.equal(inputResponse.status, 200);
const input = await inputResponse.json();
assert.equal(input.terminal_state, 'completed');
const eventKinds = input.events.map((event) => event.event_kind);
assert.deepEqual(eventKinds.slice(-7), [
  'provider_tool_call_requested',
  'tool_call_requested',
  'tool_result_received',
  'provider_request_recorded',
  'provider_text_delta_recorded',
  'turn_completed',
  'input_completed',
]);
const toolResult = input.events.find((event) => event.event_kind === 'tool_result_received');
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

const configuredDurableEnv = {
  AI: fakeAiBinding([
    {
      response: 'Deploy check configured Cloudflare AI response.',
      tool_calls: [{
        tool_name: 'cloudflare_carrier_runtime_metadata_read',
        arguments_summary: '{}',
        arguments_ref: null,
      }],
    },
    { response: 'Deploy check configured tool effect response.' },
  ]),
  CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1',
};
const configuredNamespace = fakeDurableObjectNamespace(configuredDurableEnv);
const configuredEnv = {
  CLOUDFLARE_CARRIER_SESSIONS: configuredNamespace,
  ADMIN_BEARER_TOKEN: 'deploy-check-admin-token',
  ...configuredDurableEnv,
};
await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_configured_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check_configured',
    agent_id: 'narada.deploy.check',
    site_id: 'site_deploy_check',
    site_root: 'cloudflare://site_deploy_check',
  },
}), configuredEnv);
const configuredStatusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check_configured',
}), configuredEnv);
const configuredStatus = await configuredStatusResponse.json();
assert.equal(configuredStatus.tool_effect_posture, 'configured');
assert.equal(configuredStatus.tool_effect_adapter_kind, 'cloudflare-tool-effect-boundary');
assert.deepEqual(configuredStatus.tool_effect_supported_tools, ['cloudflare_carrier_runtime_metadata_read']);
assert.deepEqual(configuredStatus.tool_effect_capabilities, [{
  capability_ref: 'cloudflare-carrier:capability/runtime-metadata-read:v1',
  effect_scope: 'cloudflare-carrier/runtime-metadata:read-only',
  tool_name: 'cloudflare_carrier_runtime_metadata_read',
  access: 'read_only',
  substrate: 'cloudflare-worker-runtime',
}]);
const configuredInputResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.input.deliver',
  request_id: 'deploy_check_tool_effect_configured',
  carrier_session_id: 'carrier_session_deploy_check_configured',
  params: {
    input: {
      ...manualOperatorInput,
      event_id: 'input_deploy_check_tool_effect_configured',
      content: 'Exercise the configured Cloudflare carrier tool effect boundary.',
    },
  },
}), configuredEnv);
assert.equal(configuredInputResponse.status, 200);
const configuredInput = await configuredInputResponse.json();
const configuredToolResult = configuredInput.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(configuredToolResult.payload.status, 'ok');
assert.equal(configuredToolResult.payload.admission_action, 'admit');
assert.equal(configuredToolResult.payload.admission_reason, 'read_only_tool_effect_admitted');
assert.equal(configuredToolResult.payload.capability_ref, 'cloudflare-carrier:capability/runtime-metadata-read:v1');
assert.equal(configuredToolResult.payload.effect_scope, 'cloudflare-carrier/runtime-metadata:read-only');
assert.equal(configuredToolResult.payload.authority_ref, 'principal:admin');
assert.match(configuredToolResult.payload.result_summary, /cloudflare-workers/);
assert.equal(configuredDurableEnv.AI.calls.length, 2);
assert.equal(configuredDurableEnv.AI.calls[0].request.tools[0].name, 'cloudflare_carrier_runtime_metadata_read');
assert.equal(configuredDurableEnv.AI.calls[1].request.tools, undefined);
assert.match(configuredDurableEnv.AI.calls[1].request.messages.at(-1).content, /read_only_tool_effect_admitted/);
assert.match(configuredDurableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/runtime-metadata-read:v1/);
assert.match(configuredDurableEnv.AI.calls[1].request.messages.at(-1).content, /principal:admin/);

const kvDurableEnv = {
  AI: fakeAiBinding([
    {
      response: 'Deploy check KV read response.',
      tool_calls: [{
        tool_name: 'cloudflare_carrier_kv_get',
        arguments_summary: JSON.stringify({ key: 'deploy-key' }),
        arguments_ref: null,
      }],
    },
    { response: 'Deploy check KV read follow-up response.' },
  ]),
  CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS: '1',
  CLOUDFLARE_CARRIER_KV: fakeKvBinding({ 'deploy-key': 'deploy-value' }),
};
const kvNamespace = fakeDurableObjectNamespace(kvDurableEnv);
const kvEnv = {
  CLOUDFLARE_CARRIER_SESSIONS: kvNamespace,
  ADMIN_BEARER_TOKEN: 'deploy-check-admin-token',
  ...kvDurableEnv,
};
await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_kv_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check_kv',
    agent_id: 'narada.deploy.check',
    site_id: 'site_deploy_check',
    site_root: 'cloudflare://site_deploy_check',
  },
}), kvEnv);
const kvStatusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check_kv',
}), kvEnv);
const kvStatus = await kvStatusResponse.json();
assert.deepEqual(kvStatus.tool_effect_supported_tools, ['cloudflare_carrier_kv_get']);
assert.deepEqual(kvStatus.tool_effect_capabilities, [{
  capability_ref: 'cloudflare-carrier:capability/kv-get:v1',
  effect_scope: 'cloudflare-kv:read-only:get',
  tool_name: 'cloudflare_carrier_kv_get',
  access: 'read_only',
  substrate: 'cloudflare-kv',
}]);
const kvInputResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.input.deliver',
  request_id: 'deploy_check_tool_effect_kv',
  carrier_session_id: 'carrier_session_deploy_check_kv',
  params: {
    input: {
      ...manualOperatorInput,
      event_id: 'input_deploy_check_tool_effect_kv',
      content: 'Exercise the configured Cloudflare KV tool effect boundary.',
    },
  },
}), kvEnv);
assert.equal(kvInputResponse.status, 200);
const kvInput = await kvInputResponse.json();
const kvToolResult = kvInput.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(kvToolResult.payload.status, 'ok');
assert.equal(kvToolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-get:v1');
assert.equal(kvToolResult.payload.effect_scope, 'cloudflare-kv:read-only:get');
assert.equal(kvToolResult.payload.authority_ref, 'principal:admin');
assert.match(kvToolResult.payload.result_summary, /deploy-value/);
assert.deepEqual(kvDurableEnv.AI.calls[0].request.tools.map((tool) => tool.name), ['cloudflare_carrier_kv_get']);

const kvWriteBinding = fakeKvBinding({});
const kvWriteDurableEnv = {
  AI: fakeAiBinding([
    {
      response: 'Deploy check KV write response.',
      tool_calls: [{
        tool_name: 'cloudflare_carrier_kv_put',
        arguments_summary: JSON.stringify({ key: 'deploy-write-key', value: 'deploy-write-value' }),
        arguments_ref: null,
      }],
    },
    { response: 'Deploy check KV write follow-up response.' },
  ]),
  CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES: '1',
  CLOUDFLARE_CARRIER_KV: kvWriteBinding,
};
const kvWriteNamespace = fakeDurableObjectNamespace(kvWriteDurableEnv);
const kvWriteEnv = {
  CLOUDFLARE_CARRIER_SESSIONS: kvWriteNamespace,
  ADMIN_BEARER_TOKEN: 'deploy-check-admin-token',
  ...kvWriteDurableEnv,
};
await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_kv_write_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check_kv_write',
    agent_id: 'narada.deploy.check',
    site_id: 'site_deploy_check',
    site_root: 'cloudflare://site_deploy_check',
  },
}), kvWriteEnv);
const kvWriteStatusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check_kv_write',
}), kvWriteEnv);
const kvWriteStatus = await kvWriteStatusResponse.json();
assert.deepEqual(kvWriteStatus.tool_effect_supported_tools, ['cloudflare_carrier_kv_put']);
assert.deepEqual(kvWriteStatus.tool_effect_capabilities, [{
  capability_ref: 'cloudflare-carrier:capability/kv-put:v1',
  effect_scope: 'cloudflare-kv:write:put',
  tool_name: 'cloudflare_carrier_kv_put',
  access: 'write',
  substrate: 'cloudflare-kv',
}]);
const kvWriteInputResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.input.deliver',
  request_id: 'deploy_check_tool_effect_kv_write',
  carrier_session_id: 'carrier_session_deploy_check_kv_write',
  params: {
    input: {
      ...manualOperatorInput,
      event_id: 'input_deploy_check_tool_effect_kv_write',
      content: 'Exercise the configured Cloudflare KV write tool effect boundary.',
    },
  },
}), kvWriteEnv);
assert.equal(kvWriteInputResponse.status, 200);
const kvWriteInput = await kvWriteInputResponse.json();
const kvWriteToolResult = kvWriteInput.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(kvWriteToolResult.payload.status, 'ok');
assert.equal(kvWriteToolResult.payload.admission_reason, 'write_tool_effect_admitted');
assert.equal(kvWriteToolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
assert.equal(kvWriteToolResult.payload.effect_scope, 'cloudflare-kv:write:put');
assert.equal(kvWriteToolResult.payload.authority_ref, 'principal:admin');
assert.deepEqual(kvWriteBinding.dump(), { 'deploy-write-key': 'deploy-write-value' });
assert.deepEqual(kvWriteDurableEnv.AI.calls[0].request.tools.map((tool) => tool.name), ['cloudflare_carrier_kv_put']);

const kvWriteFailedBinding = fakeKvBinding({});
const kvWriteFailedDurableEnv = {
  AI: fakeAiBinding([
    {
      response: 'Deploy check KV write failed response.',
      tool_calls: [{
        tool_name: 'cloudflare_carrier_kv_put',
        arguments_summary: JSON.stringify({ value: 'deploy-write-value-without-key' }),
        arguments_ref: null,
      }],
    },
    { response: 'Deploy check KV write failed follow-up response.' },
  ]),
  CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES: '1',
  CLOUDFLARE_CARRIER_KV: kvWriteFailedBinding,
};
const kvWriteFailedNamespace = fakeDurableObjectNamespace(kvWriteFailedDurableEnv);
const kvWriteFailedEnv = {
  CLOUDFLARE_CARRIER_SESSIONS: kvWriteFailedNamespace,
  ADMIN_BEARER_TOKEN: 'deploy-check-admin-token',
  ...kvWriteFailedDurableEnv,
};
await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_kv_write_failed_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check_kv_write_failed',
    agent_id: 'narada.deploy.check',
    site_id: 'site_deploy_check',
    site_root: 'cloudflare://site_deploy_check',
  },
}), kvWriteFailedEnv);
const kvWriteFailedInputResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.input.deliver',
  request_id: 'deploy_check_tool_effect_kv_write_failed',
  carrier_session_id: 'carrier_session_deploy_check_kv_write_failed',
  params: {
    input: {
      ...manualOperatorInput,
      event_id: 'input_deploy_check_tool_effect_kv_write_failed',
      content: 'Exercise the configured Cloudflare KV write failure boundary.',
    },
  },
}), kvWriteFailedEnv);
assert.equal(kvWriteFailedInputResponse.status, 200);
const kvWriteFailedInput = await kvWriteFailedInputResponse.json();
const kvWriteFailedToolResult = kvWriteFailedInput.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(kvWriteFailedToolResult.payload.status, 'failed');
assert.equal(kvWriteFailedToolResult.payload.admission_action, 'admit');
assert.equal(kvWriteFailedToolResult.payload.admission_reason, 'write_tool_effect_admitted');
assert.equal(kvWriteFailedToolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
assert.equal(kvWriteFailedToolResult.payload.effect_scope, 'cloudflare-kv:write:put');
assert.equal(kvWriteFailedToolResult.payload.authority_ref, 'principal:admin');
assert.equal(kvWriteFailedToolResult.payload.result_summary, 'cloudflare_kv_put_requires_key');
assert.deepEqual(kvWriteFailedBinding.dump(), {});
assert.match(kvWriteFailedDurableEnv.AI.calls[1].request.messages.at(-1).content, /\"status\":\"failed\"/);
assert.match(kvWriteFailedDurableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare_kv_put_requires_key/);

const throwingProviderAdapter = {
  posture: 'fixture',
  adapter_kind: 'fixture-provider',
  provider: 'fixture',
  model: 'fixture',
  calls: [],
  async run({ tool_results = [] }) {
    this.calls.push({ tool_results });
    if (tool_results.length > 0) return { text: 'Deploy check observed failed tool effect.' };
    return {
      text: 'Deploy check requesting throwing tool.',
      tool_calls: [{
        tool_name: 'fixture_throwing_tool',
        arguments_summary: '{}',
        arguments_ref: null,
      }],
    };
  },
};
const throwingSession = new CloudflareCarrierSession({
  carrier_session_id: 'carrier_session_deploy_check_tool_effect_throw',
  agent_id: 'narada.deploy.check',
  site_id: 'site_deploy_check',
  site_root: 'cloudflare://site_deploy_check',
  providerAdapter: throwingProviderAdapter,
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
const throwingInputResponse = await throwingSession.handle({
  operation: 'carrier.input.deliver',
  request_id: 'deploy_check_tool_effect_throw',
  principal: { principal_id: 'deploy-check-admin', controlled_actions: ['*'] },
  params: {
    input: {
      ...manualOperatorInput,
      event_id: 'input_deploy_check_tool_effect_throw',
      content: 'Exercise thrown tool effect adapter failure.',
    },
  },
});
assert.equal(throwingInputResponse.terminal_state, 'completed');
const throwingToolResult = throwingInputResponse.events.find((event) => event.event_kind === 'tool_result_received');
assert.equal(throwingToolResult.payload.status, 'failed');
assert.equal(throwingToolResult.payload.admission_action, undefined);
assert.equal(throwingToolResult.payload.admission_reason, undefined);
assert.equal(throwingToolResult.payload.result_summary, 'fixture_tool_effect_threw');
assert.equal(throwingProviderAdapter.calls.length, 2);
assert.equal(throwingProviderAdapter.calls[1].tool_results[0].status, 'failed');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.deploy_check.v1',
  status: 'ok',
  wrangler_config_checked: true,
  durable_object_binding: 'CLOUDFLARE_CARRIER_SESSIONS',
  auth_boundary_checked: true,
  principal_evidence_checked: true,
  workers_ai_binding_checked: true,
  tool_effect_boundary_checked: true,
  tool_effect_admission_classifier_checked: true,
  tool_effect_status_posture_checked: true,
  configured_tool_effect_boundary_checked: true,
  configured_kv_tool_effect_boundary_checked: true,
  configured_kv_write_tool_effect_boundary_checked: true,
  configured_kv_write_failed_tool_effect_boundary_checked: true,
  thrown_tool_effect_adapter_failure_checked: true,
  console_surface_checked: true,
  microsoft_operator_identity_surface_checked: true,
  api_client_route_checked: true,
  task_tool_effect_boundary_checked: true,
  d1_task_state_persistence_checked: true,
  worker_route_checked: true,
  durable_snapshot_reload_checked: true,
  live_deploy_performed: false,
}, null, 2)}\n`);

function jsonRequest(body, { path = '/control' } = {}) {
  return new Request(`https://carrier.deploy-check.example${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer deploy-check-admin-token',
    },
    body: JSON.stringify(body),
  });
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
            const object = new CloudflareCarrierDurableObject({ storage }, durableEnv);
            return object.fetch(request);
          },
        });
      }
      return objects.get(id);
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
    prepare(sql) {
      return fakeD1Statement(rows, sql);
    },
  };
}

function fakeD1Statement(rows, sql) {
  let bound = [];
  return {
    bind(...values) {
      bound = values;
      return this;
    },
    async run() {
      if (/^INSERT INTO narada_tasks/i.test(sql)) {
        const [siteId, taskId, taskNumber, title, description, status, source, note, createdAt, updatedAt, carrierSessionId, agentId, siteRoot] = bound;
        rows.push({
          site_id: siteId,
          task_id: taskId,
          task_number: taskNumber,
          title,
          description,
          status,
          source,
          note,
          created_at: createdAt,
          updated_at: updatedAt,
          carrier_session_id: carrierSessionId,
          agent_id: agentId,
          site_root: siteRoot,
        });
      }
      if (/^UPDATE narada_tasks SET/i.test(sql)) {
        const [status, note, updatedAt, siteId, taskId] = bound;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        if (row) Object.assign(row, { status, note, updated_at: updatedAt });
      }
      return { success: true };
    },
    async first() {
      if (/SELECT COALESCE\(MAX\(task_number\)/i.test(sql)) {
        const [siteId] = bound;
        const max = rows
          .filter((row) => row.site_id === siteId)
          .reduce((value, row) => Math.max(value, Number(row.task_number)), 0);
        return { next_task_number: max + 1 };
      }
      if (/WHERE site_id = \? AND task_id = \?/i.test(sql)) {
        const [siteId, taskId] = bound;
        return clone(rows.find((row) => row.site_id === siteId && row.task_id === taskId));
      }
      if (/WHERE site_id = \? AND task_number = \?/i.test(sql)) {
        const [siteId, taskNumber] = bound;
        return clone(rows.find((row) => row.site_id === siteId && Number(row.task_number) === Number(taskNumber)));
      }
      return null;
    },
    async all() {
      const [siteId] = bound;
      return {
        results: rows
          .filter((row) => row.site_id === siteId)
          .sort((left, right) => Number(left.task_number) - Number(right.task_number))
          .map(clone),
      };
    },
  };
}

function fakeStorage() {
  const values = new Map();
  return {
    async get(key) {
      return clone(values.get(key));
    },
    async put(key, value) {
      values.set(key, clone(value));
    },
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
