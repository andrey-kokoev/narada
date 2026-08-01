import test from 'node:test';
import assert from 'node:assert/strict';

interface LiveHost {
  host_id: string;
  host_instance_id: string;
  endpoint: string;
  credential: string;
  credential_class?: 'bridge_compatibility' | 'dedicated_host_gateway';
  admitted_site: string;
  expected_session_id: string;
}

function liveHosts(): LiveHost[] | null {
  const raw = process.env.NARADA_HOST_FLEET_LIVE_E2E_JSON?.trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length < 2) throw new Error('host_fleet_live_e2e_requires_two_hosts');
  return parsed.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('host_fleet_live_e2e_host_invalid');
    const item = value as Record<string, unknown>;
    for (const key of ['host_id', 'host_instance_id', 'endpoint', 'credential', 'admitted_site']) {
      if (typeof item[key] !== 'string' || !item[key]) throw new Error(`host_fleet_live_e2e_${key}_required`);
    }
    if (item.credential_class !== undefined && item.credential_class !== 'bridge_compatibility' && item.credential_class !== 'dedicated_host_gateway') {
      throw new Error('host_fleet_live_e2e_credential_class_invalid');
    }
    if (typeof item.expected_session_id !== 'string' || !item.expected_session_id) {
      throw new Error('host_fleet_live_e2e_expected_session_id_invalid');
    }
    return item as unknown as LiveHost;
  });
}

const liveEnabled = process.env.NARADA_ENABLE_LIVE_E2E === '1';

test('live host fleet health and session discovery keeps two physical hosts qualified', { skip: !liveEnabled }, async () => {
  const hosts = liveHosts()!;
  const keys = new Set(hosts.map((host) => `${host.host_id}@${host.host_instance_id}`));
  assert.equal(keys.size, hosts.length, 'physical hosts must have distinct HostKeys');
  assert.equal(new Set(hosts.map((host) => host.host_instance_id)).size, hosts.length, 'physical hosts must have distinct instance IDs');
  const observations = await Promise.all(hosts.map(async (host) => {
    const endpoint = new URL(host.endpoint);
    const endpointPort = endpoint.port
      ? Number(endpoint.port)
      : endpoint.protocol === 'https:' ? 443 : endpoint.protocol === 'http:' ? 80 : Number.NaN;
    assert.equal(endpointPort, host.local_port, `${host.host_id} endpoint port does not match local_port`);
    const endpointBase = endpoint.toString().replace(/\/+$/, '');
    const credentialHeader = host.credential_class === 'dedicated_host_gateway'
      ? 'x-narada-host-gateway-token'
      : 'x-narada-operator-console-bridge-token';
    const headers = {
      accept: 'application/json',
      'x-narada-host-id': host.host_id,
      'x-narada-host-instance-id': host.host_instance_id,
      [credentialHeader]: host.credential,
    };
    const health = await fetch(`${endpointBase}/health`, { headers });
    assert.equal(health.ok, true, `${host.host_id} health failed with HTTP ${health.status}`);
    const sessions = await fetch(`${endpointBase}/console/sessions/api/sessions`, { headers });
    assert.equal(sessions.ok, true, `${host.host_id} session discovery failed with HTTP ${sessions.status}`);
    const payload = await sessions.json() as { sessions?: Array<Record<string, unknown>> };
    assert.ok(Array.isArray(payload.sessions));
    for (const session of payload.sessions) {
      assert.equal(session.site_id, host.admitted_site);
      assert.equal(typeof session.agent_id, 'string');
      assert.equal(typeof session.session_id, 'string');
    }
    assert.ok(payload.sessions.some((session) => session.session_id === host.expected_session_id), `${host.host_id} expected session was not discoverable`);
    const unauthorized = await fetch(`${endpointBase}/health`, {
      headers: {
        accept: 'application/json',
        'x-narada-host-id': host.host_id,
        'x-narada-host-instance-id': host.host_instance_id,
        [credentialHeader]: 'invalid-test-credential',
      },
    });
    assert.ok([401, 403].includes(unauthorized.status), `${host.host_id} rejected credential probe with HTTP ${unauthorized.status}`);
    return { host: `${host.host_id}@${host.host_instance_id}`, session_count: payload.sessions.length };
  }));
  assert.equal(new Set(observations.map((entry) => entry.host)).size, hosts.length);
});
