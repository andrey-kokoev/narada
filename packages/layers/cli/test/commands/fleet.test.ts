import { describe, expect, it, afterEach, vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const previousRegistryPath = process.env.NARADA_HOST_FLEET_REGISTRY_PATH;
const temporaryRoots: string[] = [];

const { fleetAuditCommand, fleetListCommand, fleetObservationsCommand, fleetRegisterCommand } = await import('../../src/commands/fleet.js');
const { openHostFleetRegistry } = await import('@narada-core/host-fleet');

function useTemporaryRegistry(): string {
  const root = mkdtempSync(join(tmpdir(), 'narada-host-fleet-cli-'));
  temporaryRoots.push(root);
  const path = join(root, 'registry.db');
  process.env.NARADA_HOST_FLEET_REGISTRY_PATH = path;
  return path;
}

afterEach(() => {
  if (previousRegistryPath === undefined) delete process.env.NARADA_HOST_FLEET_REGISTRY_PATH;
  else process.env.NARADA_HOST_FLEET_REGISTRY_PATH = previousRegistryPath;
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('fleet commands', () => {
  it('registers and lists two same-site hosts without collapsing their HostKeys', async () => {
    useTemporaryRegistry();
    const common = {
      displayName: 'Narada host',
      platform: 'linux' as const,
      endpoint: 'http://127.0.0.1:61730',
      transport: 'ssh-tunnel' as const,
      credentialRef: 'env://NARADA_TEST_GATEWAY_TOKEN',
      admittedPath: ['/health', '/console/routes'],
      site: ['sonar'],
      format: 'json' as const,
    };

    expect((await fleetRegisterCommand({
      ...common,
      hostId: 'desktop-sunroom-2',
      hostInstanceId: 'desktop-instance',
    })).exitCode).toBe(0);
    expect((await fleetRegisterCommand({
      ...common,
      hostId: 'zima-board-2',
      hostInstanceId: 'zima-instance',
    })).exitCode).toBe(0);

    const result = await fleetListCommand({ format: 'json' });
    expect(result.exitCode).toBe(0);
    const data = result.result as { count: number; hosts: Array<{ host_id: string; host_instance_id: string }> };
    expect(data.count).toBe(2);
    expect(data.hosts.map((host) => `${host.host_id}@${host.host_instance_id}`)).toEqual([
      'desktop-sunroom-2@desktop-instance',
      'zima-board-2@zima-instance',
    ]);
  });

  it('refuses a half-specified audit filter instead of widening its scope', async () => {
    useTemporaryRegistry();
    const result = await fleetAuditCommand({ hostId: 'zima-board-2', format: 'json' });
    expect(result.exitCode).toBe(1);
    const data = result.result as { status: string; reason: string };
    expect(data.status).toBe('refused');
    expect(data.reason).toBe('host_audit_filter_requires_host_id_and_instance');
  });

  it('supports a non-mutating registration preflight', async () => {
    const path = useTemporaryRegistry();
    const result = await fleetRegisterCommand({
      hostId: 'zima-board-2',
      hostInstanceId: 'zima-instance',
      displayName: 'ZimaBoard 2',
      platform: 'linux',
      endpoint: 'http://127.0.0.1:61730',
      transport: 'ssh-tunnel',
      credentialRef: 'env://NARADA_TEST_GATEWAY_TOKEN',
      admittedPath: ['/health', '/console/routes'],
      site: ['sonar'],
      dryRun: true,
      credentialClass: 'dedicated_host_gateway',
      format: 'json',
    });
    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      schema: 'narada.host_fleet.register_preflight.v1',
      status: 'ready',
      mutation_performed: false,
      host: { host_id: 'zima-board-2', host_instance_id: 'zima-instance' },
    });
    expect((result.result as { host: { gateway: { credential: { class: string } } } }).host.gateway.credential.class)
      .toBe('dedicated_host_gateway');
    expect(existsSync(path)).toBe(false);
  });

  it('exports redacted gateway observations with an exact host filter', async () => {
    const path = useTemporaryRegistry();
    const registry = openHostFleetRegistry(path);
    registry.registerHost({
      host_id: 'zima-board-2',
      host_instance_id: 'zima-instance',
      display_name: 'ZimaBoard 2',
      platform: 'linux',
      gateway: { endpoint: 'http://127.0.0.1:61730', transport: 'ssh-tunnel', admitted_paths: ['/health'] },
      credential_ref: 'env://NARADA_TEST_GATEWAY_TOKEN',
      admitted_sites: ['sonar'],
    });
    registry.recordGatewayObservation({
      schema: 'narada.host_fleet.gateway_request_observation.v1',
      request_id: 'request-1',
      host: { host_id: 'zima-board-2', host_instance_id: 'zima-instance' },
      method: 'GET',
      path: '/health',
      status: 200,
      outcome: 'success',
      duration_ms: 7,
      reason: null,
      observed_at: '2026-07-31T12:00:00.000Z',
    });
    registry.close();

    const result = await fleetObservationsCommand({ hostId: 'zima-board-2', hostInstanceId: 'zima-instance', format: 'json' });
    expect(result.exitCode).toBe(0);
    const data = result.result as { count: number; observations: Array<Record<string, unknown>> };
    expect(data.count).toBe(1);
    expect(data.observations[0]).toMatchObject({ request_id: 'request-1', path: '/health', status: 200 });
    expect(JSON.stringify(data)).not.toContain('NARADA_TEST_GATEWAY_TOKEN');
  });
});
