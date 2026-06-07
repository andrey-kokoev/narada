#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const workerUrl = option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL;
if (!workerUrl) {
  throw new Error('live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
}
const bearerToken = option('--token') ?? process.env.CLOUDFLARE_CARRIER_TOKEN;
if (!bearerToken) {
  throw new Error('live_smoke_requires_--token_or_CLOUDFLARE_CARRIER_TOKEN');
}

const sessionSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const carrierSessionId = option('--session') ?? `carrier_session_live_smoke_${sessionSuffix}`;
const agentId = option('--agent') ?? 'narada.live.smoke';
const siteId = option('--site') ?? 'site_live_smoke';
const goalWords = option('--goal')?.split(/\s+/).filter(Boolean) ?? ['prove', 'live', 'cloudflare', 'carrier'];
const expectedGoal = goalWords.join(' ');
const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));
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
assert.equal(start.body.principal.email, 'admin@system');
assert.equal(start.body.event.event_kind, 'carrier_session_started');
assert.equal(start.body.event.payload.principal.email, 'admin@system');

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
assert.equal(command.body.principal.email, 'admin@system');
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
assert.equal(inputDelivery.body.principal.email, 'admin@system');
assert.equal(inputDelivery.body.input_event_id, providerRefusalInput.event_id);
assert.equal(inputDelivery.body.terminal_state, 'completed');
assert.deepEqual(inputDelivery.body.events.map((event) => event.event_kind), [
  'input_admitted_to_turn',
  'turn_started',
  'provider_request_recorded',
  'provider_text_delta_recorded',
  'turn_completed',
  'input_completed',
]);
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
assert.equal(status.body.reader_principal.email, 'admin@system');
assert.deepEqual(status.body.goal, { text: expectedGoal, state: 'active' });
assert.equal(status.body.next_event_sequence, 9);

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
assert.equal(events.body.reader_principal.email, 'admin@system');
assert.deepEqual(events.body.events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(events.body.events.map((event) => event.event_kind), [
  'carrier_session_started',
  'carrier_command_executed',
  'input_admitted_to_turn',
  'turn_started',
  'provider_request_recorded',
  'provider_text_delta_recorded',
  'turn_completed',
  'input_completed',
]);
assert.equal(events.body.next_cursor, 8);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  carrier_session_id: carrierSessionId,
  agent_id: agentId,
  carrier_host: status.body.carrier_host,
  provider_adapter_posture: status.body.provider_adapter_posture,
  principal_id: status.body.reader_principal.principal_id,
  principal_email: status.body.reader_principal.email,
  goal: status.body.goal,
  input_event_id: providerRefusalInput.event_id,
  input_terminal_state: inputDelivery.body.terminal_state,
  provider_request_status: providerRequest.payload.provider_request_status,
  provider_execution_enabled: providerRequest.payload.provider_execution_enabled,
  provider_text_preview: providerOutput.payload.text_delta.slice(0, 120),
  turn_terminal_status: turnCompleted.payload.terminal_status,
  event_kinds: events.body.events.map((event) => event.event_kind),
  sequences: events.body.events.map((event) => event.sequence),
  next_cursor: events.body.next_cursor,
}, null, 2)}\n`);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function post(body) {
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken}`,
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
