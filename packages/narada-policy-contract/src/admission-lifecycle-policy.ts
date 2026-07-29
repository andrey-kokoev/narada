export const ADMISSION_POLICY_SCHEMA = 'narada.admission_policy.v1' as const;
export const ADMISSION_DECISION_SCHEMA = 'narada.admission_decision.v1' as const;
export const OBJECT_LIFECYCLE_POLICY_SCHEMA = 'narada.object_lifecycle_policy.v1' as const;
export const OBJECT_LIFECYCLE_DECISION_SCHEMA = 'narada.object_lifecycle_decision.v1' as const;

export type AdmissionOutcome = 'accepted' | 'queued' | 'rejected' | 'delayed' | 'review_required';
export type AdmissionIngressKind =
  | 'operator_message'
  | 'email_intake'
  | 'inbox_task_creation'
  | 'remote_operator_input'
  | 'projection_ingress';
export type AdmissionPayloadKind =
  | 'operator_text'
  | 'inbox_event'
  | 'email_fact'
  | 'task_request'
  | 'remote_input'
  | 'projection_event';
export type AdmissionRetryMode = 'none' | 'retryable' | 'retry_after' | 'operator_review';
export type AdmissionBackpressureMode = 'none' | 'queue' | 'delay' | 'review' | 'reject';

export interface PolicyOwner {
  kind: 'site' | 'host' | 'user' | 'system';
  ref: string;
}

export interface AdmissionRetryPolicy {
  mode: AdmissionRetryMode;
  attempt: number;
  max_attempts?: number;
  retry_after_ms?: number;
}

export interface AdmissionBackpressurePolicy {
  mode: AdmissionBackpressureMode;
  queue_ref?: string;
  retry_after_ms?: number;
  capacity_remaining?: number;
}

export interface AdmissionAuditPolicy {
  required: boolean;
  event_type: 'admission_decision';
  retention_ref: string;
}

export interface AdmissionPolicy {
  schema: typeof ADMISSION_POLICY_SCHEMA;
  policy_id: string;
  revision: number;
  owner: PolicyOwner;
  permitted_ingress: readonly AdmissionIngressKind[];
  permitted_payload_kinds: readonly AdmissionPayloadKind[];
  default_retry: AdmissionRetryPolicy;
  default_backpressure: AdmissionBackpressurePolicy;
  audit: AdmissionAuditPolicy;
}

export interface AdmissionEvaluationContext {
  policy: AdmissionPolicy;
  ingress_kind: AdmissionIngressKind;
  payload_kind: AdmissionPayloadKind;
  source_ref: string;
  target_authority_ref: string;
  actor_ref: string;
  authorized: boolean;
  source_stale: boolean;
  review_required: boolean;
  turn_state: 'idle' | 'active' | 'unknown';
  capacity: 'available' | 'queueable' | 'full';
  attempt: number;
  now: string;
  decision_id?: string;
  evidence_refs?: readonly string[];
}

export interface AdmissionHookDecision {
  outcome: AdmissionOutcome;
  reason_code: string;
  site_policy_ref: string;
  retry?: AdmissionRetryPolicy;
  backpressure?: AdmissionBackpressurePolicy;
  evidence_refs?: readonly string[];
}

export type AdmissionPolicyHook = (context: AdmissionEvaluationContext) => AdmissionHookDecision | null;

export interface AdmissionDecision {
  schema: typeof ADMISSION_DECISION_SCHEMA;
  decision_id: string;
  policy_ref: string;
  policy_revision: number;
  outcome: AdmissionOutcome;
  ingress_kind: AdmissionIngressKind;
  source_ref: string;
  target_authority_ref: string;
  actor_ref: string;
  reason_code: string;
  retry: AdmissionRetryPolicy;
  backpressure: AdmissionBackpressurePolicy;
  site_governance: {
    policy_ref: string;
    hook_applied: boolean;
    authority_preserved: true;
  };
  audit: {
    required: boolean;
    event_type: 'admission_decision';
    recorded_at: string;
    actor_ref: string;
    source_ref: string;
    target_authority_ref: string;
    evidence_refs: readonly string[];
  };
}

const ADMISSION_INGRESS_SET = new Set<string>([
  'operator_message',
  'email_intake',
  'inbox_task_creation',
  'remote_operator_input',
  'projection_ingress',
]);

const ADMISSION_PAYLOAD_SET = new Set<string>([
  'operator_text',
  'inbox_event',
  'email_fact',
  'task_request',
  'remote_input',
  'projection_event',
]);

const ADMISSION_STRICTNESS: Readonly<Record<AdmissionOutcome, number>> = {
  accepted: 0,
  queued: 1,
  delayed: 2,
  review_required: 3,
  rejected: 4,
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`admission_policy_${field}_required`);
  }
  return value.trim();
}

export function assertAdmissionPolicy(value: unknown): asserts value is AdmissionPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('admission_policy_record_required');
  }
  const policy = value as Partial<AdmissionPolicy>;
  if (policy.schema !== ADMISSION_POLICY_SCHEMA) throw new Error('admission_policy_schema_invalid');
  requiredString(policy.policy_id, 'policy_id');
  if (!Number.isSafeInteger(policy.revision) || (policy.revision ?? 0) < 1) {
    throw new Error('admission_policy_revision_invalid');
  }
  if (!policy.owner || typeof policy.owner !== 'object') throw new Error('admission_policy_owner_required');
  requiredString(policy.owner.ref, 'owner_ref');
  if (!policy.owner.kind || !['site', 'host', 'user', 'system'].includes(policy.owner.kind)) {
    throw new Error('admission_policy_owner_kind_invalid');
  }
  if (!Array.isArray(policy.permitted_ingress) || policy.permitted_ingress.length === 0) {
    throw new Error('admission_policy_permitted_ingress_required');
  }
  for (const ingress of policy.permitted_ingress) {
    if (!ADMISSION_INGRESS_SET.has(ingress)) throw new Error(`admission_policy_ingress_invalid:${String(ingress)}`);
  }
  if (!Array.isArray(policy.permitted_payload_kinds) || policy.permitted_payload_kinds.length === 0) {
    throw new Error('admission_policy_permitted_payload_kinds_required');
  }
  for (const payloadKind of policy.permitted_payload_kinds) {
    if (!ADMISSION_PAYLOAD_SET.has(payloadKind)) throw new Error(`admission_policy_payload_kind_invalid:${String(payloadKind)}`);
  }
  if (!policy.audit || policy.audit.event_type !== 'admission_decision') {
    throw new Error('admission_policy_audit_invalid');
  }
  requiredString(policy.audit.retention_ref, 'audit_retention_ref');
}

export function createDefaultAdmissionPolicy(overrides: {
  policy_id?: string;
  revision?: number;
  owner?: PolicyOwner;
  permitted_ingress?: readonly AdmissionIngressKind[];
  permitted_payload_kinds?: readonly AdmissionPayloadKind[];
  default_retry?: AdmissionRetryPolicy;
  default_backpressure?: AdmissionBackpressurePolicy;
  audit?: AdmissionAuditPolicy;
} = {}): AdmissionPolicy {
  const policy: AdmissionPolicy = {
    schema: ADMISSION_POLICY_SCHEMA,
    policy_id: overrides.policy_id ?? 'policy:nars-admission-default',
    revision: overrides.revision ?? 1,
    owner: overrides.owner ?? { kind: 'system', ref: 'narada:nars' },
    permitted_ingress: overrides.permitted_ingress ?? [
      'operator_message',
      'email_intake',
      'inbox_task_creation',
      'remote_operator_input',
      'projection_ingress',
    ],
    permitted_payload_kinds: overrides.permitted_payload_kinds ?? [
      'operator_text',
      'inbox_event',
      'email_fact',
      'task_request',
      'remote_input',
      'projection_event',
    ],
    default_retry: overrides.default_retry ?? { mode: 'retryable', attempt: 0, max_attempts: 3 },
    default_backpressure: overrides.default_backpressure ?? { mode: 'queue', queue_ref: 'queue:nars-input' },
    audit: overrides.audit ?? {
      required: true,
      event_type: 'admission_decision',
      retention_ref: 'retention:canonical-event-journal',
    },
  };
  assertAdmissionPolicy(policy);
  return policy;
}

function retryForOutcome(
  outcome: AdmissionOutcome,
  context: AdmissionEvaluationContext,
  override?: AdmissionRetryPolicy,
): AdmissionRetryPolicy {
  if (override) return { ...override, attempt: context.attempt };
  if (outcome === 'accepted' || outcome === 'rejected') return { mode: 'none', attempt: context.attempt };
  if (outcome === 'review_required') return { mode: 'operator_review', attempt: context.attempt };
  return { ...context.policy.default_retry, attempt: context.attempt };
}

function backpressureForOutcome(
  outcome: AdmissionOutcome,
  context: AdmissionEvaluationContext,
  override?: AdmissionBackpressurePolicy,
): AdmissionBackpressurePolicy {
  if (override) return { ...override };
  if (outcome === 'accepted') return { mode: 'none' };
  if (outcome === 'rejected') return { mode: 'reject' };
  if (outcome === 'review_required') return { mode: 'review' };
  if (outcome === 'queued') return { ...context.policy.default_backpressure, mode: 'queue' };
  return { ...context.policy.default_backpressure, mode: 'delay' };
}

function makeAdmissionDecision(
  context: AdmissionEvaluationContext,
  selection: AdmissionHookDecision,
  hookApplied: boolean,
): AdmissionDecision {
  const decisionId = context.decision_id ?? `admission:${context.policy.policy_id}:${context.source_ref}:${context.attempt}`;
  const evidenceRefs = Object.freeze([
    ...(context.evidence_refs ?? []),
    `policy:${context.policy.policy_id}@${context.policy.revision}`,
    ...(selection.evidence_refs ?? []),
  ]);
  return {
    schema: ADMISSION_DECISION_SCHEMA,
    decision_id: decisionId,
    policy_ref: context.policy.policy_id,
    policy_revision: context.policy.revision,
    outcome: selection.outcome,
    ingress_kind: context.ingress_kind,
    source_ref: context.source_ref,
    target_authority_ref: context.target_authority_ref,
    actor_ref: context.actor_ref,
    reason_code: selection.reason_code,
    retry: retryForOutcome(selection.outcome, context, selection.retry),
    backpressure: backpressureForOutcome(selection.outcome, context, selection.backpressure),
    site_governance: {
      policy_ref: selection.site_policy_ref,
      hook_applied: hookApplied,
      authority_preserved: true,
    },
    audit: {
      required: context.policy.audit.required,
      event_type: context.policy.audit.event_type,
      recorded_at: context.now,
      actor_ref: context.actor_ref,
      source_ref: context.source_ref,
      target_authority_ref: context.target_authority_ref,
      evidence_refs: evidenceRefs,
    },
  };
}

function defaultAdmissionSelection(context: AdmissionEvaluationContext): AdmissionHookDecision {
  if (!context.authorized) {
    return { outcome: 'rejected', reason_code: 'unauthorized_source', site_policy_ref: context.policy.owner.ref };
  }
  if (context.source_stale) {
    return { outcome: 'rejected', reason_code: 'stale_source', site_policy_ref: context.policy.owner.ref };
  }
  if (!context.policy.permitted_ingress.includes(context.ingress_kind)) {
    return { outcome: 'rejected', reason_code: 'ingress_kind_not_permitted', site_policy_ref: context.policy.owner.ref };
  }
  if (!context.policy.permitted_payload_kinds.includes(context.payload_kind)) {
    return { outcome: 'rejected', reason_code: 'payload_kind_not_permitted', site_policy_ref: context.policy.owner.ref };
  }
  if (context.review_required) {
    return { outcome: 'review_required', reason_code: 'review_gate_required', site_policy_ref: context.policy.owner.ref };
  }
  if (context.turn_state === 'unknown') {
    return { outcome: 'delayed', reason_code: 'turn_state_unknown', site_policy_ref: context.policy.owner.ref };
  }
  if (context.turn_state === 'active') {
    return { outcome: 'delayed', reason_code: 'active_turn_backpressure', site_policy_ref: context.policy.owner.ref };
  }
  if (context.capacity === 'queueable') {
    return { outcome: 'queued', reason_code: 'capacity_queue', site_policy_ref: context.policy.owner.ref };
  }
  if (context.capacity === 'full') {
    return { outcome: 'delayed', reason_code: 'capacity_delay', site_policy_ref: context.policy.owner.ref };
  }
  return { outcome: 'accepted', reason_code: 'admitted', site_policy_ref: context.policy.owner.ref };
}

export function evaluateAdmissionPolicy(
  context: AdmissionEvaluationContext,
  siteHook?: AdmissionPolicyHook,
): AdmissionDecision {
  assertAdmissionPolicy(context.policy);
  if (!Number.isSafeInteger(context.attempt) || context.attempt < 0) throw new Error('admission_attempt_invalid');
  const baseline = defaultAdmissionSelection(context);
  if (!siteHook) return makeAdmissionDecision(context, baseline, false);

  const siteDecision = siteHook(context);
  if (!siteDecision) return makeAdmissionDecision(context, baseline, false);
  requiredString(siteDecision.site_policy_ref, 'site_policy_ref');
  const baselineStrictness = ADMISSION_STRICTNESS[baseline.outcome];
  const siteStrictness = ADMISSION_STRICTNESS[siteDecision.outcome];
  if (siteStrictness < baselineStrictness) {
    return makeAdmissionDecision(context, {
      outcome: 'rejected',
      reason_code: 'site_hook_relaxation_refused',
      site_policy_ref: siteDecision.site_policy_ref,
      evidence_refs: siteDecision.evidence_refs,
    }, true);
  }
  return makeAdmissionDecision(context, siteDecision, true);
}

export type LifecycleObjectFamily =
  | 'task'
  | 'session'
  | 'projection'
  | 'artifact'
  | 'attachment'
  | 'grant'
  | 'loop'
  | 'health_record';

export type SharedLifecyclePhase =
  | 'proposed'
  | 'active'
  | 'held'
  | 'stale'
  | 'revoked'
  | 'closing'
  | 'terminal'
  | 'archived'
  | 'failed';

export type LifecycleOperation = 'transition' | 'reconcile' | 'revoke' | 'archive' | 'reopen' | 'replay' | 'cleanup';
export type LifecycleReplayEvidence = 'verified' | 'pending' | 'mismatch' | 'not_attempted';

export interface ObjectLifecycleStateModel {
  states: readonly string[];
  initial_states: readonly string[];
  terminal_states: readonly string[];
  transitions: Readonly<Record<string, readonly string[]>>;
  phase_by_state: Readonly<Record<string, SharedLifecyclePhase>>;
}

export interface ObjectLifecyclePolicy {
  schema: typeof OBJECT_LIFECYCLE_POLICY_SCHEMA;
  policy_id: string;
  revision: number;
  object_family: LifecycleObjectFamily;
  owner: PolicyOwner;
  state_model: ObjectLifecycleStateModel;
  governance: {
    owner_ref: string;
    mutation_authority_ref: string;
    actor_refs: readonly string[];
    object_specific_hook_ref: string;
    reopen_from: readonly string[];
    reopen_to: string;
  };
  retention: {
    mode: 'explicit_archive' | 'ttl' | 'site_defined';
    archive_state: string;
    archive_from: readonly string[];
    cleanup_requires_archive: true;
    retention_ref: string;
    retention_ms?: number;
  };
  revocation: {
    enabled: boolean;
    revocable_states: readonly string[];
    operation: 'revoke';
  };
  stale: {
    detection: 'revision_or_observation_mismatch' | 'source_health' | 'site_defined';
    mutation: 'refuse_until_reconciled';
    reconciliation_operation: 'reconcile';
  };
  replay: {
    mode: 'durable_evidence' | 'not_supported';
    required_evidence: 'verified_replay' | 'none';
  };
  audit: {
    required: true;
    event_type: 'object_lifecycle_decision';
    retention_ref: string;
  };
}

export interface ObjectLifecyclePolicyInput extends Omit<ObjectLifecyclePolicy, 'schema'> {}

export type LifecycleTransitionCode =
  | 'allowed'
  | 'cleanup_allowed'
  | 'replay_allowed'
  | 'reconciled'
  | 'reopened'
  | 'unauthorized_actor'
  | 'unauthorized_authority'
  | 'stale_revision'
  | 'stale_object'
  | 'unknown_state'
  | 'invalid_transition'
  | 'terminal_state'
  | 'revoke_requires_operation'
  | 'archive_requires_operation'
  | 'cleanup_requires_archive'
  | 'replay_evidence_required'
  | 'reopen_not_allowed';

export interface ObjectLifecycleTransitionRequest {
  policy: ObjectLifecyclePolicy;
  object_id: string;
  actor_ref: string;
  authority_ref: string;
  current_state: string;
  next_state: string;
  expected_revision: number;
  observed_revision: number;
  stale: boolean;
  operation: LifecycleOperation;
  replay_evidence?: LifecycleReplayEvidence;
  evidence_refs?: readonly string[];
  now: string;
}

export interface ObjectLifecycleDecision {
  schema: typeof OBJECT_LIFECYCLE_DECISION_SCHEMA;
  policy_ref: string;
  policy_revision: number;
  object_family: LifecycleObjectFamily;
  object_id: string;
  operation: LifecycleOperation;
  allowed: boolean;
  code: LifecycleTransitionCode;
  message: string;
  current_state: string;
  next_state: string;
  shared_phase: SharedLifecyclePhase | null;
  object_specific_hook_ref: string;
  evidence: {
    required: true;
    replay: LifecycleReplayEvidence;
    refs: readonly string[];
  };
  audit: {
    required: true;
    event_type: 'object_lifecycle_decision';
    recorded_at: string;
    actor_ref: string;
    authority_ref: string;
    evidence_refs: readonly string[];
  };
}

export function createObjectLifecyclePolicy(input: ObjectLifecyclePolicyInput): ObjectLifecyclePolicy {
  const policy: ObjectLifecyclePolicy = { schema: OBJECT_LIFECYCLE_POLICY_SCHEMA, ...input };
  if (!policy.policy_id || !policy.owner.ref || !policy.governance.mutation_authority_ref) {
    throw new Error('object_lifecycle_policy_identity_required');
  }
  if (policy.revision < 1 || !Number.isSafeInteger(policy.revision)) {
    throw new Error('object_lifecycle_policy_revision_invalid');
  }
  if (!policy.state_model.states.includes(policy.retention.archive_state)) {
    throw new Error('object_lifecycle_policy_archive_state_invalid');
  }
  for (const state of policy.state_model.states) {
    if (!policy.state_model.phase_by_state[state]) throw new Error(`object_lifecycle_policy_phase_missing:${state}`);
    if (!policy.state_model.transitions[state]) throw new Error(`object_lifecycle_policy_transition_missing:${state}`);
  }
  return policy;
}

function lifecycleDefinition(
  objectFamily: LifecycleObjectFamily,
  states: readonly string[],
  initialStates: readonly string[],
  terminalStates: readonly string[],
  transitions: Readonly<Record<string, readonly string[]>>,
  phaseByState: Readonly<Record<string, SharedLifecyclePhase>>,
  options: {
    mutationAuthorityRef: string;
    actorRefs?: readonly string[];
    hookRef: string;
    reopenFrom?: readonly string[];
    reopenTo?: string;
    revocableStates?: readonly string[];
    staleDetection?: ObjectLifecyclePolicy['stale']['detection'];
    replayMode?: ObjectLifecyclePolicy['replay']['mode'];
  },
): ObjectLifecyclePolicy {
  return createObjectLifecyclePolicy({
    policy_id: `policy:lifecycle:${objectFamily}`,
    revision: 1,
    object_family: objectFamily,
    owner: { kind: 'system', ref: `narada:${objectFamily}` },
    state_model: {
      states,
      initial_states: initialStates,
      terminal_states: terminalStates,
      transitions,
      phase_by_state: phaseByState,
    },
    governance: {
      owner_ref: `narada:${objectFamily}`,
      mutation_authority_ref: options.mutationAuthorityRef,
      actor_refs: options.actorRefs ?? [options.mutationAuthorityRef, 'operator:direct'],
      object_specific_hook_ref: options.hookRef,
      reopen_from: options.reopenFrom ?? [],
      reopen_to: options.reopenTo ?? states[0],
    },
    retention: {
      mode: 'explicit_archive',
      archive_state: 'archived',
      archive_from: states.filter((state) => state !== 'archived'),
      cleanup_requires_archive: true,
      retention_ref: `retention:${objectFamily}`,
    },
    revocation: {
      enabled: (options.revocableStates ?? []).length > 0,
      revocable_states: options.revocableStates ?? [],
      operation: 'revoke',
    },
    stale: {
      detection: options.staleDetection ?? 'revision_or_observation_mismatch',
      mutation: 'refuse_until_reconciled',
      reconciliation_operation: 'reconcile',
    },
    replay: {
      mode: options.replayMode ?? 'durable_evidence',
      required_evidence: options.replayMode === 'not_supported' ? 'none' : 'verified_replay',
    },
    audit: {
      required: true,
      event_type: 'object_lifecycle_decision',
      retention_ref: `retention:${objectFamily}:audit`,
    },
  });
}

export function buildDefaultObjectLifecyclePolicyCatalog(): Readonly<Record<LifecycleObjectFamily, ObjectLifecyclePolicy>> {
  return Object.freeze({
    task: lifecycleDefinition(
      'task',
      ['opened', 'claimed', 'needs_continuation', 'in_review', 'deferred', 'closed', 'confirmed', 'archived'],
      ['opened'],
      ['confirmed', 'archived'],
      {
        opened: ['claimed', 'deferred', 'closed'],
        claimed: ['in_review', 'needs_continuation', 'deferred', 'closed'],
        needs_continuation: ['claimed', 'deferred', 'closed'],
        in_review: ['closed', 'needs_continuation', 'deferred'],
        deferred: ['opened', 'claimed', 'closed'],
        closed: ['confirmed', 'archived'],
        confirmed: ['archived'],
        archived: [],
      },
      {
        opened: 'active', claimed: 'active', needs_continuation: 'held', in_review: 'active',
        deferred: 'held', closed: 'closing', confirmed: 'terminal', archived: 'archived',
      },
      {
        mutationAuthorityRef: 'task-governance',
        hookRef: 'hook:task-lifecycle-governance',
        reopenFrom: ['closed', 'confirmed'],
        reopenTo: 'opened',
        revocableStates: [],
      },
    ),
    session: lifecycleDefinition(
      'session',
      ['starting', 'ready', 'closing', 'closed', 'failed', 'archived'],
      ['starting'],
      ['archived'],
      {
        starting: ['ready', 'closing', 'failed'], ready: ['closing', 'failed'],
        closing: ['closed', 'failed'], closed: ['archived'], failed: ['closed', 'archived'], archived: [],
      },
      {
        starting: 'proposed', ready: 'active', closing: 'closing', closed: 'terminal', failed: 'failed', archived: 'archived',
      },
      { mutationAuthorityRef: 'nars-session-core', hookRef: 'hook:nars-session-lifecycle', revocableStates: [] },
    ),
    projection: lifecycleDefinition(
      'projection',
      ['proposed', 'active', 'stale', 'revoked', 'archived'],
      ['proposed'],
      ['archived'],
      { proposed: ['active', 'revoked'], active: ['stale', 'revoked', 'archived'], stale: ['active', 'revoked', 'archived'], revoked: ['archived'], archived: [] },
      { proposed: 'proposed', active: 'active', stale: 'stale', revoked: 'revoked', archived: 'archived' },
      { mutationAuthorityRef: 'projection-authority', hookRef: 'hook:projection-governance', revocableStates: ['revoked'] },
    ),
    artifact: lifecycleDefinition(
      'artifact',
      ['active', 'revoked', 'expired', 'archived'],
      ['active'],
      ['archived'],
      { active: ['revoked', 'expired', 'archived'], revoked: ['archived'], expired: ['archived'], archived: [] },
      { active: 'active', revoked: 'revoked', expired: 'revoked', archived: 'archived' },
      { mutationAuthorityRef: 'nars-session-core', hookRef: 'hook:artifact-lifecycle', revocableStates: ['revoked', 'expired'] },
    ),
    attachment: lifecycleDefinition(
      'attachment',
      ['requested', 'replaying', 'live', 'closing', 'closed', 'failed', 'archived'],
      ['requested'],
      ['closed', 'failed', 'archived'],
      {
        requested: ['replaying', 'live', 'closing', 'failed'], replaying: ['live', 'closing', 'failed'],
        live: ['closing', 'failed'], closing: ['closed', 'failed'], closed: ['archived'], failed: ['archived'], archived: [],
      },
      {
        requested: 'proposed', replaying: 'held', live: 'active', closing: 'closing', closed: 'terminal', failed: 'failed', archived: 'archived',
      },
      { mutationAuthorityRef: 'nars-session-core', hookRef: 'hook:event-attachment-lifecycle', revocableStates: [] },
    ),
    grant: lifecycleDefinition(
      'grant',
      ['proposed', 'active', 'suspended', 'expired', 'revoked', 'archived'],
      ['proposed'],
      ['archived'],
      {
        proposed: ['active', 'revoked'], active: ['suspended', 'expired', 'revoked', 'archived'],
        suspended: ['active', 'expired', 'revoked'], expired: ['archived'], revoked: ['archived'], archived: [],
      },
      { proposed: 'proposed', active: 'active', suspended: 'held', expired: 'revoked', revoked: 'revoked', archived: 'archived' },
      { mutationAuthorityRef: 'grant-authority', hookRef: 'hook:grant-governance', revocableStates: ['revoked', 'expired'] },
    ),
    loop: lifecycleDefinition(
      'loop',
      ['created', 'running', 'paused', 'stale', 'stopped', 'archived'],
      ['created'],
      ['stopped', 'archived'],
      { created: ['running', 'stopped'], running: ['paused', 'stale', 'stopped'], paused: ['running', 'stopped'], stale: ['running', 'stopped'], stopped: ['archived'], archived: [] },
      { created: 'proposed', running: 'active', paused: 'held', stale: 'stale', stopped: 'terminal', archived: 'archived' },
      { mutationAuthorityRef: 'loop-authority', hookRef: 'hook:loop-governance', revocableStates: [] },
    ),
    health_record: lifecycleDefinition(
      'health_record',
      ['observed', 'degraded', 'stale', 'superseded', 'archived'],
      ['observed'],
      ['superseded', 'archived'],
      { observed: ['degraded', 'stale', 'superseded'], degraded: ['observed', 'stale', 'superseded'], stale: ['observed', 'superseded'], superseded: ['archived'], archived: [] },
      { observed: 'active', degraded: 'active', stale: 'stale', superseded: 'terminal', archived: 'archived' },
      { mutationAuthorityRef: 'health-authority', hookRef: 'hook:health-record-governance', revocableStates: [] },
    ),
  });
}

function lifecycleDecision(
  request: ObjectLifecycleTransitionRequest,
  code: LifecycleTransitionCode,
  allowed: boolean,
  message: string,
  sharedPhase: SharedLifecyclePhase | null,
  evidenceRefs: readonly string[],
): ObjectLifecycleDecision {
  const refs = Object.freeze([...evidenceRefs]);
  return {
    schema: OBJECT_LIFECYCLE_DECISION_SCHEMA,
    policy_ref: request.policy.policy_id,
    policy_revision: request.policy.revision,
    object_family: request.policy.object_family,
    object_id: request.object_id,
    operation: request.operation,
    allowed,
    code,
    message,
    current_state: request.current_state,
    next_state: request.next_state,
    shared_phase: sharedPhase,
    object_specific_hook_ref: request.policy.governance.object_specific_hook_ref,
    evidence: {
      required: true,
      replay: request.replay_evidence ?? 'not_attempted',
      refs,
    },
    audit: {
      required: true,
      event_type: 'object_lifecycle_decision',
      recorded_at: request.now,
      actor_ref: request.actor_ref,
      authority_ref: request.authority_ref,
      evidence_refs: refs,
    },
  };
}

export function evaluateObjectLifecycleTransition(
  request: ObjectLifecycleTransitionRequest,
): ObjectLifecycleDecision {
  const { policy } = request;
  const evidenceRefs = [
    ...(request.evidence_refs ?? []),
    `policy:${policy.policy_id}@${policy.revision}`,
    `object:${policy.object_family}:${request.object_id}`,
  ];
  const phase = policy.state_model.phase_by_state[request.next_state] ?? null;
  if (!policy.governance.actor_refs.includes(request.actor_ref)) {
    return lifecycleDecision(request, 'unauthorized_actor', false, 'Actor is not authorized by the object policy.', phase, evidenceRefs);
  }
  if (request.authority_ref !== policy.governance.mutation_authority_ref) {
    return lifecycleDecision(request, 'unauthorized_authority', false, 'Mutation authority does not own this object family.', phase, evidenceRefs);
  }
  if (request.expected_revision !== request.observed_revision) {
    return lifecycleDecision(request, 'stale_revision', false, 'Expected revision does not match the observed revision.', phase, evidenceRefs);
  }
  const knownStates = new Set(policy.state_model.states);
  if (!knownStates.has(request.current_state) || !knownStates.has(request.next_state)) {
    return lifecycleDecision(request, 'unknown_state', false, 'State is not declared by the object-specific policy.', phase, evidenceRefs);
  }
  if (request.stale && request.operation !== 'reconcile') {
    return lifecycleDecision(request, 'stale_object', false, 'Stale objects must be reconciled before mutation.', phase, evidenceRefs);
  }
  if (request.stale && request.operation === 'reconcile' && request.replay_evidence !== 'verified') {
    return lifecycleDecision(request, 'replay_evidence_required', false, 'Reconciliation requires verified durable replay evidence.', phase, evidenceRefs);
  }
  if (request.operation === 'cleanup') {
    if (request.current_state !== policy.retention.archive_state || request.next_state !== request.current_state) {
      return lifecycleDecision(request, 'cleanup_requires_archive', false, 'Cleanup is allowed only after archival.', phase, evidenceRefs);
    }
    return lifecycleDecision(request, 'cleanup_allowed', true, 'Archived object may be cleaned under the retention policy.', phase, evidenceRefs);
  }
  if (request.operation === 'replay') {
    if (request.replay_evidence !== 'verified') {
      return lifecycleDecision(request, 'replay_evidence_required', false, 'Replay requires verified durable evidence.', phase, evidenceRefs);
    }
    if (request.current_state !== request.next_state) {
      return lifecycleDecision(request, 'invalid_transition', false, 'Replay does not change lifecycle state.', phase, evidenceRefs);
    }
    return lifecycleDecision(request, 'replay_allowed', true, 'Durable replay evidence is verified.', phase, evidenceRefs);
  }
  const isReopen = request.operation === 'reopen';
  if (isReopen) {
    if (!policy.governance.reopen_from.includes(request.current_state) || request.next_state !== policy.governance.reopen_to) {
      return lifecycleDecision(request, 'reopen_not_allowed', false, 'This object-specific policy does not permit the requested reopen.', phase, evidenceRefs);
    }
    return lifecycleDecision(request, 'reopened', true, 'Object-specific reopen rule permits the transition.', phase, evidenceRefs);
  }
  if (request.current_state === policy.retention.archive_state) {
    return lifecycleDecision(request, 'terminal_state', false, 'Archived objects are immutable except for cleanup.', phase, evidenceRefs);
  }
  if (request.next_state === policy.retention.archive_state && request.operation !== 'archive') {
    return lifecycleDecision(request, 'archive_requires_operation', false, 'Archival must be an explicit operation.', phase, evidenceRefs);
  }
  if (policy.revocation.revocable_states.includes(request.next_state) && request.operation !== policy.revocation.operation) {
    return lifecycleDecision(request, 'revoke_requires_operation', false, 'Revocation must be an explicit operation.', phase, evidenceRefs);
  }
  const explicitArchiveFromTerminal = request.operation === 'archive'
    && request.next_state === policy.retention.archive_state
    && policy.state_model.transitions[request.current_state]?.includes(request.next_state);
  if (policy.state_model.terminal_states.includes(request.current_state) && !explicitArchiveFromTerminal) {
    return lifecycleDecision(request, 'terminal_state', false, 'Terminal objects cannot transition without an explicit object-specific reopen rule.', phase, evidenceRefs);
  }
  if (!policy.state_model.transitions[request.current_state]?.includes(request.next_state)) {
    return lifecycleDecision(request, 'invalid_transition', false, 'Transition is not allowed by the object-specific policy.', phase, evidenceRefs);
  }
  if (request.operation === 'reconcile') {
    return lifecycleDecision(request, 'reconciled', true, 'Stale state was reconciled with verified evidence.', phase, evidenceRefs);
  }
  return lifecycleDecision(request, 'allowed', true, 'Transition is authorized by the shared lifecycle algebra and object policy.', phase, evidenceRefs);
}
