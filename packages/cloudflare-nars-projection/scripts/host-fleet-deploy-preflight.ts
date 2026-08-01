import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCloudflareHostFleetRegistry, type CloudflareHostFleetRegistryValidationHost } from '../dist/cloudflare-host-fleet.js';

export const HOST_FLEET_DEPLOY_PREFLIGHT_SCHEMA = 'narada.cloudflare.host_fleet.deploy_preflight.v1' as const;

export interface HostFleetDeployPreflightResult {
  schema: typeof HOST_FLEET_DEPLOY_PREFLIGHT_SCHEMA;
  status: 'ready' | 'refused';
  preflight_ready: boolean;
  deployment_ready: false;
  registry_revision: number | null;
  host_count: number;
  active_host_count: number;
  required_service_bindings: string[];
  required_secret_bindings: string[];
  hosts: Array<Record<string, unknown>>;
  refusals: string[];
  next_steps: string[];
}

function sourceFromEnv(env: NodeJS.ProcessEnv): unknown {
  const inline = env.NARADA_HOST_FLEET_REGISTRY?.trim();
  const file = env.NARADA_HOST_FLEET_REGISTRY_FILE?.trim();
  if (inline && file) throw new Error('host_fleet_registry_source_ambiguous');
  if (inline) {
    try { return JSON.parse(inline) as unknown; } catch { throw new Error('host_fleet_registry_json_invalid'); }
  }
  return file ? { file } : null;
}

function requiredPath(host: CloudflareHostFleetRegistryValidationHost, path: string): boolean {
  return host.gateway.admitted_paths.some((candidate) => candidate.endsWith('/*')
    ? path.startsWith(candidate.slice(0, -1))
    : candidate === path);
}

function publicHost(host: CloudflareHostFleetRegistryValidationHost): Record<string, unknown> {
  return {
    host_id: host.host_id,
    host_instance_id: host.host_instance_id,
    display_name: host.display_name,
    platform: host.platform,
    lifecycle_state: host.lifecycle_state,
    admitted_sites: [...host.admitted_sites],
    capabilities: [...host.capabilities],
    gateway: {
      transport: host.gateway.transport,
      ...(host.gateway.binding ? { binding: host.gateway.binding } : {}),
      ...(host.gateway.url ? { url: host.gateway.url } : {}),
      credential_binding: host.gateway.credential_binding,
      credential_class: host.gateway.credential_class,
      admitted_path_count: host.gateway.admitted_paths.length,
    },
  };
}

export async function buildHostFleetDeployPreflight(
  env: NodeJS.ProcessEnv = process.env,
  readText: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
): Promise<HostFleetDeployPreflightResult> {
  const rawSource = sourceFromEnv(env);
  if (rawSource === null) {
    return {
      schema: HOST_FLEET_DEPLOY_PREFLIGHT_SCHEMA,
      status: 'refused',
      preflight_ready: false,
      deployment_ready: false,
      registry_revision: null,
      host_count: 0,
      active_host_count: 0,
      required_service_bindings: [],
      required_secret_bindings: [],
      hosts: [],
      refusals: ['host_fleet_registry_source_required'],
      next_steps: ['Set NARADA_HOST_FLEET_REGISTRY or NARADA_HOST_FLEET_REGISTRY_FILE.'],
    };
  }

  let raw: unknown = rawSource;
  if (typeof rawSource === 'object' && rawSource !== null && 'file' in rawSource) {
    const path = resolve(String((rawSource as { file: string }).file));
    try { raw = JSON.parse(await readText(path)) as unknown; } catch { return {
      schema: HOST_FLEET_DEPLOY_PREFLIGHT_SCHEMA,
      status: 'refused',
      preflight_ready: false,
      deployment_ready: false,
      registry_revision: null,
      host_count: 0,
      active_host_count: 0,
      required_service_bindings: [],
      required_secret_bindings: [],
      hosts: [],
      refusals: ['host_fleet_registry_file_invalid'],
      next_steps: [`Check registry file: ${path}`],
    }; }
  }

  const validation = validateCloudflareHostFleetRegistry(raw);
  const refusals = [...validation.refusals];
  const activeHosts = validation.hosts.filter((host) => host.lifecycle_state === 'active');
  const serviceBindings = new Set<string>();
  const secretBindings = new Set<string>();
  for (const host of activeHosts) {
    if (host.gateway.transport === 'service-binding' && host.gateway.binding) serviceBindings.add(host.gateway.binding);
    secretBindings.add(host.gateway.credential_binding);
    if (!requiredPath(host, '/health')) refusals.push(`${host.host_id}@${host.host_instance_id}:health_path_not_admitted`);
    if (!requiredPath(host, '/console/sessions/api/sessions')) refusals.push(`${host.host_id}@${host.host_instance_id}:sessions_path_not_admitted`);
    if (!requiredPath(host, '/sessions/probe/events')) refusals.push(`${host.host_id}@${host.host_instance_id}:events_path_not_admitted`);
    if (!host.capabilities.includes('sessions')) refusals.push(`${host.host_id}@${host.host_instance_id}:sessions_capability_missing`);
    if (!host.capabilities.includes('events')) refusals.push(`${host.host_id}@${host.host_instance_id}:events_capability_missing`);
  }

  const preflightReady = validation.status === 'success' && refusals.length === 0;
  return {
    schema: HOST_FLEET_DEPLOY_PREFLIGHT_SCHEMA,
    status: preflightReady ? 'ready' : 'refused',
    preflight_ready: preflightReady,
    deployment_ready: false,
    registry_revision: validation.revision,
    host_count: validation.hosts.length,
    active_host_count: activeHosts.length,
    required_service_bindings: [...serviceBindings].sort(),
    required_secret_bindings: [...secretBindings].sort(),
    hosts: validation.hosts.map(publicHost),
    refusals,
    next_steps: preflightReady
      ? [
        'Bind every required service binding and secret binding in Wrangler.',
        'Set NARADA_HOST_FLEET_OBSERVABILITY=log if structured relay diagnostics are desired.',
        'Deploy the Worker and run the live browser smoke test against the deployed URL.',
      ]
      : ['Correct the registry validation refusals before deployment.'],
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const result = await buildHostFleetDeployPreflight();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'refused') process.exitCode = 1;
}
