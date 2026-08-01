import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  classifyCarrierInputAdmission,
  classifyCarrierInputQueueAdmission,
} from '@narada-core/carrier-protocol';
import { createNarsEventHub } from './event-hub.js';
import type { NaradaEventHub } from './event-hub.js';
import { readNarsEventLog } from './event-log.js';
import type { NarsSessionEvent } from './event-log.js';
import { registerNarsArtifact, readNarsArtifactIndex, transitionNarsArtifact } from './artifacts.js';
import type { NaradaArtifactLifecycleEvidence, NaradaArtifactLifecycleState } from './artifact-lifecycle-state.js';
import type { NaradaArtifactIndex } from './artifacts.js';
import { createInputQueue } from './input-queue.js';
import type { NarsInputQueueApi, NarsInputQueueOptions, NarsQueueInputEvent } from './input-queue.js';
import {
  operatorInputQueueStatePathFromSessionPath,
  readOperatorInputQueueState,
  writeOperatorInputQueueState,
} from './operator-input-queue-state.js';
import { createOperationalPostureSnapshot, createSessionActivitySnapshot } from './session-status-snapshots.js';
import {
  createNarsSurfaceAttachment,
  summarizeNarsSurfaceAttachments,
} from './surface-attachment.js';
import type {
  NarsSurfaceAttachment,
  NarsSurfaceAttachmentCreateOptions,
  NarsSurfaceAttachmentState,
  NarsSurfaceAttachmentSummary,
  NarsSurfaceAttachmentTransitionEvidence,
  NarsSurfaceAttachmentTransitionResult,
} from './surface-attachment.js';
import {
  listNarsSurfaceAttachments,
  readNarsSurfaceAttachmentRegistry,
  registerNarsSurfaceAttachment as registerNarsSurfaceAttachmentInRegistry,
  transitionNarsSurfaceAttachmentInRegistry,
} from './surface-attachment-registry.js';
import type { NarsSurfaceAttachmentRegistry } from './surface-attachment-registry.js';
import {
  assertNarsTurnTransition,
  canTransitionNarsTurn,
  isNarsTurnTerminalState,
  isNarsTurnState,
  normalizeNarsTurnRecord,
  terminalStateForTurnState,
} from './turn-state.js';
import type { NarsTurnRecord, NarsTurnState } from './turn-state.js';
import {
  createNarsRecoveryAttemptId,
  createNarsRecoveryAttemptRecord,
  isNarsRecoveryAttemptState,
  normalizeNarsRecoveryAttemptRecord,
  transitionNarsRecoveryAttempt,
} from './recovery-attempt-state.js';
import type { NarsRecoveryAttemptRecord, NarsRecoveryAttemptState } from './recovery-attempt-state.js';
import {
  rehydrateNarsSessionLifecycle,
  transitionNarsSessionLifecycle,
} from './session-lifecycle-state.js';
import type { NarsSessionLifecycleState } from './session-lifecycle-state.js';

type JsonRecord = Record<string, unknown>;
type SessionEvent = JsonRecord;

interface NarsSessionCoreOptions {
  sessionId?: string | null;
  agentId?: string | null;
  sessionPath?: string | null;
  eventsPath?: string | null;
  siteRoot?: string | null;
  maxEventBuffer?: number;
  now?: () => string;
}

export interface NarsSessionCoreHealthSnapshot extends JsonRecord {
  schema: 'narada.nars.session_core_health.v1';
  session_id: string;
  lifecycle_state: NarsSessionLifecycleState;
  mcp_operational_state: string;
  active_turn_id: string | null;
  active_turn_state: NarsTurnState | null;
  last_turn_id: string | null;
  last_turn_state: NarsTurnState | null;
  operational_posture: string;
  surface_attachment_summary: NarsSurfaceAttachmentSummary;
}

export interface NarsSessionCoreRecoverySnapshot extends JsonRecord {
  schema: 'narada.nars.session_core_recovery.v1';
  session_id: string;
  lifecycle_state: NarsSessionLifecycleState;
  events_path: string;
  event_count: number;
  corrupt_event_line_count: number;
  operator_input_queue: import('./operator-input-queue-state.js').NarsOperatorInputQueueState;
  artifacts: NaradaArtifactIndex;
  active_turn: NarsTurnRecord | null;
  turns: NarsTurnRecord[];
  recovery_attempts: NarsRecoveryAttemptRecord[];
  surface_attachments: NarsSurfaceAttachmentRegistry;
}

export interface NarsTurnPreparation {
  action: 'already_completed' | 'terminal' | 'execute';
  turn: NarsTurnRecord | null;
}

type NarsArtifactRegisterOptions = NonNullable<Parameters<typeof registerNarsArtifact>[0]>;

interface NarsSessionCoreState {
  lifecycle: NarsSessionLifecycleState;
  sessionEventCount: number;
  lastEventKind: string | null;
  lastEventAt: string | null;
  lastTerminalState: unknown;
  requestOutcomeCounts: Record<string, number>;
  requestIssueCounts: Record<string, number>;
  activeTurnId: string | null;
  activeTurnState: NarsTurnState | null;
  lastTurnId: string | null;
  lastTurnState: NarsTurnState | null;
  [key: string]: unknown;
}

type NarsSessionQueueOptions = Partial<NarsInputQueueOptions> & {
  drain?: NarsInputQueueOptions['drain'];
};

interface RehydrateDefaults {
  sessionId?: string | null;
  agentId?: string | null;
}

export interface NarsTurnObservationEvidence extends JsonRecord {
  retry?: boolean;
  error?: unknown;
  reason?: unknown;
}

export function createNarsSessionCore({
  sessionId,
  agentId = null,
  sessionPath,
  eventsPath,
  siteRoot = null,
  maxEventBuffer = 1000,
  now = () => new Date().toISOString(),
}: NarsSessionCoreOptions = {}) {
  if (!sessionId) throw new Error('nars_session_id_required');
  if (!eventsPath) throw new Error('nars_events_path_required');
  const requiredSessionId: string = sessionId;
  const requiredEventsPath: string = eventsPath;
  const eventHub = createNarsEventHub({ maxBuffer: maxEventBuffer });
  const existing: SessionEvent[] = readNarsEventLog(eventsPath).events.map((event) => event as SessionEvent);
  const turns = rehydrateTurnRecords(existing, { sessionId, agentId });
  const recoveryAttempts = rehydrateRecoveryAttempts(existing, { sessionId });
  const existingOutcomeCounts = countExistingEvents(existing, requestOutcomeForEvent);
  const existingIssueCounts = countExistingEvents(existing, requestIssueForEvent);
  let sequence = existing.reduce((max, event, index) => Math.max(max, Number(event.event_sequence ?? event.sequence) || index + 1), 0);
  const activeTurn = findActiveTurn(turns);
  const state: NarsSessionCoreState = {
    lifecycle: rehydrateNarsSessionLifecycle(existing),
    sessionEventCount: existing.length,
    lastEventKind: eventKindForRecord(existing.at(-1)),
    lastEventAt: stringOrNull(existing.at(-1)?.timestamp ?? existing.at(-1)?.generated_at),
    lastTerminalState: [...existing].reverse().find((event) => event.terminal_state !== undefined)?.terminal_state ?? null,
    requestOutcomeCounts: existingOutcomeCounts,
    requestIssueCounts: existingIssueCounts,
    activeTurnId: activeTurn?.turn_id ?? null,
    activeTurnState: activeTurn?.turn_state ?? null,
    lastTurnId: [...turns.values()].at(-1)?.turn_id ?? null,
    lastTurnState: [...turns.values()].at(-1)?.turn_state ?? null,
  };

  function appendEvent(event: SessionEvent = {}): NarsSessionEvent {
    if (state.lifecycle === 'closed') throw new Error('nars_session_closed');
    const requestedSequence = Number(event.event_sequence ?? event.sequence);
    sequence = Number.isFinite(requestedSequence) && requestedSequence > sequence ? requestedSequence : sequence + 1;
    const timestamp = typeof event.timestamp === 'string' ? event.timestamp : now();
    const record: SessionEvent = {
      ...event,
      event_sequence: sequence,
      sequence,
      session_id: typeof event.session_id === 'string' ? event.session_id : sessionId,
      ...(agentId && event.agent_id === undefined ? { agent_id: agentId } : {}),
      timestamp,
    };
    mkdirSync(dirname(requiredEventsPath), { recursive: true });
    appendFileSync(requiredEventsPath, `${JSON.stringify(record)}\n`, 'utf8');
    const published = eventHub.publish(record as unknown as NarsSessionEvent);
    if (!published) throw new Error('nars_event_publish_failed');
    state.sessionEventCount += 1;
    state.lastEventKind = eventKindForRecord(published);
    state.lastEventAt = stringOrNull(published.timestamp);
    if (published.terminal_state) state.lastTerminalState = published.terminal_state;
    incrementCount(state.requestOutcomeCounts, requestOutcomeForEvent(published));
    incrementCount(state.requestIssueCounts, requestIssueForEvent(published));
    return published;
  }

  function beginRecoveryAttempt(turnId: unknown, evidence: JsonRecord = {}): NarsRecoveryAttemptRecord {
    const normalizedTurnId = String(turnId);
    const attemptNumber = [...recoveryAttempts.values()]
      .filter((attempt) => attempt.turn_id === normalizedTurnId)
      .reduce((max, attempt) => Math.max(max, attempt.attempt_number), 0) + 1;
    const requestedAt = now();
    const record = createNarsRecoveryAttemptRecord({
      attemptId: stringValue(evidence.attempt_id, createNarsRecoveryAttemptId()),
      turnId: normalizedTurnId,
      inputEventId: stringOrNull(evidence.input_event_id) ?? normalizedTurnId,
      sessionId,
      attemptNumber,
      recoveryKind: evidence.recovery_kind ?? 'queue_replay',
      requestedAt,
      reason: evidence.reason ?? 'runtime_recovery_replay',
    });
    const published = appendEvent({
      event: 'recovery_attempt_state_transition',
      ...record,
      previous_state: null,
      ...evidence,
      recovery_attempt_state: 'requested',
      timestamp: requestedAt,
    });
    const persisted = normalizeNarsRecoveryAttemptRecord({ ...record, updated_at: published.timestamp });
    recoveryAttempts.set(persisted.attempt_id, persisted);
    return persisted;
  }

  function transitionRecoveryAttempt(attemptId: unknown, nextState: unknown, evidence: JsonRecord = {}): NarsRecoveryAttemptRecord {
    const current = recoveryAttempts.get(String(attemptId));
    if (!current) throw new Error(`nars_recovery_attempt_not_found:${attemptId}`);
    const next = transitionNarsRecoveryAttempt(current, nextState, { ...evidence, updated_at: now() });
    if (next.recovery_attempt_state === current.recovery_attempt_state) return current;
    const published = appendEvent({
      event: 'recovery_attempt_state_transition',
      ...next,
      previous_state: current.recovery_attempt_state,
      ...evidence,
      recovery_attempt_state: nextState,
    });
    const persisted = normalizeNarsRecoveryAttemptRecord({ ...next, updated_at: published.timestamp });
    recoveryAttempts.set(persisted.attempt_id, persisted);
    return persisted;
  }

  function transition(next: NarsSessionLifecycleState, evidence: JsonRecord = {}): NarsSessionEvent {
    const previous = state.lifecycle;
    const activeTurnRecord = state.activeTurnId ? turns.get(state.activeTurnId) : null;
    if (next === 'closed' && activeTurnRecord && activeTurnRecord.turn_state !== 'accepted') {
      throw new Error(`nars_session_active_turn:${state.activeTurnId}`);
    }
    transitionNarsSessionLifecycle(previous, next);
    const transitionEvent = appendEvent({
      event: 'session_lifecycle_transition',
      previous_state: previous,
      lifecycle_state: next,
      ...evidence,
    });
    if (next === 'closed') {
      appendEvent({
        event: 'session_closed',
        terminal_state: 'closed',
        ...evidence,
      });
    }
    state.lifecycle = next;
    return transitionEvent;
  }

  function ensureTurn(input: SessionEvent = {}, options: JsonRecord = {}): NarsTurnRecord {
    const turnId = input.event_id ?? input.turn_id;
    if (!turnId) throw new Error('nars_turn_id_required');
    const current = turns.get(String(turnId));
    if (!current) {
      return transitionTurn(String(turnId), 'accepted', {
        input_event_id: String(input.event_id ?? turnId),
        input_ref: options.inputRef ?? inputRefFromInput(input),
        authority_posture: options.authorityPosture ?? input.authority_posture ?? recordValue(input.metadata, 'authority_posture') ?? null,
      });
    }
    if (['completed', 'blocked', 'refused'].includes(current.turn_state)) return current;
    if (isNarsTurnTerminalState(current.turn_state)) {
      return transitionTurn(current.turn_id, 'accepted', {
        retry: true,
        reason: options.reason ?? 'new_input_delivery',
      });
    }
    return current;
  }

  function prepareTurn(turnId: unknown, evidence: JsonRecord = {}): NarsTurnPreparation {
    const current = turns.get(String(turnId));
    if (!current) throw new Error(`nars_turn_not_found:${turnId}`);
    if (current.turn_state === 'completed') return { action: 'already_completed', turn: current };
    if (current.turn_state === 'blocked' || current.turn_state === 'refused') {
      return { action: 'terminal', turn: current };
    }
    if (isNarsTurnTerminalState(current.turn_state)) {
      transitionTurn(current.turn_id, 'accepted', {
        ...evidence,
        retry: true,
        reason: evidence.reason ?? 'runtime_recovery_replay',
      });
      return { action: 'execute', turn: turns.get(String(turnId)) ?? null };
    }
    if (current.turn_state !== 'accepted') {
      transitionTurn(current.turn_id, 'interrupted', {
        ...evidence,
        reason: evidence.reason ?? 'runtime_recovery_replay',
      });
      transitionTurn(current.turn_id, 'accepted', {
        ...evidence,
        retry: true,
        reason: evidence.reason ?? 'runtime_recovery_replay',
      });
    }
    return { action: 'execute', turn: turns.get(String(turnId)) ?? null };
  }

  function transitionTurn(turnId: unknown, nextState: unknown, evidence: NarsTurnObservationEvidence = {}): NarsTurnRecord {
    const normalizedTurnId = String(turnId);
    const current = turns.get(normalizedTurnId) ?? null;
    const previousState = current?.turn_state ?? null;
    if (current && previousState === nextState) return current;
    assertNarsTurnTransition(previousState, nextState, { retry: evidence.retry === true });
    const attempt = current && nextState === 'accepted' && isNarsTurnTerminalState(previousState)
      ? current.attempt + 1
      : current?.attempt ?? 1;
    const record = normalizeNarsTurnRecord({
      ...current,
      turn_id: normalizedTurnId,
      input_event_id: current?.input_event_id ?? evidence.input_event_id ?? normalizedTurnId,
      session_id: current?.session_id ?? sessionId,
      agent_id: current?.agent_id ?? agentId,
      input_ref: current?.input_ref ?? evidence.input_ref ?? { kind: 'session_input', event_id: normalizedTurnId },
      authority_posture: current?.authority_posture ?? evidence.authority_posture ?? null,
      turn_state: nextState,
      attempt,
      updated_at: now(),
      last_error: evidence.retry ? null : evidence.error ?? current?.last_error ?? null,
    });
    appendEvent({
      event: 'turn_lifecycle_transition',
      turn_id: record.turn_id,
      input_event_id: record.input_event_id,
      previous_state: previousState,
      turn_state: record.turn_state,
      terminal_state: record.terminal_state,
      attempt: record.attempt,
      input_ref: record.input_ref,
      authority_posture: record.authority_posture,
      ...(record.last_error ? { error: record.last_error } : {}),
      ...evidence,
    });
    turns.set(normalizedTurnId, record);
    updateTurnActivity(record);
    appendTurnCompatibilityEvent(previousState, record, evidence);
    return record;
  }

  function observeTurnEvent(event: SessionEvent = {}): NarsTurnRecord | null {
    const turnId = event.turn_id ?? event.input_event_id;
    if (!turnId || !turns.has(String(turnId))) return null;
    const normalizedTurnId = String(turnId);
    const advance = (nextState: unknown, evidence: JsonRecord = {}): NarsTurnRecord | null => {
      const current = turns.get(normalizedTurnId);
      if (!current || current.turn_state === nextState || isNarsTurnTerminalState(current.turn_state)) return current ?? null;
      if (!canTransitionNarsTurn(current.turn_state, nextState)) return current;
      return transitionTurn(normalizedTurnId, nextState, { ...evidence, observed_event: event.event });
    };
    switch (event.event) {
      case 'carrier_turn_started':
        advance('contextualized');
        advance('evaluating');
        break;
      case 'carrier_tool_requested':
        advance('tool_requested', { tool_name: event.tool_name ?? null, tool_call_id: event.tool_call_id ?? null });
        break;
      case 'carrier_tool_completed': {
        const status = event.status ?? 'unknown';
        if (status === 'interrupted') {
          advance('interrupted', { tool_name: event.tool_name ?? null, reason: 'tool_interrupted', terminal_status: 'interrupted' });
        } else if (status === 'blocked') {
          advance('blocked', { tool_name: event.tool_name ?? null, reason: 'tool_blocked' });
        } else if (status === 'refused') {
          advance('tool_refused', { tool_name: event.tool_name ?? null, reason: 'tool_refused' });
          advance('evaluating');
        } else {
          advance('tool_admitted', { tool_name: event.tool_name ?? null });
          advance('executing', { tool_name: event.tool_name ?? null });
          advance('reconciling', { tool_name: event.tool_name ?? null });
          advance('evaluating');
        }
        break;
      }
      case 'assistant_message':
        advance('reconciling');
        break;
      case 'carrier_turn_completed':
        advance('reconciling');
        advance('completed', { terminal_status: 'completed' });
        break;
      case 'carrier_turn_blocked':
      case 'turn_blocked':
        advance('blocked', { reason: event.reason ?? 'turn_blocked', terminal_status: 'blocked' });
        break;
      case 'carrier_turn_refused':
      case 'turn_refused':
        advance('refused', { reason: event.reason ?? 'turn_refused', terminal_status: 'refused' });
        break;
      case 'carrier_turn_interrupted':
      case 'turn_interrupted':
        advance('interrupted', { reason: event.reason ?? 'turn_interrupted', terminal_status: 'interrupted' });
        break;
      case 'carrier_turn_failed': {
        const error = String(event.error ?? 'carrier_turn_failed');
        const interrupted = /abort|cancel|interrupt/i.test(error) || event.terminal_status === 'interrupted';
        advance(interrupted ? 'interrupted' : 'failed', { error, terminal_status: interrupted ? 'interrupted' : 'failed' });
        break;
      }
      default:
        break;
    }
    return turns.get(normalizedTurnId) ?? null;
  }

  function updateTurnActivity(record: NarsTurnRecord): void {
    state.lastTurnId = record.turn_id;
    state.lastTurnState = record.turn_state;
    if (isNarsTurnTerminalState(record.turn_state)) {
      state.activeTurnId = null;
      state.activeTurnState = null;
    } else {
      state.activeTurnId = record.turn_id;
      state.activeTurnState = record.turn_state;
    }
  }

  function appendTurnCompatibilityEvent(previousState: NarsTurnState | null, record: NarsTurnRecord, evidence: JsonRecord): void {
    const base = {
      turn_id: record.turn_id,
      input_event_id: record.input_event_id,
      attempt: record.attempt,
      turn_state: record.turn_state,
      terminal_state: record.terminal_state,
    };
    if (record.turn_state === 'accepted') {
      appendEvent({ event: 'directive_received', ...base, input_ref: record.input_ref, authority_posture: record.authority_posture });
      return;
    }
    if (record.turn_state === 'evaluating' && (previousState === 'accepted' || previousState === 'contextualized')) {
      appendEvent({ event: 'turn_started', ...base });
      return;
    }
    if (!record.terminal_state) return;
    if (record.terminal_state === 'failed') {
      appendEvent({
        event: 'turn_failed',
        ...base,
        terminal_status: 'failed',
        error_summary: record.last_error ?? evidence.error ?? 'turn_failed',
      });
    } else if (record.terminal_state === 'interrupted') {
      appendEvent({ event: 'turn_interrupted', ...base, terminal_status: 'interrupted' });
    } else {
      appendEvent({ event: 'turn_complete', ...base, terminal_status: record.terminal_state });
    }
  }

  function createQueue(options: NarsSessionQueueOptions = {}): NarsInputQueueApi {
    const queuePath = operatorInputQueueStatePathFromSessionPath(sessionPath);
    const persisted = readOperatorInputQueueState(queuePath);
    if (typeof options.drain !== 'function') throw new Error('nars_queue_drain_required');
    return createInputQueue({
      ...options,
      drain: options.drain,
      identity: options.identity ?? agentId,
      session: options.session ?? sessionId,
      initialPending: options.initialPending ?? persisted.pending,
      initialIdempotencyRecords: options.initialIdempotencyRecords ?? existing,
      classifyInputRuntimeQueueAdmissionFn: options.classifyInputRuntimeQueueAdmissionFn
        ?? ((event, _transcriptDisplaySettings, state) => classifyCarrierInputQueueAdmission(event, state)),
      classifyInputRuntimeAdmissionFn: options.classifyInputRuntimeAdmissionFn
        ?? ((event) => classifyCarrierInputAdmission(event)),
      assertEnqueueAllowedFn: (event, enqueueOptions) => {
        if (state.lifecycle !== 'ready') throw new Error(`nars_session_not_accepting_input:${state.lifecycle}`);
        options.assertEnqueueAllowedFn?.(event, enqueueOptions);
      },
      appendSessionFn: options.appendSessionFn ?? ((event: unknown) => appendEvent(isRecord(event) ? event : {})),
      onInputAcceptedFn: (event) => {
        ensureTurn(event, {
          inputRef: inputRefFromInput(event),
          authorityPosture: recordValue(event, 'authority_posture') ?? recordValue(event.metadata, 'authority_posture') ?? null,
        });
        if (event.source_kind === 'operator') {
          appendEvent({
            event: 'user_message',
            type: 'user_message',
            input_id: event.event_id,
            input_event_id: event.event_id,
            ...(event.request_id ? { request_id: event.request_id } : {}),
            content: event.content,
            source: event.source,
            source_kind: event.source_kind,
            transport: event.transport,
            delivery_mode: event.delivery_mode,
            ...(event.authority_ref ? { authority_ref: event.authority_ref } : {}),
          });
        }
        options.onInputAcceptedFn?.(event);
      },
      onQueueStateChangedFn: (queueState) => {
        writeOperatorInputQueueState(queuePath, {
          ...queueState,
          last_transition: queueState.transition ?? queueState.last_transition ?? null,
        });
        options.onQueueStateChangedFn?.(queueState);
      },
    });
  }

  function registerArtifact(options: NarsArtifactRegisterOptions = {}) {
    const registered = registerNarsArtifact({
      ...options,
      sessionPath,
      sessionId,
      agentId: options.agentId ?? agentId,
      siteRoot: options.siteRoot ?? siteRoot,
    });
    appendEvent({
      event: 'session_artifact_registered',
      artifact_id: registered.record.artifact_id,
      kind: registered.record.kind,
      artifact: registered.public_record,
    });
    return registered;
  }

  function transitionArtifact(artifactId: string, nextState: NaradaArtifactLifecycleState, evidence: NaradaArtifactLifecycleEvidence = {}) {
    if (state.lifecycle === 'closed') throw new Error('nars_session_closed');
    const transitioned = transitionNarsArtifact({
      sessionPath,
      artifactId,
      nextState,
      evidence,
    });
    if (transitioned.changed) {
      appendEvent({
        event: 'session_artifact_lifecycle_transition',
        artifact_id: transitioned.record.artifact_id,
        kind: transitioned.record.kind,
        previous_state: transitioned.previous_record.lifecycle.state,
        artifact_state: transitioned.record.lifecycle.state,
        reason: transitioned.record.lifecycle.reason,
        artifact: transitioned.public_record,
      });
    }
    return transitioned;
  }

  function revokeArtifact(artifactId: string, evidence: NaradaArtifactLifecycleEvidence = {}) {
    return transitionArtifact(artifactId, 'revoked', evidence);
  }

  function expireArtifact(artifactId: string, evidence: NaradaArtifactLifecycleEvidence = {}) {
    return transitionArtifact(artifactId, 'expired', evidence);
  }

  function archiveArtifact(artifactId: string, evidence: NaradaArtifactLifecycleEvidence = {}) {
    return transitionArtifact(artifactId, 'archived', evidence);
  }

  function surfaceAttachments(): NarsSurfaceAttachment[] {
    if (!sessionPath) return [];
    return listNarsSurfaceAttachments({ sessionPath, sessionId: requiredSessionId, now: now() });
  }

  function registerSurfaceAttachment(
    options: NarsSurfaceAttachment | NarsSurfaceAttachmentCreateOptions,
  ): NarsSurfaceAttachment {
    if (state.lifecycle === 'closed') throw new Error('nars_session_closed');
    if (!sessionPath) throw new Error('surface_attachment_session_path_required');
    const attachment = 'schema' in options
      ? options
      : createNarsSurfaceAttachment({ ...options, session_id: requiredSessionId, now: options.now ?? now() });
    const registered = registerNarsSurfaceAttachmentInRegistry({
      sessionPath,
      sessionId: requiredSessionId,
      attachment,
      now: now(),
    });
    appendEvent({
      event: 'session_surface_attachment_state_transition',
      attachment_id: registered.attachment_id,
      previous_attachment_state: null,
      attachment_state: registered.attachment_state,
      surface_attachment: registered,
      reason: 'surface_attachment_requested',
    });
    return registered;
  }

  function transitionSurfaceAttachment(
    attachmentId: string,
    nextState: NarsSurfaceAttachmentState,
    evidence: NarsSurfaceAttachmentTransitionEvidence = {},
  ): NarsSurfaceAttachmentTransitionResult {
    if (state.lifecycle === 'closed') throw new Error('nars_session_closed');
    if (!sessionPath) throw new Error('surface_attachment_session_path_required');
    const result = transitionNarsSurfaceAttachmentInRegistry({
      sessionPath,
      sessionId: requiredSessionId,
      attachmentId,
      nextState,
      evidence: { ...evidence, now: evidence.now ?? now() },
    });
    if (result.changed) {
      appendEvent({
        event: 'session_surface_attachment_state_transition',
        attachment_id: result.record.attachment_id,
        previous_attachment_state: result.previous_record.attachment_state,
        attachment_state: result.record.attachment_state,
        surface_attachment: result.record,
        ...(typeof evidence.reason === 'string' ? { reason: evidence.reason } : {}),
      });
    }
    return result;
  }

  function detachSurfaceAttachment(attachmentId: string, evidence: NarsSurfaceAttachmentTransitionEvidence = {}) {
    const detaching = transitionSurfaceAttachment(attachmentId, 'detaching', evidence);
    if (!detaching.changed || detaching.record.attachment_state !== 'detaching') return detaching;
    return transitionSurfaceAttachment(attachmentId, 'detached', evidence);
  }

  function surfaceAttachmentSummary(): NarsSurfaceAttachmentSummary {
    return summarizeNarsSurfaceAttachments(surfaceAttachments());
  }

  function healthSnapshot({ mcpOperationalState = 'unknown' }: { mcpOperationalState?: string } = {}): NarsSessionCoreHealthSnapshot {
    const postureState = { ...state, closed: state.lifecycle === 'closed' };
    return {
      schema: 'narada.nars.session_core_health.v1',
      session_id: requiredSessionId,
      lifecycle_state: state.lifecycle,
      mcp_operational_state: mcpOperationalState,
      ...createSessionActivitySnapshot(state),
      ...createOperationalPostureSnapshot({ state: postureState, mcpOperationalState }),
      surface_attachment_summary: surfaceAttachmentSummary(),
      cursor: eventHub.cursor(),
    } as unknown as NarsSessionCoreHealthSnapshot;
  }

  function recoverySnapshot(): NarsSessionCoreRecoverySnapshot {
    const queuePath = operatorInputQueueStatePathFromSessionPath(sessionPath);
    const log = readNarsEventLog(eventsPath);
    return {
      schema: 'narada.nars.session_core_recovery.v1',
      session_id: requiredSessionId,
      lifecycle_state: state.lifecycle,
      events_path: requiredEventsPath,
      event_count: log.events.length,
      corrupt_event_line_count: log.corruptLineCount,
      operator_input_queue: readOperatorInputQueueState(queuePath),
      artifacts: readNarsArtifactIndex({ sessionPath }),
      active_turn: state.activeTurnId ? turns.get(state.activeTurnId) ?? null : null,
      turns: [...turns.values()],
      recovery_attempts: [...recoveryAttempts.values()],
      surface_attachments: sessionPath
        ? readNarsSurfaceAttachmentRegistry({ sessionPath, sessionId: requiredSessionId, now: now() })
        : {
          schema: 'narada.nars.surface_attachment_registry.v1',
          session_id: requiredSessionId,
          generated_at: now(),
          attachments: [],
        },
    };
  }

  return {
    sessionId,
    agentId,
    sessionPath,
    eventsPath,
    appendEvent,
    transition,
    ensureTurn,
    prepareTurn,
    transitionTurn,
    observeTurnEvent,
    beginRecoveryAttempt,
    transitionRecoveryAttempt,
    recoveryAttempt: (attemptId: unknown) => recoveryAttempts.get(String(attemptId)) ?? null,
    recoveryAttempts: () => [...recoveryAttempts.values()],
    turn: (turnId: unknown) => turns.get(String(turnId)) ?? null,
    turns: () => [...turns.values()],
    createQueue,
    registerArtifact,
    transitionArtifact,
    revokeArtifact,
    expireArtifact,
    archiveArtifact,
    surfaceAttachments,
    registerSurfaceAttachment,
    transitionSurfaceAttachment,
    detachSurfaceAttachment,
    surfaceAttachmentSummary,
    healthSnapshot,
    recoverySnapshot,
    eventHub,
    get lifecycleState() { return state.lifecycle; },
  };
}

function inputRefFromInput(input: SessionEvent = {}): JsonRecord {
  return {
    kind: 'session_input',
    event_id: input.event_id ?? input.turn_id ?? null,
    request_id: input.request_id ?? null,
    source: input.source ?? null,
    transport: input.transport ?? null,
  };
}

function rehydrateRecoveryAttempts(events: readonly SessionEvent[], { sessionId = null }: RehydrateDefaults = {}): Map<string, NarsRecoveryAttemptRecord> {
  const attempts = new Map<string, NarsRecoveryAttemptRecord>();
  for (const event of events) {
    if (event.event !== 'recovery_attempt_state_transition' || !event.attempt_id) continue;
    const nextState = event.recovery_attempt_state;
    if (!isNarsRecoveryAttemptState(nextState)) continue;
    const attemptId = String(event.attempt_id);
    const current = attempts.get(attemptId);
    if (!current) {
      let created = createNarsRecoveryAttemptRecord({
        attemptId,
        turnId: stringOrNull(event.turn_id),
        inputEventId: stringOrNull(event.input_event_id),
        sessionId: stringOrNull(event.session_id) ?? sessionId,
        attemptNumber: Number(event.attempt_number ?? 1),
        recoveryKind: event.recovery_kind,
        requestedAt: event.timestamp ?? null,
        reason: event.reason ?? null,
      });
      if (nextState !== 'requested') {
        created = transitionNarsRecoveryAttempt(created, nextState, {
          reason: event.reason,
          error: event.error,
          updated_at: event.timestamp ?? null,
        });
      }
      attempts.set(attemptId, normalizeNarsRecoveryAttemptRecord({ ...created, updated_at: event.timestamp ?? created.updated_at, error: event.error ?? created.error }));
      continue;
    }
    if (current.recovery_attempt_state === nextState) continue;
    const transitioned = transitionNarsRecoveryAttempt(current, nextState, {
      reason: event.reason,
      error: event.error,
      updated_at: event.timestamp ?? current.updated_at,
    });
    attempts.set(attemptId, normalizeNarsRecoveryAttemptRecord({ ...transitioned, updated_at: event.timestamp ?? transitioned.updated_at, error: event.error ?? transitioned.error }));
  }
  return attempts;
}

function rehydrateTurnRecords(events: readonly SessionEvent[], defaults: RehydrateDefaults): Map<string, NarsTurnRecord> {
  const turns = new Map<string, NarsTurnRecord>();
  for (const event of events) {
    if (event.event === 'turn_lifecycle_transition' && event.turn_id) {
      const current = turns.get(String(event.turn_id));
      const turnState = event.turn_state;
      if (!isNarsTurnState(turnState)) continue;
      turns.set(String(event.turn_id), normalizeNarsTurnRecord({
        ...current,
        turn_id: event.turn_id,
        input_event_id: event.input_event_id ?? current?.input_event_id ?? event.turn_id,
        session_id: event.session_id ?? current?.session_id ?? defaults.sessionId,
        agent_id: event.agent_id ?? current?.agent_id ?? defaults.agentId,
        input_ref: event.input_ref ?? current?.input_ref,
        authority_posture: event.authority_posture ?? current?.authority_posture,
        turn_state: turnState,
        attempt: event.attempt ?? current?.attempt ?? 1,
        updated_at: event.timestamp ?? current?.updated_at ?? null,
        last_error: event.error ?? current?.last_error ?? null,
      }));
      continue;
    }
    applyLegacyTurnEvent(turns, event, defaults);
  }
  return turns;
}

function applyLegacyTurnEvent(turns: Map<string, NarsTurnRecord>, event: SessionEvent, defaults: RehydrateDefaults): void {
  const turnId = event.turn_id ?? event.input_event_id ?? (event.event === 'input_event_queued' ? event.event_id : null);
  if (!turnId) return;
  const normalizedTurnId = String(turnId);
  const current = turns.get(normalizedTurnId) ?? normalizeNarsTurnRecord({
    turn_id: normalizedTurnId,
    input_event_id: event.input_event_id ?? event.event_id ?? normalizedTurnId,
    session_id: event.session_id ?? defaults.sessionId,
    agent_id: event.agent_id ?? defaults.agentId,
    input_ref: inputRefFromInput(event),
    turn_state: 'accepted',
    updated_at: event.timestamp ?? null,
  });
  const nextState = legacyTurnStateForEvent(event);
  if (!nextState) return;
  turns.set(normalizedTurnId, normalizeNarsTurnRecord({
    ...current,
    turn_state: nextState,
    terminal_state: terminalStateForTurnState(nextState),
    last_error: event.error ?? current.last_error ?? null,
    updated_at: event.timestamp ?? current.updated_at,
  }));
}

function legacyTurnStateForEvent(event: SessionEvent): NarsTurnState | null {
  switch (event.event) {
    case 'input_event_queued': return 'accepted';
    case 'input_event_started': return 'contextualized';
    case 'carrier_turn_started':
    case 'turn_started': return 'evaluating';
    case 'carrier_tool_requested':
    case 'tool_call': return 'tool_requested';
    case 'carrier_tool_completed':
      if (event.status === 'blocked') return 'blocked';
      return event.status === 'refused' ? 'tool_refused' : 'evaluating';
    case 'assistant_message': return 'reconciling';
    case 'carrier_turn_completed':
      return 'completed';
    case 'turn_complete':
      return isNarsTurnTerminalState(event.terminal_status) ? event.terminal_status : 'completed';
    case 'carrier_turn_blocked':
    case 'turn_blocked': return 'blocked';
    case 'carrier_turn_refused':
    case 'turn_refused': return 'refused';
    case 'carrier_turn_interrupted':
    case 'turn_interrupted': return 'interrupted';
    case 'carrier_turn_failed':
    case 'turn_failed': return event.terminal_status === 'interrupted'
      || /abort|cancel|interrupt/i.test(String(event.error ?? '')) ? 'interrupted' : 'failed';
    default: return null;
  }
}

function findActiveTurn(turns: Map<string, NarsTurnRecord>): NarsTurnRecord | null {
  let active: NarsTurnRecord | null = null;
  for (const record of turns.values()) {
    if (!isNarsTurnTerminalState(record.turn_state)) active = record;
  }
  return active;
}

function requestOutcomeForEvent(event: SessionEvent = {}): string | null {
  if (event.event === 'carrier_turn_failed' || event.event === 'turn_failed') {
    return /abort|cancel|interrupt/i.test(String(event.error ?? event.error_summary ?? ''))
      ? 'cancelled'
      : 'request_runtime_failure';
  }
  if (event.event === 'session_control_rejected') {
    if (event.code === 'request_dispatch_failed') return 'dispatch_failure';
    return typeof event.code === 'string' && ['invalid_json', 'unsupported_session_control'].includes(event.code)
      ? 'invalid_request'
      : null;
  }
  if (event.event === 'session_control_response') {
    return event.request_outcome === 'completed' || event.terminal_state === 'completed'
      ? 'completed'
      : null;
  }
  return null;
}

function requestIssueForEvent(event: SessionEvent = {}): string | null {
  if (event.event === 'carrier_turn_failed' || event.event === 'turn_failed') {
    return /abort|cancel|interrupt/i.test(String(event.error ?? event.error_summary ?? '')) ? null : 'carrier_turn_failed';
  }
  if (event.event === 'session_control_rejected') return typeof event.code === 'string' ? event.code : 'session_control_rejected';
  return null;
}

function countExistingEvents(events: readonly SessionEvent[], classify: (event: SessionEvent) => string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) incrementCount(counts, classify(event));
  return counts;
}

function incrementCount(counts: Record<string, number>, key: string | null): void {
  if (!key) return;
  counts[key] = Number(counts[key] ?? 0) + 1;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringValue(value: unknown, fallback: string): string {
  return stringOrNull(value) ?? fallback;
}

function eventKindForRecord(event: SessionEvent | NarsSessionEvent | undefined): string | null {
  const value = event?.event ?? event?.event_kind;
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.type === 'string') return value.type;
  return typeof event?.type === 'string' ? event.type : null;
}
