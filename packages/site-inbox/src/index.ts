export type SiteInboxEnvelopeKind =
  | 'observation'
  | 'proposal'
  | 'command_request'
  | 'knowledge_candidate'
  | 'task_candidate'
  | 'incident';

export type SiteInboxAuthorityLevel =
  | 'operator_requested'
  | 'agent_reported'
  | 'system_observed'
  | 'external_evidence'
  | 'unknown';

export type SiteInboxAdmissionState =
  | 'received'
  | 'admitted'
  | 'rejected'
  | 'deferred'
  | 'promoted'
  | 'archived';

export interface SiteInboxCrossingCoordinates {
  scale: 'operation' | 'site' | 'realm' | 'role' | 'task' | 'capability';
  authority_scope: string;
  from_locus: string;
  to_locus: string;
  owning_site: string;
  target_authority:
    | 'task_lifecycle'
    | 'canonical_inbox'
    | 'evidence_admission'
    | 'site_governance'
    | 'capability_consent'
    | 'operator';
  requested_crossing:
    | 'review_request'
    | 'handoff'
    | 'approval_request'
    | 'admission_request'
    | 'verification_request'
    | 'blocker'
    | 'capa_candidate'
    | 'capa_addendum';
  admission_state: SiteInboxAdmissionState;
  review_state?: 'not_required' | 'requested' | 'in_review' | 'accepted' | 'rejected' | 'superseded';
}

export interface SiteInboxEnvelopeAdmissionRequest {
  schema: 'narada.site_inbox.envelope_admission_request.v0';
  envelope_id: string;
  received_at: string;
  source: {
    kind: string;
    ref: string;
    site?: string;
  };
  target_locus: string;
  kind: SiteInboxEnvelopeKind;
  authority: {
    level: SiteInboxAuthorityLevel;
    principal: string;
  };
  payload: Record<string, unknown>;
  crossing?: SiteInboxCrossingCoordinates;
  source_db_import_requested?: boolean;
  source_history_import_requested?: boolean;
  runtime_state_import_requested?: boolean;
  credentials_requested?: boolean;
  allow_empty_payload?: boolean;
}

export interface SiteInboxAdmissionDecision {
  schema: 'narada.site_inbox.admission_decision.v0';
  status: 'admissible_descriptor' | 'refused';
  refusals: string[];
  warnings: string[];
  descriptor_only: true;
  envelope_written: false;
  db_mutated: false;
  source_state_imported: false;
}

export interface SiteInboxPortableArtifactPlan {
  schema: 'narada.site_inbox.portable_artifact_plan.v0';
  envelope_id: string;
  artifact_path: string;
  git_visible: true;
  db_export: false;
  source_history_imported: false;
}

export function buildSiteInboxEnvelopeAdmissionRequest(
  input: Omit<SiteInboxEnvelopeAdmissionRequest, 'schema'>,
): SiteInboxEnvelopeAdmissionRequest {
  return {
    schema: 'narada.site_inbox.envelope_admission_request.v0',
    ...input,
  };
}

export function decideSiteInboxAdmission(
  request: SiteInboxEnvelopeAdmissionRequest,
): SiteInboxAdmissionDecision {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (!request.envelope_id) refusals.push('envelope_id_required');
  if (!request.received_at) refusals.push('received_at_required');
  if (!request.authority.principal) refusals.push('authority_principal_required');
  if (request.authority.level === 'unknown') warnings.push('unknown_authority_level_requires_local_review');
  if (!request.allow_empty_payload && Object.keys(request.payload).length === 0) {
    refusals.push('empty_payload_refused_without_explicit_allowance');
  }
  if (request.source_db_import_requested) refusals.push('source_inbox_db_import_refused');
  if (request.source_history_import_requested) refusals.push('source_inbox_history_import_refused');
  if (request.runtime_state_import_requested) refusals.push('runtime_state_import_refused');
  if (request.credentials_requested) refusals.push('credential_import_refused');
  if (containsUnsafePathReference(request.source.ref)) refusals.push('unsafe_source_ref_refused');
  if (request.crossing) {
    const crossingRefusal = validateCrossingCoordinates(request.crossing);
    if (crossingRefusal) refusals.push(crossingRefusal);
  }

  return {
    schema: 'narada.site_inbox.admission_decision.v0',
    status: refusals.length === 0 ? 'admissible_descriptor' : 'refused',
    refusals,
    warnings,
    descriptor_only: true,
    envelope_written: false,
    db_mutated: false,
    source_state_imported: false,
  };
}

export function buildSiteInboxPortableArtifactPlan(input: {
  envelope_id: string;
  received_at: string;
}): SiteInboxPortableArtifactPlan {
  const safeTimestamp = input.received_at.replace(/[:.]/g, '-');
  return {
    schema: 'narada.site_inbox.portable_artifact_plan.v0',
    envelope_id: input.envelope_id,
    artifact_path: `.ai/inbox-envelopes/${safeTimestamp}-${input.envelope_id}.json`,
    git_visible: true,
    db_export: false,
    source_history_imported: false,
  };
}

function validateCrossingCoordinates(crossing: SiteInboxCrossingCoordinates): string | null {
  const required = [
    crossing.scale,
    crossing.authority_scope,
    crossing.from_locus,
    crossing.to_locus,
    crossing.owning_site,
    crossing.target_authority,
    crossing.requested_crossing,
    crossing.admission_state,
  ];
  if (required.some((value) => !value)) return 'crossing_coordinates_incomplete';
  if (crossing.requested_crossing === 'review_request' && !crossing.review_state) {
    return 'review_crossing_requires_review_state';
  }
  return null;
}

function containsUnsafePathReference(ref: string): boolean {
  return /[<>|`$]/.test(ref) || /\bwsl(?:\.exe)?\b/i.test(ref);
}
