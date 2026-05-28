export type ContractStatus = 'planned' | 'refused_live_execution';

export interface ExecutionSurfaceContract {
  schema: 'narada.mcp_execution_surface_contract.v0';
  surface: 'filesystem' | 'test' | 'shell_ee';
  status: ContractStatus;
  authority_boundary: {
    canonical_owner: string;
    live_execution_ready: false;
    mcp_surface_is_authority: false;
  };
  admitted_posture: string[];
  refused_live_tools: string[];
  next_step: string;
  break_glass?: {
    exceptional: true;
    operator_authorized: true;
    scoped: true;
    time_bounded: true;
    audit_required: true;
  };
}

export const NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS: ExecutionSurfaceContract[] = [
  {
    schema: 'narada.mcp_execution_surface_contract.v0',
    surface: 'filesystem',
    status: 'refused_live_execution',
    authority_boundary: {
      canonical_owner: 'bounded_filesystem_reader_and_governed_patch_writer',
      live_execution_ready: false,
      mcp_surface_is_authority: false,
    },
    admitted_posture: [
      'root_bounded_read_glob_grep_media',
      'write_replace_requires_audit_path_policy_and_canonical_mutation_evidence',
    ],
    refused_live_tools: ['filesystem.write', 'filesystem.replace', 'filesystem.delete'],
    next_step: 'Expose read-only bounded file excerpt/glob/grep first; admit writes only through governed patch evidence.',
  },
  {
    schema: 'narada.mcp_execution_surface_contract.v0',
    surface: 'test',
    status: 'refused_live_execution',
    authority_boundary: {
      canonical_owner: 'approved_test_gateway',
      live_execution_ready: false,
      mcp_surface_is_authority: false,
    },
    admitted_posture: [
      'approved_test_registry_required',
      'identity_binding_required',
      'bounded_timeout_and_output_required',
      'source_pass_fail_history_not_imported',
    ],
    refused_live_tools: ['test.run_unregistered', 'test.import_source_history'],
    next_step: 'Bind tests to an approved registry and emit structured evidence before live MCP execution.',
  },
  {
    schema: 'narada.mcp_execution_surface_contract.v0',
    surface: 'shell_ee',
    status: 'refused_live_execution',
    authority_boundary: {
      canonical_owner: 'command_execution_intent_zone',
      live_execution_ready: false,
      mcp_surface_is_authority: false,
    },
    admitted_posture: [
      'ceiz_command_intent_first',
      'shell_mcp_policy_aware_execution_only_after_admission',
      'native_shell_break_glass_last_resort',
    ],
    refused_live_tools: ['shell.raw', 'git.raw_push', 'command.execute_without_intent'],
    next_step: 'Route through CEIZ intent/admission before shell MCP execution.',
    break_glass: {
      exceptional: true,
      operator_authorized: true,
      scoped: true,
      time_bounded: true,
      audit_required: true,
    },
  },
];

export function validateExecutionSurfaceContracts(records = NARADA_PROPER_EXECUTION_SURFACE_CONTRACTS): string[] {
  const errors: string[] = [];
  for (const record of records) {
    if (record.authority_boundary.live_execution_ready !== false) errors.push(`${record.surface}.live_execution_ready must be false until canonical owner is ready`);
    if (record.authority_boundary.mcp_surface_is_authority !== false) errors.push(`${record.surface}.mcp_surface_is_authority must be false`);
    if (record.status === 'refused_live_execution' && record.refused_live_tools.length === 0) errors.push(`${record.surface}.refused_live_tools required`);
    if (record.surface === 'shell_ee') {
      if (record.authority_boundary.canonical_owner !== 'command_execution_intent_zone') errors.push('shell_ee canonical owner must be CEIZ');
      if (!record.break_glass?.exceptional || !record.break_glass.operator_authorized || !record.break_glass.scoped || !record.break_glass.time_bounded || !record.break_glass.audit_required) {
        errors.push('shell_ee break-glass posture must be exceptional, scoped, time-bounded, audited, and operator-authorized');
      }
    }
  }
  return errors;
}
