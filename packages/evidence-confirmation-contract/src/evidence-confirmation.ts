export const EVIDENCE_PACKET_SCHEMA = 'narada.evidence_packet.v1' as const;
export const EFFECT_CONFIRMATION_SCHEMA = 'narada.effect_confirmation.v1' as const;
export const EVIDENCE_CORRELATION_AUDIT_SCHEMA = 'narada.evidence_correlation_audit.v1' as const;

export const EVIDENCE_STATUS_VALUES = [
  'accepted',
  'completed',
  'failed',
  'cancelled',
  'interrupted_unknown',
  'stale',
  'reconnecting',
  'degraded',
  'unknown',
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUS_VALUES)[number];

export const EVIDENCE_TYPE_VALUES = [
  'claim',
  'observation',
  'command',
  'test',
  'artifact',
  'replay',
  'reconciliation',
  'transport',
  'provider',
  'projection',
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPE_VALUES)[number];

export const EVIDENCE_TRUST_VALUES = [
  'unverified',
  'observed',
  'attested',
  'verified',
  'derived',
] as const;

export type EvidenceTrust = (typeof EVIDENCE_TRUST_VALUES)[number];

export const EVIDENCE_INVALIDATION_VALUES = [
  'valid',
  'superseded',
  'stale',
  'revoked',
  'mismatch',
] as const;

export type EvidenceInvalidation = (typeof EVIDENCE_INVALIDATION_VALUES)[number];

export type EvidenceClaimKind =
  | 'admission'
  | 'execution'
  | 'effect'
  | 'lifecycle'
  | 'health'
  | 'reconciliation';

export interface EvidenceCorrelation {
  request_ref: string | null;
  input_ref: string | null;
  turn_ref: string | null;
  session_ref: string | null;
  authority_epoch: number | null;
  capability_ref: string | null;
  intent_ref: string | null;
  effect_ref: string | null;
  observation_ref: string | null;
}

export interface EvidenceScope {
  site_ref: string;
  authority_ref: string;
  object_ref: string | null;
}

export interface EvidenceClaim {
  claim_ref: string;
  claim_kind: EvidenceClaimKind;
  statement: string;
  claimed_status: EvidenceStatus;
  effect_ref: string | null;
}

export type EvidenceArtifactKind =
  | 'artifact'
  | 'command_output'
  | 'test_output'
  | 'git_diff'
  | 'projection'
  | 'replay'
  | 'log';

export interface EvidenceArtifactRef {
  ref: string;
  kind: EvidenceArtifactKind;
  digest: string | null;
  media_type: string | null;
}

export interface EvidenceCommandTestRef {
  kind: 'command' | 'test';
  ref: string;
  result_ref: string | null;
}

export interface EvidencePacket {
  schema: typeof EVIDENCE_PACKET_SCHEMA;
  packet_id: string;
  claim: EvidenceClaim;
  evidence_type: EvidenceType;
  producer_ref: string;
  verifier_ref: string;
  trust: EvidenceTrust;
  invalidation: EvidenceInvalidation;
  invalidation_reason: string | null;
  created_at: string;
  observed_at: string | null;
  scope: EvidenceScope;
  artifacts: readonly EvidenceArtifactRef[];
  command_test_refs: readonly EvidenceCommandTestRef[];
  correlation: EvidenceCorrelation;
  predecessor_packet_refs: readonly string[];
  evidence_packet_refs: readonly string[];
  metadata: Readonly<Record<string, string>>;
}

export type EvidencePacketInput = Omit<EvidencePacket, 'schema'> & {
  schema?: typeof EVIDENCE_PACKET_SCHEMA;
};

export type EvidenceAdmissionCode =
  | 'admitted'
  | 'schema_mismatch'
  | 'invalid_packet'
  | 'invalidated'
  | 'missing_correlation'
  | 'missing_verifier';

export interface EvidenceAdmissionDecision {
  admitted: boolean;
  code: EvidenceAdmissionCode;
  packet_ref: string | null;
  reason: string;
}

export interface EvidenceCorrelationExpectation {
  request_ref?: string | null;
  input_ref?: string | null;
  turn_ref?: string | null;
  session_ref?: string | null;
  authority_epoch?: number | null;
  capability_ref?: string | null;
  intent_ref?: string | null;
  observation_ref?: string | null;
}

export interface EvidenceCorrelationAudit {
  schema: typeof EVIDENCE_CORRELATION_AUDIT_SCHEMA;
  valid: boolean;
  effect_ref: string;
  packet_refs: readonly string[];
  observation_packet_refs: readonly string[];
  missing_fields: readonly string[];
  mismatches: readonly string[];
}

export type ConfirmationVerdict = 'confirmed' | 'unknown';

export type ConfirmationReasonCode =
  | 'effect_observation_confirmed'
  | 'effect_observation_terminal'
  | 'effect_not_terminal'
  | 'observation_verification_required'
  | 'evidence_missing'
  | 'evidence_invalidated'
  | 'interrupted_requires_reconciliation'
  | 'transport_or_provider_not_confirmation'
  | 'correlation_mismatch';

export interface EffectConfirmation {
  schema: typeof EFFECT_CONFIRMATION_SCHEMA;
  confirmation_id: string;
  effect_ref: string;
  verdict: ConfirmationVerdict;
  outcome: EvidenceStatus;
  reason_code: ConfirmationReasonCode;
  evidence_packet_refs: readonly string[];
  observation_packet_ref: string | null;
  non_confirming_signal_status: EvidenceStatus | null;
  reconciliation_required: boolean;
  created_at: string;
  authority_ref: string | null;
  correlation_audit: EvidenceCorrelationAudit;
}

export interface EffectConfirmationInput {
  effect_ref: string;
  packets: readonly EvidencePacket[];
  now: string;
  expected_correlation?: EvidenceCorrelationExpectation;
}

export interface InterruptedEffectReconciliation {
  status: 'reconciled' | 'unknown';
  replay_packet_refs: readonly string[];
  confirmation: EffectConfirmation;
}

export interface TaskEvidenceReference {
  task_ref: string;
  evidence_refs: readonly string[];
  evidence_packet_refs: readonly string[];
}

export interface RuntimeEvidenceReference {
  runtime_request_ref: string;
  effect_ref: string | null;
  evidence_packet_refs: readonly string[];
  confirmation_ref: string | null;
}

const OBSERVATION_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'observation',
  'artifact',
  'replay',
  'reconciliation',
];

const UNCERTAIN_STATUSES: readonly EvidenceStatus[] = [
  'interrupted_unknown',
  'stale',
  'reconnecting',
  'degraded',
];

const FORBIDDEN_PERMISSION_FIELDS = [
  'permission',
  'permission_ref',
  'permission_granted',
  'authorized',
  'authorization',
  'admission_decision',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function requireString(value: unknown, field: string): asserts value is string {
  if (!isNonEmptyString(value)) throw new Error(`evidence_packet_${field}_required`);
}

function assertCorrelation(value: unknown): asserts value is EvidenceCorrelation {
  if (!isRecord(value)) throw new Error('evidence_packet_correlation_required');
  const fields = [
    'request_ref',
    'input_ref',
    'turn_ref',
    'session_ref',
    'capability_ref',
    'intent_ref',
    'effect_ref',
    'observation_ref',
  ];
  for (const field of fields) {
    if (value[field] !== null && !isNonEmptyString(value[field])) {
      throw new Error(`evidence_packet_correlation_${field}_invalid`);
    }
  }
  if (value.authority_epoch !== null
    && (typeof value.authority_epoch !== 'number' || !Number.isInteger(value.authority_epoch) || value.authority_epoch < 0)) {
    throw new Error('evidence_packet_correlation_authority_epoch_invalid');
  }
}

function assertNoPermissionFields(value: Record<string, unknown>): void {
  for (const field of FORBIDDEN_PERMISSION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`evidence_packet_must_not_grant_permission:${field}`);
    }
  }
}

export function assertEvidencePacket(value: unknown): asserts value is EvidencePacket {
  if (!isRecord(value)) throw new Error('evidence_packet_object_required');
  assertNoPermissionFields(value);
  if (value.schema !== EVIDENCE_PACKET_SCHEMA) throw new Error('evidence_packet_schema_mismatch');
  requireString(value.packet_id, 'packet_id');
  requireString(value.producer_ref, 'producer_ref');
  requireString(value.verifier_ref, 'verifier_ref');
  requireString(value.created_at, 'created_at');
  if (!isRecord(value.claim)) throw new Error('evidence_packet_claim_required');
  requireString(value.claim.claim_ref, 'claim_ref');
  requireString(value.claim.statement, 'statement');
  if (!isOneOf(['admission', 'execution', 'effect', 'lifecycle', 'health', 'reconciliation'], value.claim.claim_kind)) {
    throw new Error('evidence_packet_claim_kind_invalid');
  }
  if (!isOneOf(EVIDENCE_STATUS_VALUES, value.claim.claimed_status)) {
    throw new Error('evidence_packet_claimed_status_invalid');
  }
  if (value.claim.effect_ref !== null && !isNonEmptyString(value.claim.effect_ref)) {
    throw new Error('evidence_packet_claim_effect_ref_invalid');
  }
  if (!isOneOf(EVIDENCE_TYPE_VALUES, value.evidence_type)) throw new Error('evidence_packet_evidence_type_invalid');
  if (!isOneOf(EVIDENCE_TRUST_VALUES, value.trust)) throw new Error('evidence_packet_trust_invalid');
  if (!isOneOf(EVIDENCE_INVALIDATION_VALUES, value.invalidation)) throw new Error('evidence_packet_invalidation_invalid');
  if (value.invalidation_reason !== null && !isNonEmptyString(value.invalidation_reason)) {
    throw new Error('evidence_packet_invalidation_reason_invalid');
  }
  if (value.observed_at !== null && !isNonEmptyString(value.observed_at)) {
    throw new Error('evidence_packet_observed_at_invalid');
  }
  if (!isRecord(value.scope)) throw new Error('evidence_packet_scope_required');
  requireString(value.scope.site_ref, 'scope_site_ref');
  requireString(value.scope.authority_ref, 'scope_authority_ref');
  if (value.scope.object_ref !== null && !isNonEmptyString(value.scope.object_ref)) {
    throw new Error('evidence_packet_scope_object_ref_invalid');
  }
  assertCorrelation(value.correlation);
  if (value.claim.effect_ref !== null
    && value.correlation.effect_ref !== null
    && value.claim.effect_ref !== value.correlation.effect_ref) {
    throw new Error('evidence_packet_effect_correlation_mismatch');
  }
  if (!Array.isArray(value.artifacts) || !Array.isArray(value.command_test_refs)
    || !Array.isArray(value.predecessor_packet_refs) || !Array.isArray(value.evidence_packet_refs)) {
    throw new Error('evidence_packet_reference_arrays_required');
  }
  if (!isRecord(value.metadata)) throw new Error('evidence_packet_metadata_required');
}

export function isEvidencePacket(value: unknown): value is EvidencePacket {
  try {
    assertEvidencePacket(value);
    return true;
  } catch {
    return false;
  }
}

export function createEvidencePacket(input: EvidencePacketInput): EvidencePacket {
  const packet: EvidencePacket = {
    schema: EVIDENCE_PACKET_SCHEMA,
    packet_id: input.packet_id,
    claim: { ...input.claim },
    evidence_type: input.evidence_type,
    producer_ref: input.producer_ref,
    verifier_ref: input.verifier_ref,
    trust: input.trust,
    invalidation: input.invalidation,
    invalidation_reason: input.invalidation_reason,
    created_at: input.created_at,
    observed_at: input.observed_at,
    scope: { ...input.scope },
    artifacts: input.artifacts.map((artifact) => ({ ...artifact })),
    command_test_refs: input.command_test_refs.map((reference) => ({ ...reference })),
    correlation: { ...input.correlation },
    predecessor_packet_refs: [...input.predecessor_packet_refs],
    evidence_packet_refs: [...input.evidence_packet_refs],
    metadata: { ...input.metadata },
  };
  assertEvidencePacket(packet);
  return packet;
}

export function admitEvidencePacket(value: unknown): EvidenceAdmissionDecision {
  try {
    assertEvidencePacket(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      admitted: false,
      code: reason === 'evidence_packet_schema_mismatch' ? 'schema_mismatch' : 'invalid_packet',
      packet_ref: isRecord(value) && typeof value.packet_id === 'string' ? value.packet_id : null,
      reason,
    };
  }
  const packet = value;
  if (packet.invalidation !== 'valid') {
    return {
      admitted: false,
      code: 'invalidated',
      packet_ref: packet.packet_id,
      reason: `evidence_packet_${packet.invalidation}`,
    };
  }
  const correlationValues = Object.values(packet.correlation);
  if (!correlationValues.some((entry) => entry !== null)) {
    return {
      admitted: false,
      code: 'missing_correlation',
      packet_ref: packet.packet_id,
      reason: 'evidence_packet_requires_at_least_one_correlation_identity',
    };
  }
  if (!packet.verifier_ref) {
    return {
      admitted: false,
      code: 'missing_verifier',
      packet_ref: packet.packet_id,
      reason: 'evidence_packet_verifier_required',
    };
  }
  return {
    admitted: true,
    code: 'admitted',
    packet_ref: packet.packet_id,
    reason: 'evidence_packet_admitted_without_permission_grant',
  };
}

function isObservationPacket(packet: EvidencePacket): boolean {
  return OBSERVATION_EVIDENCE_TYPES.includes(packet.evidence_type);
}

function packetMatchesEffect(packet: EvidencePacket, effectRef: string): boolean {
  return packet.claim.effect_ref === effectRef || packet.correlation.effect_ref === effectRef;
}

export function auditEvidenceCorrelation(
  effectRef: string,
  packets: readonly EvidencePacket[],
  expected: EvidenceCorrelationExpectation = {},
): EvidenceCorrelationAudit {
  const related = packets.filter((packet) => packetMatchesEffect(packet, effectRef));
  const missingFields: string[] = related.length === 0 ? ['effect_ref'] : [];
  const mismatches: string[] = [];
  const observations: string[] = [];
  const expectedEntries = Object.entries(expected) as Array<[keyof EvidenceCorrelationExpectation, string | number | null | undefined]>;

  for (const packet of related) {
    if (isObservationPacket(packet)) {
      observations.push(packet.packet_id);
      if (packet.correlation.observation_ref === null) mismatches.push(`${packet.packet_id}:observation_ref`);
    }
    if (packet.invalidation !== 'valid') mismatches.push(`${packet.packet_id}:invalidation`);
    for (const [field, expectedValue] of expectedEntries) {
      if (expectedValue === undefined || expectedValue === null) continue;
      if (packet.correlation[field] !== expectedValue) mismatches.push(`${packet.packet_id}:${String(field)}`);
    }
  }

  return {
    schema: EVIDENCE_CORRELATION_AUDIT_SCHEMA,
    valid: missingFields.length === 0 && mismatches.length === 0,
    effect_ref: effectRef,
    packet_refs: related.map((packet) => packet.packet_id),
    observation_packet_refs: observations,
    missing_fields: missingFields,
    mismatches,
  };
}

function confirmationId(effectRef: string, packetRefs: readonly string[]): string {
  return `confirmation:${effectRef}:${packetRefs.join(',') || 'none'}`;
}

function makeConfirmation(
  input: EffectConfirmationInput,
  related: readonly EvidencePacket[],
  audit: EvidenceCorrelationAudit,
  values: Omit<EffectConfirmation, 'schema' | 'confirmation_id' | 'effect_ref' | 'evidence_packet_refs' | 'created_at' | 'correlation_audit'>,
): EffectConfirmation {
  return {
    schema: EFFECT_CONFIRMATION_SCHEMA,
    confirmation_id: confirmationId(input.effect_ref, related.map((packet) => packet.packet_id)),
    effect_ref: input.effect_ref,
    evidence_packet_refs: related.map((packet) => packet.packet_id),
    created_at: input.now,
    correlation_audit: audit,
    ...values,
  };
}

export function reconcileEffectConfirmation(input: EffectConfirmationInput): EffectConfirmation {
  const related = input.packets.filter((packet) => packetMatchesEffect(packet, input.effect_ref));
  const audit = auditEvidenceCorrelation(input.effect_ref, input.packets, input.expected_correlation);
  if (related.length === 0) {
    return makeConfirmation(input, related, audit, {
      verdict: 'unknown',
      outcome: 'unknown',
      reason_code: 'evidence_missing',
      observation_packet_ref: null,
      non_confirming_signal_status: null,
      reconciliation_required: true,
      authority_ref: null,
    });
  }

  const invalidated = related.find((packet) => packet.invalidation !== 'valid');
  if (invalidated) {
    return makeConfirmation(input, related, audit, {
      verdict: 'unknown',
      outcome: 'stale',
      reason_code: 'evidence_invalidated',
      observation_packet_ref: null,
      non_confirming_signal_status: invalidated.claim.claimed_status,
      reconciliation_required: true,
      authority_ref: invalidated.scope.authority_ref,
    });
  }

  const uncertain = related.find((packet) => UNCERTAIN_STATUSES.includes(packet.claim.claimed_status));
  if (uncertain) {
    return makeConfirmation(input, related, audit, {
      verdict: 'unknown',
      outcome: uncertain.claim.claimed_status,
      reason_code: uncertain.claim.claimed_status === 'interrupted_unknown'
        ? 'interrupted_requires_reconciliation'
        : 'evidence_invalidated',
      observation_packet_ref: isObservationPacket(uncertain) ? uncertain.packet_id : null,
      non_confirming_signal_status: null,
      reconciliation_required: true,
      authority_ref: uncertain.scope.authority_ref,
    });
  }

  const observations = related.filter(isObservationPacket);
  const verifiedObservation = observations.find((packet) => packet.trust === 'verified' || packet.trust === 'attested');
  if (verifiedObservation) {
    const outcome = verifiedObservation.claim.claimed_status;
    const terminal = outcome === 'completed' || outcome === 'failed' || outcome === 'cancelled';
    return makeConfirmation(input, related, audit, {
      verdict: terminal && audit.valid ? 'confirmed' : 'unknown',
      outcome,
      reason_code: terminal && audit.valid ? 'effect_observation_confirmed' : 'correlation_mismatch',
      observation_packet_ref: verifiedObservation.packet_id,
      non_confirming_signal_status: null,
      reconciliation_required: !terminal || !audit.valid,
      authority_ref: verifiedObservation.scope.authority_ref,
    });
  }

  if (observations.length > 0) {
    const observation = observations[0];
    return makeConfirmation(input, related, audit, {
      verdict: 'unknown',
      outcome: observation.claim.claimed_status,
      reason_code: 'observation_verification_required',
      observation_packet_ref: observation.packet_id,
      non_confirming_signal_status: null,
      reconciliation_required: true,
      authority_ref: observation.scope.authority_ref,
    });
  }

  const signal = related[0];
  return makeConfirmation(input, related, audit, {
    verdict: 'unknown',
    outcome: 'unknown',
    reason_code: 'transport_or_provider_not_confirmation',
    observation_packet_ref: null,
    non_confirming_signal_status: signal.claim.claimed_status,
    reconciliation_required: true,
    authority_ref: signal.scope.authority_ref,
  });
}

export function reconcileInterruptedEffect(input: EffectConfirmationInput): InterruptedEffectReconciliation {
  const replayPacketRefs = input.packets
    .filter((packet) => packetMatchesEffect(packet, input.effect_ref) && (packet.evidence_type === 'replay' || packet.evidence_type === 'reconciliation'))
    .map((packet) => packet.packet_id);
  const confirmation = reconcileEffectConfirmation(input);
  return {
    status: replayPacketRefs.length > 0 && confirmation.verdict === 'confirmed' ? 'reconciled' : 'unknown',
    replay_packet_refs: replayPacketRefs,
    confirmation,
  };
}

function mergeRefs(existing: readonly string[], additions: readonly string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

export function buildTaskEvidenceReference(
  taskRef: string,
  existingEvidenceRefs: readonly string[],
  packetRefs: readonly string[],
): TaskEvidenceReference {
  return {
    task_ref: taskRef,
    evidence_refs: mergeRefs(existingEvidenceRefs, packetRefs),
    evidence_packet_refs: mergeRefs([], packetRefs),
  };
}

export function buildRuntimeEvidenceReference(
  runtimeRequestRef: string,
  effectRef: string | null,
  packetRefs: readonly string[],
  confirmationRef: string | null,
): RuntimeEvidenceReference {
  return {
    runtime_request_ref: runtimeRequestRef,
    effect_ref: effectRef,
    evidence_packet_refs: mergeRefs([], packetRefs),
    confirmation_ref: confirmationRef,
  };
}
