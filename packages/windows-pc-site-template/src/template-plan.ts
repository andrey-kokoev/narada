export type WindowsPcSiteSlice =
  | 'operator_surface'
  | 'mcp_shell'
  | 'mcp_test'
  | 'windows_osl'
  | 'komorebi_yasb';

export interface WindowsPcSiteTemplatePlanInput {
  site_id: string;
  runtime_root: string;
  slices: WindowsPcSiteSlice[];
  windows_profile?: 'none' | 'current_user_profile';
  source_runtime_import_requested?: boolean;
  credentials_requested?: boolean;
  pc_locus_state_import_requested?: boolean;
}

export interface WindowsPcSiteTemplatePlan {
  schema: 'narada.windows_pc_site_template.plan.v0';
  site_id: string;
  runtime_root: string;
  planned_dirs: string[];
  package_slices: WindowsPcSiteSlice[];
  required_local_admissions: string[];
  warnings: string[];
  refusals: string[];
  descriptor_only: true;
  filesystem_created: false;
  live_pc_state_imported: false;
}

export function buildWindowsPcSiteTemplatePlan(input: WindowsPcSiteTemplatePlanInput): WindowsPcSiteTemplatePlan {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (input.source_runtime_import_requested) refusals.push('source_site_runtime_import_refused');
  if (input.credentials_requested) refusals.push('credential_import_refused');
  if (input.pc_locus_state_import_requested) refusals.push('pc_locus_state_import_refused');
  if (input.windows_profile === 'current_user_profile') {
    warnings.push('windows_profile_mutation_requires_separate_admission');
  }

  const required = new Set<string>([
    'pc_locus_authority',
    'runtime_root_creation_authority',
    'local_evidence_storage_authority',
  ]);

  for (const slice of input.slices) {
    switch (slice) {
      case 'operator_surface':
        required.add('operator_surface_carrier_authority');
        break;
      case 'mcp_shell':
        required.add('shell_mcp_carrier_authority');
        break;
      case 'mcp_test':
        required.add('test_mcp_carrier_authority');
        break;
      case 'windows_osl':
        required.add('osl_panel_carrier_authority');
        break;
      case 'komorebi_yasb':
        required.add('komorebi_yasb_materialization_authority');
        break;
    }
  }

  return {
    schema: 'narada.windows_pc_site_template.plan.v0',
    site_id: input.site_id,
    runtime_root: input.runtime_root,
    planned_dirs: [
      `${input.runtime_root}/tools`,
      `${input.runtime_root}/runtime`,
      `${input.runtime_root}/logs`,
      `${input.runtime_root}/operator-surfaces`,
    ],
    package_slices: [...input.slices],
    required_local_admissions: [...required],
    warnings,
    refusals,
    descriptor_only: true,
    filesystem_created: false,
    live_pc_state_imported: false,
  };
}
