import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
  NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';
import { updateNarsSessionAuthorityTransitionState } from './nars-session-index.mjs';

export const NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA = 'narada.nars.authority_transition_source_state.v1';

export function authorityTransitionStatePathFromSessionPath(sessionPath) {
  if (!sessionPath) return null;
  return join(dirname(String(sessionPath)), 'authority-transition-state.json');
}

export function readAuthorityTransitionSourceState(path) {
  if (!path || !existsSync(path)) return emptyAuthorityTransitionSourceState({ path });
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed?.schema !== NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA) return emptyAuthorityTransitionSourceState({ path, corrupt: true });
    return normalizeAuthorityTransitionSourceState({ ...parsed, path });
  } catch {
    return emptyAuthorityTransitionSourceState({ path, corrupt: true });
  }
}

export function writeAuthorityTransitionSourceState(path, state = {}) {
  if (!path) return normalizeAuthorityTransitionSourceState(state);
  const next = normalizeAuthorityTransitionSourceState({ ...state, path, updated_at: new Date().toISOString() });
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, path);
  return next;
}

export function prepareTargetAuthority({ path, sessionPath, state, targetAuthorityLocator = null, supersededBySessionId = null, authorityLocatorRef = null, reason = null, requestedBy = null, now = new Date() } = {}) {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'preparing_target',
    target_write_admission: 'not_before_source_seal',
    target_prepared_at: current.target_prepared_at ?? occurredAt,
    target_authority_locator: normalizeOptionalObject(targetAuthorityLocator) ?? current.target_authority_locator ?? null,
    superseded_by_session_id: normalizeOptionalString(supersededBySessionId) ?? current.superseded_by_session_id ?? null,
    authority_locator_ref: normalizeOptionalString(authorityLocatorRef) ?? current.authority_locator_ref ?? null,
    target_prepare_reason: reason ?? current.target_prepare_reason ?? null,
    target_prepare_requested_by: requestedBy ?? current.target_prepare_requested_by ?? null,
    last_transition: { transition: 'preparing_target', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    updatedAt: occurredAt,
  });
  return next;
}

export function activateTargetAuthority({ path, sessionPath, state, activationId, targetFirstSequence, authorityEpochToken, targetAuthorityLocator = null, supersededBySessionId = null, authorityLocatorRef = null, reason = null, requestedBy = null, now = new Date() } = {}) {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'target_active',
    source_write_admission: 'sealed',
    target_write_admission: 'active_after_epoch_token',
    target_activated_at: current.target_activated_at ?? occurredAt,
    target_first_sequence: Number.isInteger(targetFirstSequence) && targetFirstSequence > 0 ? targetFirstSequence : current.target_first_sequence ?? null,
    authority_epoch_token: authorityEpochToken && typeof authorityEpochToken === 'object' ? authorityEpochToken : current.authority_epoch_token ?? null,
    activation_id: activationId ?? current.activation_id ?? null,
    target_authority_locator: normalizeOptionalObject(targetAuthorityLocator) ?? current.target_authority_locator ?? null,
    superseded_by_session_id: normalizeOptionalString(supersededBySessionId) ?? current.superseded_by_session_id ?? null,
    authority_locator_ref: normalizeOptionalString(authorityLocatorRef) ?? current.authority_locator_ref ?? null,
    target_activation_reason: reason ?? current.target_activation_reason ?? null,
    target_activation_requested_by: requestedBy ?? current.target_activation_requested_by ?? null,
    last_transition: { transition: 'target_active', occurred_at: occurredAt, reason, requested_by: requestedBy, activation_id: activationId ?? null },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    updatedAt: occurredAt,
  });
  return next;
}

export function beginSourceDrain({ path, sessionPath, state, reason = null, requestedBy = null, now = new Date() } = {}) {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  if (current.source_write_admission === 'sealed') return current;
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'source_draining',
    source_write_admission: 'draining',
    drain_started_at: current.drain_started_at ?? occurredAt,
    drain_reason: reason ?? current.drain_reason ?? null,
    drain_requested_by: requestedBy ?? current.drain_requested_by ?? null,
    last_transition: { transition: 'source_draining', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    sourceWriteAdmission: next.source_write_admission,
    updatedAt: occurredAt,
  });
  return next;
}

export function sealSourceAuthority({ path, sessionPath, state, sourceLastSequence = null, reason = null, requestedBy = null, now = new Date() } = {}) {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'source_sealed',
    source_write_admission: 'sealed',
    sealed_at: current.sealed_at ?? occurredAt,
    source_last_sequence: Number.isInteger(sourceLastSequence) && sourceLastSequence >= 0 ? sourceLastSequence : current.source_last_sequence ?? null,
    seal_reason: reason ?? current.seal_reason ?? null,
    seal_requested_by: requestedBy ?? current.seal_requested_by ?? null,
    last_transition: { transition: 'source_sealed', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    sourceWriteAdmission: next.source_write_admission,
    updatedAt: occurredAt,
  });
  return next;
}

export function authorityTransitionSourceStateSnapshot(state = {}) {
  const normalized = normalizeAuthorityTransitionSourceState(state);
  return {
    schema: normalized.schema,
    path: normalized.path ?? null,
    authority_transition_state: normalized.authority_transition_state,
    source_write_admission: normalized.source_write_admission,
    drain_started_at: normalized.drain_started_at,
    sealed_at: normalized.sealed_at,
    source_last_sequence: normalized.source_last_sequence,
    target_write_admission: normalized.target_write_admission,
    target_prepared_at: normalized.target_prepared_at,
    target_activated_at: normalized.target_activated_at,
    target_first_sequence: normalized.target_first_sequence,
    authority_epoch_token: normalized.authority_epoch_token,
    activation_id: normalized.activation_id,
    target_authority_locator: normalized.target_authority_locator,
    superseded_by_session_id: normalized.superseded_by_session_id,
    authority_locator_ref: normalized.authority_locator_ref,
    last_transition: normalized.last_transition,
  };
}

export function classifyTargetWriteAdmission(state = {}, { authorityEpochToken = null, targetFirstSequence = null, nextEventSequence = null } = {}) {
  const snapshot = normalizeAuthorityTransitionSourceState(state);
  const missing = [];
  if (snapshot.source_write_admission !== 'sealed' && snapshot.source_write_admission !== 'retired') missing.push('source_seal_evidence');
  if (!snapshot.sealed_at || !Number.isInteger(snapshot.source_last_sequence)) missing.push('source_event_cursor');
  const effectiveEpochToken = authorityEpochToken && typeof authorityEpochToken === 'object' ? authorityEpochToken : snapshot.authority_epoch_token;
  if (!effectiveEpochToken || typeof effectiveEpochToken !== 'object') missing.push('authority_epoch_token');
  const effectiveTargetFirstSequence = Number.isInteger(targetFirstSequence) && targetFirstSequence > 0 ? targetFirstSequence : snapshot.target_first_sequence;
  if (!Number.isInteger(effectiveTargetFirstSequence) || effectiveTargetFirstSequence <= 0) missing.push('target_first_sequence');
  if (Number.isInteger(nextEventSequence) && Number.isInteger(effectiveTargetFirstSequence) && effectiveTargetFirstSequence !== nextEventSequence) {
    missing.push('target_first_sequence_boundary');
  }
  if (missing.length > 0) {
    return {
      admitted: false,
      reason_code: 'target_activation_evidence_missing',
      reason: `Target authority activation requires ${missing.join(', ')}.`,
      missing,
      authority_transition: authorityTransitionSourceStateSnapshot(snapshot),
    };
  }
  return {
    admitted: true,
    target_first_sequence: effectiveTargetFirstSequence,
    authority_epoch_token: effectiveEpochToken,
    authority_transition: authorityTransitionSourceStateSnapshot(snapshot),
  };
}

export function classifySourceWriteAdmission(state = {}, { methodKind = null, transitionPolicy = null } = {}) {
  const snapshot = normalizeAuthorityTransitionSourceState(state);
  if (snapshot.source_write_admission === 'active') return { admitted: true, admission: 'active' };
  if (snapshot.source_write_admission === 'sealed' || snapshot.source_write_admission === 'retired') {
    return {
      admitted: false,
      reason_code: 'source_authority_sealed',
      reason: 'Source authority is sealed and cannot admit canonical writes.',
      authority_transition: authorityTransitionSourceStateSnapshot(snapshot),
    };
  }
  if (snapshot.source_write_admission === 'draining') {
    if (methodKind === 'conversation_enqueue' && transitionPolicy === 'queue_during_drain') {
      return { admitted: true, admission: 'queued_during_drain', drain: false };
    }
    return {
      admitted: false,
      reason_code: 'source_authority_draining',
      reason: 'Source authority is draining; only explicit queue_during_drain enqueue is admitted.',
      authority_transition: authorityTransitionSourceStateSnapshot(snapshot),
    };
  }
  return { admitted: true, admission: 'active' };
}

export function emptyAuthorityTransitionSourceState({ path = null, corrupt = false } = {}) {
  return normalizeAuthorityTransitionSourceState({
    path,
    corrupt,
    authority_transition_state: null,
    source_write_admission: 'active',
    target_write_admission: 'not_before_source_seal',
    drain_started_at: null,
    sealed_at: null,
    source_last_sequence: null,
    target_prepared_at: null,
    target_activated_at: null,
    target_first_sequence: null,
    authority_epoch_token: null,
    activation_id: null,
    target_authority_locator: null,
    superseded_by_session_id: null,
    authority_locator_ref: null,
    last_transition: null,
  });
}

function normalizeAuthorityTransitionSourceState(state = {}) {
  const authorityTransitionState = NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES.includes(state.authority_transition_state)
    ? state.authority_transition_state
    : null;
  const sourceWriteAdmission = NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS.includes(state.source_write_admission)
    ? state.source_write_admission
    : 'active';
  const targetWriteAdmission = NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS.includes(state.target_write_admission)
    ? state.target_write_admission
    : 'not_before_source_seal';
  return {
    schema: NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA,
    path: state.path ?? null,
    corrupt: state.corrupt === true,
    updated_at: state.updated_at ?? null,
    authority_transition_state: authorityTransitionState,
    source_write_admission: sourceWriteAdmission,
    target_write_admission: targetWriteAdmission,
    drain_started_at: state.drain_started_at ?? null,
    drain_reason: state.drain_reason ?? null,
    drain_requested_by: state.drain_requested_by ?? null,
    sealed_at: state.sealed_at ?? null,
    source_last_sequence: Number.isInteger(state.source_last_sequence) && state.source_last_sequence >= 0 ? state.source_last_sequence : null,
    target_prepared_at: state.target_prepared_at ?? null,
    target_prepare_reason: state.target_prepare_reason ?? null,
    target_prepare_requested_by: state.target_prepare_requested_by ?? null,
    target_activated_at: state.target_activated_at ?? null,
    target_first_sequence: Number.isInteger(state.target_first_sequence) && state.target_first_sequence > 0 ? state.target_first_sequence : null,
    authority_epoch_token: state.authority_epoch_token && typeof state.authority_epoch_token === 'object' ? state.authority_epoch_token : null,
    activation_id: state.activation_id ?? null,
    target_authority_locator: normalizeOptionalObject(state.target_authority_locator),
    superseded_by_session_id: normalizeOptionalString(state.superseded_by_session_id),
    authority_locator_ref: normalizeOptionalString(state.authority_locator_ref),
    target_activation_reason: state.target_activation_reason ?? null,
    target_activation_requested_by: state.target_activation_requested_by ?? null,
    seal_reason: state.seal_reason ?? null,
    seal_requested_by: state.seal_requested_by ?? null,
    last_transition: state.last_transition && typeof state.last_transition === 'object' ? state.last_transition : null,
  };
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
