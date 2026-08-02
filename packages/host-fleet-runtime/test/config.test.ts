import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { HOST_FLEET_RUNTIME_CONFIG_SCHEMA, validateHostFleetRuntimeConfig } from '../src/index.js';

function authorityConfig(): Record<string, unknown> {
  return {
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode: 'authority',
    fleet_id: 'home',
    host_id: 'desktop',
    authority_host_id: 'desktop',
    ingress_url: null,
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port: 61_732 },
    credentials: {
      active: { key_id: 'active', file: resolve('fleet.secret'), accept_until: null },
      previous: null,
    },
    heartbeat: { interval_ms: 15_000, stale_after_ms: 45_000, max_clock_skew_ms: 60_000, max_body_bytes: 4_096 },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [
      { host_id: 'desktop', display_name: 'Desktop', platform: 'windows', operator_console_url: null, operator_console_health_url: null },
    ],
  };
}

test('authority configuration owns the roster and remains loopback-only', () => {
  assert.equal(validateHostFleetRuntimeConfig(authorityConfig()).mode, 'authority');
  assert.equal(validateHostFleetRuntimeConfig({ ...authorityConfig(), local_health_url: 'http://[::1]:61731/health' }).local_health_url, 'http://[::1]:61731/health');
  assert.throws(
    () => validateHostFleetRuntimeConfig({ ...authorityConfig(), listener: { host: '0.0.0.0', port: 61_732 } }),
    /host_fleet_listener_not_loopback/,
  );
  assert.throws(
    () => validateHostFleetRuntimeConfig({ ...authorityConfig(), roster: [] }),
    /host_fleet_authority_config_incoherent/,
  );
});

test('publisher configuration cannot own a roster or previous credential', () => {
  const authority = authorityConfig();
  const publisher = {
    ...authority,
    mode: 'publisher',
    host_id: 'zima',
    ingress_url: 'https://fleet.example.test/console/fleet/api/observations',
    roster: [],
  };
  assert.equal(validateHostFleetRuntimeConfig(publisher).mode, 'publisher');
  assert.throws(
    () => validateHostFleetRuntimeConfig({ ...publisher, roster: authority.roster }),
    /host_fleet_publisher_config_incoherent/,
  );
  assert.throws(
    () => validateHostFleetRuntimeConfig({
      ...publisher,
      credentials: {
        active: { key_id: 'new', file: resolve('new.secret'), accept_until: null },
        previous: { key_id: 'old', file: resolve('old.secret'), accept_until: '2026-08-02T00:00:00.000Z' },
      },
    }),
    /host_fleet_publisher_previous_credential_forbidden/,
  );
});

test('cleartext remote ingress requires an explicit lab opt-in', () => {
  const publisher = {
    ...authorityConfig(),
    mode: 'publisher',
    host_id: 'zima',
    ingress_url: 'http://192.0.2.10/console/fleet/api/observations',
    roster: [],
  };
  assert.throws(() => validateHostFleetRuntimeConfig(publisher), /host_fleet_insecure_ingress_requires_opt_in/);
  assert.equal(validateHostFleetRuntimeConfig({ ...publisher, allow_insecure_ingress: true }).allow_insecure_ingress, true);
});
