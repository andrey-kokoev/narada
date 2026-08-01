import test from 'node:test';
import assert from 'node:assert/strict';

interface LiveHost {
  host_id: string;
  host_instance_id: string;
  endpoint: string;
  credential: string;
  admitted_site: string;
  local_port?: number;
  expected_session_id?: string;
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
    if (item.local_port !== undefined && (!Number.isInteger(item.local_port) || Number(item.local_port) < 1 || Number(item.local_port) > 65535)) {
      throw new Error('host_fleet_live_e2e_local_port_invalid');
    }
    if (item.expected_session_id !== undefined && (typeof item.expected_session_id !== 'string' || !item.expected_session_id)) {
      throw new Error('host_fleet_live_e2e_expected_session_id_invalid');
    }
    return item as unknown as LiveHost;
  });
}

test('live host fleet health and session discovery keeps two physical hosts qualified', { skip: !process.env.NARADA_HOST_FLEET_LIVE_E2E_JSON }, async () => {
  const hosts = liveHosts()!;
  const keys = new Set(hosts.map((host) => `${host.host_id}@${host.host_instance_id}`));
  assert.equal(keys.size, hosts.length, 'physical hosts must have distinct HostKeys');
  const localPorts = hosts.map((host) => host.local_port).filter((port): port is number => port !== undefined);
  assert.ok(localPorts.length === 0 || localPorts.length === hosts.length, 'provide local_port for every host or none');
  if (localPorts.length > 0) assert.equal(new Set(localPorts).size, 1, 'physical hosts must prove the same local port is valid on each machine');
  const observations = await Promise.all(hosts.map(async (host) => {
    const headers = {
      accept: 'application/json',
      'x-narada-host-id': host.host_id,
      'x-narada-host-instance-id': host.host_instance_id,
      'x-narada-operator-console-bridge-token': host.credential,
    };
    const health = await fetch(`${host.endpoint.replace(/\/+$/, '')}/health`, { headers });
    assert.equal(health.ok, true, `${host.host_id} health failed with HTTP ${health.status}`);
    const sessions = await fetch(`${host.endpoint.replace(/\/+$/, '')}/console/sessions/api/sessions`, { headers });
    assert.equal(sessions.ok, true, `${host.host_id} session discovery failed with HTTP ${sessions.status}`);
    const payload = await sessions.json() as { sessions?: Array<Record<string, unknown>> };
    assert.ok(Array.isArray(payload.sessions));
    for (const session of payload.sessions) {
      assert.equal(session.site_id, host.admitted_site);
      assert.equal(typeof session.agent_id, 'string');
      assert.equal(typeof session.session_id, 'string');
    }
    if (host.expected_session_id) {
      assert.ok(payload.sessions.some((session) => session.session_id === host.expected_session_id), `${host.host_id} expected session was not discoverable`);
    }
    return { host: `${host.host_id}@${host.host_instance_id}`, session_count: payload.sessions.length };
  }));
  assert.equal(new Set(observations.map((entry) => entry.host)).size, hosts.length);
});
