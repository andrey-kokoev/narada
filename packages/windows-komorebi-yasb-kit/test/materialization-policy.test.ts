import { describe, expect, it } from 'vitest';
import {
  buildKomorebiYasbMaterializationRequest,
  decideKomorebiYasbMaterialization,
} from '../src/index.js';

describe('Komorebi/YASB materialization policy descriptors', () => {
  it('plans operator-surface materialization without live mutation', () => {
    const decision = decideKomorebiYasbMaterialization(buildKomorebiYasbMaterializationRequest({
      template_id: 'windows-komorebi-yasb',
      surface: 'operator_surface_mcp',
    }));

    expect(decision.status).toBe('planned_descriptor');
    expect(decision.required_admissions).toEqual(expect.arrayContaining([
      'pc_locus_authority',
      'operator_surface_materialization_authority',
    ]));
    expect(decision.descriptor_only).toBe(true);
    expect(decision.live_mutation_performed).toBe(false);
  });

  it('warns for PC Site local fallback because it needs explicit evidence', () => {
    const decision = decideKomorebiYasbMaterialization(buildKomorebiYasbMaterializationRequest({
      template_id: 'windows-komorebi-yasb',
      surface: 'pc_site_local_fallback',
    }));

    expect(decision.warnings).toContain('local_fallback_requires_reason_and_evidence');
    expect(decision.required_admissions).toContain('pc_site_local_fallback_authority');
  });

  it('refuses live runtime projection and imported machine state as authority', () => {
    const decision = decideKomorebiYasbMaterialization(buildKomorebiYasbMaterializationRequest({
      template_id: 'windows-komorebi-yasb',
      surface: 'live_runtime_directory',
      live_runtime_import_requested: true,
      monitor_state_import_requested: true,
      user_preference_authority_requested: true,
      credentials_requested: true,
    }));

    expect(decision.status).toBe('refused');
    expect(decision.refusals).toEqual([
      'live_runtime_directory_is_projection_not_authority',
      'live_yasb_runtime_import_refused',
      'live_monitor_state_import_refused',
      'user_preference_authority_import_refused',
      'credential_import_refused',
    ]);
  });
});
