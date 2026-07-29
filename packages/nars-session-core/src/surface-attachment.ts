export const NARS_SURFACE_ATTACHMENT_SCHEMA = 'narada.nars.surface_attachment.v1' as const;
export const NARS_SURFACE_ATTACHMENT_SUMMARY_SCHEMA = 'narada.nars.surface_attachment_summary.v1' as const;
export const NARS_SURFACE_ATTACHMENT_REFUSAL_SCHEMA = 'narada.nars.surface_attachment_refusal.v1' as const;

export const NARS_SURFACE_ATTACHMENT_STATES = Object.freeze([
  'requested',
  'discovering',
  'probing_health',
  'attached',
  'reconnecting',
  'stale',
  'detaching',
  'detached',
  'failed',
] as const);
export type NarsSurfaceAttachmentState = typeof NARS_SURFACE_ATTACHMENT_STATES[number];

export const NARS_SURFACE_ATTACHMENT_HEALTH_STATES = Object.freeze([
  'unknown',
  'healthy',
  'degraded',
  'unavailable',
  'stale',
] as const);
export type NarsSurfaceAttachmentHealthState = typeof NARS_SURFACE_ATTACHMENT_HEALTH_STATES[number];

export const NARS_SURFACE_ATTACHMENT_TRANSITIONS: Readonly<Record<NarsSurfaceAttachmentState, readonly NarsSurfaceAttachmentState[]>> = Object.freeze({
  requested: ['discovering', 'failed'],
  discovering: ['probing_health', 'failed'],
  probing_health: ['attached', 'reconnecting', 'stale', 'failed'],
  attached: ['reconnecting', 'stale', 'detaching', 'failed'],
  reconnecting: ['probing_health', 'attached', 'stale', 'detaching', 'failed'],
  stale: ['reconnecting', 'detaching', 'detached', 'failed'],
  detaching: ['detached', 'failed'],
  detached: [],
  failed: [],
});

export const NARS_SURFACE_ATTACHMENT_REFUSAL_CODES = Object.freeze({
  INVALID_REQUEST: 'surface_attachment_invalid_request',
  SESSION_NOT_FOUND: 'surface_attachment_session_not_found',
  SESSION_AMBIGUOUS: 'surface_attachment_session_ambiguous',
  SESSION_STALE: 'surface_attachment_session_stale',
  SESSION_HEALTH_UNAVAILABLE: 'surface_attachment_session_health_unavailable',
  ENDPOINT_UNAVAILABLE: 'surface_attachment_endpoint_unavailable',
  AUTHORITY_MISMATCH: 'surface_attachment_authority_mismatch',
  TERMINAL: 'surface_attachment_terminal',
});
export type NarsSurfaceAttachmentRefusalCode = typeof NARS_SURFACE_ATTACHMENT_REFUSAL_CODES[keyof typeof NARS_SURFACE_ATTACHMENT_REFUSAL_CODES];

export interface NarsSurfaceAttachmentCursor {
  last_sequence: number | null;
  next_sequence: number | null;
}

export interface NarsSurfaceAttachmentFailure {
  code: string;
  message: string;
  at: string;
  details?: Record<string, unknown>;
}

export interface NarsSurfaceAttachment {
  schema: typeof NARS_SURFACE_ATTACHMENT_SCHEMA;
  attachment_id: string;
  session_id: string;
  authority_runtime_id: string | null;
  surface_kind: string;
  surface_instance_id: string;
  projection_mode: string;
  view_policy: string | null;
  permission_set: string[];
  event_cursor: NarsSurfaceAttachmentCursor;
  event_endpoint: string | null;
  health_endpoint: string | null;
  attach_source: string;
  attachment_state: NarsSurfaceAttachmentState;
  health_state: NarsSurfaceAttachmentHealthState;
  created_at: string;
  updated_at: string;
  attached_at: string | null;
  detached_at: string | null;
  failure: NarsSurfaceAttachmentFailure | null;
  metadata: Record<string, unknown>;
}

export interface NarsSurfaceAttachmentCreateOptions {
  attachment_id: string;
  session_id: string;
  authority_runtime_id?: string | null;
  surface_kind: string;
  surface_instance_id: string;
  projection_mode?: string;
  view_policy?: string | null;
  permission_set?: readonly string[];
  event_cursor?: Partial<NarsSurfaceAttachmentCursor> | null;
  event_endpoint?: string | null;
  health_endpoint?: string | null;
  attach_source?: string;
  now?: string;
  metadata?: Record<string, unknown>;
}

export interface NarsSurfaceAttachmentTransitionEvidence extends Record<string, unknown> {
  now?: string;
  reason?: string;
  health_state?: NarsSurfaceAttachmentHealthState;
  event_cursor?: Partial<NarsSurfaceAttachmentCursor> | null;
  failure?: NarsSurfaceAttachmentFailure | null;
}

export interface NarsSurfaceAttachmentTransitionResult {
  changed: boolean;
  previous_record: NarsSurfaceAttachment;
  record: NarsSurfaceAttachment;
}

export interface NarsSurfaceAttachmentSummary {
  schema: typeof NARS_SURFACE_ATTACHMENT_SUMMARY_SCHEMA;
  count: number;
  attached_count: number;
  reconnecting_count: number;
  stale_count: number;
  detached_count: number;
  failed_count: number;
  health_counts: Record<NarsSurfaceAttachmentHealthState, number>;
}

export interface NarsSurfaceAttachmentRefusal {
  schema: typeof NARS_SURFACE_ATTACHMENT_REFUSAL_SCHEMA;
  code: NarsSurfaceAttachmentRefusalCode;
  message: string;
  session_id: string | null;
  surface_kind: string | null;
  candidates: readonly Record<string, unknown>[];
}

const STATE_SET = new Set<string>(NARS_SURFACE_ATTACHMENT_STATES);
const HEALTH_SET = new Set<string>(NARS_SURFACE_ATTACHMENT_HEALTH_STATES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requiredString(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`surface_attachment_${field}_required`);
  return normalized;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown, field: string, fallback: string): string {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (!Number.isFinite(Date.parse(candidate))) throw new Error(`surface_attachment_${field}_invalid`);
  return candidate;
}

function normalizeCursor(value: unknown): NarsSurfaceAttachmentCursor {
  const record = isRecord(value) ? value : {};
  const last = record.last_sequence;
  const next = record.next_sequence;
  return {
    last_sequence: last === null || last === undefined ? null : Number.isSafeInteger(last) ? Number(last) : null,
    next_sequence: next === null || next === undefined ? null : Number.isSafeInteger(next) ? Number(next) : null,
  };
}

function cloneAttachment(record: NarsSurfaceAttachment): NarsSurfaceAttachment {
  return {
    ...record,
    permission_set: [...record.permission_set],
    event_cursor: { ...record.event_cursor },
    failure: record.failure ? {
      ...record.failure,
      ...(record.failure.details ? { details: { ...record.failure.details } } : {}),
    } : null,
    metadata: { ...record.metadata },
  };
}

export function isNarsSurfaceAttachmentState(value: unknown): value is NarsSurfaceAttachmentState {
  return typeof value === 'string' && STATE_SET.has(value);
}

export function isNarsSurfaceAttachmentHealthState(value: unknown): value is NarsSurfaceAttachmentHealthState {
  return typeof value === 'string' && HEALTH_SET.has(value);
}

export function canTransitionNarsSurfaceAttachment(previousState: unknown, nextState: unknown): boolean {
  if (!isNarsSurfaceAttachmentState(previousState) || !isNarsSurfaceAttachmentState(nextState)) return false;
  if (previousState === nextState) return true;
  return NARS_SURFACE_ATTACHMENT_TRANSITIONS[previousState].includes(nextState);
}

export function assertNarsSurfaceAttachmentTransition(previousState: unknown, nextState: unknown): asserts nextState is NarsSurfaceAttachmentState {
  if (!canTransitionNarsSurfaceAttachment(previousState, nextState)) {
    throw new Error(`invalid_nars_surface_attachment_transition:${String(previousState)}:${String(nextState)}`);
  }
}

export function normalizeNarsSurfaceAttachment(value: unknown): NarsSurfaceAttachment {
  if (!isRecord(value)) throw new Error('surface_attachment_record_required');
  if (value.schema !== NARS_SURFACE_ATTACHMENT_SCHEMA) throw new Error(`surface_attachment_schema_invalid:${String(value.schema)}`);
  const now = timestamp(value.updated_at, 'updated_at', new Date(0).toISOString());
  const attachmentState = value.attachment_state;
  const healthState = value.health_state;
  if (!isNarsSurfaceAttachmentState(attachmentState)) throw new Error(`surface_attachment_state_invalid:${String(attachmentState)}`);
  if (!isNarsSurfaceAttachmentHealthState(healthState)) throw new Error(`surface_attachment_health_invalid:${String(healthState)}`);
  const permissionSet = Array.isArray(value.permission_set)
    ? value.permission_set.filter((permission): permission is string => typeof permission === 'string').map((permission) => permission.trim()).filter(Boolean)
    : [];
  const failureValue = value.failure;
  let failure: NarsSurfaceAttachmentFailure | null = null;
  if (failureValue !== null && failureValue !== undefined) {
    if (!isRecord(failureValue)) throw new Error('surface_attachment_failure_invalid');
    failure = {
      code: requiredString(failureValue.code, 'failure_code'),
      message: requiredString(failureValue.message, 'failure_message'),
      at: timestamp(failureValue.at, 'failure_at', now),
      ...(isRecord(failureValue.details) ? { details: { ...failureValue.details } } : {}),
    };
  }
  return {
    schema: NARS_SURFACE_ATTACHMENT_SCHEMA,
    attachment_id: requiredString(value.attachment_id, 'attachment_id'),
    session_id: requiredString(value.session_id, 'session_id'),
    authority_runtime_id: nullableString(value.authority_runtime_id),
    surface_kind: requiredString(value.surface_kind, 'surface_kind'),
    surface_instance_id: requiredString(value.surface_instance_id, 'surface_instance_id'),
    projection_mode: requiredString(value.projection_mode ?? 'live', 'projection_mode'),
    view_policy: nullableString(value.view_policy),
    permission_set: [...new Set(permissionSet)],
    event_cursor: normalizeCursor(value.event_cursor),
    event_endpoint: nullableString(value.event_endpoint),
    health_endpoint: nullableString(value.health_endpoint),
    attach_source: requiredString(value.attach_source ?? 'manual', 'attach_source'),
    attachment_state: attachmentState,
    health_state: healthState,
    created_at: timestamp(value.created_at, 'created_at', now),
    updated_at: now,
    attached_at: timestampOrNull(value.attached_at, 'attached_at'),
    detached_at: timestampOrNull(value.detached_at, 'detached_at'),
    failure,
    metadata: isRecord(value.metadata) ? { ...value.metadata } : {},
  };
}

function timestampOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return timestamp(value, field, new Date(0).toISOString());
}

export function createNarsSurfaceAttachment(options: NarsSurfaceAttachmentCreateOptions): NarsSurfaceAttachment {
  const now = timestamp(options.now, 'now', new Date().toISOString());
  return normalizeNarsSurfaceAttachment({
    schema: NARS_SURFACE_ATTACHMENT_SCHEMA,
    attachment_id: options.attachment_id,
    session_id: options.session_id,
    authority_runtime_id: options.authority_runtime_id ?? null,
    surface_kind: options.surface_kind,
    surface_instance_id: options.surface_instance_id,
    projection_mode: options.projection_mode ?? 'live',
    view_policy: options.view_policy ?? null,
    permission_set: options.permission_set ?? [],
    event_cursor: options.event_cursor ?? { last_sequence: null, next_sequence: null },
    event_endpoint: options.event_endpoint ?? null,
    health_endpoint: options.health_endpoint ?? null,
    attach_source: options.attach_source ?? 'manual',
    attachment_state: 'requested',
    health_state: 'unknown',
    created_at: now,
    updated_at: now,
    attached_at: null,
    detached_at: null,
    failure: null,
    metadata: options.metadata ?? {},
  });
}

export function transitionNarsSurfaceAttachment(
  attachment: NarsSurfaceAttachment,
  nextState: NarsSurfaceAttachmentState,
  evidence: NarsSurfaceAttachmentTransitionEvidence = {},
): NarsSurfaceAttachmentTransitionResult {
  const current = normalizeNarsSurfaceAttachment(attachment);
  assertNarsSurfaceAttachmentTransition(current.attachment_state, nextState);
  if (current.attachment_state === nextState) return { changed: false, previous_record: cloneAttachment(current), record: cloneAttachment(current) };
  const updatedAt = timestamp(evidence.now, 'now', new Date().toISOString());
  const nextHealth = evidence.health_state && isNarsSurfaceAttachmentHealthState(evidence.health_state)
    ? evidence.health_state
    : current.health_state;
  const nextCursor = evidence.event_cursor === undefined ? current.event_cursor : normalizeCursor(evidence.event_cursor);
  const failure = evidence.failure === null
    ? null
    : evidence.failure && isRecord(evidence.failure)
      ? normalizeFailure(evidence.failure, updatedAt)
      : nextState === 'failed' && typeof evidence.error === 'string'
        ? { code: 'surface_attachment_failed', message: evidence.error, at: updatedAt }
        : current.failure;
  const next = normalizeNarsSurfaceAttachment({
    ...current,
    attachment_state: nextState,
    health_state: nextHealth,
    event_cursor: nextCursor,
    updated_at: updatedAt,
    attached_at: nextState === 'attached' ? current.attached_at ?? updatedAt : current.attached_at,
    detached_at: nextState === 'detached' || nextState === 'failed' ? current.detached_at ?? updatedAt : current.detached_at,
    failure,
    metadata: {
      ...current.metadata,
      ...(typeof evidence.reason === 'string' && evidence.reason.trim() ? { last_transition_reason: evidence.reason.trim() } : {}),
    },
  });
  return { changed: true, previous_record: cloneAttachment(current), record: next };
}

function normalizeFailure(value: Record<string, unknown>, fallbackAt: string): NarsSurfaceAttachmentFailure {
  return {
    code: requiredString(value.code, 'failure_code'),
    message: requiredString(value.message, 'failure_message'),
    at: timestamp(value.at, 'failure_at', fallbackAt),
    ...(isRecord(value.details) ? { details: { ...value.details } } : {}),
  };
}

export function summarizeNarsSurfaceAttachments(attachments: readonly NarsSurfaceAttachment[] = []): NarsSurfaceAttachmentSummary {
  const healthCounts: Record<NarsSurfaceAttachmentHealthState, number> = {
    unknown: 0,
    healthy: 0,
    degraded: 0,
    unavailable: 0,
    stale: 0,
  };
  let attachedCount = 0;
  let reconnectingCount = 0;
  let staleCount = 0;
  let detachedCount = 0;
  let failedCount = 0;
  for (const attachment of attachments) {
    const normalized = normalizeNarsSurfaceAttachment(attachment);
    healthCounts[normalized.health_state] += 1;
    if (normalized.attachment_state === 'attached') attachedCount += 1;
    if (normalized.attachment_state === 'reconnecting') reconnectingCount += 1;
    if (normalized.attachment_state === 'stale') staleCount += 1;
    if (normalized.attachment_state === 'detached') detachedCount += 1;
    if (normalized.attachment_state === 'failed') failedCount += 1;
  }
  return {
    schema: NARS_SURFACE_ATTACHMENT_SUMMARY_SCHEMA,
    count: attachments.length,
    attached_count: attachedCount,
    reconnecting_count: reconnectingCount,
    stale_count: staleCount,
    detached_count: detachedCount,
    failed_count: failedCount,
    health_counts: healthCounts,
  };
}

export function createNarsSurfaceAttachmentRefusal({
  code,
  message,
  sessionId = null,
  surfaceKind = null,
  candidates = [],
}: {
  code: NarsSurfaceAttachmentRefusalCode;
  message: string;
  sessionId?: string | null;
  surfaceKind?: string | null;
  candidates?: readonly Record<string, unknown>[];
}): NarsSurfaceAttachmentRefusal {
  return {
    schema: NARS_SURFACE_ATTACHMENT_REFUSAL_SCHEMA,
    code,
    message: requiredString(message, 'refusal_message'),
    session_id: nullableString(sessionId),
    surface_kind: nullableString(surfaceKind),
    candidates: candidates.map((candidate) => ({ ...candidate })),
  };
}
