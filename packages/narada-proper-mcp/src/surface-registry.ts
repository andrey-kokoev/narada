export type SurfaceStatus = 'live' | 'planned' | 'refused' | 'compatibility';

export interface NaradaProperMcpSurfaceRecord {
  schema: 'narada.mcp_surface_registry.record.v0';
  surface_id: string;
  package_name: string;
  surface_type: string;
  status: SurfaceStatus;
  semantic_purpose: string;
  runtime_binding: {
    command_name?: string;
    transport: 'stdio' | 'descriptor_only' | 'none';
    generated_client_config_posture: 'transport_wiring_only' | 'not_generated';
  };
  authority_boundary: {
    target_site_authority: 'target_local';
    mutating_tools_require_canonical_owner: boolean;
    imports_source_runtime_authority: false;
  };
  tool_contract: {
    exposed_tools: string[];
    read_only_tools: string[];
    mutating_tools: string[];
    planned_tools: string[];
    refused_tools: string[];
  };
  evidence_refs: string[];
  failure_modes: string[];
  provenance: {
    source_refs: string[];
    source_refs_are_authority: false;
  };
}

export type NaradaProperMcpRolePolicyRole = 'architect';
export type NaradaProperMcpRolePolicyServer = 'narada-proper';

export interface NaradaProperMcpRolePolicyProjection {
  schema: 'narada.mcp_role_policy_projection.v0';
  role: NaradaProperMcpRolePolicyRole;
  server: NaradaProperMcpRolePolicyServer;
  policy_source: {
    kind: 'mcp_surface_registry';
    package_name: '@narada2/narada-proper-mcp';
    surface_id: string;
  };
  reconciled_runtime_posture: {
    config_path: 'config.json';
    config_json_is_authority: false;
    config_json_role: 'site_local_runtime_posture';
    reconciliation_required_for_runtime: true;
  };
  tool_policy: {
    canonical_allowed_tools: string[];
    optional_alias_tools: string[];
    refused_tools: string[];
    role_eligible_tools: string[];
  };
}

export interface RolePolicyValidationResult {
  schema: 'narada.mcp_role_policy_validation.v0';
  status: 'valid' | 'invalid';
  errors: string[];
  missing_tools: string[];
  stale_tools: string[];
  alias_tools: string[];
  refused_tools: string[];
}

const EXPOSED_TOOL_NAMES = [
  'agent_context_doctrinal_grounding',
  'agent_context_hydrate_current',
  'agent_context_memory.plan_hydration',
  'agent_context_memory.read_checkpoint_summary',
  'agent_context_memory.record_checkpoint',
  'agent_context_startup_sequence',
  'inbox_stage_submission_workflow',
  'inbox_submit_observation',
  'inbox_submit_typed_envelope',
  'narada_ee_mcp_doctor',
  'narada_inbox_doctor',
  'narada_inbox_list',
  'narada_inbox_show',
  'narada_inbox_stage_submission_workflow',
  'narada_inbox_submit_observation',
  'narada_inbox_submit_typed_envelope',
  'narada_inbox_work_next',
  'narada_directive_create',
  'narada_directive_list',
  'narada_directive_record_operator_authorized_system_emission',
  'narada_directive_render_context',
  'narada_mcp_fabric_context',
  'narada_site_context',
  'narada_task_read',
  'narada_task_work_next',
  'site_registry_relation_plan_transition',
  'site_task_lifecycle.admit_task',
  'site_task_lifecycle.materialize_task',
  'site_task_lifecycle.plan_init',
  'site_task_lifecycle.read_task',
].sort();

export const NARADA_PROPER_MCP_SURFACE_REGISTRY: NaradaProperMcpSurfaceRecord[] = [
  {
    schema: 'narada.mcp_surface_registry.record.v0',
    surface_id: 'narada-proper.surface.agent-facing-mcp.v1',
    package_name: '@narada2/narada-proper-mcp',
    surface_type: 'target_local_agent_facing_mcp',
    status: 'live',
    semantic_purpose: 'Target-local agent-facing Narada proper MCP facade over bounded Site, inbox, task, work-next, and agent-context surfaces.',
    runtime_binding: {
      command_name: 'narada-proper-mcp',
      transport: 'stdio',
      generated_client_config_posture: 'transport_wiring_only',
    },
    authority_boundary: {
      target_site_authority: 'target_local',
      mutating_tools_require_canonical_owner: true,
      imports_source_runtime_authority: false,
    },
    tool_contract: {
      exposed_tools: EXPOSED_TOOL_NAMES,
      read_only_tools: [
        'agent_context_doctrinal_grounding',
        'agent_context_hydrate_current',
        'agent_context_startup_sequence',
        'agent_context_memory.plan_hydration',
        'agent_context_memory.read_checkpoint_summary',
        'narada_ee_mcp_doctor',
        'narada_inbox_doctor',
        'narada_inbox_list',
        'narada_inbox_show',
        'narada_directive_list',
        'narada_directive_render_context',
        'narada_mcp_fabric_context',
        'narada_site_context',
        'narada_task_read',
        'site_task_lifecycle.plan_init',
        'site_task_lifecycle.read_task',
      ],
      mutating_tools: [
        'agent_context_memory.record_checkpoint',
        'inbox_stage_submission_workflow',
        'inbox_submit_observation',
        'inbox_submit_typed_envelope',
        'narada_inbox_submit_observation',
        'narada_inbox_stage_submission_workflow',
        'narada_inbox_submit_typed_envelope',
        'narada_inbox_work_next',
        'narada_directive_create',
        'narada_directive_record_operator_authorized_system_emission',
        'narada_task_work_next',
        'site_task_lifecycle.admit_task',
        'site_task_lifecycle.materialize_task',
      ],
      planned_tools: [],
      refused_tools: ['narada_ee_run'],
    },
    evidence_refs: [
      'packages/narada-proper-mcp/src/server.ts',
      'docs/product/site-telemetry-publication-outcome-shapes.md',
      'kb/operations/narada-proper-mcp-coverage-matrix-20260516.md',
    ],
    failure_modes: [
      'target_site_resolution_failed',
      'canonical_owner_missing_for_mutation',
      'capability_grant_missing',
      'source_runtime_authority_import_refused',
    ],
    provenance: {
      source_refs: ['C:/Users/Andrey/Narada'],
      source_refs_are_authority: false,
    },
  },
  {
    schema: 'narada.mcp_surface_registry.record.v0',
    surface_id: 'narada-proper.surface.windows-shell-mcp.policy.v1',
    package_name: '@narada2/mcp-shell-windows',
    surface_type: 'execution_policy_descriptor',
    status: 'planned',
    semantic_purpose: 'Policy descriptors for audited Windows shell-like MCP execution; not Narada proper authority.',
    runtime_binding: {
      command_name: 'narada-shell-mcp',
      transport: 'descriptor_only',
      generated_client_config_posture: 'not_generated',
    },
    authority_boundary: {
      target_site_authority: 'target_local',
      mutating_tools_require_canonical_owner: true,
      imports_source_runtime_authority: false,
    },
    tool_contract: {
      exposed_tools: [],
      read_only_tools: [],
      mutating_tools: [],
      planned_tools: ['execute_command', 'git_task_closeout_commit_and_push'],
      refused_tools: ['raw_shell', 'raw_git_push_without_publication_intent'],
    },
    evidence_refs: ['packages/mcp-shell-windows/package.json'],
    failure_modes: ['command_intent_missing', 'publication_intent_missing'],
    provenance: {
      source_refs: ['C:/Users/Andrey/Narada'],
      source_refs_are_authority: false,
    },
  },
  {
    schema: 'narada.mcp_surface_registry.record.v0',
    surface_id: 'narada-proper.surface.windows-test-mcp.policy.v1',
    package_name: '@narada2/mcp-test-windows',
    surface_type: 'test_gateway_descriptor',
    status: 'planned',
    semantic_purpose: 'Descriptor contracts for approved Windows test gateway MCP surfaces.',
    runtime_binding: {
      transport: 'descriptor_only',
      generated_client_config_posture: 'not_generated',
    },
    authority_boundary: {
      target_site_authority: 'target_local',
      mutating_tools_require_canonical_owner: true,
      imports_source_runtime_authority: false,
    },
    tool_contract: {
      exposed_tools: [],
      read_only_tools: [],
      mutating_tools: [],
      planned_tools: ['run_test'],
      refused_tools: ['unapproved_test_path'],
    },
    evidence_refs: ['packages/mcp-test-windows/package.json'],
    failure_modes: ['test_path_not_approved'],
    provenance: {
      source_refs: ['C:/Users/Andrey/Narada'],
      source_refs_are_authority: false,
    },
  },
  {
    schema: 'narada.mcp_surface_registry.record.v0',
    surface_id: 'narada-proper.surface.carrier-supervisor-mcp.policy.v1',
    package_name: '@narada2/mcp-surface-carrier-supervisor',
    surface_type: 'carrier_supervisor_descriptor',
    status: 'planned',
    semantic_purpose: 'Read-only descriptor contracts for MCP surface carrier supervisor lifecycle.',
    runtime_binding: {
      transport: 'descriptor_only',
      generated_client_config_posture: 'not_generated',
    },
    authority_boundary: {
      target_site_authority: 'target_local',
      mutating_tools_require_canonical_owner: true,
      imports_source_runtime_authority: false,
    },
    tool_contract: {
      exposed_tools: [],
      read_only_tools: [],
      mutating_tools: [],
      planned_tools: ['surface_carrier_supervisor.inspect'],
      refused_tools: ['surface_carrier_supervisor.mutate_authority'],
    },
    evidence_refs: ['packages/mcp-surface-carrier-supervisor/package.json'],
    failure_modes: ['runtime_binding_missing'],
    provenance: {
      source_refs: ['C:/Users/Andrey/Narada'],
      source_refs_are_authority: false,
    },
  },
];

export function validateNaradaProperMcpSurfaceRegistry(
  registry = NARADA_PROPER_MCP_SURFACE_REGISTRY,
  exposedTools = EXPOSED_TOOL_NAMES,
): string[] {
  const errors: string[] = [];
  const exposed = new Set(exposedTools);
  for (const record of registry) {
    for (const field of ['surface_id', 'package_name', 'surface_type', 'semantic_purpose'] as const) {
      if (!record[field]) errors.push(`${record.surface_id || '<missing>'}.${field} is required`);
    }
    for (const tool of [...record.tool_contract.read_only_tools, ...record.tool_contract.mutating_tools]) {
      if (!exposed.has(tool)) errors.push(`${record.surface_id}.${tool} is not exposed`);
    }
    for (const snippetPosture of [record.runtime_binding.generated_client_config_posture]) {
      if (snippetPosture !== 'transport_wiring_only' && snippetPosture !== 'not_generated') {
        errors.push(`${record.surface_id}.generated_client_config_posture is invalid`);
      }
    }
    if (record.authority_boundary.imports_source_runtime_authority !== false) {
      errors.push(`${record.surface_id} imports source runtime authority`);
    }
    if (record.provenance.source_refs_are_authority !== false) {
      errors.push(`${record.surface_id} treats provenance as authority`);
    }
  }
  return errors;
}

export function buildNaradaProperArchitectRolePolicyProjection(input: {
  registry?: NaradaProperMcpSurfaceRecord[];
  include_alias_tools?: boolean;
} = {}): NaradaProperMcpRolePolicyProjection {
  const registry = input.registry ?? NARADA_PROPER_MCP_SURFACE_REGISTRY;
  const surface = registry.find((record) => record.package_name === '@narada2/narada-proper-mcp' && record.status === 'live');
  if (!surface) throw new Error('narada_proper_mcp_live_surface_missing');

  const exposed = new Set(surface.tool_contract.exposed_tools);
  const roleEligible = [...surface.tool_contract.read_only_tools, ...surface.tool_contract.mutating_tools]
    .filter((tool) => exposed.has(tool))
    .sort();
  const optionalAliases = roleEligible.filter((tool) => isOptionalInboxAlias(tool));
  const canonical = roleEligible
    .filter((tool) => input.include_alias_tools === true || !optionalAliases.includes(tool))
    .sort();

  return {
    schema: 'narada.mcp_role_policy_projection.v0',
    role: 'architect',
    server: 'narada-proper',
    policy_source: {
      kind: 'mcp_surface_registry',
      package_name: '@narada2/narada-proper-mcp',
      surface_id: surface.surface_id,
    },
    reconciled_runtime_posture: {
      config_path: 'config.json',
      config_json_is_authority: false,
      config_json_role: 'site_local_runtime_posture',
      reconciliation_required_for_runtime: true,
    },
    tool_policy: {
      canonical_allowed_tools: canonical,
      optional_alias_tools: optionalAliases,
      refused_tools: [...surface.tool_contract.refused_tools].sort(),
      role_eligible_tools: roleEligible,
    },
  };
}

export function validateNaradaProperArchitectAllowedTools(
  allowedTools: string[],
  projection = buildNaradaProperArchitectRolePolicyProjection(),
): RolePolicyValidationResult {
  const configured = new Set(allowedTools);
  const canonical = new Set(projection.tool_policy.canonical_allowed_tools);
  const optionalAliases = new Set(projection.tool_policy.optional_alias_tools);
  const refused = new Set(projection.tool_policy.refused_tools);
  const admitted = new Set([
    ...projection.tool_policy.canonical_allowed_tools,
    ...projection.tool_policy.optional_alias_tools,
  ]);
  const missingTools = projection.tool_policy.canonical_allowed_tools.filter((tool) => !configured.has(tool));
  const staleTools = allowedTools.filter((tool) => !admitted.has(tool) && !refused.has(tool)).sort();
  const aliasTools = allowedTools.filter((tool) => optionalAliases.has(tool) && !canonical.has(tool)).sort();
  const refusedTools = allowedTools.filter((tool) => refused.has(tool)).sort();
  const errors = [
    ...missingTools.map((tool) => `missing_canonical_tool:${tool}`),
    ...staleTools.map((tool) => `stale_or_unknown_tool:${tool}`),
    ...aliasTools.map((tool) => `alias_tool_requires_explicit_admission:${tool}`),
    ...refusedTools.map((tool) => `refused_tool_configured:${tool}`),
  ];

  return {
    schema: 'narada.mcp_role_policy_validation.v0',
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
    missing_tools: missingTools,
    stale_tools: staleTools,
    alias_tools: aliasTools,
    refused_tools: refusedTools,
  };
}

function isOptionalInboxAlias(tool: string): boolean {
  return tool.startsWith('inbox_');
}
