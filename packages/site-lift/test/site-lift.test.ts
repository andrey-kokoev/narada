import { describe, expect, it } from 'vitest';
import {
  buildSiteLiftAdoptionCommandPacket,
  buildSiteLiftAdoptionPlan,
  buildSiteLiftArtifactDescriptor,
} from '../src/index.js';

function artifact() {
  return buildSiteLiftArtifactDescriptor({
    artifact_id: 'site_registry_awareness_contract',
    name: 'Site registry awareness contract',
    version: '0.1.0',
    status: 'advisory_contract',
    lift_class: 'site_config_governance',
    source_locus: 'narada-proper',
    portable_scope: 'contracts_docs_tests_only',
    source_paths: ['docs/site-config/site-registry-capability-current-state-contract.md'],
    dependencies: ['@narada2/site-config'],
    non_portable_paths: ['target_site_config.json', 'target_site_task_db'],
    authority_boundaries: ['catalog_membership_is_not_receiving_site_authority'],
    adoption_requirements: ['receiving_site_records_admission_decision'],
  });
}

describe('site lift descriptors', () => {
  it('builds advisory artifact descriptors without importing source state', () => {
    const descriptor = artifact();

    expect(descriptor.receiving_site_must_admit).toBe(true);
    expect(descriptor.source_state_imported).toBe(false);
    expect(descriptor.status).toBe('advisory_contract');
  });

  it('builds adoption plans that remain advisory and refuse non-portable state', () => {
    const plan = buildSiteLiftAdoptionPlan(artifact());

    expect(plan.mutation_posture).toBe('advisory_only_no_copy_install_or_bootstrap');
    expect(plan.refusals).toEqual(expect.arrayContaining([
      'target_site_config.json',
      'source_runtime_databases',
      'source_task_or_inbox_history',
      'secrets_or_credentials',
      'implicit_live_authority',
    ]));
  });

  it('builds command packets that start pending receiving-Site admission', () => {
    const packet = buildSiteLiftAdoptionCommandPacket({
      artifact: artifact(),
      receiving_site_id: 'example-site',
      receiving_site_root: 'C:/example/.narada',
    });

    expect(packet.adoption_record_template.decision).toBe('pending_receiving_site_admission');
    expect(packet.mutation_posture).toBe('advisory_command_packet_no_copy_install_or_bootstrap');
    expect(packet.source_state_imported).toBe(false);
    expect(packet.command_flow).toContain('materialize_only_after_local_authority_admits');
  });
});
