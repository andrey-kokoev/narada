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
  const existingOutcomeCounts = countExistingEvents(existing, requestOutcomeForEvent);
  const existingIssueCounts = countExistingEvents(existing, requestIssueForEvent);
  let sequence = existing.reduce((max, event, index) => Math.max(max, Number(event?.event_sequence ?? event?.sequence) || index + 1), 0);
  const state = {
    lifecycle: 'starting',
    sessionEventCount: existing.length,
    lastEventKind: existing.at(-1)?.event ?? existing.at(-1)?.event_kind ?? null,
    lastEventAt: existing.at(-1)?.timestamp ?? existing.at(-1)?.generated_at ?? null,
    lastTerminalState: [...existing].reverse().find((event) => event?.terminal_state)?.terminal_state ?? null,
    requestOutcomeCounts: existingOutcomeCounts,
    requestIssueCounts: existingIssueCounts,
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
    state.lifecycle = next;
    return transitionEvent;
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
    };
  }

  return {
    sessionId,
    agentId,
    sessionPath,
    eventsPath,
    appendEvent,
    transition,
    createQueue,
    registerArtifact,
    healthSnapshot,
    recoverySnapshot,
    eventHub,
    get lifecycleState() { return state.lifecycle; },
  };
}

function requestOutcomeForEvent(event = {}) {
  if (event.event === 'carrier_turn_failed') {
    return /abort|cancel|interrupt/i.test(String(event.error ?? ''))
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
  if (event.event === 'carrier_turn_failed') {
    return /abort|cancel|interrupt/i.test(String(event.error ?? '')) ? null : 'carrier_turn_failed';
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
