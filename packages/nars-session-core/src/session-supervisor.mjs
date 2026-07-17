import { createNarsSessionCore } from './session-core.mjs';
import { transitionNarsSessionShutdown } from './session-shutdown-state.mjs';

function eventRecord(event) {
  const { kind, ...payload } = event ?? {};
  return { event: kind ?? 'session_supervisor_event', ...payload };
}

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
} = {}) {
  const core = sessionCore ?? createNarsSessionCore(sessionCoreOptions);
  if (!carrier || typeof carrier.runTurn !== 'function') throw new Error('nars_session_supervisor_carrier_required');
  let queue = null;
  let activeAbortController = null;
  let activeTurnId = null;
  let cancelRequested = false;
  let recoveryDrain = null;
  let recoveryMode = false;
  let shutdownState = core.lifecycleState === 'closed' ? 'closed' : core.lifecycleState === 'failed' ? 'failed' : 'idle';
  let closePromise = null;

  function queueSnapshot() {
    const snapshot = queue?.state?.() ?? {};
    const pendingInputRefs = typeof queue?.items === 'function'
      ? queue.items().slice(0, 100).map((item) => ({
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

  function healthSnapshot(mcpOperationalState = toolGateway.operationalState?.() ?? 'unknown') {
    return {
      ...core.healthSnapshot({ mcpOperationalState }),
      shutdown_state: shutdownState,
      operator_input_queue: queueSnapshot(),
    };
  }

  const eventSink = async (event) => {
    const record = core.appendEvent(eventRecord(event));
    core.observeTurnEvent(record);
    return record;
  };

  function transitionShutdown(nextState, evidence = {}) {
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

  const drain = async (input) => {
    const turnId = String(input.event_id);
    const isRecoveryReplay = recoveryMode;
    let recoveryAttempt = null;
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
      return { terminal_state: prepared.turn.terminal_state, replay_skipped: true };
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
      };
      const result = await carrier.runTurn(context, eventSink, toolGateway);
      const current = core.turn(turnId);
      if (current && !['completed', 'blocked', 'interrupted', 'failed', 'refused'].includes(current.turn_state)) {
        core.transitionTurn(turnId, 'reconciling', { reason: 'carrier_returned' });
        core.transitionTurn(turnId, 'completed', { terminal_status: 'completed' });
      }
      const finalTurn = core.turn(turnId);
      if (recoveryAttempt) {
        core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'reconciled', {
          reason: 'carrier_replay_returned',
          terminal_state: finalTurn?.terminal_state ?? null,
        });
        core.transitionRecoveryAttempt(recoveryAttempt.attempt_id, 'completed', { reason: 'recovery_replay_completed' });
      }
      return { terminal_state: finalTurn?.terminal_state ?? 'completed', result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const interrupted = controller.signal.aborted || /abort|cancel|interrupt/i.test(message);
      const current = core.turn(turnId);
      if (current && !['completed', 'blocked', 'interrupted', 'failed', 'refused'].includes(current.turn_state)) {
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

  function start() {
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

  async function cancel(evidence = {}) {
    const turnId = activeTurnId;
    if (activeAbortController) activeAbortController.abort();
    else cancelRequested = true;
    await eventSink({ kind: 'session_turn_cancel_requested', turn_id: turnId, ...evidence });
    if (turnId) await eventSink({ kind: 'interrupt_requested', turn_id: turnId, ...evidence });
    return true;
  }

  async function dispatch(request = {}) {
    if (core.lifecycleState !== 'ready') throw new Error(`nars_session_not_ready:${core.lifecycleState}`);
    const content = typeof request === 'string'
      ? request
      : request.content ?? request.params?.content ?? request.params?.message ?? null;
    if (content != null) return submit({ ...request, content });
    if (typeof handleControlRequest !== 'function') {
      throw new Error('nars_session_control_handler_required');
    }
    const requestId = request.id ?? request.request_id ?? null;
    await eventSink({ kind: 'control_request_started', request_id: requestId, method: request.method ?? null });
    try {
      const result = await handleControlRequest({
        request,
        sessionCore: core,
        submit,
        eventSink,
        toolGateway,
      });
      await eventSink({ kind: 'control_request_completed', request_id: requestId, method: request.method ?? null });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await eventSink({ kind: 'control_request_failed', request_id: requestId, method: request.method ?? null, error: message });
      throw error;
    }
  }

  async function submit(input) {
    if (core.lifecycleState !== 'ready') throw new Error(`nars_session_not_ready:${core.lifecycleState}`);
    if (!queue) start();
    const queuedInput = input && typeof input === 'object'
      ? { ...input, request_id: input.request_id ?? input.id ?? null }
      : input;
    return queue.enqueue(queuedInput, { drain: true });
  }

  function health() {
    return healthSnapshot();
  }

  function recovery() {
    return core.recoverySnapshot();
  }

  async function close(evidence = {}, hooks = {}) {
    if (closePromise) return closePromise;
    closePromise = closeInternal(evidence, hooks);
    return closePromise;
  }

  async function closeInternal(evidence = {}, hooks = {}) {
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
