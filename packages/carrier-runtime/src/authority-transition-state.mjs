import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
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
    last_transition: normalized.last_transition,
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
    drain_started_at: null,
    sealed_at: null,
    source_last_sequence: null,
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
  return {
    schema: NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA,
    path: state.path ?? null,
    corrupt: state.corrupt === true,
    updated_at: state.updated_at ?? null,
    authority_transition_state: authorityTransitionState,
    source_write_admission: sourceWriteAdmission,
    drain_started_at: state.drain_started_at ?? null,
    drain_reason: state.drain_reason ?? null,
    drain_requested_by: state.drain_requested_by ?? null,
    sealed_at: state.sealed_at ?? null,
    source_last_sequence: Number.isInteger(state.source_last_sequence) && state.source_last_sequence >= 0 ? state.source_last_sequence : null,
    seal_reason: state.seal_reason ?? null,
    seal_requested_by: state.seal_requested_by ?? null,
    last_transition: state.last_transition && typeof state.last_transition === 'object' ? state.last_transition : null,
  };
}
