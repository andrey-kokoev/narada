export type SiteLiftArtifactStatus =
  | 'advisory_contract'
  | 'advisory_protocol'
  | 'advisory_composite_packet'
  | 'package_descriptor';

export interface SiteLiftArtifactDescriptor {
  schema: 'narada.site_lift.artifact_descriptor.v0';
  artifact_id: string;
  name: string;
  version: string;
  status: SiteLiftArtifactStatus;
  lift_class: string;
  source_locus: string;
  portable_scope: string;
  source_paths: string[];
  dependencies: string[];
  non_portable_paths: string[];
  authority_boundaries: string[];
  adoption_requirements: string[];
  receiving_site_must_admit: true;
  source_state_imported: false;
}

export interface SiteLiftAdoptionPlan {
  schema: 'narada.site_lift.adoption_plan.v0';
  artifact_id: string;
  receiving_site_must_admit: true;
  portable_scope: string;
  source_paths: string[];
  dependencies: string[];
  non_portable_paths: string[];
  authority_boundaries: string[];
  adoption_requirements: string[];
  mutation_posture: 'advisory_only_no_copy_install_or_bootstrap';
  refusals: string[];
}

export interface SiteLiftAdoptionCommandPacket {
  schema: 'narada.site_lift.adoption_command.v0';
  artifact_id: string;
  receiving_site: {
    site_id: string;
    root?: string;
  };
  adoption_record_template: {
    decision: 'pending_receiving_site_admission';
    local_authority_owner: string;
    evidence_refs: string[];
  };
  command_flow: string[];
  mutation_posture: 'advisory_command_packet_no_copy_install_or_bootstrap';
  source_state_imported: false;
}

export function buildSiteLiftArtifactDescriptor(
  input: Omit<SiteLiftArtifactDescriptor, 'schema' | 'receiving_site_must_admit' | 'source_state_imported'>,
): SiteLiftArtifactDescriptor {
  return {
    schema: 'narada.site_lift.artifact_descriptor.v0',
    ...input,
    receiving_site_must_admit: true,
    source_state_imported: false,
  };
}

export function buildSiteLiftAdoptionPlan(artifact: SiteLiftArtifactDescriptor): SiteLiftAdoptionPlan {
  return {
    schema: 'narada.site_lift.adoption_plan.v0',
    artifact_id: artifact.artifact_id,
    receiving_site_must_admit: true,
    portable_scope: artifact.portable_scope,
    source_paths: artifact.source_paths,
    dependencies: artifact.dependencies,
    non_portable_paths: artifact.non_portable_paths,
    authority_boundaries: artifact.authority_boundaries,
    adoption_requirements: artifact.adoption_requirements,
    mutation_posture: 'advisory_only_no_copy_install_or_bootstrap',
    refusals: defaultSiteLiftRefusals(artifact),
  };
}

export function buildSiteLiftAdoptionCommandPacket(input: {
  artifact: SiteLiftArtifactDescriptor;
  receiving_site_id: string;
  receiving_site_root?: string;
  local_authority_owner?: string;
}): SiteLiftAdoptionCommandPacket {
  return {
    schema: 'narada.site_lift.adoption_command.v0',
    artifact_id: input.artifact.artifact_id,
    receiving_site: {
      site_id: input.receiving_site_id,
      root: input.receiving_site_root,
    },
    adoption_record_template: {
      decision: 'pending_receiving_site_admission',
      local_authority_owner: input.local_authority_owner ?? input.receiving_site_id,
      evidence_refs: [],
    },
    command_flow: [
      'review_artifact_descriptor',
      'record_receiving_site_admission_decision',
      'materialize_only_after_local_authority_admits',
      'run_receiving_site_verification',
      'record_refused_nonportable_state',
    ],
    mutation_posture: 'advisory_command_packet_no_copy_install_or_bootstrap',
    source_state_imported: false,
  };
}

export function defaultSiteLiftRefusals(artifact: SiteLiftArtifactDescriptor): string[] {
  return [
    ...artifact.non_portable_paths,
    'source_runtime_databases',
    'source_task_or_inbox_history',
    'source_rosters_or_checkpoints',
    'operator_surface_runtime_state',
    'pc_locus_state',
    'secrets_or_credentials',
    'implicit_live_authority',
  ];
}
