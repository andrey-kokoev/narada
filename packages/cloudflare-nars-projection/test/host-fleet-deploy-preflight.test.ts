import { describe, expect, it } from 'vitest';
import { buildHostFleetDeployPreflight } from '../scripts/host-fleet-deploy-preflight';

function registry(): Record<string, unknown> {
  return {
    schema: 'narada.cloudflare.host_fleet_registry.v1',
    revision: 3,
    hosts: [{
      host_id: 'zima-board-2',
      host_instance_id: 'zima-instance-2026-07',
      display_name: 'ZimaBoard 2',
      platform: 'linux',
      lifecycle_state: 'active',
      admitted_sites: ['sonar'],
      capabilities: ['sessions', 'events'],
      gateway: {
        transport: 'service-binding',
        binding: 'ZIMA_GATEWAY',
        credential_binding: 'ZIMA_TOKEN',
        admitted_paths: ['/health', '/console/sessions/api/sessions', '/sessions/*'],
      },
    }],
  };
}

describe('host fleet deployment preflight', () => {
  it('separates static preflight readiness from live deployment readiness', async () => {
    const result = await buildHostFleetDeployPreflight({
      NARADA_HOST_FLEET_REGISTRY: JSON.stringify(registry()),
    });

    expect(result).toMatchObject({
      status: 'ready',
      preflight_ready: true,
      deployment_ready: false,
      registry_revision: 3,
      required_service_bindings: ['ZIMA_GATEWAY'],
      required_secret_bindings: ['ZIMA_TOKEN'],
    });
  });

  it('refuses to claim preflight readiness without a registry source', async () => {
    const result = await buildHostFleetDeployPreflight({});
    expect(result).toMatchObject({
      status: 'refused',
      preflight_ready: false,
      deployment_ready: false,
      refusals: ['host_fleet_registry_source_required'],
    });
  });

  it('surfaces the optional authority bridge as a required secret binding without reading the secret', async () => {
    const result = await buildHostFleetDeployPreflight({
      NARADA_HOST_FLEET_REGISTRY: JSON.stringify(registry()),
      NARADA_HOST_FLEET_AUTHORITY_URL: 'https://user-site.example',
      NARADA_HOST_FLEET_AUTHORITY_TOKEN: 'test-secret-must-not-be-returned',
    });

    expect(result).toMatchObject({
      status: 'ready',
      authority_forwarding: {
        mode: 'configured',
        authority_url_configured: true,
        required_token_binding: 'NARADA_HOST_FLEET_AUTHORITY_TOKEN',
      },
      required_secret_bindings: ['NARADA_HOST_FLEET_AUTHORITY_TOKEN', 'ZIMA_TOKEN'],
    });
    expect(JSON.stringify(result)).not.toContain('test-secret-must-not-be-returned');
  });

  it('refuses an authority bridge URL that cannot be used as an HTTPS origin', async () => {
    const result = await buildHostFleetDeployPreflight({
      NARADA_HOST_FLEET_REGISTRY: JSON.stringify(registry()),
      NARADA_HOST_FLEET_AUTHORITY_URL: 'http://user-site.example',
    });
    expect(result.status).toBe('refused');
    expect(result.refusals).toContain('host_fleet_authority_url_invalid');
  });
});
