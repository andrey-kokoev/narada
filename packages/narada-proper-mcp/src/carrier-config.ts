import { NARADA_PROPER_MCP_SURFACE_REGISTRY, type NaradaProperMcpSurfaceRecord } from './surface-registry.js';

export interface CarrierMcpConfigResult {
  schema: 'narada.carrier_mcp_config.v0';
  client_shape: 'codex' | 'generic_stdio';
  config: Record<string, unknown>;
  missing_snippets: string[];
  private_client_mutation_performed: false;
  transport_wiring_only: true;
}

export const LEGACY_CLI_MCP_FACADE_POSTURE = {
  schema: 'narada.legacy_mcp_facade_posture.v0',
  path: 'packages/layers/cli/src/mcp-server.ts',
  status: 'compatibility_quarantined',
  replacement: '@narada2/narada-proper-mcp',
  migration_guidance: 'Use target-local narada-proper-mcp registry-driven stdio config for covered surfaces; keep legacy CLI MCP facade as compatibility only.',
  monolithic_cli_dist_required_for_covered_surfaces: false,
} as const;

export function generateCarrierMcpConfig(input: {
  client_shape: 'codex' | 'generic_stdio';
  site_root: string;
  site_id?: string;
  agent_id_env?: string;
  registry?: NaradaProperMcpSurfaceRecord[];
}): CarrierMcpConfigResult {
  const registry = input.registry ?? NARADA_PROPER_MCP_SURFACE_REGISTRY;
  const live = registry.find((record) => record.package_name === '@narada2/narada-proper-mcp' && record.status === 'live');
  const missingSnippets: string[] = [];
  if (!live) missingSnippets.push('narada_proper_mcp_live_surface_missing');
  if (live?.runtime_binding.generated_client_config_posture !== 'transport_wiring_only') {
    missingSnippets.push('narada_proper_mcp_transport_wiring_posture_missing');
  }
  const env = {
    NARADA_SITE_ROOT: input.site_root,
    ...(input.site_id ? { NARADA_SITE_ID: input.site_id } : {}),
    ...(input.agent_id_env ? { NARADA_AGENT_ID: input.agent_id_env } : {}),
  };
  const command = live?.runtime_binding.command_name ?? 'narada-proper-mcp';
  const args = ['--site-root', input.site_root, ...(input.site_id ? ['--site-id', input.site_id] : [])];
  return {
    schema: 'narada.carrier_mcp_config.v0',
    client_shape: input.client_shape,
    config: input.client_shape === 'codex'
      ? {
          mcpServers: {
            narada: {
              command,
              args,
              env,
            },
          },
        }
      : {
          name: 'narada',
          transport: 'stdio',
          command,
          args,
          env,
        },
    missing_snippets: missingSnippets,
    private_client_mutation_performed: false,
    transport_wiring_only: true,
  };
}
