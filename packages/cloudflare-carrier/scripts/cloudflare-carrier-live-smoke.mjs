#!/usr/bin/env node
import assert from 'node:assert/strict';

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
assert.deepEqual(events.body.events.map((event) => event.sequence), [1, 2]);
assert.deepEqual(events.body.events.map((event) => event.event_kind), [
  'carrier_session_started',
  'carrier_command_executed',
]);
assert.equal(events.body.next_cursor, 2);

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  carrier_session_id: carrierSessionId,
  agent_id: agentId,
  carrier_host: status.body.carrier_host,
  provider_adapter_posture: status.body.provider_adapter_posture,
  goal: status.body.goal,
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
