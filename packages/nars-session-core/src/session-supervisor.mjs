import { createNarsSessionCore } from './session-core.mjs';

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

  function queueSnapshot() {
    const snapshot = queue?.state?.() ?? {};
    return {
      running: Boolean(snapshot.running),
      pending_count: Number(snapshot.pendingCount ?? 0),
      pending_system_directive_count: Number(snapshot.pendingSystemDirectiveCount ?? 0),
      pending_operator_directive_count: Number(snapshot.pendingOperatorDirectiveCount ?? 0),
      pending_observer_count: Number(snapshot.pendingObserverCount ?? 0),
    };
  }

  function healthSnapshot(mcpOperationalState = toolGateway.operationalState?.() ?? 'unknown') {
    return {
      ...core.healthSnapshot({ mcpOperationalState }),
      operator_input_queue: queueSnapshot(),
    };
  }

  const eventSink = async (event) => {
    const record = core.appendEvent(eventRecord(event));
    core.observeTurnEvent(record);
    return record;
  };

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
    if (activeAbortController) activeAbortController.abort();
    else cancelRequested = true;
    await eventSink({ kind: 'session_turn_cancel_requested', turn_id: activeTurnId, ...evidence });
    if (activeTurnId) await eventSink({ kind: 'interrupt_requested', turn_id: activeTurnId, ...evidence });
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

  async function close(evidence = {}) {
    if (core.lifecycleState === 'starting' || core.lifecycleState === 'ready') core.transition('closing', evidence);
    try {
      await toolGateway.close?.();
      if (core.lifecycleState === 'closing') core.transition('closed', evidence);
    } catch (error) {
      if (core.lifecycleState === 'closing') {
        core.transition('failed', { ...evidence, error: error instanceof Error ? error.message : String(error) });
      }
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
  });
}
