import { join } from 'node:path';

export function mcpFabricRepairPlan(code, details = {}) {
  if (code === 'mcp_fabric_duplicate_server_conflict') {
    return {
      schema: 'narada.mcp.fabric.repair_plan.v1',
      kind: 'duplicate_server_conflict',
      status: 'manual_review_required',
      server_name: details.serverName ?? null,
      conflicting_files: [details.firstFile, details.secondFile].filter(Boolean).map((file) => ({
        file,
        path: details.mcpDir ? join(details.mcpDir, file) : file,
      })),
      recommended_actions: [
        'Keep exactly one canonical MCP server definition for this server name.',
        'Regenerate Site MCP client configs from the Site surface registry if either file is generated.',
        'Remove or rename the stale duplicate file only after confirming it is not the registered surface owner.',
      ],
      verification: [
        'Run MCP fabric doctor after the duplicate is removed or regenerated.',
        'Confirm the server name appears once and initializes from the intended generated file.',
      ],
    };
  }
  if (code === 'mcp_fabric_registry_mismatch') {
    return {
      schema: 'narada.mcp.fabric.repair_plan.v1',
      kind: 'registry_generated_file_mismatch',
      status: 'regenerate_or_remove_stale_registry_entry',
      registry_path: details.registryPath ?? null,
      missing: (details.missing ?? []).map((item) => ({
        surface_id: item.surface_id,
        generated_file: item.generated_file,
        expected_path: details.mcpDir && item.generated_file ? join(details.mcpDir, item.generated_file) : item.generated_file,
      })),
      server_name_mismatches: (details.serverNameMismatches ?? details.server_name_mismatches ?? []).map((item) => ({
        generated_file: item.generated_file,
        surface_id: item.surface_id ?? null,
        actual_server_name: item.actual_server_name,
        expected_server_name: item.expected_server_name ?? null,
        expected_server_names: item.expected_server_names ?? [],
      })),
      recommended_actions: [
        'Regenerate missing MCP client config files from the authoritative Site surface registry.',
        'If a registry surface is obsolete, remove or retire that registry entry instead of leaving a missing generated file.',
        'Regenerate stale server names from the authoritative Site surface registry; do not hand-edit generated MCP client or carrier files.',
      ],
      verification: [
        'Run MCP fabric doctor with registry validation enabled.',
        'Confirm registry_validation.status is ok and server_name_mismatches is empty.',
      ],
    };
  }
  return null;
}
