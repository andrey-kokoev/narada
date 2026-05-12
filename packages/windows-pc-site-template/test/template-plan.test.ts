import { describe, expect, it } from 'vitest';
import { buildWindowsPcSiteTemplatePlan } from '../src/index.js';

describe('windows PC Site template plan', () => {
  it('builds descriptor-only greenfield plans with local admissions', () => {
    const plan = buildWindowsPcSiteTemplatePlan({
      site_id: 'pc.fixture',
      runtime_root: 'C:/ProgramData/Narada/sites/pc/fixture',
      slices: ['operator_surface', 'mcp_shell', 'mcp_test', 'windows_osl'],
    });

    expect(plan.descriptor_only).toBe(true);
    expect(plan.filesystem_created).toBe(false);
    expect(plan.live_pc_state_imported).toBe(false);
    expect(plan.planned_dirs).toContain('C:/ProgramData/Narada/sites/pc/fixture/operator-surfaces');
    expect(plan.required_local_admissions).toEqual(expect.arrayContaining([
      'pc_locus_authority',
      'operator_surface_carrier_authority',
      'shell_mcp_carrier_authority',
      'test_mcp_carrier_authority',
      'osl_panel_carrier_authority',
    ]));
  });

  it('warns for Windows profile mutation because it is separate execution', () => {
    const plan = buildWindowsPcSiteTemplatePlan({
      site_id: 'pc.fixture',
      runtime_root: 'C:/ProgramData/Narada/sites/pc/fixture',
      slices: [],
      windows_profile: 'current_user_profile',
    });

    expect(plan.warnings).toContain('windows_profile_mutation_requires_separate_admission');
  });

  it('refuses source runtime, PC-locus state, and credential imports', () => {
    const plan = buildWindowsPcSiteTemplatePlan({
      site_id: 'pc.fixture',
      runtime_root: 'C:/ProgramData/Narada/sites/pc/fixture',
      slices: ['komorebi_yasb'],
      source_runtime_import_requested: true,
      pc_locus_state_import_requested: true,
      credentials_requested: true,
    });

    expect(plan.refusals).toEqual([
      'source_site_runtime_import_refused',
      'credential_import_refused',
      'pc_locus_state_import_refused',
    ]);
    expect(plan.required_local_admissions).toContain('komorebi_yasb_materialization_authority');
  });
});
