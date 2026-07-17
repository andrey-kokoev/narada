import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { appendEvent } from '../src/render.js';
import { refreshHttpHealthStatus } from '../src/health.js';
import { classifyRuntimeMessage, createSessionProjection } from '../src/session-projection.js';
import {
  TURN_ACTIVITY_PHASES,
  createTurnActivityState,
  materializeTurnActivity,
  reduceTurnActivity,
} from '../src/session-projection-activity.js';
import {
  projectRuntimeEvent,
  reconnectDelayForAttempt,
  resolveAttachConfig,
  shouldRenderRuntimeEvent,
  summarizeRuntimeEvent,
} from '../src/agent-web-ui.js';
import {
  OPERATOR_INPUT_DELIVERY_PHASES,
  OPERATOR_INPUT_DELIVERY_TRANSITIONS,
  canTransitionOperatorInputDelivery,
  createOperatorInputDeliveryProjection,
} from '../src/operator-input-delivery.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.id = null;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.value = '';
    this.parentNode = null;
  }

  append(...children) {
    for (const child of children) {
      if (child && typeof child === 'object') child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children.length = 0;
    this.append(...children);
  }

  remove() {
    const siblings = this.parentNode?.children;
    if (!Array.isArray(siblings)) return;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
  }
}

function createProjectionDocument({ withNarsConfig = false } = {}) {
  const elements = new Map([
    ['events', new FakeElement('ul')],
    ['projection-verbosity', new FakeElement('select')],
  ]);
  elements.get('projection-verbosity').value = 'conversation';
  if (withNarsConfig) {
    const config = new FakeElement('script');
    config.textContent = JSON.stringify({ artifactBasePath: '/sessions' });
    elements.set('nars-config', config);
  }
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) {
      const node = new FakeElement('#text');
      node.textContent = String(text ?? '');
      return node;
    },
  };
  return { elements, documentRef };
}

function descendantsWithClass(node, className, matches = []) {
  if (!node || typeof node !== 'object') return matches;
  if (String(node.className ?? '').split(/\s+/).includes(className)) matches.push(node);
  for (const child of node.children ?? []) descendantsWithClass(child, className, matches);
  return matches;
}

test('event stream reconnect uses bounded backoff and visible disconnected duration', () => {
  assert.equal(reconnectDelayForAttempt(1), 1000);
  assert.equal(reconnectDelayForAttempt(2), 2000);
  assert.equal(reconnectDelayForAttempt(5), 10000);
  assert.equal(reconnectDelayForAttempt(20), 10000);
});

test('operator input delivery exposes an explicit monotonic transition table', () => {
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.DRAFT, OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED, OPERATOR_INPUT_DELIVERY_PHASES.QUEUED), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.QUEUED, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED), false);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED, OPERATOR_INPUT_DELIVERY_PHASES.STEERING), false);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING, OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING, OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT, OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING, OPERATOR_INPUT_DELIVERY_PHASES.RETRIED), true);
  assert.equal(canTransitionOperatorInputDelivery(OPERATOR_INPUT_DELIVERY_PHASES.RETRIED, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED), false);
  assert.deepEqual(OPERATOR_INPUT_DELIVERY_TRANSITIONS[OPERATOR_INPUT_DELIVERY_PHASES.FAILED], []);
});

test('operator input delivery makes an unacknowledged submission recoverable and accepts late runtime evidence', () => {
  const timedOut = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-timeout', method: 'session.submit', content: 'proceed', timestamp: '2026-07-15T21:00:00.000Z' },
    { event: 'web_ui_input_ack_timeout', request_id: 'input-timeout', method: 'session.submit', content: 'proceed', message: 'ack timeout', timestamp: '2026-07-15T21:00:05.000Z' },
  ], Date.parse('2026-07-15T21:00:05.000Z'));
  assert.equal(timedOut.phase, OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT);
  assert.equal(timedOut.content, 'proceed');
  assert.equal(timedOut.label, 'Input not acknowledged');
  assert.match(timedOut.detail, /no automatic resend/);

  const lateAck = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-timeout', method: 'session.submit', content: 'proceed', timestamp: '2026-07-15T21:00:00.000Z' },
    { event: 'web_ui_input_ack_timeout', request_id: 'input-timeout', method: 'session.submit', content: 'proceed', message: 'ack timeout', timestamp: '2026-07-15T21:00:05.000Z' },
    { event: 'operator_input_late_acknowledged', request_id: 'input-timeout', method: 'session.submit', content: 'proceed', acknowledged_event: 'input_event_queued', timestamp: '2026-07-15T21:00:06.000Z' },
    { event: 'input_event_queued', request_id: 'input-timeout', event_id: 'nars-input-timeout', timestamp: '2026-07-15T21:00:06.000Z' },
  ]);
  assert.equal(lateAck.phase, OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED);
  assert.equal(lateAck.error, null);
  assert.equal(lateAck.terminalState, 'late_acknowledged');
  assert.deepEqual(lateAck.history, [
    OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
    OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING,
    OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT,
    OPERATOR_INPUT_DELIVERY_PHASES.LATE_RECONCILED,
  ]);

  const restored = createOperatorInputDeliveryProjection([
    { event: 'operator_input_pending_restored', request_id: 'input-restored', method: 'session.submit', content: 'review me', message: 'review before retry', created_at: '2026-07-15T21:00:05.000Z' },
  ]);
  assert.equal(restored.phase, OPERATOR_INPUT_DELIVERY_PHASES.TIMED_OUT);
  assert.equal(restored.content, 'review me');

  const restoredForReview = createOperatorInputDeliveryProjection([
    { event: 'operator_input_pending_restored', request_id: 'input-reviewing', method: 'session.submit', content: 'review me', pending_state: 'reviewing', message: 'already under review', created_at: '2026-07-15T21:00:05.000Z' },
  ]);
  assert.equal(restoredForReview.phase, OPERATOR_INPUT_DELIVERY_PHASES.REVIEWING);

  const retried = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-retry', method: 'session.submit', content: 'retry me' },
    { event: 'web_ui_input_ack_timeout', request_id: 'input-retry', method: 'session.submit', content: 'retry me' },
    { event: 'operator_input_reviewed', request_id: 'input-retry', method: 'session.submit', content: 'retry me' },
    { event: 'operator_input_retried', request_id: 'input-retry', method: 'session.submit', content: 'retry me', retry_request_id: 'input-retry-2' },
  ]);
  assert.equal(retried.phase, OPERATOR_INPUT_DELIVERY_PHASES.RETRIED);
  assert.equal(retried.terminalState, 'retried');

  const expired = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-expired', method: 'session.submit', content: 'expire me' },
    { event: 'web_ui_input_ack_timeout', request_id: 'input-expired', method: 'session.submit', content: 'expire me' },
    { event: 'operator_input_pending_expired', request_id: 'input-expired', method: 'session.submit', content: 'expire me' },
  ]);
  assert.equal(expired.phase, OPERATOR_INPUT_DELIVERY_PHASES.EXPIRED);
  assert.equal(expired.terminalState, 'expired');
});

test('operator input delivery ignores backward runtime evidence after admission', () => {
  const projection = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-order', method: 'session.submit', content: 'run', operator_delivery_mode: 'enqueue' },
    { event: 'input_event_queued', request_id: 'input-order', event_id: 'nars-input-order' },
    { event: 'input_event_started', request_id: 'input-order', event_id: 'nars-input-order' },
    { event: 'input_event_queued', request_id: 'input-order', event_id: 'nars-input-order' },
  ]);

  assert.equal(projection.phase, OPERATOR_INPUT_DELIVERY_PHASES.STEERING);
  assert.deepEqual(projection.history, [
    OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
    OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING,
    OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED,
    OPERATOR_INPUT_DELIVERY_PHASES.QUEUED,
    OPERATOR_INPUT_DELIVERY_PHASES.STEERING,
  ]);
});

test('turn activity reducer exposes the canonical queued, thinking, tool, and idle phases', () => {
  const state = createTurnActivityState();
  reduceTurnActivity(state, { event: 'operator_input_submitted', timestamp: '2026-07-11T12:00:00.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.QUEUED);
  reduceTurnActivity(state, { event: 'turn_started', turn_id: 'turn-1', agent_id: 'resident', timestamp: '2026-07-11T12:00:01.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.THINKING);
  assert.equal(state.activeTurnId, 'turn-1');
  reduceTurnActivity(state, { event: 'tool_call', tool_name: 'narada.test', timestamp: '2026-07-11T12:00:02.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.TOOL);
  reduceTurnActivity(state, { event: 'tool_result', tool_name: 'narada.test', status: 'ok', timestamp: '2026-07-11T12:00:03.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.THINKING);
  reduceTurnActivity(state, { event: 'turn_complete', turn_id: 'turn-1', timestamp: '2026-07-11T12:00:04.000Z' });
  assert.deepEqual(materializeTurnActivity(state, Date.parse('2026-07-11T12:00:05.000Z')), {
    active: false,
    state: TURN_ACTIVITY_PHASES.IDLE,
    label: 'Idle',
    detail: null,
    elapsedSeconds: 0,
    startedAtMs: null,
    activeTurnId: null,
  });
});

test('turn activity ignores late evidence and rebases on a newer turn or health identity', () => {
  const state = createTurnActivityState();
  reduceTurnActivity(state, { event: 'turn_started', turn_id: 'turn-1', request_id: 'request-1', agent_id: 'resident', timestamp: '2026-07-11T12:00:01.000Z' });
  reduceTurnActivity(state, { event: 'turn_complete', turn_id: 'turn-1', request_id: 'request-1', timestamp: '2026-07-11T12:00:04.000Z' });
  reduceTurnActivity(state, { event: 'tool_call', turn_id: 'turn-1', request_id: 'request-1', tool_name: 'late.tool', timestamp: '2026-07-11T12:00:05.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.IDLE);
  assert.equal(state.toolCallCount, 0);

  reduceTurnActivity(state, { event: 'turn_started', turn_id: 'turn-2', request_id: 'request-2', agent_id: 'resident', timestamp: '2026-07-11T12:00:06.000Z' });
  reduceTurnActivity(state, { event: 'tool_call', turn_id: 'turn-1', request_id: 'request-1', tool_name: 'stale.tool', timestamp: '2026-07-11T12:00:07.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.THINKING);
  assert.equal(state.activeTurnId, 'turn-2');
  assert.equal(state.toolCallCount, 0);

  reduceTurnActivity(state, { event: 'session_health', active_turn_state: 'running', active_turn_id: 'turn-3', timestamp: '2026-07-11T12:00:08.000Z' });
  assert.equal(state.state, TURN_ACTIVITY_PHASES.THINKING);
  assert.equal(state.activeTurnId, 'turn-3');
  assert.equal(state.activeRequestId, null);
});

test('session projection reconciles incomplete replay from the runtime health snapshot', () => {
  const running = createSessionProjection([], {
    nowMs: Date.parse('2026-07-11T12:01:05.000Z'),
    healthSnapshot: {
      active_turn_state: 'running',
      active_turn_id: 'turn-health',
      agent_id: 'resident',
      provider: 'codex-subscription',
      timestamp: '2026-07-11T12:01:00.000Z',
    },
  });
  assert.equal(running.activity.active, true);
  assert.equal(running.activity.state, TURN_ACTIVITY_PHASES.THINKING);
  assert.equal(running.activity.activeTurnId, 'turn-health');

  const idle = createSessionProjection([{ event: 'turn_started', turn_id: 'turn-stale', timestamp: '2026-07-11T12:00:00.000Z' }], {
    nowMs: Date.parse('2026-07-11T12:01:05.000Z'),
    healthSnapshot: { active_turn_state: 'idle' },
  });
  assert.equal(idle.activity.active, false);
  assert.equal(idle.activity.activeTurnId, null);
});

test('HTTP health renderer prefers scoped agent identity ref for status text', async () => {
  const { elements, documentRef } = createProjectionDocument();
  elements.set('health', new FakeElement('div'));
  await refreshHttpHealthStatus('http://127.0.0.1:12345/health', documentRef, async () => ({
    status: 200,
    async json() {
      return {
        status: 'healthy',
        agent_id: 'resident',
        agent_identity_ref: {
          schema: 'narada.agent_identity_ref.v1',
          site_id: 'sonar',
          local_agent_id: 'resident',
          canonical_agent_id: 'sonar.resident',
        },
        session_id: 'carrier_test',
      };
    },
  }));
  assert.equal(elements.get('health').textContent, 'healthy · sonar.resident · carrier_test');
});

test('attach config resolves one event endpoint and one health endpoint from query or injected config', () => {
  assert.deepEqual(resolveAttachConfig('?event_endpoint=ws://nars/events&health_endpoint=http://nars/health&max_replay=7'), {
    mode: 'local_nars_projection',
    projectionId: null,
    cloudflareApiBaseUrl: null,
    browserToken: null,
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    inputEndpoint: null,
    cacheEndpoint: null,
    sessionId: null,
    healthTransport: 'http-proxy',
    artifactBasePath: '/api/nars',
    artifactTransport: 'local-nars-proxy',
    projectionControl: null,
    authorityTransition: null,
    protocolHealthMethod: 'session.health',
    maxReplay: 7,
  });
  assert.deepEqual(resolveAttachConfig('', { eventEndpoint: 'ws://injected/events', healthEndpoint: '/api/health' }), {
    mode: 'local_nars_projection',
    projectionId: null,
    cloudflareApiBaseUrl: null,
    browserToken: null,
    eventEndpoint: 'ws://injected/events',
    healthEndpoint: '/api/health',
    inputEndpoint: null,
    cacheEndpoint: null,
    sessionId: null,
    healthTransport: 'http-proxy',
    artifactBasePath: '/api/nars',
    artifactTransport: 'local-nars-proxy',
    projectionControl: null,
    authorityTransition: null,
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
  });
});

test('runtime event summaries unwrap NARS session_event envelopes', () => {
  assert.equal(summarizeRuntimeEvent({ event: 'session_events_subscription_started', replay_count: 3 }), '3 replayed event(s)');
  assert.equal(summarizeRuntimeEvent({ event: 'session_events_replay_completed', replay_count: 0 }), '0 replayed event(s); replay complete');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), 'hello');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'tool_call', tool_name: 'narada-site.whoami' } }), 'narada-site.whoami');
});

test('classifies replay completion as a diagnostic signal', () => {
  assert.equal(classifyRuntimeMessage({ event: 'session_events_replay_completed', replay_count: 0 }), 'diagnostic_signal');
});

test('classifies input acknowledgment evidence as operations without adding it to conversation rows', () => {
  assert.equal(classifyRuntimeMessage({ event: 'session_control_accepted', request_id: 'input-1' }), 'operation_fact');
  assert.equal(classifyRuntimeMessage({ event: 'session_control_response', request_id: 'input-1' }), 'operation_fact');
  assert.equal(classifyRuntimeMessage({ event: 'input_event_completed', request_id: 'input-1' }), 'operation_fact');
  assert.equal(classifyRuntimeMessage({ event: 'runtime_request_state_transition', request_id: 'input-1', request_state: 'completed' }), 'operation_fact');
  const projection = createSessionProjection([
    { event: 'operator_input_submitted', request_id: 'input-1', content: 'run' },
    { event: 'session_control_accepted', request_id: 'input-1', acceptance_state: 'accepted' },
  ], { verbosity: 'conversation' });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['operator_input_submitted']);
});

test('web UI projection renders stale authority reattach target distinctly', () => {
  const projection = projectRuntimeEvent({
    event: 'authority_source_write_refused',
    code: 'authority_source_sealed',
    authority_transition_source: {
      state: 'sealed',
      target_authority_locator: {
        kind: 'cloudflare-host',
        site_id: 'site',
        session_id: 'cf_session',
      },
    },
  });
  assert.equal(projection.kind, 'authority_source_write_refused');
  assert.equal(projection.label, 'Source write refused');
  assert.equal(projection.tone, 'error');
  assert.equal(projection.summary, 'authority_source_sealed; reattach cloudflare-host/site/cf_session');
  assert.equal(shouldRenderRuntimeEvent(projection.event, { verbosity: 'conversation' }), false);
  assert.equal(shouldRenderRuntimeEvent(projection.event, { verbosity: 'operations' }), true);
});

test('web UI projection normalizes nested provider events and suppresses status noise', () => {
  const toolProjection = projectRuntimeEvent({
    event_sequence: 5,
    event: {
      type: 'item.started',
      item: { type: 'mcp_tool_call', server: 'narada-sonar-sop', tool: 'sop_run_start', status: 'in_progress' },
    },
  });
  assert.equal(toolProjection.kind, 'tool_call');
  assert.equal(toolProjection.summary, 'narada-sonar-sop.sop_run_start running');
  const assistantProjection = projectRuntimeEvent({
    event: { type: 'item.completed', item: { type: 'agent_message', text: 'Startup sequence completed.' } },
  });
  assert.equal(assistantProjection.kind, 'provider_agent_message');
  assert.equal(assistantProjection.class, 'diagnostics');
  assert.equal(assistantProjection.summary, 'Startup sequence completed.');
  assert.equal(shouldRenderRuntimeEvent({ event: { type: 'item.completed', item: { type: 'agent_message', text: 'Startup sequence completed.' } } }, { verbosity: 'conversation' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: { type: 'item.completed', item: { type: 'agent_message', text: 'Startup sequence completed.' } } }, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }, { verbosity: 'raw' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'degraded' }, { verbosity: 'operations' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'degraded' }, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldRenderRuntimeEvent({ event: 'websocket_connected' }, { verbosity: 'raw' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'ok' } }), true);
});

test('conversation projection shows canonical lifecycle assistant message and hides provider assistant telemetry', () => {
  const events = [
    { event: 'operator_input_submitted', request_id: 'input_startup', content: 'run startup sequence', timestamp: '2026-06-30T18:11:00.000Z' },
    { event: 'user_message', request_id: 'input_startup', content: 'run startup sequence', event_sequence: 1, timestamp: '2026-06-30T18:11:01.000Z' },
    { agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_intro', type: 'agent_message', text: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.' } }, timestamp: '2026-06-30T18:11:02.000Z' },
    { agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_final', type: 'agent_message', text: 'Startup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.' } }, timestamp: '2026-06-30T18:11:03.000Z' },
    { event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_startup', request_id: 'input_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.\n\nStartup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.', agent_id: 'resident', session_id: 'carrier_test', event_sequence: 4, timestamp: '2026-06-30T18:11:04.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T18:11:05.000Z') });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.match(assistantRows[0].summary, /Narada startup affordance/);
  assert.match(assistantRows[0].summary, /Startup sequence ran successfully/);
  assert.equal(projection.rows.some((row) => row.kind === 'provider_agent_message'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'assistant_message_stream'), false);
  assert.equal(projection.activity.active, false);
});

test('conversation projection collapses assistant stream, final, and duplicate final by render identity', () => {
  const events = [
    { event: 'assistant_message_stream', request_id: 'input_startup', turn_id: 'turn_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.', event_sequence: 40, sequence: 40, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_startup', turn_id: 'turn_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.\n\nStartup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.', event_sequence: 41, sequence: 41, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_startup', turn_id: 'turn_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.\n\nStartup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.', event_sequence: 42, sequence: 42, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.equal(assistantRows[0].event.request_id, 'input_startup');
  assert.match(assistantRows[0].summary, /Startup sequence ran successfully/);
  assert.equal(projection.rows.some((row) => row.kind === 'assistant_message_stream'), false);
});

test('conversation projection keeps identical assistant text from distinct turns', () => {
  const events = [
    { event: 'assistant_message', request_id: 'input_first', turn_id: 'turn_first', content: 'Cloudflare runtime tool adapter executed conversation.send.', event_sequence: 20, sequence: 20, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_first', turn_id: 'turn_first', content: 'Cloudflare runtime tool adapter executed conversation.send.', event_sequence: 21, sequence: 21, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_second', turn_id: 'turn_second', content: 'Cloudflare runtime tool adapter executed conversation.send.', event_sequence: 22, sequence: 22, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 2);
  assert.deepEqual(assistantRows.map((row) => row.event.request_id), ['input_first', 'input_second']);
});

test('conversation projection collapses duplicate tool results by render identity', () => {
  const events = [
    { event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-site.whoami', status: 'ok', event_sequence: 50, sequence: 50, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-site.whoami', status: 'ok', event_sequence: 51, sequence: 51, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'operations' });
  const toolRows = projection.rows.filter((row) => row.kind === 'tool_result');
  assert.equal(toolRows.length, 1);
  assert.equal(toolRows[0].event.request_id, 'input_diag');
  assert.match(toolRows[0].summary, /narada-site\.whoami ok/);
});

test('conversation projection keeps a visible boundary between separate assistant messages in one turn', () => {
  const events = [
    { event: 'assistant_message', request_id: 'input_sop', turn_id: 'turn_sop', content: 'I’ll query the SOP MCP’s template list directly to see what SOPs are registered for this site.', event_sequence: 30, sequence: 30, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_sop', turn_id: 'turn_sop', content: 'No. The SOP MCP template list is empty for this site: `count: 0`.\n\nThere are currently no registered SOP templates, active, draft, or deprecated.', event_sequence: 31, sequence: 31, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.match(assistantRows[0].summary, /registered for this site\.\n\n---\n\nNo\./);
});

test('conversation projection keeps artifact presentation and lifecycle message while hiding provider notes', () => {
  const events = [
    { event_sequence: 63, sequence: 63, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.' } } },
    { event_sequence: 67, sequence: 67, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_art_1', content: [{ type: 'text', text: 'Here is the registered HTML artifact rendered inline.' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }] },
    { event_sequence: 69, sequence: 69, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_11', type: 'agent_message', text: 'Done. Created and presented the artifact.' } } },
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.\n\nDone. Created and presented the artifact.' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 2);
  assert.equal(Array.isArray(assistantRows[0].summary), true);
  assert.match(assistantRows[1].summary, /inline\.\n\nDone\./);
  assert.equal(projection.rows.some((row) => row.kind === 'provider_agent_message'), false);
});

test('conversation projection renders registered artifacts without switching to operations', () => {
  const events = [
    { event_sequence: 67, sequence: 67, event: 'session_artifact_registered', agent_id: 'resident', session_id: 'carrier_test', artifact: { artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' } },
    { event_sequence: 68, sequence: 68, event: 'tool_result', tool_name: 'fixture.tool', status: 'ok', agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['session_artifact_registered']);
  assert.equal(projection.rows[0].disposition, 'conversation_fact');
  assert.deepEqual(projection.rows[0].summary, [{ type: 'text', text: 'Preview' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }]);
});

test('conversation projection preserves audio artifact references for browser playback', () => {
  const events = [
    { event_sequence: 77, sequence: 77, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_audio_1', content: [{ type: 'text', text: 'Spoken version is ready.' }, { type: 'artifact_ref', artifact_id: 'art_audio_1', kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' }] },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['assistant_message']);
  assert.deepEqual(projection.rows[0].summary, [{ type: 'text', text: 'Spoken version is ready.' }, { type: 'artifact_ref', artifact_id: 'art_audio_1', kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' }]);
});

test('Vue artifact renderer exposes explicit audio controls for audio artifacts', () => {
  const component = readFileSync(new URL('../src/app/components/content/ArtifactReferencePart.vue', import.meta.url), 'utf8');
  assert.match(component, /<audio[\s\S]*controls[\s\S]*preload="metadata"[\s\S]*:src="contentUrl \?\? undefined"/);
  assert.match(component, /canPreviewAudio/);
});

test('DOM renderer projects audio artifact references as explicit audio controls', () => {
  const { elements, documentRef } = createProjectionDocument({ withNarsConfig: true });
  appendEvent({ event_sequence: 78, sequence: 78, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_audio_1', content: [{ type: 'text', text: 'Spoken version is ready.' }, { type: 'artifact_ref', artifact_id: 'art_audio_1', kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' }] }, documentRef, { verbosity: 'conversation' });
  const row = elements.get('events').children.find((child) => child?.dataset?.eventKind === 'assistant_message');
  const card = row.children[1].children[0].children.find((child) => child?.className === 'artifact-card');
  const audio = card.children.find((child) => child?.tagName === 'AUDIO');
  assert.equal(audio.className, 'artifact-audio-preview');
  assert.equal(audio.controls, true);
  assert.equal(audio.preload, 'metadata');
  assert.equal(audio.src, '/sessions/sessions/carrier_test/artifacts/art_audio_1/content');
});

test('DOM compatibility renderer consumes canonical structured content kinds', () => {
  const { elements, documentRef } = createProjectionDocument();
  appendEvent({
    event_sequence: 79,
    sequence: 79,
    event: 'assistant_message',
    agent_id: 'resident',
    session_id: 'carrier_test',
    request_id: 'canonical_parts',
    content: [
      { type: 'code', language: 'mermaid', text: 'flowchart TD\n  A --> B' },
      { type: 'intent_ref', intent: 'entity_number:dismiss', label: 'Dismiss' },
    ],
  }, documentRef, { verbosity: 'conversation' });
  const row = elements.get('events').children.find((child) => child?.dataset?.eventKind === 'assistant_message');
  assert.ok(row);
  assert.equal(descendantsWithClass(row, 'message-code-mermaid_diagram').length, 1);
  assert.equal(descendantsWithClass(row, 'intent-ref-part').length, 1);
});

test('conversation projection preserves canonical lifecycle content without punctuation boundary guessing', () => {
  const events = [
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', request_id: 'input_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.Done. Created and presented the artifact.' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.equal(assistantRows[0].summary, 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.Done. Created and presented the artifact.');
});

test('DOM renderer keeps artifact presentation and lifecycle message while hiding provider notes', () => {
  const { elements, documentRef } = createProjectionDocument({ withNarsConfig: true });
  const events = [
    { event_sequence: 63, sequence: 63, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.' } } },
    { event_sequence: 67, sequence: 67, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_art_1', content: [{ type: 'text', text: 'Here is the registered HTML artifact rendered inline.' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }] },
    { event_sequence: 69, sequence: 69, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_11', type: 'agent_message', text: 'Done. Created and presented the artifact.' } } },
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.\n\nDone. Created and presented the artifact.' },
  ];
  for (const event of events) appendEvent(event, documentRef, { verbosity: 'conversation' });
  const rows = elements.get('events').children.filter((child) => child?.dataset?.eventKind === 'assistant_message');
  assert.equal(rows.length, 2);
  assert.match(rows[0].dataset.assistantSummary, /registered HTML artifact/);
  assert.match(rows[1].dataset.assistantSummary, /Done/);
  assert.equal(elements.get('events').children.some((child) => child?.dataset?.eventKind === 'provider_agent_message'), false);
});

test('replayed user message does not duplicate operator row or reopen queued activity after assistant completion', () => {
  const events = [
    { event: 'operator_input_submitted', request_id: 'local_echo_startup', content: 'run startup sequence', event_sequence: 10, sequence: 10, timestamp: '2026-06-30T18:11:00.000Z' },
    { event: 'assistant_message', request_id: 'input_startup', content: 'done', event_sequence: 11, sequence: 11, timestamp: '2026-06-30T18:11:01.000Z' },
    { event: 'user_message', request_id: 'input_startup', content: 'run startup sequence', event_sequence: 12, sequence: 12, timestamp: '2026-06-30T18:11:02.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T18:11:03.000Z') });
  const operatorRows = projection.rows.filter((row) => row.kind === 'operator_input_submitted' || row.kind === 'user_message');
  assert.equal(operatorRows.length, 1);
  assert.equal(operatorRows[0].kind, 'user_message');
  assert.equal(operatorRows[0].summary, 'run startup sequence');
  assert.equal(projection.activity.active, false);
});

test('DOM renderer replaces local operator submit echo with canonical user message', () => {
  const { elements, documentRef } = createProjectionDocument();
  appendEvent({ event: 'operator_input_submitted', request_id: 'local_echo', content: 'run startup sequence' }, documentRef, { verbosity: 'conversation' });
  appendEvent({ event: 'user_message', request_id: 'nars_input', session_id: 'carrier_test', content: 'run startup sequence' }, documentRef, { verbosity: 'conversation' });
  const rows = elements.get('events').children.filter((child) => child?.dataset?.eventKind === 'operator_input_submitted' || child?.dataset?.eventKind === 'user_message');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.eventKind, 'user_message');
});

test('conversation projection keeps chat compact while activity summarizes top-level tool progress', () => {
  const base = { agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-07-08T20:49:39.000Z', provider: 'codex-subscription' };
  const events = [
    { ...base, event: 'user_message', request_id: 'input_tools', content: 'finish task 473' },
    { ...base, event: 'turn_started', request_id: 'input_tools', turn_id: 'turn_tools' },
    { ...base, event: 'assistant_message', request_id: 'input_tools', turn_id: 'turn_tools', content: 'I will restart the MCP and run diagnostics.' },
    { ...base, event: 'tool_call', request_id: 'input_tools', tool_name: 'narada-sonar-task-lifecycle.task_lifecycle_restart' },
    { ...base, event: 'tool_result', request_id: 'input_tools', tool_name: 'narada-sonar-task-lifecycle.task_lifecycle_restart', status: 'ok' },
    { ...base, event: 'tool_call', request_id: 'input_tools', tool_name: 'narada-sonar-task-lifecycle.task_lifecycle_doctor' },
    { ...base, event: 'tool_result', request_id: 'input_tools', tool_name: 'narada-sonar-task-lifecycle.task_lifecycle_doctor', status: 'error' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-07-08T20:50:12.000Z') });
  assert.equal(projection.rows.some((row) => row.kind === 'tool_call' || row.kind === 'tool_result'), false);
  assert.equal(projection.activity.active, true);
  assert.equal(projection.activity.state, 'thinking');
  assert.match(projection.activity.label, /resident is thinking/);
  assert.match(projection.activity.detail, /tools: 2 called · 2 completed · 1 failed · latest narada-sonar-task-lifecycle\.task_lifecycle_doctor/);

  const completedProjection = createSessionProjection([
    ...events,
    { ...base, event: 'turn_complete', request_id: 'input_tools', turn_id: 'turn_tools', terminal_state: 'completed' },
  ], { verbosity: 'conversation' });
  assert.equal(completedProjection.activity.active, false);
});

test('custom projection views filter rendered rows by presentation facet while keeping activity state intact', () => {
  const events = [
    { event: 'user_message', request_id: 'view-input', content: 'show me the result' },
    { event: 'tool_call', request_id: 'view-input', tool_name: 'narada.example.lookup' },
    { event: 'error', request_id: 'view-input', message: 'example failure' },
    { event: 'directive_received', request_id: 'view-input', directive_id: 'directive-1' },
    { event: 'unclassified_event', request_id: 'view-input', value: 'raw record' },
  ];

  const conversationOnly = createSessionProjection(events, {
    verbosity: 'raw',
    customView: { facets: ['conversation'] },
  });
  assert.deepEqual(conversationOnly.rows.map((row) => row.disposition), ['conversation_fact']);
  assert.equal(conversationOnly.rows[0].kind, 'user_message');

  const operationsAndDiagnostics = createSessionProjection(events, {
    verbosity: 'raw',
    customView: { facets: ['operations', 'diagnostics'] },
  });
  assert.deepEqual(operationsAndDiagnostics.rows.map((row) => row.disposition), ['operation_fact', 'diagnostic_signal']);
});

test('session projection reduces routine health into state and clears completed tool activity', () => {
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'sonar',
    local_agent_id: 'resident',
    canonical_agent_id: 'sonar.resident',
  };
  const events = [
    { event: 'session_health', status: 'healthy', agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'session_health', status: 'healthy', agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:10.000Z' },
    { event_sequence: 10, sequence: 10, agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:11.000Z', event: { type: 'item.started', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence' } } },
    { event_sequence: 11, sequence: 11, agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:12.000Z', event: { type: 'item.completed', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', result: { content: [{ type: 'text', text: '{"status":"ok"}' }] } } } },
    { event: 'session_health', status: 'healthy', agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:04:00.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'diagnostics', nowMs: Date.parse('2026-06-30T15:04:36.000Z') });
  assert.equal(projection.health.status, 'healthy');
  assert.equal(projection.health.agentId, 'sonar.resident');
  assert.equal(projection.health.text, 'healthy · sonar.resident · carrier_test');
  assert.equal(projection.health.healthySampleCount, 3);
  assert.equal(projection.rows.some((row) => row.kind === 'session_health'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'websocket_connected'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'tool_result'), false);
  assert.equal(projection.activity.active, true);
  assert.equal(projection.activity.state, 'thinking');
  assert.equal(projection.activity.label, 'sonar.resident is thinking...');
  assert.notEqual(projection.activity.state, 'tool');

  const completeProjection = createSessionProjection([...events, { event: 'turn_complete', turn_id: 'turn_after_tool', terminal_state: 'completed', timestamp: '2026-06-30T15:04:37.000Z' }], { verbosity: 'diagnostics' });
  assert.equal(completeProjection.activity.active, false);
});

test('session projection clears stale activity when health reports no running turn', () => {
  const events = [
    { event: 'turn_started', turn_id: 'turn_stale', agent_id: 'resident', session_id: 'carrier_test', provider: 'codex-subscription', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'assistant_message_stream', turn_id: 'turn_stale', agent_id: 'resident', session_id: 'carrier_test', content: 'partial', timestamp: '2026-06-30T15:00:03.000Z' },
    { event: 'session_health', status: 'healthy', active_turn_state: 'idle', active_turn_id: null, agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:10:00.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T15:10:01.000Z') });
  assert.equal(projection.activity.active, false);
  assert.equal(projection.activity.state, 'idle');
});

test('session projection settles carrier completion aliases after retained-tab replay', () => {
  const prefix = [
    { event: 'operator_input_submitted', request_id: 'input-carrier', method: 'session.submit', content: 'run', timestamp: '2026-07-11T12:10:00.000Z' },
    { event: 'input_event_queued', request_id: 'input-carrier', event_id: 'turn-carrier', timestamp: '2026-07-11T12:10:00.100Z' },
    { event: 'input_event_started', request_id: 'input-carrier', event_id: 'turn-carrier', timestamp: '2026-07-11T12:10:00.200Z' },
    { event: 'carrier_turn_started', request_id: 'input-carrier', turn_id: 'turn-carrier', timestamp: '2026-07-11T12:10:00.300Z' },
  ];
  const carrierCompleted = createSessionProjection([
    ...prefix,
    { event: 'carrier_turn_completed', turn_id: 'turn-carrier', terminal_state: 'completed', timestamp: '2026-07-11T12:11:00.000Z' },
  ], { verbosity: 'conversation', nowMs: Date.parse('2026-07-11T12:11:01.000Z') });
  assert.equal(carrierCompleted.activity.active, false);
  assert.equal(carrierCompleted.activity.state, TURN_ACTIVITY_PHASES.IDLE);

  const inputCompleted = createSessionProjection([
    ...prefix,
    { event: 'input_completed', input_event_id: 'turn-carrier', terminal_state: 'completed', timestamp: '2026-07-11T12:11:00.000Z' },
  ], {
    verbosity: 'conversation',
    nowMs: Date.parse('2026-07-11T12:11:01.000Z'),
    healthSnapshot: { active_turn_state: null, active_turn_id: null },
  });
  assert.equal(inputCompleted.activity.active, false);
  assert.equal(inputCompleted.operatorDelivery.phase, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED);
  assert.equal(inputCompleted.operatorDelivery.label, 'Input delivered');

  const nullHealth = createSessionProjection([
    { event: 'turn_started', turn_id: 'turn-stale', timestamp: '2026-07-11T12:10:00.000Z' },
  ], {
    healthSnapshot: { active_turn_state: null, active_turn_id: null },
  });
  assert.equal(nullHealth.activity.active, false);
});

test('session projection clears activity on turn interruption', () => {
  const events = [
    { event: 'turn_started', turn_id: 'turn_interrupt', agent_id: 'resident', session_id: 'carrier_test', provider: 'codex-subscription', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'turn_interrupted', turn_id: 'turn_interrupt', agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:00:05.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T15:00:06.000Z') });
  assert.equal(projection.activity.active, false);
  assert.equal(projection.activity.state, 'idle');
});

test('diagnostics projection shows fault signals without routine transcript and operation rows', () => {
  const base = { agent_id: 'resident', session_id: 'carrier_diag', timestamp: '2026-06-30T18:00:00.000Z', provider: 'codex-subscription' };
  const events = [
    { ...base, event: 'operator_input_submitted', request_id: 'input_diag', content: 'run startup sequence' },
    { ...base, event: 'tool_call', request_id: 'input_diag', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence' },
    { ...base, event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence', status: 'ok' },
    { ...base, event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-sonar-sop.sop_run_start', status: 'failed', error: 'sop unavailable' },
    { ...base, event: 'assistant_message', request_id: 'input_diag', content: 'Startup sequence completed.' },
    { ...base, event: 'session_health', status: 'degraded', mcp_operational_state: 'degraded', mcp_runtime_fault_count: 1 },
    { ...base, event: 'websocket_error', message: 'socket dropped' },
    { ...base, event: 'turn_failed', terminal_state: 'failed', message: 'provider failed' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'diagnostics', nowMs: Date.parse('2026-06-30T18:00:05.000Z') });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['session_health', 'websocket_error', 'turn_failed']);
  assert.match(projection.rows.map((row) => row.summary).join('\n'), /degraded|socket dropped|provider failed|turn_failed/i);
});

test('operator input delivery projects submission through NARS acknowledgment and completion', () => {
  const projection = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-1', method: 'session.submit', content: 'run startup sequence', operator_delivery_mode: 'default', timestamp: '2026-07-11T12:00:00.000Z' },
    { event: 'session_control_accepted', request_id: 'input-1', method: 'session.submit', acceptance_state: 'accepted', timestamp: '2026-07-11T12:00:00.050Z' },
    { event: 'input_event_queued', request_id: 'input-1', event_id: 'nars-input-1', source: 'manual_operator', timestamp: '2026-07-11T12:00:00.100Z' },
    { event: 'input_event_started', request_id: 'input-1', event_id: 'nars-input-1', source: 'manual_operator', timestamp: '2026-07-11T12:00:00.200Z' },
    { event: 'carrier_turn_started', turn_id: 'nars-input-1', timestamp: '2026-07-11T12:00:00.300Z' },
    { event: 'input_event_completed', request_id: 'input-1', event_id: 'nars-input-1', terminal_state: 'completed', timestamp: '2026-07-11T12:00:01.000Z' },
    { event: 'session_control_response', request_id: 'input-1', method: 'session.submit', terminal_state: 'completed', timestamp: '2026-07-11T12:00:01.100Z' },
  ], Date.parse('2026-07-11T12:00:01.100Z'));

  assert.equal(projection.phase, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED);
  assert.deepEqual(projection.history, [
    OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
    OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING,
    OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED,
    OPERATOR_INPUT_DELIVERY_PHASES.STEERING,
    OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED,
  ]);
  assert.equal(projection.requestId, 'input-1');
  assert.equal(projection.activeTurnId, 'nars-input-1');
});

test('operator input delivery advances a relayed submission when NARS acknowledges it', () => {
  const projection = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-relay', method: 'session.submit', content: 'relay this', timestamp: '2026-07-11T12:00:00.000Z' },
    { event: 'projection_input_response', request_id: 'input-relay', method: 'session.submit', status: 'ok', http_ok: true, timestamp: '2026-07-11T12:00:00.050Z' },
    { event: 'session_control_accepted', request_id: 'input-relay', method: 'session.submit', acceptance_state: 'accepted', timestamp: '2026-07-11T12:00:00.100Z' },
  ]);

  assert.equal(projection.phase, OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED);
  assert.deepEqual(projection.history, [
    OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
    OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING,
    OPERATOR_INPUT_DELIVERY_PHASES.RELAY_PENDING,
    OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED,
  ]);
});

test('operator input delivery recognizes carrier input completion evidence', () => {
  const projection = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-carrier', method: 'session.submit', content: 'run', timestamp: '2026-07-11T12:12:00.000Z' },
    { event: 'input_event_queued', request_id: 'input-carrier', event_id: 'nars-input-carrier', timestamp: '2026-07-11T12:12:00.100Z' },
    { event: 'input_event_started', request_id: 'input-carrier', event_id: 'nars-input-carrier', timestamp: '2026-07-11T12:12:00.200Z' },
    { event: 'input_completed', input_event_id: 'nars-input-carrier', terminal_state: 'completed', timestamp: '2026-07-11T12:13:00.000Z' },
  ], Date.parse('2026-07-11T12:13:01.000Z'));

  assert.equal(projection.phase, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED);
  assert.equal(projection.label, 'Input delivered');
  assert.equal(projection.terminalState, 'completed');
});

test('operator input delivery distinguishes explicit queueing before turn admission', () => {
  const projection = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-queue-1', method: 'session.submit', content: 'run after this', operator_delivery_mode: 'enqueue', timestamp: '2026-07-11T12:01:00.000Z' },
    { event: 'input_event_queued', request_id: 'input-queue-1', event_id: 'nars-input-queue-1', source: 'operator_steering', delivery_mode: 'admit_after_active_turn', timestamp: '2026-07-11T12:01:00.100Z' },
    { event: 'session_control_response', request_id: 'input-queue-1', method: 'session.submit', terminal_state: 'completed', timestamp: '2026-07-11T12:01:00.200Z' },
  ]);

  assert.equal(projection.phase, OPERATOR_INPUT_DELIVERY_PHASES.QUEUED);
  assert.deepEqual(projection.history, [
    OPERATOR_INPUT_DELIVERY_PHASES.DRAFT,
    OPERATOR_INPUT_DELIVERY_PHASES.SUBMITTING,
    OPERATOR_INPUT_DELIVERY_PHASES.ACCEPTED,
    OPERATOR_INPUT_DELIVERY_PHASES.QUEUED,
  ]);
  assert.match(projection.detail, /holding it for the next turn/);
});

test('operator input delivery correlates runtime queue evidence by unique method and preserves event identity', () => {
  const projection = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-fallback', method: 'session.submit', content: 'run', operator_delivery_mode: 'default' },
    { event: 'input_event_queued', event_id: 'nars-input-fallback', method: 'session.submit', source: 'manual_operator' },
    { event: 'input_event_started', event_id: 'nars-input-fallback', method: 'session.submit', source: 'manual_operator' },
    { event: 'carrier_turn_started', turn_id: 'nars-input-fallback' },
    { event: 'input_event_completed', event_id: 'nars-input-fallback', method: 'session.submit', terminal_state: 'completed' },
    { event: 'session_control_response', request_id: 'input-fallback', method: 'session.submit', terminal_state: 'completed' },
  ]);

  assert.equal(projection.phase, OPERATOR_INPUT_DELIVERY_PHASES.COMPLETED);
  assert.equal(projection.requestId, 'input-fallback');
  assert.equal(projection.activeTurnId, 'nars-input-fallback');
});

test('operator input delivery keeps rejection and runtime failure terminal states distinct', () => {
  const rejected = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-rejected', method: 'session.submit', content: 'blocked', operator_delivery_mode: 'default' },
    { event: 'session_control_rejected', request_id: 'input-rejected', method: 'session.submit', code: 'unsupported_session_control', error: 'unsupported', timestamp: '2026-07-11T12:02:00.000Z' },
  ]);
  assert.equal(rejected.phase, OPERATOR_INPUT_DELIVERY_PHASES.REJECTED);
  assert.equal(rejected.terminalState, 'unsupported_session_control');

  const failed = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-failed', method: 'session.submit', content: 'run', operator_delivery_mode: 'default', active_turn_id: 'turn-failed' },
    { event: 'input_event_queued', request_id: 'input-failed', event_id: 'nars-input-failed', timestamp: '2026-07-11T12:03:00.000Z' },
    { event: 'carrier_turn_failed', turn_id: 'nars-input-failed', error: 'provider unavailable', terminal_state: 'failed', timestamp: '2026-07-11T12:03:01.000Z' },
    { event: 'session_control_rejected', request_id: 'input-failed', method: 'session.submit', code: 'request_dispatch_failed', error: 'provider unavailable', timestamp: '2026-07-11T12:03:01.100Z' },
  ]);
  assert.equal(failed.phase, OPERATOR_INPUT_DELIVERY_PHASES.FAILED);
  assert.equal(failed.error, 'provider unavailable');
  assert.equal(failed.terminalState, 'failed');

  const requestStateFailed = createOperatorInputDeliveryProjection([
    { event: 'operator_input_submitted', request_id: 'input-state-failed', method: 'session.submit', content: 'run', operator_delivery_mode: 'default' },
    { event: 'runtime_request_state_transition', request_id: 'input-state-failed', method: 'session.submit', request_state: 'failed', terminal_state: 'failed', error: 'dispatch failed' },
  ]);
  assert.equal(requestStateFailed.phase, OPERATOR_INPUT_DELIVERY_PHASES.FAILED);
  assert.equal(requestStateFailed.terminalState, 'failed');
  assert.equal(requestStateFailed.error, 'dispatch failed');
});
