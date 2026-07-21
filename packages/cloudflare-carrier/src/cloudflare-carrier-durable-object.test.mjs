import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudflareCarrierDurableObjectBase } from './cloudflare-carrier-durable-object.mjs';

function fakeStorage() {
  const values = new Map();
  return {
    async get(key) {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
    values,
  };
}

function startRequest() {
  return {
    operation: 'session.start',
    request_id: 'request_durable_object_boundary_start',
    principal: { principal_id: 'principal:test' },
    params: {
      carrier_session_id: 'carrier_session_boundary',
      agent_id: 'agent:test',
      site_id: 'site:test',
      site_root: 'cloudflare://site:test',
      site_ref: 'site://test',
    },
  };
}

test('Durable Object boundary owns lifecycle and snapshot recovery without Worker handlers', async () => {
  const storage = fakeStorage();
  const recorded = [];
  const dependencies = {
    recordEvidenceEvents: async (_env, _session, events) => {
      recorded.push(...events);
    },
  };
  const firstObject = new CloudflareCarrierDurableObjectBase({ storage }, {}, dependencies);
  const start = await firstObject.handle(startRequest());

  assert.equal(start.ok, true);
  assert.equal(start.event.event_kind, 'carrier_session_started');
  assert.equal(recorded.length, 1);
  assert.equal(storage.values.size, 1);

  const secondObject = new CloudflareCarrierDurableObjectBase({ storage }, {}, dependencies);
  const status = await secondObject.handle({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_boundary',
  });

  assert.equal(status.carrier_session_id, 'carrier_session_boundary');
  assert.equal(status.site_id, 'site:test');
  assert.equal(status.next_event_sequence, 2);
});
