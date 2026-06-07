#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { CloudflareCarrierDurableObject } from '../src/cloudflare-worker.mjs';

const configText = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

assert.match(configText, /^name = "narada-cloudflare-carrier"$/m);
assert.match(configText, /^main = "src\/cloudflare-worker\.mjs"$/m);
assert.match(configText, /^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
assert.match(configText, /^name = "CLOUDFLARE_CARRIER_SESSIONS"$/m);
assert.match(configText, /^class_name = "CloudflareCarrierDurableObject"$/m);
assert.match(configText, /^new_sqlite_classes = \["CloudflareCarrierDurableObject"\]$/m);
assert.equal(configText.includes('account_id'), false);

const namespace = fakeDurableObjectNamespace();
const startResponse = await worker.fetch(jsonRequest({
  operation: 'session.start',
  request_id: 'deploy_check_start',
  params: {
    carrier_session_id: 'carrier_session_deploy_check',
    agent_id: 'narada.deploy.check',
    site_id: 'site_deploy_check',
    site_root: 'cloudflare://site_deploy_check',
  },
}), { CLOUDFLARE_CARRIER_SESSIONS: namespace });
assert.equal(startResponse.status, 200);

const commandResponse = await worker.fetch(jsonRequest({
  operation: 'carrier.command.execute',
  request_id: 'deploy_check_goal',
  carrier_session_id: 'carrier_session_deploy_check',
  params: {
    command: '/goal',
    args: ['prove', 'cloudflare', 'carrier', 'boundary'],
  },
}), { CLOUDFLARE_CARRIER_SESSIONS: namespace });
assert.equal(commandResponse.status, 200);

const statusResponse = await worker.fetch(jsonRequest({
  operation: 'session.status',
  carrier_session_id: 'carrier_session_deploy_check',
}), { CLOUDFLARE_CARRIER_SESSIONS: namespace });
const status = await statusResponse.json();
assert.equal(status.goal.text, 'prove cloudflare carrier boundary');
assert.equal(status.carrier_host, 'cloudflare-durable-object');
assert.equal(status.provider_adapter_posture, 'refused');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.deploy_check.v1',
  status: 'ok',
  wrangler_config_checked: true,
  durable_object_binding: 'CLOUDFLARE_CARRIER_SESSIONS',
  worker_route_checked: true,
  durable_snapshot_reload_checked: true,
  live_deploy_performed: false,
}, null, 2)}\n`);

function jsonRequest(body) {
  return new Request('https://carrier.deploy-check.example/control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function fakeDurableObjectNamespace() {
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
            const object = new CloudflareCarrierDurableObject({ storage });
            return object.fetch(request);
          },
        });
      }
      return objects.get(id);
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
