export type SiteLocusType = 'client_service' | 'project' | 'project_ops' | 'pc_locus' | 'user_site' | 'unknown';

export interface SiteCapabilityEdge {
  from: string;
  to: string;
  capability: string;
  status: 'available' | 'observed' | 'planned' | 'blocked';
  basis: 'local_registry_awareness' | 'operator_pinned' | 'target_evidence' | 'probe_observed';
  evidence_refs?: string[];
}

export interface SiteCapabilityDenial {
  from: string;
  to: string;
  capability: string;
  status: 'not_granted';
  basis: 'local_site_registry_non_grant' | 'target_evidence' | 'operator_pinned';
  evidence_refs?: string[];
}

export interface KnownSiteRegistryEntry {
  site_id: string;
  locus_type: SiteLocusType;
  roots: Record<string, string>;
  authority_boundaries: {
    user_site: string[];
    not_granted_by_awareness: string[];
    [owner: string]: string[];
  };
  capability_edges: SiteCapabilityEdge[];
  capability_denials: SiteCapabilityDenial[];
  sync_posture: string;
  capabilities: string[];
  inbox_endpoint: { status: string };
  task_lifecycle: { status: string };
  mcp_access: { status: string };
  freshness: Record<string, unknown>;
  health: { status: string; note?: string };
  blockers: string[];
  evidence_refs: string[];
}

export interface SiteRegistryValidationResult {
  schema: 'narada.site_config.registry_validation.v0';
  status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  config_mutated: false;
  target_authority_granted: false;
}

export interface RegisteredSiteProbeRequest {
  schema: 'narada.site_config.registered_site_probe_request.v0';
  site_id?: string;
  root?: string;
  authority_basis?: {
    kind: 'operator_direct_instruction' | 'local_registry_entry';
    summary: string;
  };
  target_mutation_requested?: boolean;
  arbitrary_scan_requested?: boolean;
  runtime_state_import_requested?: boolean;
  credentials_requested?: boolean;
}

export interface RegisteredSiteProbeReport {
  schema: 'narada.registered_site.probe_report.v0';
  status: 'ok' | 'blocked' | 'refused';
  site_id: string;
  root: string;
  registration_status:
    | 'registered_local_site_registry'
    | 'operator_explicit_unregistered_root'
    | 'refused_unregistered_root';
  current_state: KnownSiteRegistryEntry;
  readable_surfaces: string[];
  missing_surfaces: string[];
  blockers: string[];
  recommended_next_actions: string[];
  evidence_refs: string[];
  read_only: true;
  target_mutated: false;
  arbitrary_client_files_scanned: false;
  source_state_imported: false;
}

export interface RegisteredSiteProbeDecision {
  schema: 'narada.site_config.registered_site_probe_decision.v0';
  status: 'planned_descriptor' | 'refused';
  refusals: string[];
  warnings: string[];
  descriptor_only: true;
  target_mutated: false;
  arbitrary_client_files_scanned: false;
  source_state_imported: false;
}

export function validateKnownSiteRegistryEntry(
  key: string,
  entry: KnownSiteRegistryEntry,
): SiteRegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entry.site_id !== key) errors.push('registered_site_id_mismatch');
  if (!entry.authority_boundaries?.user_site?.length) errors.push('registered_site_missing_user_site_boundary');
  if (!entry.authority_boundaries?.not_granted_by_awareness?.some((capability) => capability.includes('mutate'))) {
    errors.push('registered_site_missing_mutation_denial');
  }
  if (!entry.task_lifecycle?.status) errors.push('registered_site_missing_task_lifecycle_status');
  if (!entry.inbox_endpoint?.status) errors.push('registered_site_missing_inbox_endpoint_status');
  if (!entry.mcp_access?.status) errors.push('registered_site_missing_mcp_access_status');
  if (!Array.isArray(entry.capability_edges)) errors.push('registered_site_missing_capability_edges');
  if (!Array.isArray(entry.capability_denials)) errors.push('registered_site_missing_capability_denials');
  for (const edge of entry.capability_edges ?? []) {
    if (!['local_registry_awareness', 'operator_pinned', 'target_evidence', 'probe_observed'].includes(edge.basis)) {
      errors.push('registered_site_bad_capability_basis');
    }
  }
  for (const denial of entry.capability_denials ?? []) {
    if (denial.status !== 'not_granted') errors.push('registered_site_bad_capability_denial_status');
  }
  if (entry.health?.status === 'root_known_not_inspected') warnings.push('registered_site_not_inspected');

  return {
    schema: 'narada.site_config.registry_validation.v0',
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
    warnings,
    config_mutated: false,
    target_authority_granted: false,
  };
}

export function decideRegisteredSiteProbe(request: RegisteredSiteProbeRequest): RegisteredSiteProbeDecision {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (!request.site_id && !request.root) refusals.push('site_probe_requires_site_id_or_root');
  if (request.root && !request.site_id) {
    if (request.authority_basis?.kind !== 'operator_direct_instruction' || !request.authority_basis.summary) {
      refusals.push('site_probe_unregistered_root_requires_operator_authority_basis');
    } else {
      warnings.push('operator_explicit_unregistered_root_requires_registry_decision_before_reuse');
    }
  }
  if (request.target_mutation_requested) refusals.push('target_site_mutation_refused');
  if (request.arbitrary_scan_requested) refusals.push('arbitrary_client_file_scan_refused');
  if (request.runtime_state_import_requested) refusals.push('runtime_state_import_refused');
  if (request.credentials_requested) refusals.push('credential_import_refused');

  return {
    schema: 'narada.site_config.registered_site_probe_decision.v0',
    status: refusals.length === 0 ? 'planned_descriptor' : 'refused',
    refusals,
    warnings,
    descriptor_only: true,
    target_mutated: false,
    arbitrary_client_files_scanned: false,
    source_state_imported: false,
  };
}

export function buildRegisteredSiteProbeReport(input: {
  site_id: string;
  root: string;
  registration_status: RegisteredSiteProbeReport['registration_status'];
  current_state: KnownSiteRegistryEntry;
  readable_surfaces?: string[];
  missing_surfaces?: string[];
  blockers?: string[];
  recommended_next_actions?: string[];
  evidence_refs?: string[];
}): RegisteredSiteProbeReport {
  return {
    schema: 'narada.registered_site.probe_report.v0',
    status: input.blockers?.length ? 'blocked' : 'ok',
    site_id: input.site_id,
    root: input.root,
    registration_status: input.registration_status,
    current_state: input.current_state,
    readable_surfaces: input.readable_surfaces ?? [],
    missing_surfaces: input.missing_surfaces ?? [],
    blockers: input.blockers ?? [],
    recommended_next_actions: input.recommended_next_actions ?? [],
    evidence_refs: input.evidence_refs ?? [],
    read_only: true,
    target_mutated: false,
    arbitrary_client_files_scanned: false,
    source_state_imported: false,
  };
}

export function buildRegisteredSiteProbeRequest(
  input: Omit<RegisteredSiteProbeRequest, 'schema'>,
): RegisteredSiteProbeRequest {
  return {
    schema: 'narada.site_config.registered_site_probe_request.v0',
    ...input,
  };
}
