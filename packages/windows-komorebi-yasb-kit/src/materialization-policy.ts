export type KomorebiYasbMaterializationSurface =
  | 'operator_surface_mcp'
  | 'pc_site_local_fallback'
  | 'live_runtime_directory';

export interface KomorebiYasbMaterializationRequest {
  schema: 'narada.windows_komorebi_yasb.materialization_request.v0';
  template_id: string;
  surface: KomorebiYasbMaterializationSurface;
  live_runtime_import_requested?: boolean;
  monitor_state_import_requested?: boolean;
  user_preference_authority_requested?: boolean;
  credentials_requested?: boolean;
}

export interface KomorebiYasbMaterializationDecision {
  schema: 'narada.windows_komorebi_yasb.materialization_decision.v0';
  status: 'planned_descriptor' | 'refused';
  required_admissions: string[];
  warnings: string[];
  refusals: string[];
  descriptor_only: true;
  live_mutation_performed: false;
}

export function buildKomorebiYasbMaterializationRequest(
  input: Omit<KomorebiYasbMaterializationRequest, 'schema'>,
): KomorebiYasbMaterializationRequest {
  return {
    schema: 'narada.windows_komorebi_yasb.materialization_request.v0',
    ...input,
  };
}

export function decideKomorebiYasbMaterialization(
  request: KomorebiYasbMaterializationRequest,
): KomorebiYasbMaterializationDecision {
  const refusals: string[] = [];
  const warnings: string[] = [];
  const required = new Set<string>(['pc_locus_authority']);

  if (request.surface === 'operator_surface_mcp') required.add('operator_surface_materialization_authority');
  if (request.surface === 'pc_site_local_fallback') {
    required.add('pc_site_local_fallback_authority');
    warnings.push('local_fallback_requires_reason_and_evidence');
  }
  if (request.surface === 'live_runtime_directory') {
    refusals.push('live_runtime_directory_is_projection_not_authority');
  }
  if (request.live_runtime_import_requested) refusals.push('live_yasb_runtime_import_refused');
  if (request.monitor_state_import_requested) refusals.push('live_monitor_state_import_refused');
  if (request.user_preference_authority_requested) refusals.push('user_preference_authority_import_refused');
  if (request.credentials_requested) refusals.push('credential_import_refused');

  return {
    schema: 'narada.windows_komorebi_yasb.materialization_decision.v0',
    status: refusals.length > 0 ? 'refused' : 'planned_descriptor',
    required_admissions: [...required],
    warnings,
    refusals,
    descriptor_only: true,
    live_mutation_performed: false,
  };
}
