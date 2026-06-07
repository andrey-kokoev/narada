#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const workerUrl = option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL;
if (!workerUrl) {
  throw new Error('live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
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
assert.equal(start.body.event.event_kind, 'carrier_session_started');

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
assert.equal(inputDelivery.body.input_event_id, providerRefusalInput.event_id);
assert.equal(inputDelivery.body.terminal_state, 'failed');
assert.deepEqual(inputDelivery.body.events.map((event) => event.event_kind), [
  'input_admitted_to_turn',
  'turn_started',
  'provider_request_recorded',
  'turn_failed',
  'input_completed',
]);
const providerRequest = inputDelivery.body.events.find((event) => event.event_kind === 'provider_request_recorded');
assert.equal(providerRequest.payload.provider_request_status, 'refused');
assert.equal(providerRequest.payload.provider_execution_enabled, false);
assert.equal(providerRequest.payload.provider_runtime_status, 'unavailable');
assert.equal(providerRequest.payload.provider_adapter_admission_status, 'rejected');
const turnFailed = inputDelivery.body.events.find((event) => event.event_kind === 'turn_failed');
assert.equal(turnFailed.payload.provider_request_status, 'refused');
assert.equal(turnFailed.payload.terminal_status, 'failed');
const inputCompleted = inputDelivery.body.events.find((event) => event.event_kind === 'input_completed');
assert.equal(inputCompleted.payload.input_event_id, providerRefusalInput.event_id);
assert.equal(inputCompleted.payload.terminal_state, 'failed');

const status = await post({
  operation: 'session.status',
  carrier_session_id: carrierSessionId,
});
assert.equal(status.http_status, 200);
assert.equal(status.body.ok, true);
assert.equal(status.body.carrier_session_id, carrierSessionId);
assert.equal(status.body.agent_id, agentId);
assert.equal(status.body.carrier_host, 'cloudflare-durable-object');
assert.equal(status.body.provider_adapter_posture, 'refused');
assert.deepEqual(status.body.goal, { text: expectedGoal, state: 'active' });
assert.equal(status.body.next_event_sequence, 8);

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
assert.deepEqual(events.body.events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(events.body.events.map((event) => event.event_kind), [
  'carrier_session_started',
  'carrier_command_executed',
  'input_admitted_to_turn',
  'turn_started',
  'provider_request_recorded',
  'turn_failed',
  'input_completed',
]);
assert.equal(events.body.next_cursor, 7);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  carrier_session_id: carrierSessionId,
  agent_id: agentId,
  carrier_host: status.body.carrier_host,
  provider_adapter_posture: status.body.provider_adapter_posture,
  goal: status.body.goal,
  input_event_id: providerRefusalInput.event_id,
  input_terminal_state: inputDelivery.body.terminal_state,
  provider_request_status: providerRequest.payload.provider_request_status,
  provider_execution_enabled: providerRequest.payload.provider_execution_enabled,
  turn_terminal_status: turnFailed.payload.terminal_status,
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
    headers: { 'content-type': 'application/json' },
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
