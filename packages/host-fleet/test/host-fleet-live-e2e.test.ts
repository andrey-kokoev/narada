import test from 'node:test';
import assert from 'node:assert/strict';

interface LiveHost {
  host_id: string;
  host_instance_id: string;
  endpoint: string;
  credential: string;
  admitted_site: string;
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
    return item as unknown as LiveHost;
  });
}

test('live host fleet health and session discovery keeps two physical hosts qualified', { skip: !process.env.NARADA_HOST_FLEET_LIVE_E2E_JSON }, async () => {
  const hosts = liveHosts()!;
  const keys = new Set(hosts.map((host) => `${host.host_id}@${host.host_instance_id}`));
  assert.equal(keys.size, hosts.length, 'physical hosts must have distinct HostKeys');
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
    return { host: `${host.host_id}@${host.host_instance_id}`, session_count: payload.sessions.length };
  }));
  assert.equal(new Set(observations.map((entry) => entry.host)).size, 2);
});
