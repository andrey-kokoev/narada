import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REQUIRED_NON_GRANTS = [
  'native_shell',
  'arbitrary_shell',
  'raw_sql',
  'ad_hoc_scripts',
  'unlisted_scripts',
  'secrets_access',
  'cross_site_mutation',
  'client_file_mutation',
];

export function validateAgentExecutionPolicy(siteRoot, config = null, registry = null) {
  const root = resolve(siteRoot);
  const loadedConfig = config ?? readJson(join(root, 'config.json'));
  const loadedRegistry = registry ?? readJson(join(root, '.narada', 'capabilities', 'mcp-surfaces.json'));
  const policy = loadedConfig?.structural_config?.agent_execution_policy;
  const errors = [];
  const residuals = [];

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    errors.push('agent_execution_policy_missing: structural_config.agent_execution_policy must be object');
    return result({ root, policy, registry: loadedRegistry, errors, residuals });
  }
  if (policy.schema !== 'narada.agent_execution_policy.v0') errors.push('agent_execution_policy_schema_mismatch');
  if (policy.default_posture !== 'mcp_only') errors.push('agent_execution_policy_default_posture_must_be_mcp_only');
  if (policy.runtime_authority !== 'declared_mcp_surfaces_only') errors.push('agent_execution_policy_runtime_authority_must_be_declared_mcp_surfaces_only');
  if (policy.native_shell?.granted !== false) errors.push('agent_execution_policy_native_shell_must_be_not_granted');
  if (policy.raw_sql?.granted !== false) errors.push('agent_execution_policy_raw_sql_must_be_not_granted');
  if (policy.secrets_access?.granted !== false) errors.push('agent_execution_policy_secrets_access_must_be_not_granted');
  if (policy.cross_site_mutation?.granted !== false) errors.push('agent_execution_policy_cross_site_mutation_must_be_not_granted');

  const nonGrants = new Set(Array.isArray(policy.non_grants) ? policy.non_grants : []);
  for (const required of REQUIRED_NON_GRANTS) {
    if (!nonGrants.has(required)) errors.push(`agent_execution_policy_missing_non_grant: ${required}`);
  }

  if (policy.allowlist_source?.registry_path !== '.narada/capabilities/mcp-surfaces.json') {
    errors.push('agent_execution_policy_allowlist_source_must_reference_mcp_registry');
  }
  if (policy.allowlist_source?.derivation !== 'runtime_binding.entrypoint') {
    errors.push('agent_execution_policy_allowlist_source_must_derive_from_runtime_binding_entrypoint');
  }

  const registryEntrypoints = declaredMcpEntrypoints(loadedRegistry);
  const allowlist = Array.isArray(policy.allowed_mcp_entrypoints) ? policy.allowed_mcp_entrypoints : [];
  if (!Array.isArray(policy.allowed_mcp_entrypoints)) errors.push('agent_execution_policy_allowed_mcp_entrypoints_must_be_array');
  const allowlistPaths = new Set(allowlist.map((entry) => entry?.path).filter(Boolean));

  for (const entry of registryEntrypoints) {
    if (!allowlistPaths.has(entry.path)) {
      errors.push(`agent_execution_policy_missing_allowlist_entry: ${entry.surface_id} -> ${entry.path}`);
    }
  }
  for (const entry of allowlist) {
    if (!entry || typeof entry !== 'object') {
      errors.push('agent_execution_policy_bad_allowlist_entry: entry must be object');
      continue;
    }
    if (!entry.surface_id || typeof entry.surface_id !== 'string') errors.push('agent_execution_policy_bad_allowlist_entry: surface_id required');
    if (!entry.path || typeof entry.path !== 'string') errors.push(`agent_execution_policy_bad_allowlist_entry: ${entry.surface_id ?? '<unknown>'}.path required`);
    if (entry.command !== 'node') errors.push(`agent_execution_policy_bad_allowlist_entry: ${entry.surface_id ?? entry.path}.command must be node`);
    if (entry.kind !== 'mcp_entrypoint') errors.push(`agent_execution_policy_bad_allowlist_entry: ${entry.surface_id ?? entry.path}.kind must be mcp_entrypoint`);
    if (entry.path && !existsSync(join(root, entry.path))) errors.push(`agent_execution_policy_allowlist_path_missing: ${entry.path}`);
    if (entry.path && !registryEntrypoints.some((candidate) => candidate.path === entry.path && candidate.surface_id === entry.surface_id)) {
      residuals.push(`agent_execution_policy_allowlist_entry_not_declared_by_registry: ${entry.surface_id ?? '<unknown>'} -> ${entry.path}`);
    }
  }

  return result({ root, policy, registry: loadedRegistry, errors, residuals, registryEntrypoints });
}

export function declaredMcpEntrypoints(registry) {
  const surfaces = Array.isArray(registry?.surfaces) ? registry.surfaces : [];
  return surfaces
    .map((surface) => ({
      surface_id: surface.surface_id,
      path: surface.runtime_binding?.entrypoint,
      command: surface.runtime_binding?.transport?.command,
      runtime_kind: surface.runtime_binding?.runtime_kind,
    }))
    .filter((entry) => entry.surface_id && entry.path);
}

function result({ root, policy, registry, errors, residuals, registryEntrypoints = declaredMcpEntrypoints(registry) }) {
  return {
    schema: 'narada.agent_execution_policy.validation.v0',
    status: errors.length > 0 ? 'error' : residuals.length > 0 ? 'residuals' : 'ok',
    site_root: root,
    policy_present: Boolean(policy),
    default_posture: policy?.default_posture ?? null,
    registry_path: '.narada/capabilities/mcp-surfaces.json',
    declared_mcp_entrypoint_count: registryEntrypoints.length,
    allowlist_entry_count: Array.isArray(policy?.allowed_mcp_entrypoints) ? policy.allowed_mcp_entrypoints.length : 0,
    errors,
    residuals,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
