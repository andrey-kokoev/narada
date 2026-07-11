import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createNarsEventHub } from './event-hub.mjs';
import { readNarsEventLog } from './event-log.mjs';
import { registerNarsArtifact, readNarsArtifactIndex } from './artifacts.mjs';
import { createInputQueue } from './input-queue.mjs';
import {
  operatorInputQueueStatePathFromSessionPath,
  readOperatorInputQueueState,
  writeOperatorInputQueueState,
} from './operator-input-queue-state.mjs';
import { createOperationalPostureSnapshot, createSessionActivitySnapshot } from './session-status-snapshots.mjs';
import {
  assertNarsTurnTransition,
  canTransitionNarsTurn,
  isNarsTurnTerminalState,
  isNarsTurnState,
  normalizeNarsTurnRecord,
  terminalStateForTurnState,
} from './turn-state.mjs';

const LIFECYCLE_TRANSITIONS = Object.freeze({
  starting: new Set(['ready', 'closing', 'failed']),
  ready: new Set(['closing', 'failed']),
  closing: new Set(['closed', 'failed']),
  failed: new Set(['closed']),
  closed: new Set(),
});

export function createNarsSessionCore({
  sessionId,
  agentId = null,
  sessionPath,
  eventsPath,
  siteRoot = null,
  maxEventBuffer = 1000,
  now = () => new Date().toISOString(),
} = {}) {
  if (!sessionId) throw new Error('nars_session_id_required');
  if (!eventsPath) throw new Error('nars_events_path_required');
  const eventHub = createNarsEventHub({ maxBuffer: maxEventBuffer });
  const existing = readNarsEventLog(eventsPath).events;
  const turns = rehydrateTurnRecords(existing, { sessionId, agentId });
  const existingOutcomeCounts = countExistingEvents(existing, requestOutcomeForEvent);
  const existingIssueCounts = countExistingEvents(existing, requestIssueForEvent);
  let sequence = existing.reduce((max, event, index) => Math.max(max, Number(event?.event_sequence ?? event?.sequence) || index + 1), 0);
  const activeTurn = findActiveTurn(turns);
  const state = {
    lifecycle: rehydrateSessionLifecycle(existing),
    sessionEventCount: existing.length,
    lastEventKind: existing.at(-1)?.event ?? existing.at(-1)?.event_kind ?? null,
    lastEventAt: existing.at(-1)?.timestamp ?? existing.at(-1)?.generated_at ?? null,
    lastTerminalState: [...existing].reverse().find((event) => event?.terminal_state)?.terminal_state ?? null,
    requestOutcomeCounts: existingOutcomeCounts,
    requestIssueCounts: existingIssueCounts,
    activeTurnId: activeTurn?.turn_id ?? null,
    activeTurnState: activeTurn?.turn_state ?? null,
    lastTurnId: [...turns.values()].at(-1)?.turn_id ?? null,
    lastTurnState: [...turns.values()].at(-1)?.turn_state ?? null,
  };

  function appendEvent(event = {}) {
    if (state.lifecycle === 'closed') throw new Error('nars_session_closed');
    const requestedSequence = Number(event.event_sequence ?? event.sequence);
    sequence = Number.isFinite(requestedSequence) && requestedSequence > sequence ? requestedSequence : sequence + 1;
    const record = {
      ...event,
      event_sequence: sequence,
      sequence,
      session_id: event.session_id ?? sessionId,
      ...(agentId && event.agent_id === undefined ? { agent_id: agentId } : {}),
      timestamp: event.timestamp ?? now(),
    };
    mkdirSync(dirname(eventsPath), { recursive: true });
    appendFileSync(eventsPath, `${JSON.stringify(record)}\n`, 'utf8');
    const published = eventHub.publish(record);
    state.sessionEventCount += 1;
    state.lastEventKind = published.event ?? published.event_kind ?? null;
    state.lastEventAt = published.timestamp;
    if (published.terminal_state) state.lastTerminalState = published.terminal_state;
    incrementCount(state.requestOutcomeCounts, requestOutcomeForEvent(published));
    incrementCount(state.requestIssueCounts, requestIssueForEvent(published));
    return published;
  }

  function transition(next, evidence = {}) {
    if (!LIFECYCLE_TRANSITIONS[state.lifecycle]?.has(next)) {
      throw new Error(`invalid_nars_session_transition:${state.lifecycle}:${next}`);
    }
    const previous = state.lifecycle;
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

  function ensureTurn(input = {}, options = {}) {
    const turnId = input.event_id ?? input.turn_id;
    if (!turnId) throw new Error('nars_turn_id_required');
    const current = turns.get(String(turnId));
    if (!current) {
      return transitionTurn(String(turnId), 'accepted', {
        input_event_id: String(input.event_id ?? turnId),
        input_ref: options.inputRef ?? inputRefFromInput(input),
        authority_posture: options.authorityPosture ?? input.authority_posture ?? input.metadata?.authority_posture ?? null,
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

  function prepareTurn(turnId, evidence = {}) {
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
      return { action: 'execute', turn: turns.get(String(turnId)) };
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
    return { action: 'execute', turn: turns.get(String(turnId)) };
  }

  function transitionTurn(turnId, nextState, evidence = {}) {
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

  function observeTurnEvent(event = {}) {
    const turnId = event.turn_id ?? event.input_event_id;
    if (!turnId || !turns.has(String(turnId))) return null;
    const normalizedTurnId = String(turnId);
    const advance = (nextState, evidence = {}) => {
      const current = turns.get(normalizedTurnId);
      if (!current || current.turn_state === nextState || isNarsTurnTerminalState(current.turn_state)) return current;
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
        if (status === 'blocked') {
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

  function updateTurnActivity(record) {
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

  function appendTurnCompatibilityEvent(previousState, record, evidence) {
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
    if (record.turn_state === 'evaluating' && ['accepted', 'contextualized'].includes(previousState)) {
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

  function createQueue(options = {}) {
    const queuePath = operatorInputQueueStatePathFromSessionPath(sessionPath);
    const persisted = readOperatorInputQueueState(queuePath);
    return createInputQueue({
      ...options,
      identity: options.identity ?? agentId,
      session: options.session ?? sessionId,
      initialPending: options.initialPending ?? persisted.pending,
      appendSessionFn: options.appendSessionFn ?? appendEvent,
      onInputAcceptedFn: (event) => {
        ensureTurn(event, {
          inputRef: inputRefFromInput(event),
          authorityPosture: event.authority_posture ?? event.metadata?.authority_posture ?? null,
        });
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

  function registerArtifact(options = {}) {
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

  function healthSnapshot({ mcpOperationalState = 'unknown' } = {}) {
    const postureState = { ...state, closed: state.lifecycle === 'closed' };
    return {
      schema: 'narada.nars.session_core_health.v1',
      session_id: sessionId,
      lifecycle_state: state.lifecycle,
      mcp_operational_state: mcpOperationalState,
      ...createSessionActivitySnapshot(state),
      ...createOperationalPostureSnapshot({ state: postureState, mcpOperationalState }),
      cursor: eventHub.cursor(),
    };
  }

  function recoverySnapshot() {
    const queuePath = operatorInputQueueStatePathFromSessionPath(sessionPath);
    const log = readNarsEventLog(eventsPath);
    return {
      schema: 'narada.nars.session_core_recovery.v1',
      session_id: sessionId,
      lifecycle_state: state.lifecycle,
      events_path: eventsPath,
      event_count: log.events.length,
      corrupt_event_line_count: log.corruptLineCount,
      operator_input_queue: readOperatorInputQueueState(queuePath),
      artifacts: readNarsArtifactIndex({ sessionPath }),
      active_turn: state.activeTurnId ? turns.get(state.activeTurnId) ?? null : null,
      turns: [...turns.values()],
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
    turn: (turnId) => turns.get(String(turnId)) ?? null,
    turns: () => [...turns.values()],
    createQueue,
    registerArtifact,
    healthSnapshot,
    recoverySnapshot,
    eventHub,
    get lifecycleState() { return state.lifecycle; },
  };
}

function inputRefFromInput(input = {}) {
  return {
    kind: 'session_input',
    event_id: input.event_id ?? input.turn_id ?? null,
    request_id: input.request_id ?? null,
    source: input.source ?? null,
    transport: input.transport ?? null,
  };
}

function rehydrateSessionLifecycle(events) {
  let lifecycle = 'starting';
  for (const event of events) {
    if (event.event === 'session_lifecycle_transition' && LIFECYCLE_TRANSITIONS[lifecycle]?.has(event.lifecycle_state)) {
      lifecycle = event.lifecycle_state;
    } else if (event.event === 'session_closed') {
      lifecycle = 'closed';
    }
  }
  return lifecycle;
}

function rehydrateTurnRecords(events, defaults) {
  const turns = new Map();
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

function applyLegacyTurnEvent(turns, event, defaults) {
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

function legacyTurnStateForEvent(event) {
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

function findActiveTurn(turns) {
  let active = null;
  for (const record of turns.values()) {
    if (!isNarsTurnTerminalState(record.turn_state)) active = record;
  }
  return active;
}

function requestOutcomeForEvent(event = {}) {
  if (event.event === 'carrier_turn_failed' || event.event === 'turn_failed') {
    return /abort|cancel|interrupt/i.test(String(event.error ?? event.error_summary ?? ''))
      ? 'cancelled'
      : 'request_runtime_failure';
  }
  if (event.event === 'session_control_rejected') {
    if (event.code === 'request_dispatch_failed') return 'dispatch_failure';
    return ['invalid_json', 'unsupported_session_control'].includes(event.code)
      ? 'invalid_request'
      : null;
  }
  if (event.event === 'session_control_response') return 'completed';
  return null;
}

function requestIssueForEvent(event = {}) {
  if (event.event === 'carrier_turn_failed' || event.event === 'turn_failed') {
    return /abort|cancel|interrupt/i.test(String(event.error ?? event.error_summary ?? '')) ? null : 'carrier_turn_failed';
  }
  if (event.event === 'session_control_rejected') return event.code ?? 'session_control_rejected';
  return null;
}

function countExistingEvents(events, classify) {
  const counts = {};
  for (const event of events) incrementCount(counts, classify(event));
  return counts;
}

function incrementCount(counts, key) {
  if (!key) return;
  counts[key] = Number(counts[key] ?? 0) + 1;
}
