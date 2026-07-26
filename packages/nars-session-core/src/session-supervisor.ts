import { createNarsSessionCore } from './session-core.js';
import type { NarsSessionCoreRecoverySnapshot } from './session-core.js';
import { transitionNarsSessionShutdown } from './session-shutdown-state.js';
import type { NarsSessionShutdownState } from './session-shutdown-state.js';
import type { NarsInputQueueApi, NarsQueueInputEvent } from './input-queue.js';
import type { NarsSessionEvent } from './event-log.js';

type JsonRecord = Record<string, unknown>;
type SessionCore = ReturnType<typeof createNarsSessionCore>;
type SupervisorInput = JsonRecord | string | null | undefined;

interface NarsTurnMessage extends JsonRecord {
  role: string;
  content: unknown;
}

interface NarsTurnContext extends JsonRecord {
  turnId: string;
  inputEventId: string;
  messages: NarsTurnMessage[];
  abortSignal: AbortSignal;
  recoveryReplay: boolean;
  recoveryAttemptId?: string;
}

interface NarsControlRequest extends JsonRecord {
  id?: string | null;
  request_id?: string | null;
  method?: string | null;
  content?: unknown;
  params?: JsonRecord;
}

interface NarsCarrier {
  runTurn: (context: NarsTurnContext, eventSink: (event: JsonRecord) => Promise<NarsSessionEvent>, toolGateway: NarsToolGateway) => Promise<JsonRecord>;
}

interface NarsToolGateway {
  operationalState?: () => string;
  toolCatalog?: () => JsonRecord[];
  close?: () => Promise<unknown> | unknown;
  [key: string]: unknown;
}

interface NarsControlHandlerContext {
  request: NarsControlRequest;
  sessionCore: SessionCore;
  submit: (input: SupervisorInput) => Promise<NarsQueueInputEvent>;
  eventSink: (event: JsonRecord) => Promise<NarsSessionEvent>;
  toolGateway: NarsToolGateway;
}

interface NarsSessionSupervisorOptions {
  sessionCore?: SessionCore;
  sessionCoreOptions?: Parameters<typeof createNarsSessionCore>[0];
  carrier?: NarsCarrier;
  toolGateway?: NarsToolGateway;
  handleControlRequest?: ((request: NarsControlHandlerContext) => Promise<JsonRecord> | JsonRecord) | null;
  buildTurnContext?: (input: NarsQueueInputEvent) => JsonRecord;
}

interface SupervisorCloseHooks {
  beforeSessionClosed?: () => Promise<unknown> | unknown;
}

interface NarsQueueHealth extends JsonRecord {
  running: boolean;
  pending_count: number;
  pending_system_directive_count: number;
  pending_operator_directive_count: number;
  pending_observer_count: number;
  pending_input_refs: JsonRecord[];
}

interface NarsSupervisorHealth extends JsonRecord {
  operator_input_queue: NarsQueueHealth;
  shutdown_state: NarsSessionShutdownState;
}

function eventRecord(event: JsonRecord = {}): JsonRecord {
  const { kind, ...payload } = event ?? {};
  return { event: kind ?? 'session_supervisor_event', ...payload };
}

const TERMINAL_TURN_STATES = new Set(['completed', 'blocked', 'interrupted', 'failed', 'refused']);

export function createNarsSessionSupervisor({
  sessionCore,
  sessionCoreOptions,
  carrier,
  toolGateway = {},
  handleControlRequest = null,
  buildTurnContext = (input) => ({
    turnId: input.event_id,
    messages: [{ role: 'user', content: input.content }],
  }),
}: NarsSessionSupervisorOptions = {}) {
  const core = sessionCore ?? createNarsSessionCore(sessionCoreOptions);
  if (!carrier || typeof carrier.runTurn !== 'function') throw new Error('nars_session_supervisor_carrier_required');
  let queue: NarsInputQueueApi | null = null;
  let activeAbortController: AbortController | null = null;
  let activeTurnId: string | null = null;
  let cancelRequested = false;
  let recoveryDrain: Promise<unknown> | null = null;
  let recoveryMode = false;
  let shutdownState: NarsSessionShutdownState = core.lifecycleState === 'closed' ? 'closed' : core.lifecycleState === 'failed' ? 'failed' : 'idle';
  let closePromise: Promise<NarsSupervisorHealth> | null = null;

  function queueSnapshot(): NarsQueueHealth {
    const snapshot: JsonRecord = queue
      ? queue.state() as unknown as JsonRecord
      : {};
    const pendingInputRefs = typeof queue?.items === 'function'
      ? queue.items().slice(0, 100).map((item: JsonRecord) => ({
        event_id: item.event_id ?? null,
        request_id: item.request_id ?? null,
        directive_id: item.directive_id ?? null,
        admission_state: item.admission_state ?? null,
        created_at: item.created_at ?? null,
      }))
      : [];
    return {
      running: Boolean(snapshot.running),
      pending_count: Number(snapshot.pendingCount ?? 0),
      pending_system_directive_count: Number(snapshot.pendingSystemDirectiveCount ?? 0),
      pending_operator_directive_count: Number(snapshot.pendingOperatorDirectiveCount ?? 0),
      pending_observer_count: Number(snapshot.pendingObserverCount ?? 0),
      pending_input_refs: pendingInputRefs,
    };
  }

  function healthSnapshot(mcpOperationalState: string = toolGateway.operationalState?.() ?? 'unknown'): NarsSupervisorHealth {
    return {
      ...core.healthSnapshot({ mcpOperationalState }),
      shutdown_state: shutdownState,
      operator_input_queue: queueSnapshot(),
    };
  }

  const eventSink = async (event: JsonRecord): Promise<NarsSessionEvent> => {
    const record = core.appendEvent(eventRecord(event));
    core.observeTurnEvent(record);
    return record;
  };

  function transitionShutdown(nextState: NarsSessionShutdownState, evidence: JsonRecord = {}): NarsSessionShutdownState {
    if (shutdownState === nextState) return shutdownState;
    const previousState = shutdownState;
    transitionNarsSessionShutdown(previousState, nextState);
    shutdownState = nextState;
    core.appendEvent({
      event: 'session_shutdown_state_transition',
      previous_state: previousState,
      shutdown_state: nextState,
      ...evidence,
    });
    return shutdownState;
  }

  const drain = async (input: NarsQueueInputEvent): Promise<JsonRecord> => {
    const turnId = String(input.event_id);
    const isRecoveryReplay = recoveryMode;
    let recoveryAttempt: ReturnType<SessionCore['beginRecoveryAttempt']> | null = null;
    if (isRecoveryReplay) {
      recoveryAttempt = core.beginRecoveryAttempt(turnId, {
        input_event_id: input.event_id,
        recovery_kind: 'queue_replay',
        reason: 'session_start_recovery',
      });
      core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'claimed', { reason: 'queue_item_claimed' });
    }
    const prepared = core.prepareTurn(turnId, {
      reason: isRecoveryReplay ? 'queue_replay' : 'queue_drain',
      ...(recoveryAttempt ? { recovery_attempt_id: recoveryAttempt.attempt_id } : {}),
    });
    if (prepared.action === 'already_completed' || prepared.action === 'terminal') {
      if (recoveryAttempt) core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'skipped', {
        reason: prepared.action === 'already_completed' ? 'already_completed' : 'terminal_turn',
      });
      return { terminal_state: prepared.turn?.terminal_state ?? null, replay_skipped: true };
    }
    if (recoveryAttempt) core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'replaying', { reason: 'carrier_replay_started' });

    core.transitionTurn(turnId, 'contextualized', { reason: 'input_admitted_to_turn' });
    core.transitionTurn(turnId, 'evaluating', { reason: 'turn_context_ready' });
    const controller = new AbortController();
    activeAbortController = controller;
    activeTurnId = turnId;
    const preCancelled = cancelRequested;
    cancelRequested = false;
    if (preCancelled) controller.abort();
    try {
      const context = {
        ...buildTurnContext(input),
        turnId,
        inputEventId: turnId,
        abortSignal: controller.signal,
        recoveryReplay: isRecoveryReplay,
        ...(recoveryAttempt ? { recoveryAttemptId: recoveryAttempt.attempt_id } : {}),
      } as NarsTurnContext;
      const result = await carrier.runTurn(context, eventSink, toolGateway);
      const current = core.turn(turnId);
      const returnedTerminalState = isTerminalTurnState(result.terminal_state) ? result.terminal_state : null;
      if (current && !TERMINAL_TURN_STATES.has(current.turn_state)) {
        if (returnedTerminalState && returnedTerminalState !== 'completed') {
          core.transitionTurn(turnId, returnedTerminalState, {
            ...(result?.error ? { error: result.error } : {}),
            terminal_status: returnedTerminalState,
            reason: 'carrier_returned_terminal_result',
          });
        } else {
          core.transitionTurn(turnId, 'reconciling', { reason: 'carrier_returned' });
          core.transitionTurn(turnId, 'completed', { terminal_status: 'completed' });
        }
      }
      const finalTurn = core.turn(turnId);
      if (recoveryAttempt) {
        if (finalTurn?.terminal_state === 'failed' || finalTurn?.terminal_state === 'interrupted') {
          core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, finalTurn.terminal_state, {
            reason: `recovery_replay_${finalTurn.terminal_state}`,
            ...(result?.error ? { error: result.error } : {}),
          });
        } else {
          core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'reconciled', {
            reason: 'carrier_replay_returned',
            terminal_state: finalTurn?.terminal_state ?? null,
          });
          core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'completed', { reason: 'recovery_replay_completed' });
        }
      }
      return { terminal_state: finalTurn?.terminal_state ?? returnedTerminalState ?? 'completed', result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const interrupted = controller.signal.aborted || /abort|cancel|interrupt/i.test(message);
      const current = core.turn(turnId);
      if (current && !TERMINAL_TURN_STATES.has(current.turn_state)) {
        core.transitionTurn(turnId, interrupted ? 'interrupted' : 'failed', {
          error: message,
          terminal_status: interrupted ? 'interrupted' : 'failed',
        });
      }
      if (recoveryAttempt) {
        core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, interrupted ? 'interrupted' : 'failed', {
          reason: interrupted ? 'recovery_replay_interrupted' : 'recovery_replay_failed',
          error: message,
        });
      }
      throw error;
    } finally {
      if (activeTurnId === turnId) {
        activeTurnId = null;
        activeAbortController = null;
      }
    }
  };

  function start(): JsonRecord {
    if (core.lifecycleState === 'starting') core.transition('ready', { supervisor: 'nars-session-core' });
    if (!queue) queue = core.createQueue({ drain });
    if (queue.pendingCount > 0 && !recoveryDrain && core.lifecycleState === 'ready') {
      recoveryMode = true;
      recoveryDrain = queue.drainUntilIdle()
        .catch(async (error) => {
          await eventSink({ kind: 'session_recovery_drain_failed', error: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => { recoveryMode = false; });
    }
    return healthSnapshot();
  }

  async function cancel(evidence: JsonRecord = {}): Promise<boolean> {
    const turnId = activeTurnId;
    if (activeAbortController) activeAbortController.abort();
    else cancelRequested = true;
    await eventSink({ kind: 'session_turn_cancel_requested', turn_id: turnId, ...evidence });
    if (turnId) await eventSink({ kind: 'interrupt_requested', turn_id: turnId, ...evidence });
    return true;
  }

  async function dispatch(request: SupervisorInput = {}): Promise<JsonRecord> {
    if (core.lifecycleState !== 'ready') throw new Error(`nars_session_not_ready:${core.lifecycleState}`);
    const requestRecord: NarsControlRequest = (isRecord(request) ? request : {}) as NarsControlRequest;
    const content = typeof request === 'string'
      ? request
      : requestRecord.content ?? recordValue(requestRecord.params, 'content') ?? recordValue(requestRecord.params, 'message') ?? null;
    if (content != null) {
      const submitted = await submit({ ...requestRecord, content });
      const turnId = submitted.event_id ?? requestRecord.event_id ?? null;
      return {
        ...submitted,
        terminal_state: core.turn(turnId)?.terminal_state ?? submitted?.terminal_state ?? 'completed',
      };
    }
    if (typeof handleControlRequest !== 'function') {
      throw new Error('nars_session_control_handler_required');
    }
    const requestId = requestRecord.id ?? requestRecord.request_id ?? null;
    await eventSink({ kind: 'control_request_started', request_id: requestId, method: requestRecord.method ?? null });
    try {
      const result = await handleControlRequest({
        request: requestRecord,
        sessionCore: core,
        submit,
        eventSink,
        toolGateway,
      });
      await eventSink({ kind: 'control_request_completed', request_id: requestId, method: requestRecord.method ?? null });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await eventSink({ kind: 'control_request_failed', request_id: requestId, method: requestRecord.method ?? null, error: message });
      throw error;
    }
  }

  async function submit(input: SupervisorInput): Promise<NarsQueueInputEvent> {
    if (core.lifecycleState !== 'ready') throw new Error(`nars_session_not_ready:${core.lifecycleState}`);
    if (!queue) start();
    const activeQueue = queue;
    if (!activeQueue) throw new Error('nars_session_queue_not_initialized');
    const queuedInput = isRecord(input)
      ? { ...input, request_id: input.request_id ?? input.id ?? null }
      : input;
    return activeQueue.enqueue(queuedInput, { drain: true });
  }

  function health(): NarsSupervisorHealth {
    return healthSnapshot();
  }

  function recovery(): NarsSessionCoreRecoverySnapshot {
    return core.recoverySnapshot();
  }

  async function close(evidence: JsonRecord = {}, hooks: SupervisorCloseHooks = {}): Promise<NarsSupervisorHealth> {
    if (closePromise) return closePromise;
    closePromise = closeInternal(evidence, hooks);
    return closePromise;
  }

  async function closeInternal(evidence: JsonRecord = {}, hooks: SupervisorCloseHooks = {}): Promise<NarsSupervisorHealth> {
    if (core.lifecycleState === 'closed') return healthSnapshot('closed');
    if (core.lifecycleState === 'failed') return healthSnapshot();
    if (core.lifecycleState === 'starting' || core.lifecycleState === 'ready') core.transition('closing', evidence);
    try {
      if (activeAbortController || activeTurnId) {
        transitionShutdown('cancelling', evidence);
        await cancel({ ...evidence, reason: evidence.reason ?? 'session_close' });
      } else {
        transitionShutdown('draining', evidence);
      }
      await queue?.waitForIdle?.();
      if (shutdownState === 'cancelling') transitionShutdown('draining', evidence);
      transitionShutdown('finalizing_queue', evidence);
      queue?.finalizeSession?.();
      transitionShutdown('closing_tools', evidence);
      await toolGateway.close?.();
      await hooks.beforeSessionClosed?.();
      transitionShutdown('closed', evidence);
      if (core.lifecycleState === 'closing') core.transition('closed', evidence);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (shutdownState !== 'closed' && shutdownState !== 'failed') transitionShutdown('failed', { ...evidence, error: message });
      if (core.lifecycleState === 'closing') core.transition('failed', { ...evidence, error: message });
      throw error;
    }
    return healthSnapshot('closed');
  }

  return Object.freeze({
    core,
    start,
    submit,
    dispatch,
    cancel,
    health,
    recovery,
    close,
    get recoveryDrain() { return recoveryDrain; },
    get activeTurnId() { return activeTurnId; },
    get shutdownState() { return shutdownState; },
  });
}

function isTerminalTurnState(value: unknown): value is 'completed' | 'blocked' | 'interrupted' | 'failed' | 'refused' {
  return typeof value === 'string' && TERMINAL_TURN_STATES.has(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}
