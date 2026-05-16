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

export type RemoteSiteInboxMessageStatus =
  | 'pending'
  | 'admitted'
  | 'rejected'
  | 'error'
  | 'expired';

export type RemoteSiteInboxFinalizeStatus = 'admitted' | 'rejected' | 'error';

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

export interface RemoteSiteInboxMessageReceipt {
  schema: 'narada.site_inbox.remote_message_receipt.v0';
  receipt_id: string;
  message_id: string;
  status: RemoteSiteInboxMessageStatus;
  remote_received: {
    received_at: string;
    source_ref: string;
    idempotency_key: string;
  };
  local_admission?: {
    site_id: string;
    admission_id: string;
    kind: SiteInboxEnvelopeKind;
    admitted_at: string;
  };
  rejection?: {
    reason: string;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface RemoteSiteInboxMessage {
  schema: 'narada.site_inbox.remote_message.v0';
  message_id: string;
  target_site_id: string;
  status: RemoteSiteInboxMessageStatus;
  source: {
    kind: string;
    ref: string;
    principal?: string;
    site?: string;
  };
  idempotency_key: string;
  kind: SiteInboxEnvelopeKind;
  subject?: string;
  body: string;
  payload: Record<string, unknown>;
  received_at: string;
  receipt: RemoteSiteInboxMessageReceipt;
}

export interface RemoteSiteInboxLocalAdmissionPlan {
  schema: 'narada.site_inbox.remote_local_admission_plan.v0';
  remote_message_id: string;
  target_site_id: string;
  status: 'local_admission_required';
  request: SiteInboxEnvelopeAdmissionRequest;
  decision: SiteInboxAdmissionDecision;
  remote_surface_authority: 'candidate_only';
  local_site_admission_required: true;
  db_mutated: false;
  envelope_written: false;
}

export type RemoteSiteInboxFinalizePayload =
  | {
      schema: 'narada.site_inbox.remote_finalize_payload.v0';
      status: 'admitted';
      local_site_id: string;
      local_admission_id: string;
      local_kind: SiteInboxEnvelopeKind;
      local_admitted_at: string;
    }
  | {
      schema: 'narada.site_inbox.remote_finalize_payload.v0';
      status: 'rejected';
      rejected_reason: string;
    }
  | {
      schema: 'narada.site_inbox.remote_finalize_payload.v0';
      status: 'error';
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
    };

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

export function buildRemoteSiteInboxMessage(
  input: Omit<RemoteSiteInboxMessage, 'schema' | 'status' | 'receipt'> & {
    status?: RemoteSiteInboxMessageStatus;
    receipt?: RemoteSiteInboxMessageReceipt;
  },
): RemoteSiteInboxMessage {
  const status = input.status ?? 'pending';
  const receipt = input.receipt ?? buildRemoteSiteInboxReceipt({
    message_id: input.message_id,
    status,
    received_at: input.received_at,
    source_ref: input.source.ref,
    idempotency_key: input.idempotency_key,
  });

  return {
    schema: 'narada.site_inbox.remote_message.v0',
    ...input,
    status,
    receipt,
  };
}

export function buildRemoteSiteInboxReceipt(input: {
  message_id: string;
  status: RemoteSiteInboxMessageStatus;
  received_at: string;
  source_ref: string;
  idempotency_key: string;
  local_admission?: RemoteSiteInboxMessageReceipt['local_admission'];
  rejection?: RemoteSiteInboxMessageReceipt['rejection'];
  error?: RemoteSiteInboxMessageReceipt['error'];
}): RemoteSiteInboxMessageReceipt {
  return {
    schema: 'narada.site_inbox.remote_message_receipt.v0',
    receipt_id: `remote-site-inbox-receipt:${input.message_id}`,
    message_id: input.message_id,
    status: input.status,
    remote_received: {
      received_at: input.received_at,
      source_ref: input.source_ref,
      idempotency_key: input.idempotency_key,
    },
    ...(input.local_admission ? { local_admission: input.local_admission } : {}),
    ...(input.rejection ? { rejection: input.rejection } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}

export function planRemoteSiteInboxLocalAdmission(
  message: RemoteSiteInboxMessage,
  input: {
    envelope_id: string;
    received_at: string;
    authority_level?: SiteInboxAuthorityLevel;
    authority_principal?: string;
  },
): RemoteSiteInboxLocalAdmissionPlan {
  if (message.status !== 'pending') {
    throw new Error(`remote_message_not_pending:${message.status}`);
  }

  const request = buildSiteInboxEnvelopeAdmissionRequest({
    envelope_id: input.envelope_id,
    received_at: input.received_at,
    source: {
      kind: 'remote_site_inbox',
      ref: message.message_id,
      site: message.source.site,
    },
    target_locus: message.target_site_id,
    kind: message.kind,
    authority: {
      level: input.authority_level ?? 'external_evidence',
      principal: input.authority_principal ?? message.source.principal ?? message.source.ref,
    },
    payload: {
      schema: 'narada.site_inbox.remote_message_payload.v0',
      title: message.subject ?? `${message.kind} from ${message.source.ref}`,
      body: message.body,
      remote_message: {
        message_id: message.message_id,
        target_site_id: message.target_site_id,
        source: message.source,
        idempotency_key: message.idempotency_key,
        received_at: message.received_at,
      },
      payload: message.payload,
    },
    crossing: {
      scale: 'site',
      authority_scope: message.target_site_id,
      from_locus: message.source.site ?? message.source.ref,
      to_locus: message.target_site_id,
      owning_site: message.target_site_id,
      target_authority: 'canonical_inbox',
      requested_crossing: 'admission_request',
      admission_state: 'received',
    },
  });

  return {
    schema: 'narada.site_inbox.remote_local_admission_plan.v0',
    remote_message_id: message.message_id,
    target_site_id: message.target_site_id,
    status: 'local_admission_required',
    request,
    decision: decideSiteInboxAdmission(request),
    remote_surface_authority: 'candidate_only',
    local_site_admission_required: true,
    db_mutated: false,
    envelope_written: false,
  };
}

export function buildRemoteSiteInboxFinalizePayload(
  input:
    | {
        status: 'admitted';
        local_site_id: string;
        local_admission_id: string;
        local_kind: SiteInboxEnvelopeKind;
        local_admitted_at: string;
      }
    | {
        status: 'rejected';
        rejected_reason: string;
      }
    | {
        status: 'error';
        error: {
          code: string;
          message: string;
          retryable?: boolean;
        };
      },
): RemoteSiteInboxFinalizePayload {
  if (input.status === 'error') {
    return {
      schema: 'narada.site_inbox.remote_finalize_payload.v0',
      status: 'error',
      error: {
        ...input.error,
        retryable: input.error.retryable ?? false,
      },
    };
  }

  return {
    schema: 'narada.site_inbox.remote_finalize_payload.v0',
    ...input,
  };
}

export function receiptFromRemoteSiteInboxFinalize(
  message: RemoteSiteInboxMessage,
  finalize: RemoteSiteInboxFinalizePayload,
): RemoteSiteInboxMessageReceipt {
  if (finalize.status === 'admitted') {
    return buildRemoteSiteInboxReceipt({
      message_id: message.message_id,
      status: 'admitted',
      received_at: message.received_at,
      source_ref: message.source.ref,
      idempotency_key: message.idempotency_key,
      local_admission: {
        site_id: finalize.local_site_id,
        admission_id: finalize.local_admission_id,
        kind: finalize.local_kind,
        admitted_at: finalize.local_admitted_at,
      },
    });
  }

  if (finalize.status === 'rejected') {
    return buildRemoteSiteInboxReceipt({
      message_id: message.message_id,
      status: 'rejected',
      received_at: message.received_at,
      source_ref: message.source.ref,
      idempotency_key: message.idempotency_key,
      rejection: { reason: finalize.rejected_reason },
    });
  }

  return buildRemoteSiteInboxReceipt({
    message_id: message.message_id,
    status: 'error',
    received_at: message.received_at,
    source_ref: message.source.ref,
    idempotency_key: message.idempotency_key,
    error: finalize.error,
  });
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
