import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
  NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';
import { synchronizeNarsAuthorityHandoffLifecycle } from './authority-handoff-fsm.js';
import type { NaradaAuthorityHandoffLifecycle } from './authority-handoff-fsm.js';
import { assertNarsAuthorityRuntimeHostTransition } from './authority-transition-fsm.js';
import type { NaradaAuthorityRuntimeHostTransitionState } from './authority-transition-fsm.js';
import { updateNarsSessionAuthorityTransitionState } from './session-index.js';

export const NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA = 'narada.nars.authority_transition_source_state.v1' as const;

export type NaradaAuthorityRuntimeHostKind = 'local' | 'cloudflare-host';
export type NaradaAuthorityRuntimeSourceWriteAdmission = 'active' | 'draining' | 'sealed' | 'retired';
export type NaradaAuthorityRuntimeTargetWriteAdmission = 'not_before_source_seal' | 'active_after_epoch_token' | 'refused';
export type NaradaAuthorityRuntimeHostTransitionFailureState =
  | 'preparation_failed'
  | 'drain_failed'
  | 'seal_failed'
  | 'target_activation_failed'
  | 'transition_aborted';

export interface NaradaAuthorityTransitionSourceState {
  schema: typeof NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA;
  path: string | null;
  corrupt: boolean;
  updated_at: unknown;
  authority_transition_state: NaradaAuthorityRuntimeHostTransitionState | null;
  source_write_admission: NaradaAuthorityRuntimeSourceWriteAdmission;
  source_authority_runtime_host: NaradaAuthorityRuntimeHostKind | null;
  source_authority_epoch: number | null;
  source_authority_runtime_id: string | null;
  transition_id: string | null;
  target_write_admission: NaradaAuthorityRuntimeTargetWriteAdmission;
  drain_started_at: unknown;
  drain_reason: unknown;
  drain_requested_by: unknown;
  sealed_at: unknown;
  source_last_sequence: number | null;
  target_prepared_at: unknown;
  target_prepare_reason: unknown;
  target_prepare_requested_by: unknown;
  target_activation_started_at: unknown;
  target_activated_at: unknown;
  target_first_sequence: number | null;
  authority_epoch_token: Record<string, unknown> | null;
  activation_id: unknown;
  target_authority_locator: Record<string, unknown> | null;
  superseded_by_session_id: string | null;
  authority_locator_ref: string | null;
  target_transition_plan: Record<string, unknown> | null;
  authority_handoff_lifecycle: NaradaAuthorityHandoffLifecycle | null;
  handoff_evidence: Record<string, unknown> | null;
  reconciliation_evidence: Record<string, unknown> | null;
  target_activation_reason: unknown;
  target_activation_requested_by: unknown;
  seal_reason: unknown;
  seal_requested_by: unknown;
  last_transition: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type NaradaAuthorityTransitionSourceStateInput = Record<string, unknown>;

export interface NaradaAuthorityTargetPlanRefusal {
  reason_code: string;
  failed_invariant: string;
  reason: string;
}

export interface NaradaAuthorityTransitionOperationOptions {
  path?: string | null;
  sessionPath?: string | null;
  state?: NaradaAuthorityTransitionSourceStateInput;
  reason?: unknown;
  requestedBy?: unknown;
  now?: Date;
}

export function authorityTransitionStatePathFromSessionPath(sessionPath: string | null | undefined): string | null {
  if (!sessionPath) return null;
  return join(dirname(String(sessionPath)), 'authority-transition-state.json');
}

export function readAuthorityTransitionSourceState(path: string | null | undefined): NaradaAuthorityTransitionSourceState {
  if (!path || !existsSync(path)) return emptyAuthorityTransitionSourceState({ path });
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed) || parsed.schema !== NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA) return emptyAuthorityTransitionSourceState({ path, corrupt: true });
    return normalizeAuthorityTransitionSourceState({ ...parsed, path });
  } catch {
    return emptyAuthorityTransitionSourceState({ path, corrupt: true });
  }
}

export function writeAuthorityTransitionSourceState(path: string | null | undefined, state: NaradaAuthorityTransitionSourceStateInput = {}): NaradaAuthorityTransitionSourceState {
  if (!path) return normalizeAuthorityTransitionSourceState(state);
  const next = normalizeAuthorityTransitionSourceState({ ...state, path, updated_at: new Date().toISOString() });
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, path);
  return next;
}

export function planTargetAuthorityTransition({ sourceAuthorityRuntimeHost = 'local', sourceAuthorityEpoch = 1, sourceAuthorityRuntimeId = null, transitionId = null, currentSiteRoot = null, currentSessionId = null, targetAuthorityLocator = null, supersededBySessionId = null, authorityLocatorRef = null }: { sourceAuthorityRuntimeHost?: unknown; sourceAuthorityEpoch?: unknown; sourceAuthorityRuntimeId?: unknown; transitionId?: unknown; currentSiteRoot?: unknown; currentSessionId?: unknown; targetAuthorityLocator?: unknown; supersededBySessionId?: unknown; authorityLocatorRef?: unknown } = {}): Record<string, unknown> {
  const sourceHostKind = normalizeAuthorityRuntimeHostKind(sourceAuthorityRuntimeHost, 'local');
  const rawLocator = normalizeOptionalObject(targetAuthorityLocator);
  const targetHostKind = normalizeAuthorityRuntimeHostKind(rawLocator?.kind ?? rawLocator?.host_kind, null);
  const refusals: NaradaAuthorityTargetPlanRefusal[] = [];
  if (!rawLocator) refusals.push(authorityTargetPlanRefusal('target_authority_locator_missing', 'target_authority_locator_required', 'Target preparation requires an explicit target authority locator.'));
  if (!targetHostKind) refusals.push(authorityTargetPlanRefusal('target_authority_host_kind_invalid', 'target_authority_locator_kind_required', 'Target authority locator kind must be local or cloudflare-host.'));
  let normalizedLocator: Record<string, unknown> | null = rawLocator ? { ...rawLocator, kind: targetHostKind ?? rawLocator.kind } : null;
  const requirements: string[] = [];
  if (targetHostKind === 'local') {
    requirements.push('local_target_session_id', 'local_target_site_path_resolution');
    const targetSessionId = normalizeOptionalString(rawLocator?.session_id ?? rawLocator?.sessionId ?? currentSessionId);
    if (!targetSessionId) refusals.push(authorityTargetPlanRefusal('local_target_session_id_missing', 'local_target_requires_session_id', 'Local target preparation requires a session_id.'));
    const rawSiteRoot = rawLocator?.site_root ?? rawLocator?.siteRoot ?? (sourceHostKind === 'local' ? currentSiteRoot : null);
    if (!rawSiteRoot) {
      refusals.push(authorityTargetPlanRefusal('local_target_site_root_missing', 'cloudflare_to_local_requires_explicit_site_root', 'Cloudflare-to-local preparation requires an explicit local site_root.'));
    } else if (targetSessionId) {
      const resolvedSiteRoot = resolve(String(rawSiteRoot));
      const sitePaths = resolveNaradaSitePaths({ siteRoot: resolvedSiteRoot, sessionId: targetSessionId });
      normalizedLocator = {
        ...normalizedLocator,
        kind: 'local',
        site_root: resolvedSiteRoot,
        session_id: targetSessionId,
        session_dir: sitePaths.narsSessionDir,
        session_path: sitePaths.narsSessionPath,
        events_path: sitePaths.narsEventsPath,
      };
    }
  } else if (targetHostKind === 'cloudflare-host') {
    requirements.push('cloudflare_target_site_id', 'cloudflare_target_session_id');
    if (!normalizeOptionalString(rawLocator?.site_id ?? rawLocator?.siteId)) refusals.push(authorityTargetPlanRefusal('cloudflare_target_site_id_missing', 'cloudflare_target_requires_site_id', 'Cloudflare target preparation requires a site_id.'));
    if (!normalizeOptionalString(rawLocator?.session_id ?? rawLocator?.sessionId)) refusals.push(authorityTargetPlanRefusal('cloudflare_target_session_id_missing', 'cloudflare_target_requires_session_id', 'Cloudflare target preparation requires a session_id.'));
  }
  return {
    schema: 'narada.nars.authority_transition_plan.v1',
    status: refusals.length > 0 ? 'refused' : 'ready',
    direction: targetHostKind ? `${sourceHostKind}_to_${targetHostKind}` : 'unknown',
    source_authority_runtime_host: sourceHostKind,
    source_authority_epoch: Number.isInteger(Number(sourceAuthorityEpoch)) && Number(sourceAuthorityEpoch) >= 1 ? Number(sourceAuthorityEpoch) : 1,
    source_authority_runtime_id: normalizeOptionalString(sourceAuthorityRuntimeId) ?? (normalizeOptionalString(currentSessionId) ? `local-nars:${String(currentSessionId).trim()}` : null),
    transition_id: normalizeOptionalString(transitionId),
    target_authority_runtime_host: targetHostKind,
    target_authority_locator: normalizedLocator,
    superseded_by_session_id: normalizeOptionalString(supersededBySessionId),
    authority_locator_ref: normalizeOptionalString(authorityLocatorRef),
    preparation_requirements: requirements,
    shared_activation_requirements: ['source_seal_evidence', 'source_event_cursor', 'authority_epoch_token', 'target_first_sequence', 'target_health', 'mcp_fabric', 'artifact_handoff_policy'],
    direction_specific_requirements: requirements,
    refusals,
  };
}

export function prepareTargetAuthority({ path = null, sessionPath = null, state, targetAuthorityLocator = null, supersededBySessionId = null, authorityLocatorRef = null, transitionPlan = null, reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions & { targetAuthorityLocator?: unknown; supersededBySessionId?: unknown; authorityLocatorRef?: unknown; transitionPlan?: unknown } = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  if (current.authority_transition_state === 'not_requested' || current.authority_transition_state == null) {
    assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'proposed');
    assertNarsAuthorityRuntimeHostTransition('proposed', 'preparing_target');
  } else {
    assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'preparing_target');
  }
  const occurredAt = now.toISOString();
  const plan = normalizeOptionalObject(transitionPlan);
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'preparing_target',
    target_write_admission: 'not_before_source_seal',
    target_prepared_at: current.target_prepared_at ?? occurredAt,
    target_authority_locator: normalizeOptionalObject(targetAuthorityLocator) ?? current.target_authority_locator ?? null,
    superseded_by_session_id: normalizeOptionalString(supersededBySessionId) ?? current.superseded_by_session_id ?? null,
    authority_locator_ref: normalizeOptionalString(authorityLocatorRef) ?? current.authority_locator_ref ?? null,
    target_transition_plan: normalizeOptionalObject(transitionPlan) ?? current.target_transition_plan ?? null,
    source_authority_runtime_host: normalizeAuthorityRuntimeHostKind(plan?.source_authority_runtime_host, current.source_authority_runtime_host ?? 'local'),
    source_authority_epoch: Number.isInteger(Number(plan?.source_authority_epoch)) && Number(plan?.source_authority_epoch) >= 1 ? Number(plan?.source_authority_epoch) : current.source_authority_epoch ?? 1,
    source_authority_runtime_id: normalizeOptionalString(plan?.source_authority_runtime_id) ?? current.source_authority_runtime_id ?? null,
    transition_id: normalizeOptionalString(plan?.transition_id) ?? current.transition_id ?? `arht_${randomUUID()}`,
    target_prepare_reason: reason ?? current.target_prepare_reason ?? null,
    target_prepare_requested_by: requestedBy ?? current.target_prepare_requested_by ?? null,
    last_transition: { transition: 'preparing_target', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    authorityHandoffEvidence: next.handoff_evidence,
    authorityReconciliationEvidence: next.reconciliation_evidence,
    updatedAt: occurredAt,
  });
  return next;
}

export function activateTargetAuthority({ path = null, sessionPath = null, state, activationId = null, targetFirstSequence = null, authorityEpochToken = null, targetAuthorityLocator = null, supersededBySessionId = null, authorityLocatorRef = null, handoffEvidence = null, reconciliationEvidence = null, reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions & { activationId?: unknown; targetFirstSequence?: unknown; authorityEpochToken?: unknown; targetAuthorityLocator?: unknown; supersededBySessionId?: unknown; authorityLocatorRef?: unknown; handoffEvidence?: unknown; reconciliationEvidence?: unknown } = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'target_activating');
  assertNarsAuthorityRuntimeHostTransition('target_activating', 'target_active');
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'target_active',
    source_write_admission: 'sealed',
    target_write_admission: 'active_after_epoch_token',
    target_activated_at: current.target_activated_at ?? occurredAt,
    target_first_sequence: typeof targetFirstSequence === 'number' && Number.isInteger(targetFirstSequence) && targetFirstSequence > 0 ? targetFirstSequence : current.target_first_sequence ?? null,
    authority_epoch_token: normalizeOptionalObject(authorityEpochToken) ?? current.authority_epoch_token ?? null,
    handoff_evidence: normalizeOptionalObject(handoffEvidence) ?? current.handoff_evidence ?? null,
    reconciliation_evidence: normalizeOptionalObject(reconciliationEvidence) ?? current.reconciliation_evidence ?? null,
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
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    authorityHandoffEvidence: next.handoff_evidence,
    authorityReconciliationEvidence: next.reconciliation_evidence,
    updatedAt: occurredAt,
  });
  return next;
}

export function beginTargetActivation({ path = null, sessionPath = null, state, targetAuthorityLocator = null, supersededBySessionId = null, authorityLocatorRef = null, reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions & { targetAuthorityLocator?: unknown; supersededBySessionId?: unknown; authorityLocatorRef?: unknown } = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'target_activating');
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'target_activating',
    source_write_admission: 'sealed',
    target_write_admission: 'not_before_source_seal',
    target_activation_started_at: current.target_activation_started_at ?? occurredAt,
    target_authority_locator: normalizeOptionalObject(targetAuthorityLocator) ?? current.target_authority_locator ?? null,
    superseded_by_session_id: normalizeOptionalString(supersededBySessionId) ?? current.superseded_by_session_id ?? null,
    authority_locator_ref: normalizeOptionalString(authorityLocatorRef) ?? current.authority_locator_ref ?? null,
    target_activation_reason: reason ?? current.target_activation_reason ?? null,
    target_activation_requested_by: requestedBy ?? current.target_activation_requested_by ?? null,
    last_transition: { transition: 'target_activating', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    updatedAt: occurredAt,
  });
  return next;
}

export function beginSourceDrain({ path = null, sessionPath = null, state, reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  if (current.source_write_admission === 'sealed') return current;
  assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'source_draining');
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
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    updatedAt: occurredAt,
  });
  return next;
}

export function sealSourceAuthority({ path = null, sessionPath = null, state, sourceLastSequence = null, reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions & { sourceLastSequence?: unknown } = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'source_sealed');
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'source_sealed',
    source_write_admission: 'sealed',
    sealed_at: current.sealed_at ?? occurredAt,
    source_last_sequence: typeof sourceLastSequence === 'number' && Number.isInteger(sourceLastSequence) && sourceLastSequence >= 0 ? sourceLastSequence : current.source_last_sequence ?? null,
    seal_reason: reason ?? current.seal_reason ?? null,
    seal_requested_by: requestedBy ?? current.seal_requested_by ?? null,
    last_transition: { transition: 'source_sealed', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    updatedAt: occurredAt,
  });
  return next;
}

export function retireSourceAuthority({ path = null, sessionPath = null, state, reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, 'source_retired');
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: 'source_retired',
    source_write_admission: 'retired',
    last_transition: { transition: 'source_retired', occurred_at: occurredAt, reason, requested_by: requestedBy },
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    updatedAt: occurredAt,
  });
  return next;
}

export function recordAuthorityTransitionFailure({ path = null, sessionPath = null, state, failureState = 'transition_aborted', reason = null, requestedBy = null, now = new Date() }: NaradaAuthorityTransitionOperationOptions & { failureState?: NaradaAuthorityRuntimeHostTransitionFailureState } = {}): NaradaAuthorityTransitionSourceState {
  const current = normalizeAuthorityTransitionSourceState(state ?? readAuthorityTransitionSourceState(path));
  assertNarsAuthorityRuntimeHostTransition(current.authority_transition_state, failureState);
  const occurredAt = now.toISOString();
  const next = writeAuthorityTransitionSourceState(path, {
    ...current,
    authority_transition_state: failureState,
    last_transition: { transition: failureState, occurred_at: occurredAt, reason, requested_by: requestedBy },
    failure_reason: reason ?? null,
    failure_requested_by: requestedBy ?? null,
  });
  updateNarsSessionAuthorityTransitionState({
    sessionPath,
    authorityTransitionState: next.authority_transition_state,
    authorityHandoffLifecycle: next.authority_handoff_lifecycle,
    sourceWriteAdmission: next.source_write_admission,
    supersededBySessionId: next.superseded_by_session_id,
    authorityLocatorRef: next.authority_locator_ref,
    authorityRuntimeHost: next.source_authority_runtime_host,
    authorityEpoch: next.source_authority_epoch,
    authorityRuntimeId: next.source_authority_runtime_id,
    authorityTransitionId: next.transition_id,
    updatedAt: occurredAt,
  });
  return next;
}

export function authorityTransitionSourceStateSnapshot(state: NaradaAuthorityTransitionSourceStateInput = {}): Record<string, unknown> {
  const normalized = normalizeAuthorityTransitionSourceState(state);
  return {
    schema: normalized.schema,
    path: normalized.path ?? null,
    authority_transition_state: normalized.authority_transition_state,
    source_write_admission: normalized.source_write_admission,
    source_authority_runtime_host: normalized.source_authority_runtime_host,
    source_authority_epoch: normalized.source_authority_epoch,
    source_authority_runtime_id: normalized.source_authority_runtime_id,
    transition_id: normalized.transition_id,
    drain_started_at: normalized.drain_started_at,
    sealed_at: normalized.sealed_at,
    source_last_sequence: normalized.source_last_sequence,
    target_write_admission: normalized.target_write_admission,
    target_prepared_at: normalized.target_prepared_at,
    target_activation_started_at: normalized.target_activation_started_at,
    target_activated_at: normalized.target_activated_at,
    target_first_sequence: normalized.target_first_sequence,
    authority_epoch_token: normalized.authority_epoch_token,
    activation_id: normalized.activation_id,
    target_authority_locator: normalized.target_authority_locator,
    superseded_by_session_id: normalized.superseded_by_session_id,
    authority_locator_ref: normalized.authority_locator_ref,
    target_transition_plan: normalized.target_transition_plan,
    authority_handoff_lifecycle: normalized.authority_handoff_lifecycle,
    handoff_evidence: normalized.handoff_evidence,
    reconciliation_evidence: normalized.reconciliation_evidence,
    last_transition: normalized.last_transition,
  };
}

export function classifyTargetWriteAdmission(state: NaradaAuthorityTransitionSourceStateInput = {}, { authorityEpochToken = null, targetFirstSequence = null, nextEventSequence = null }: { authorityEpochToken?: unknown; targetFirstSequence?: unknown; nextEventSequence?: unknown } = {}): Record<string, unknown> {
  const snapshot = normalizeAuthorityTransitionSourceState(state);
  const missing: string[] = [];
  if (snapshot.source_write_admission !== 'sealed' && snapshot.source_write_admission !== 'retired') missing.push('source_seal_evidence');
  if (!snapshot.sealed_at || !Number.isInteger(snapshot.source_last_sequence)) missing.push('source_event_cursor');
  const effectiveEpochToken = normalizeOptionalObject(authorityEpochToken) ?? snapshot.authority_epoch_token;
  if (!effectiveEpochToken) missing.push('authority_epoch_token');
  const effectiveTargetFirstSequence = typeof targetFirstSequence === 'number' && Number.isInteger(targetFirstSequence) && targetFirstSequence > 0 ? targetFirstSequence : snapshot.target_first_sequence;
  if (typeof effectiveTargetFirstSequence !== 'number' || !Number.isInteger(effectiveTargetFirstSequence) || effectiveTargetFirstSequence <= 0) missing.push('target_first_sequence');
  if (typeof nextEventSequence === 'number' && Number.isInteger(nextEventSequence) && typeof effectiveTargetFirstSequence === 'number' && Number.isInteger(effectiveTargetFirstSequence) && effectiveTargetFirstSequence !== nextEventSequence) {
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

export function classifySourceWriteAdmission(state: NaradaAuthorityTransitionSourceStateInput = {}, { methodKind = null, transitionPolicy = null }: { methodKind?: unknown; transitionPolicy?: unknown } = {}): Record<string, unknown> {
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

export function emptyAuthorityTransitionSourceState({ path = null, corrupt = false }: { path?: string | null; corrupt?: boolean } = {}): NaradaAuthorityTransitionSourceState {
  return normalizeAuthorityTransitionSourceState({
    path,
    corrupt,
    authority_transition_state: null,
    source_write_admission: 'active',
    source_authority_runtime_host: 'local',
    source_authority_epoch: 1,
    source_authority_runtime_id: null,
    transition_id: null,
    target_write_admission: 'not_before_source_seal',
    drain_started_at: null,
    sealed_at: null,
    source_last_sequence: null,
    target_prepared_at: null,
    target_activation_started_at: null,
    target_activated_at: null,
    target_first_sequence: null,
    authority_epoch_token: null,
    activation_id: null,
    target_authority_locator: null,
    superseded_by_session_id: null,
    authority_locator_ref: null,
    target_transition_plan: null,
    authority_handoff_lifecycle: null,
    handoff_evidence: null,
    reconciliation_evidence: null,
    last_transition: null,
  });
}

function normalizeAuthorityTransitionSourceState(state: NaradaAuthorityTransitionSourceStateInput = {}): NaradaAuthorityTransitionSourceState {
  const authorityTransitionState = typeof state.authority_transition_state === 'string' && NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES.includes(state.authority_transition_state)
    ? state.authority_transition_state as NaradaAuthorityRuntimeHostTransitionState
    : null;
  const sourceWriteAdmission = state.corrupt === true ? 'sealed' : typeof state.source_write_admission === 'string' && NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS.includes(state.source_write_admission)
    ? state.source_write_admission as NaradaAuthorityRuntimeSourceWriteAdmission
    : 'active';
  const targetWriteAdmission = typeof state.target_write_admission === 'string' && NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS.includes(state.target_write_admission)
    ? state.target_write_admission as NaradaAuthorityRuntimeTargetWriteAdmission
    : 'not_before_source_seal';
  return {
    schema: NARS_AUTHORITY_TRANSITION_SOURCE_STATE_SCHEMA,
    path: typeof state.path === 'string' ? state.path : null,
    corrupt: state.corrupt === true,
    updated_at: state.updated_at ?? null,
    authority_transition_state: authorityTransitionState,
    source_write_admission: sourceWriteAdmission,
    source_authority_runtime_host: normalizeAuthorityRuntimeHostKind(state.source_authority_runtime_host, 'local'),
    source_authority_epoch: Number.isInteger(Number(state.source_authority_epoch)) && Number(state.source_authority_epoch) >= 1 ? Number(state.source_authority_epoch) : 1,
    source_authority_runtime_id: normalizeOptionalString(state.source_authority_runtime_id),
    transition_id: normalizeOptionalString(state.transition_id),
    target_write_admission: targetWriteAdmission,
    drain_started_at: state.drain_started_at ?? null,
    drain_reason: state.drain_reason ?? null,
    drain_requested_by: state.drain_requested_by ?? null,
    sealed_at: state.sealed_at ?? null,
    source_last_sequence: typeof state.source_last_sequence === 'number' && Number.isInteger(state.source_last_sequence) && state.source_last_sequence >= 0 ? state.source_last_sequence : null,
    target_prepared_at: state.target_prepared_at ?? null,
    target_prepare_reason: state.target_prepare_reason ?? null,
    target_prepare_requested_by: state.target_prepare_requested_by ?? null,
    target_activation_started_at: state.target_activation_started_at ?? null,
    target_activated_at: state.target_activated_at ?? null,
    target_first_sequence: typeof state.target_first_sequence === 'number' && Number.isInteger(state.target_first_sequence) && state.target_first_sequence > 0 ? state.target_first_sequence : null,
    authority_epoch_token: normalizeOptionalObject(state.authority_epoch_token),
    activation_id: state.activation_id ?? null,
    target_authority_locator: normalizeOptionalObject(state.target_authority_locator),
    superseded_by_session_id: normalizeOptionalString(state.superseded_by_session_id),
    authority_locator_ref: normalizeOptionalString(state.authority_locator_ref),
    target_transition_plan: normalizeOptionalObject(state.target_transition_plan),
    authority_handoff_lifecycle: synchronizeNarsAuthorityHandoffLifecycle(
      state.authority_handoff_lifecycle,
      authorityTransitionState,
    ),
    handoff_evidence: normalizeOptionalObject(state.handoff_evidence),
    reconciliation_evidence: normalizeOptionalObject(state.reconciliation_evidence),
    target_activation_reason: state.target_activation_reason ?? null,
    target_activation_requested_by: state.target_activation_requested_by ?? null,
    seal_reason: state.seal_reason ?? null,
    seal_requested_by: state.seal_requested_by ?? null,
    last_transition: normalizeOptionalObject(state.last_transition),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeAuthorityRuntimeHostKind(value: unknown, defaultValue: NaradaAuthorityRuntimeHostKind | null): NaradaAuthorityRuntimeHostKind | null {
  return value === 'local' || value === 'cloudflare-host' ? value : defaultValue;
}

function authorityTargetPlanRefusal(reasonCode: string, failedInvariant: string, reason: string): NaradaAuthorityTargetPlanRefusal {
  return { reason_code: reasonCode, failed_invariant: failedInvariant, reason };
}
