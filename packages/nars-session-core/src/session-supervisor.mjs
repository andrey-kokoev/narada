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
  let cancelRequested = false;
  let recoveryDrain = null;

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

  const eventSink = async (event) => core.appendEvent(eventRecord(event));
  const drain = async (input) => {
    activeAbortController = new AbortController();
    if (cancelRequested) {
      cancelRequested = false;
      activeAbortController.abort();
    }
    try {
      const result = await carrier.runTurn({ ...buildTurnContext(input), abortSignal: activeAbortController.signal }, eventSink, toolGateway);
      return { terminal_state: 'completed', result };
    } finally {
      activeAbortController = null;
    }
  };

  function start() {
    if (core.lifecycleState === 'starting') core.transition('ready', { supervisor: 'nars-session-core' });
    if (!queue) queue = core.createQueue({ drain });
    if (queue.pendingCount > 0 && !recoveryDrain) {
      recoveryDrain = queue.drainUntilIdle().catch(async (error) => {
        await eventSink({ kind: 'session_recovery_drain_failed', error: error instanceof Error ? error.message : String(error) });
      });
    }
    return healthSnapshot();
  }

  async function cancel(evidence = {}) {
    if (activeAbortController) activeAbortController.abort();
    else cancelRequested = true;
    await eventSink({ kind: 'session_turn_cancel_requested', ...evidence });
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
    return queue.enqueue(input, { drain: true });
  }

  function health() {
    return healthSnapshot();
  }

  function recovery() {
    return core.recoverySnapshot();
  }

  async function close(evidence = {}) {
    if (core.lifecycleState === 'ready') core.transition('closing', evidence);
    await toolGateway.close?.();
    if (core.lifecycleState === 'closing') core.transition('closed', evidence);
    return healthSnapshot('closed');
  }

  return Object.freeze({ core, start, submit, dispatch, cancel, health, recovery, close, get recoveryDrain() { return recoveryDrain; } });
}
