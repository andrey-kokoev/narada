import { describe, expect, it, afterEach, vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const previousRegistryPath = process.env.NARADA_HOST_FLEET_REGISTRY_PATH;
const temporaryRoots: string[] = [];

const { fleetAuditCommand, fleetListCommand, fleetRegisterCommand } = await import('../../src/commands/fleet.js');

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
});
