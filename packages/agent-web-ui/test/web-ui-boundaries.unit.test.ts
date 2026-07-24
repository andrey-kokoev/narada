import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import {
  createRetainedEventState,
  retainEvent,
} from '../src/app/lib/eventRetention';
import {
  NARS_TRANSPORT_TRANSITIONS,
  canTransitionNarsTransport,
  createNarsTransportLifecycle,
  transitionNarsTransport,
} from '../src/protocol/sessionTransportAdapters';
import {
  PENDING_OPERATOR_INPUT_PHASES,
  PENDING_OPERATOR_INPUT_TRANSITIONS,
  canTransitionPendingOperatorInput,
  transitionPendingOperatorInput,
} from '../src/protocol/operatorInputLifecycle';
import {
  OPERATOR_INPUT_PHASES,
  OPERATOR_INPUT_TRANSITIONS,
} from '../src/operator-input-lifecycle.ts';
import {
  OPERATOR_INPUT_DELIVERY_PHASES,
  OPERATOR_INPUT_DELIVERY_TRANSITIONS,
} from '../src/operator-input-delivery.ts';
import { buildMessageContentPipeline } from '../src/app/lib/contentPipeline';
import {
  SESSION_PANEL_REGISTRY,
  availableSessionPanelIds,
  isSessionPanelAvailable,
} from '../src/app/panel-registry';
import { useSessionActions } from '../src/app/composables/useSessionActions';
import { submitOperatorInput } from '../src/protocol/operatorInput';
import { buildOperatorCommandPaletteEntries } from '../src/app/lib/operatorCommandController';
import {
  readBooleanPreference,
  readJsonPreference,
  writeBooleanPreference,
} from '../src/app/lib/browserPreferences.ts';
import { createNarsClient } from '../src/protocol/narsClient';
import { createSessionProjection } from '../src/session-projection.ts';
import { useRuntimeTopology } from '../src/app/composables/useRuntimeTopology';
import { buildIntelligenceReconfigureFrame } from '../src/app/lib/narsFrames';
import { isOperatorInputTransportReady, isTransportLive, operatorInputNotReadyReason } from '../src/app/lib/operatorInputReadiness';
import { findCorrelatedInput, inputCorrelationFromEvent } from '../src/operator-input-correlation.ts';
import type { SessionProtocolFrame, SessionTransport } from '../src/protocol/sessionTransport';

describe('agent-web-ui runtime boundaries', () => {
  it('keeps operator input gated by transport state, not display-status text', () => {
    expect(isTransportLive('live')).toBe(true);
    expect(isTransportLive('opening')).toBe(false);
    expect(isTransportLive('input acknowledgment timed out after 5s')).toBe(false);
    expect(isOperatorInputTransportReady(true, null)).toBe(true);
    expect(isOperatorInputTransportReady(false, 'https://projection.example/input')).toBe(true);
    expect(isOperatorInputTransportReady(false, null)).toBe(false);
    expect(operatorInputNotReadyReason('subscribing')).toContain('subscribing');
  });

  it('renders browser-local correlation diagnostics in the default conversation projection', () => {
    const projection = createSessionProjection([
      {
        event: 'web_ui_session_correlation_mismatch',
        message: 'The attached transport reported a different NARS session; the event was ignored.',
      },
    ]);

    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0]).toMatchObject({
      kind: 'web_ui_session_correlation_mismatch',
      disposition: 'diagnostic_signal',
      summary: 'The attached transport reported a different NARS session; the event was ignored.',
    });
  });

  it('models transport lifecycle transitions explicitly', () => {
    const lifecycle = createNarsTransportLifecycle(true);
    expect(lifecycle.phase).toBe('idle');
    transitionNarsTransport(lifecycle, { type: 'open_requested' });
    transitionNarsTransport(lifecycle, { type: 'replay_started' });
    expect(lifecycle.phase).toBe('replaying');
    transitionNarsTransport(lifecycle, { type: 'connected' });
    expect(lifecycle.phase).toBe('live');
    transitionNarsTransport(lifecycle, { type: 'reconnect_scheduled', reason: 'socket closed', at: 1000 });
    expect(lifecycle).toMatchObject({ phase: 'reconnecting', attempt: 1, reason: 'socket closed', disconnectedAt: 1000 });
    transitionNarsTransport(lifecycle, { type: 'open_requested' });
    expect(lifecycle.phase).toBe('opening');
    transitionNarsTransport(lifecycle, { type: 'close_requested' });
    transitionNarsTransport(lifecycle, { type: 'closed' });
    expect(lifecycle.phase).toBe('closed');
  });

  it('exposes the transport contract and ignores stale socket events', () => {
    expect(canTransitionNarsTransport('idle', 'open_requested')).toBe(true);
    expect(canTransitionNarsTransport('live', 'open_requested')).toBe(false);
    expect(canTransitionNarsTransport('closed', 'connected')).toBe(false);
    expect(NARS_TRANSPORT_TRANSITIONS.closed).toEqual([]);

    const lifecycle = createNarsTransportLifecycle(true);
    transitionNarsTransport(lifecycle, { type: 'connected' });
    expect(lifecycle.phase).toBe('idle');
    transitionNarsTransport(lifecycle, { type: 'open_requested' });
    transitionNarsTransport(lifecycle, { type: 'replay_started' });
    expect(lifecycle.phase).toBe('replaying');
    transitionNarsTransport(lifecycle, { type: 'open_requested' });
    expect(lifecycle.phase).toBe('replaying');
  });

  it('models correlated operator input recovery as a closed transition machine', () => {
    const lifecycle = { phase: PENDING_OPERATOR_INPUT_PHASES.SENT, updated_at: '2026-07-15T21:00:00.000Z' };
    expect(canTransitionPendingOperatorInput(lifecycle.phase, PENDING_OPERATOR_INPUT_PHASES.RELAY_PENDING)).toBe(true);
    expect(canTransitionPendingOperatorInput(lifecycle.phase, PENDING_OPERATOR_INPUT_PHASES.RETRIED)).toBe(false);
    expect(transitionPendingOperatorInput(lifecycle, PENDING_OPERATOR_INPUT_PHASES.RELAY_PENDING)).toBe(true);
    expect(transitionPendingOperatorInput(lifecycle, PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT)).toBe(true);
    expect(transitionPendingOperatorInput(lifecycle, PENDING_OPERATOR_INPUT_PHASES.REVIEWING)).toBe(true);
    expect(transitionPendingOperatorInput(lifecycle, PENDING_OPERATOR_INPUT_PHASES.RETRIED)).toBe(true);
    expect(lifecycle.phase).toBe(PENDING_OPERATOR_INPUT_PHASES.RETRIED);
    expect(transitionPendingOperatorInput(lifecycle, PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT)).toBe(false);
  });

  it('uses one canonical input transition graph for recovery and delivery projections', () => {
    expect(OPERATOR_INPUT_DELIVERY_PHASES).toBe(OPERATOR_INPUT_PHASES);
    expect(OPERATOR_INPUT_DELIVERY_TRANSITIONS).toBe(OPERATOR_INPUT_TRANSITIONS);
    expect(PENDING_OPERATOR_INPUT_TRANSITIONS[PENDING_OPERATOR_INPUT_PHASES.RELAY_PENDING]).toEqual([
      PENDING_OPERATOR_INPUT_PHASES.TIMED_OUT,
      PENDING_OPERATOR_INPUT_PHASES.REVIEWING,
    ]);
  });

  it('keeps request IDs distinct from input-event IDs and refuses ambiguous method fallback', () => {
    expect(inputCorrelationFromEvent({ request_id: 'request-1', input_event_id: 'event-1' })).toMatchObject({
      requestId: 'request-1',
      inputEventId: 'event-1',
    });
    expect(inputCorrelationFromEvent({ authority_request_id: 'authority-1', input_id: 'input-1' })).toMatchObject({
      requestId: 'authority-1',
      inputEventId: 'input-1',
    });
    expect(findCorrelatedInput([
      { request_id: 'request-1', method: 'session.submit', phase: 'sent' },
      { request_id: 'request-2', method: 'session.submit', phase: 'sent' },
    ], { method: 'session.submit' }, { allowUniqueMethod: true })).toMatchObject({
      record: null,
      matchedBy: 'unique_method',
      ambiguous: true,
    });
    expect(findCorrelatedInput([
      { request_id: 'request-1', session_id: 'session-1', method: 'session.submit', phase: 'sent' },
    ], { request_id: 'request-1', session_id: 'session-2' })).toMatchObject({
      record: null,
      matchedBy: null,
      ambiguous: false,
    });
    expect(findCorrelatedInput([
      { request_id: 'request-3', method: 'session.submit', phase: 'sent' },
    ], { method: 'conversation.send' }, { allowUniqueMethod: true })).toMatchObject({
      record: expect.objectContaining({ request_id: 'request-3' }),
      matchedBy: 'unique_method',
      ambiguous: false,
    });
  });

  it('builds the Intelligence box action as a direct local runtime control', () => {
    expect(buildIntelligenceReconfigureFrame({ model: 'next-model' }, { id: 'ui-reconfigure-1' })).toEqual({
      id: 'ui-reconfigure-1',
      method: 'runtime.intelligence.reconfigure',
      params: { request_id: 'ui-reconfigure-1', model: 'next-model' },
    });
  });

  it('projects the NARS control-input bridge into connection diagnostics', () => {
    const topology = useRuntimeTopology({
      eventEndpoint: 'ws://127.0.0.1/events',
      healthEndpoint: 'http://127.0.0.1/health',
      inputEndpoint: 'http://127.0.0.1/input',
      streamText: shallowRef('connected'),
      healthText: shallowRef('healthy'),
      healthBody: shallowRef({
        status: 'healthy',
        session_id: 'session-1',
        control_input_bridge: {
          status: 'polling',
          path: 'control.jsonl',
          last_read_status: 'empty',
          offset: 42,
          read_count: 7,
          emitted_count: 2,
          error_count: 0,
        },
      }),
      sessionIdentity: shallowRef({ siteId: 'sonar', agentId: 'sonar.resident', role: 'resident', sessionId: 'session-1', title: 'sonar.resident', subtitle: 'session-1' }),
      authorityTransition: shallowRef(null),
      mcpInventory: shallowRef({ operationalState: 'healthy', serverCount: 1, startupFailureCount: 0, runtimeFaultCount: 0, servers: [], source: 'health' }),
    }).topology.value;
    expect(topology.nodes.find((node) => node.id === 'control-input-bridge')).toMatchObject({
      label: 'Control Input',
      state: 'polling',
      detail: 'control.jsonl',
    });
  });

  it('filters command discovery and help through runtime method capabilities', () => {
    const supportsHealthOnly = (method: string) => method === 'session.health';
    const commands = buildOperatorCommandPaletteEntries({
      draft: '/',
      snippets: [],
      supportsProtocolMethod: supportsHealthOnly,
    });
    expect(commands.some((entry) => entry.kind === 'command' && entry.command.id === 'status')).toBe(true);
    expect(commands.some((entry) => entry.kind === 'command' && entry.command.id === 'recovery')).toBe(false);

    const help = submitOperatorInput('/help', null, null, 'default', false, supportsHealthOnly);
    expect(help.localEvent).toMatchObject({ event: 'agent_web_ui_help' });
    expect((help.localEvent as { content: string }).content).toContain('/status');
    expect((help.localEvent as { content: string }).content).not.toContain('/recovery');
  });

  it('bounds retained session events and preserves the newest sequence window', () => {
    const state = createRetainedEventState(3);
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      retainEvent(state, { event: 'session_event', payload: { event: 'assistant_message', sequence }, cursor: { sequence } });
    }
    expect(state.events).toHaveLength(3);
    expect(state.droppedCount).toBe(2);
    expect(state.events.map((event) => (event as { cursor: { sequence: number } }).cursor.sequence)).toEqual([3, 4, 5]);
  });

  it('does not allow an invalid retention limit to disable trimming', () => {
    expect(createRetainedEventState(Number.POSITIVE_INFINITY).maxEvents).toBe(500);
    expect(createRetainedEventState(0).maxEvents).toBe(500);
  });

  it('uses one canonical content classification for structured code and fenced text', () => {
    const pipeline = buildMessageContentPipeline([
      { type: 'text', text: 'Before' },
      { type: 'code', language: 'mermaid', text: 'flowchart TD\n  A --> B' },
      { type: 'artifact_ref', artifact_id: 'artifact-1', kind: 'html' },
      { type: 'intent_ref', intent: 'entity_number:dismiss', label: 'Dismiss' },
    ]);
    expect(pipeline.parts.map((part) => part.kind)).toEqual([
      'plain_text',
      'mermaid_diagram',
      'artifact_ref',
      'intent_ref',
    ]);
    expect(buildMessageContentPipeline('```json\n{"ok":true}\n```').parts[0]?.kind).toBe('json_block');
  });

  it('keeps unavailable panel capabilities explicit and searchable by policy', () => {
    const context = { artifactBasePath: null, surfaceKinds: [], genericAffordanceCount: 0 };
    expect(isSessionPanelAvailable('generic_affordance', context)).toBe(false);
    expect(availableSessionPanelIds(context)).toEqual(['runtime_topology', 'mcp']);
    expect(SESSION_PANEL_REGISTRY.find((panel) => panel.id === 'generic_affordance')?.unavailableMessage).toMatch(/advertised/);
  });

  it('admits session actions once and records fail-closed refusals', () => {
    const retained: unknown[] = [];
    const transport = shallowRef<SessionTransport | null>({
      sendFrame: vi.fn(() => true),
    } as unknown as SessionTransport);
    const actions = useSessionActions(transport, (event) => retained.push(event), (method) => method === 'session.health');
    expect(actions.send({ method: 'session.health', params: {} })).toBe(true);
    expect(actions.send({ method: 'session.close', params: {} })).toBe(false);
    expect(actions.send(null)).toBe(false);
    expect(retained).toEqual([
      expect.objectContaining({ reason_code: 'unsupported_session_control', method: 'session.close' }),
      expect.objectContaining({ reason_code: 'invalid_session_control' }),
    ]);
    expect(actions.send({ method: 42 } as unknown as SessionProtocolFrame)).toBe(false);
    expect(retained.at(-1)).toEqual(expect.objectContaining({ reason_code: 'invalid_session_control' }));
    const throwingTransport = shallowRef<SessionTransport | null>({
      sendFrame: vi.fn(() => { throw new Error('transport down'); }),
    } as unknown as SessionTransport);
    const throwingActions = useSessionActions(throwingTransport, (event) => retained.push(event));
    expect(throwingActions.send({ method: 'session.health' })).toBe(false);
    expect(retained.at(-1)).toEqual(expect.objectContaining({ reason_code: 'transport_rejected_session_action' }));
  });

  it('uses the projected active turn identity when building operator input', () => {
    const frames: SessionProtocolFrame[] = [];
    const result = submitOperatorInput(
      'change course',
      { activeTurnId: 'transport-turn', sendFrame: vi.fn(() => true) } as unknown as Parameters<typeof submitOperatorInput>[1],
      null,
      'default',
      true,
      null,
      (frame) => { frames.push(frame); return true; },
      'projected-turn',
    );
    expect(result.handled).toBe(true);
    expect(frames[0]).toMatchObject({
      method: 'session.submit',
      params: { active_turn_id: 'projected-turn' },
    });
  });

  it('preserves durable idempotency keys across input, session close, and manual retry frames', () => {
    const frames: SessionProtocolFrame[] = [];
    const sendFrame = (frame: SessionProtocolFrame) => {
      frames.push(frame);
      return true;
    };

    const initial = submitOperatorInput(
      'run startup sequence',
      null,
      null,
      'default',
      false,
      (method) => method === 'session.submit',
      sendFrame,
    );
    expect(initial.handled).toBe(true);
    const initialKey = (frames[0].params as { idempotency_key?: string }).idempotency_key;
    expect(initialKey).toMatch(/^agent-web-ui:session\.submit:/);
    expect(initial.localEvent).toMatchObject({ idempotency_key: initialKey });

    const close = submitOperatorInput(
      '/exit',
      null,
      null,
      'default',
      false,
      (method) => method === 'session.close',
      sendFrame,
    );
    expect(close.handled).toBe(true);
    const closeKey = (frames[1].params as { idempotency_key?: string }).idempotency_key;
    expect(closeKey).toMatch(/^agent-web-ui:session\.close:/);
    expect(close.localEvent).toMatchObject({ method: 'session.close', idempotency_key: closeKey });

    const retried = submitOperatorInput(
      'run startup sequence',
      null,
      null,
      'default',
      false,
      (method) => method === 'session.submit',
      sendFrame,
      undefined,
      initialKey ?? null,
    );
    expect(retried.handled).toBe(true);
    expect((frames[2].params as { idempotency_key?: string }).idempotency_key).toBe(initialKey);
    expect(retried.localEvent).toMatchObject({ idempotency_key: initialKey });
  });

  it('survives throwing browser storage reads and writes', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('storage blocked'); }),
      setItem: vi.fn(() => { throw new Error('storage blocked'); }),
    };
    expect(readBooleanPreference('narada:agent-web-ui:test.v1', true, storage)).toBe(true);
    expect(readJsonPreference('narada:agent-web-ui:test.v1', ['fallback'], storage)).toEqual(['fallback']);
    expect(writeBooleanPreference('narada:agent-web-ui:test.v1', false, storage)).toBe(false);
  });

  it('prevents duplicate Cloudflare reconnect scheduling across error and close', async () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ id: number; delay: number; handler: () => void; cleared: boolean }> = [];
    let nextTimerId = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const client = createNarsClient({
      endpoint: 'https://projection.example/events',
      healthEndpoint: 'https://projection.example/health',
      WebSocketCtor,
      fetchFn: vi.fn(async () => ({ ok: true, status: 200, async json() { return { events: [], has_more: false }; } })) as unknown as typeof fetch,
      timers: {
        setTimeout(handler: TimerHandler, delay?: number) {
          const timer = { id: ++nextTimerId, delay: delay ?? 0, handler: handler as () => void, cleared: false };
          timers.push(timer);
          return timer.id;
        },
        clearTimeout(id: number) {
          const timer = timers.find((candidate) => candidate.id === id);
          if (timer) timer.cleared = true;
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.kind).toBe('cloudflare-projection');
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    expect(() => client.sendFrame({ method: 42 } as unknown as SessionProtocolFrame)).toThrow('unsupported_agent_web_ui_protocol_frame');
    sockets[0].emit('error');
    sockets[0].emit('close');
    expect(sockets[0].readyState).toBe(3);
    expect(timers.filter((timer) => timer.delay === 1000 && !timer.cleared)).toHaveLength(1);
    client.close();
    expect(timers.some((timer) => timer.cleared)).toBe(true);
  });

  it('times out an unacknowledged operator input without resending and reconciles a late acknowledgment', () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ id: number; delay: number; handler: () => void; cleared: boolean }> = [];
    const storageValues = new Map<string, string>();
    let nextTimerId = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const clientEvents: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/events',
      sessionId: 'session-timeout',
      pendingInputStorageKey: 'pending-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      operatorInputAckTimeoutMs: 5000,
      WebSocketCtor,
      timers: {
        setTimeout(handler: TimerHandler, delay?: number) {
          const timer = { id: ++nextTimerId, delay: delay ?? 0, handler: handler as () => void, cleared: false };
          timers.push(timer);
          return timer.id;
        },
        clearTimeout(id: number) {
          const timer = timers.find((candidate) => candidate.id === id);
          if (timer) timer.cleared = true;
        },
      },
      onEvent: (event) => clientEvents.push(event),
    });

    sockets[0].open();
    expect(client.sendFrame({
      id: 'request-timeout',
      method: 'session.submit',
      params: { message: 'proceed', source: 'agent-web-ui' },
    })).toBe(true);
    expect(JSON.parse(sockets[0].sentFrames.at(-1) ?? '{}')).toMatchObject({
      id: 'request-timeout',
      method: 'session.submit',
    });
    expect(storageValues.get('pending-input-test')).toContain('request-timeout');

    timers.find((timer) => timer.delay === 5000)?.handler();
    expect(clientEvents).toContainEqual(expect.objectContaining({
      event: 'web_ui_input_ack_timeout',
      request_id: 'request-timeout',
      reason_code: 'nars_ack_timeout',
    }));
    expect(timers.filter((timer) => timer.delay === 5000 && !timer.cleared)).toHaveLength(0);
    expect(sockets[0].sentFrames.filter((frame) => JSON.parse(frame).id === 'request-timeout')).toHaveLength(1);
    expect(JSON.parse(storageValues.get('pending-input-test') ?? '[]')).toEqual([
      expect.objectContaining({ request_id: 'request-timeout', phase: 'timed_out' }),
    ]);

    sockets[0].emit('message', { data: JSON.stringify({
      event: 'input_event_queued',
      request_id: 'request-timeout',
      event_id: 'nars-input-timeout',
    }) });
    expect(clientEvents).toContainEqual(expect.objectContaining({
      event: 'operator_input_late_acknowledged',
      request_id: 'request-timeout',
      recovery_state: 'timed_out',
      acknowledged_event: 'input_event_queued',
    }));
    expect(storageValues.has('pending-input-test')).toBe(false);
    client.close();
  });

  it('surfaces a correlated local NARS websocket rejection before the acknowledgment timeout', () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ id: number; delay: number; handler: () => void; cleared: boolean }> = [];
    const storageValues = new Map<string, string>();
    let nextTimerId = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const clientEvents: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/events',
      sessionId: 'session-websocket-error',
      pendingInputStorageKey: 'websocket-error-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      operatorInputAckTimeoutMs: 5000,
      WebSocketCtor,
      timers: {
        setTimeout(handler: TimerHandler, delay?: number) {
          const timer = { id: ++nextTimerId, delay: delay ?? 0, handler: handler as () => void, cleared: false };
          timers.push(timer);
          return timer.id;
        },
        clearTimeout(id: number) {
          const timer = timers.find((candidate) => candidate.id === id);
          if (timer) timer.cleared = true;
        },
      },
      onEvent: (event) => clientEvents.push(event),
    });

    sockets[0].open();
    expect(client.sendFrame({
      id: 'request-websocket-error',
      method: 'session.submit',
      params: { message: 'reject me', source: 'agent-web-ui' },
    })).toBe(true);

    sockets[0].emit('message', { data: JSON.stringify({
      schema: 'narada.nars.websocket.error.v1',
      event: 'websocket_error',
      request_id: 'request-websocket-error',
      code: 'unsupported_session_control',
      method: 'conversation.send',
      message: 'Unsupported session control method.',
    }) });

    expect(clientEvents).toContainEqual(expect.objectContaining({
      event: 'web_ui_input_transport_failed',
      request_id: 'request-websocket-error',
      reason_code: 'nars_websocket_error',
      websocket_code: 'unsupported_session_control',
      rejected_method: 'conversation.send',
    }));
    expect(storageValues.has('websocket-error-input-test')).toBe(false);
    expect(timers.find((timer) => timer.delay === 5000)?.cleared).toBe(true);
    expect(clientEvents.some((event) => (event as { event?: string })?.event === 'web_ui_input_ack_timeout')).toBe(false);
    client.close();
  });

  it('reconciles a wrapped completed request transition before the acknowledgment timeout', () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ id: number; delay: number; handler: () => void; cleared: boolean }> = [];
    const storageValues = new Map<string, string>();
    let nextTimerId = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const clientEvents: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/events',
      sessionId: 'session-terminal',
      pendingInputStorageKey: 'pending-terminal-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      operatorInputAckTimeoutMs: 5000,
      WebSocketCtor,
      timers: {
        setTimeout(handler: TimerHandler, delay?: number) {
          const timer = { id: ++nextTimerId, delay: delay ?? 0, handler: handler as () => void, cleared: false };
          timers.push(timer);
          return timer.id;
        },
        clearTimeout(id: number) {
          const timer = timers.find((candidate) => candidate.id === id);
          if (timer) timer.cleared = true;
        },
      },
      onEvent: (event) => clientEvents.push(event),
    });

    sockets[0].open();
    expect(client.sendFrame({
      id: 'request-terminal',
      method: 'session.submit',
      params: { message: 'complete this', source: 'agent-web-ui' },
    })).toBe(true);
    expect(storageValues.get('pending-terminal-input-test')).toContain('request-terminal');

    sockets[0].emit('message', { data: JSON.stringify({
      event: 'session_event',
      payload: {
        event: 'runtime_request_state_transition',
        request_id: 'request-terminal',
        method: 'session.submit',
        request_state: 'completed',
        terminal_state: 'completed',
        session_id: 'session-terminal',
      },
    }) });

    expect(clientEvents).toContainEqual(expect.objectContaining({
      event: 'session_event',
      payload: expect.objectContaining({ event: 'runtime_request_state_transition' }),
    }));
    expect(storageValues.has('pending-terminal-input-test')).toBe(false);
    expect(timers.find((timer) => timer.delay === 5000)?.cleared).toBe(true);
    expect(clientEvents.some((event) => (event as { event?: string })?.event === 'web_ui_input_ack_timeout')).toBe(false);
    client.close();
  });

  it('supports explicit review, retry, and discard transitions without automatic resend', () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ id: number; delay: number; handler: () => void; cleared: boolean }> = [];
    const storageValues = new Map<string, string>();
    let nextTimerId = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const events: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/events',
      sessionId: 'session-recovery',
      pendingInputStorageKey: 'recovery-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      operatorInputAckTimeoutMs: 5000,
      WebSocketCtor,
      timers: {
        setTimeout(handler: TimerHandler, delay?: number) {
          const timer = { id: ++nextTimerId, delay: delay ?? 0, handler: handler as () => void, cleared: false };
          timers.push(timer);
          return timer.id;
        },
        clearTimeout(id: number) {
          const timer = timers.find((candidate) => candidate.id === id);
          if (timer) timer.cleared = true;
        },
      },
      onEvent: (event) => events.push(event),
    });

    sockets[0].open();
    expect(client.sendFrame({ id: 'request-review', method: 'session.submit', params: { message: 'review me' } })).toBe(true);
    expect(client.reviewPendingOperatorInput('request-review')).toBe(true);
    expect(JSON.parse(storageValues.get('recovery-input-test') ?? '[]')).toEqual([
      expect.objectContaining({ request_id: 'request-review', phase: 'reviewing' }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({ event: 'operator_input_reviewed', request_id: 'request-review' }));
    expect(client.markPendingOperatorInputRetried('request-review', 'request-retry')).toBe(true);
    expect(JSON.parse(storageValues.get('recovery-input-test') ?? '[]')).toEqual([
      expect.objectContaining({ request_id: 'request-review', phase: 'retried', superseded_by_request_id: 'request-retry' }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({ event: 'operator_input_retried', request_id: 'request-review', retry_request_id: 'request-retry' }));
    expect(sockets[0].sentFrames.filter((frame) => JSON.parse(frame).id === 'request-review')).toHaveLength(1);

    expect(client.sendFrame({ id: 'request-discard', method: 'session.submit', params: { message: 'discard me' } })).toBe(true);
    expect(client.reviewPendingOperatorInput('request-discard')).toBe(true);
    expect(client.discardPendingOperatorInput('request-discard')).toBe(true);
    expect(JSON.parse(storageValues.get('recovery-input-test') ?? '[]')).toEqual([
      expect.objectContaining({ request_id: 'request-review', phase: 'retried' }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({ event: 'operator_input_discarded', request_id: 'request-discard' }));
    client.close();
  });

  it('restores pending operator input metadata from tab storage for explicit review after reload', () => {
    const recentCreatedAt = new Date(Date.now() - 60_000).toISOString();
    const sockets: FakeSocket[] = [];
    const storageValues = new Map([
      ['pending-input-test', JSON.stringify([{
        request_id: 'request-restored',
        method: 'session.submit',
        content: 'proceed',
        source: 'agent-web-ui',
        delivery_mode: 'default',
        active_turn_id: null,
        created_at: recentCreatedAt,
      }])],
    ]);
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const restoredEvents: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/events',
      sessionId: 'session-restored',
      pendingInputStorageKey: 'pending-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      WebSocketCtor,
      onEvent: (event) => restoredEvents.push(event),
    });

    expect(restoredEvents).toContainEqual(expect.objectContaining({
      event: 'operator_input_pending_restored',
      request_id: 'request-restored',
      content: 'proceed',
      pending_state: 'timed_out',
    }));
    expect(storageValues.has('pending-input-test')).toBe(true);
    client.close();
  });

  it('expires stale recovery records and emits an explicit expiry event', () => {
    const sockets: FakeSocket[] = [];
    const storageValues = new Map([
      ['expired-input-test', JSON.stringify([{
        request_id: 'request-expired',
        method: 'session.submit',
        content: 'old input',
        updated_at: '2000-01-01T00:00:00.000Z',
        created_at: '2000-01-01T00:00:00.000Z',
        phase: 'timed_out',
      }])],
    ]);
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const events: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/events',
      sessionId: 'session-expiry',
      pendingInputStorageKey: 'expired-input-test',
      pendingInputRetentionMs: 1000,
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      WebSocketCtor,
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual(expect.objectContaining({
      event: 'operator_input_pending_expired',
      request_id: 'request-expired',
      reason_code: 'pending_input_retention_elapsed',
    }));
    expect(storageValues.has('expired-input-test')).toBe(false);
    client.close();
  });

  it('applies the same acknowledgment watchdog to Cloudflare input POST transport', async () => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ id: number; delay: number; handler: () => void; cleared: boolean }> = [];
    const storageValues = new Map<string, string>();
    let nextTimerId = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() { return { events: [], has_more: false }; },
    }));
    const events: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'https://projection.example/events',
      inputEndpoint: 'https://projection.example/input',
      pendingInputStorageKey: 'cloudflare-pending-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      operatorInputAckTimeoutMs: 7000,
      WebSocketCtor,
      fetchFn: fetchFn as unknown as typeof fetch,
      timers: {
        setTimeout(handler: TimerHandler, delay?: number) {
          const timer = { id: ++nextTimerId, delay: delay ?? 0, handler: handler as () => void, cleared: false };
          timers.push(timer);
          return timer.id;
        },
        clearTimeout(id: number) {
          const timer = timers.find((candidate) => candidate.id === id);
          if (timer) timer.cleared = true;
        },
      },
      onEvent: (event) => events.push(event),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    expect(client.sendFrame({
      id: 'cloudflare-request-timeout',
      method: 'session.submit',
      params: { message: 'proceed', source: 'agent-web-ui' },
    })).toBe(true);
    await Promise.resolve();
    expect(fetchFn).toHaveBeenCalledWith('https://projection.example/input', expect.objectContaining({ method: 'POST' }));
    expect(storageValues.get('cloudflare-pending-input-test')).toContain('cloudflare-request-timeout');

    timers.find((timer) => timer.delay === 7000)?.handler();
    expect(events).toContainEqual(expect.objectContaining({
      event: 'web_ui_input_ack_timeout',
      request_id: 'cloudflare-request-timeout',
    }));
    expect(fetchFn.mock.calls.filter(([url]) => String(url) === 'https://projection.example/input')).toHaveLength(1);
    client.close();
  });

  it('preserves Cloudflare replay evidence and remote admission semantics', async () => {
    const sockets: FakeSocket[] = [];
    const storageValues = new Map<string, string>();
    let inputResponseCount = 0;
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const events: unknown[] = [];
    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url) === 'https://projection.example/input') {
        inputResponseCount += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return inputResponseCount === 1
              ? {
                status: 'admitted',
                method: 'conversation.send',
                nars_admission: {
                  status: 'admitted',
                  request_id: 'remote-admitted-1',
                  input_event_id: 'input-cloudflare-1',
                  evidence: { event: 'input_event_queued', request_id: 'remote-admitted-1', input_id: 'carrier-input-1' },
                },
              }
              : { status: 'refused', method: 'conversation.send', request_id: 'remote-refused-1', message: 'authority refused input' };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            events: [{ event_sequence: 1, payload: { event: 'session_started' } }],
            event_count: 1,
            has_more: false,
            truncated: true,
            cursor: { last_sequence: 1, next_sequence: 2 },
          };
        },
      };
    });
    const client = createNarsClient({
      endpoint: 'https://projection.example/events',
      inputEndpoint: 'https://projection.example/input',
      pendingInputStorageKey: 'cloudflare-admission-semantics-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      WebSocketCtor,
      fetchFn: fetchFn as unknown as typeof fetch,
      onEvent: (event) => events.push(event),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sockets).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({
      event: 'session_events_subscription_started',
      transport: 'cloudflare-projection',
    }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'session_events_read',
      method: 'session.events.read',
      history_truncated: true,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'session_events_replay_completed',
      replay_count: 1,
      history_truncated: true,
    }));

    sockets[0].open();
    expect(client.sendFrame({ id: 'cloudflare-admitted', method: 'session.submit', params: { message: 'admit me' } })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'projection_input_response',
      request_id: 'cloudflare-admitted',
      authority_request_id: 'remote-admitted-1',
      input_event_id: 'input-cloudflare-1',
      input_id: 'carrier-input-1',
      status: 'admitted',
      method: 'conversation.send',
      transport_method: 'session.submit',
      remote_method: 'conversation.send',
      http_ok: true,
    }));

    sockets[0].emit('message', { data: JSON.stringify({
      event: 'input_event_queued',
      request_id: 'remote-admitted-1',
      event_id: 'input-cloudflare-1',
      method: 'conversation.send',
    }) });
    expect(storageValues.has('cloudflare-admission-semantics-test')).toBe(false);
    expect(events).not.toContainEqual(expect.objectContaining({
      event: 'web_ui_input_ack_timeout',
      request_id: 'cloudflare-admitted',
    }));

    expect(client.sendFrame({ id: 'cloudflare-refused', method: 'session.submit', params: { message: 'refuse me' } })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'projection_input_response',
      request_id: 'cloudflare-refused',
      status: 'refused',
      method: 'conversation.send',
      http_ok: true,
    }));
    client.close();
  });

  it('correlates a Cloudflare relay failure to the pending input and clears recovery state', async () => {
    const sockets: FakeSocket[] = [];
    const storageValues = new Map<string, string>();
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url) === 'https://projection.example/input') {
        return {
          ok: false,
          status: 503,
          async json() { return { message: 'relay unavailable' }; },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() { return { events: [], has_more: false }; },
      };
    });
    const events: unknown[] = [];
    const client = createNarsClient({
      endpoint: 'https://projection.example/events',
      inputEndpoint: 'https://projection.example/input',
      pendingInputStorageKey: 'cloudflare-failed-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      WebSocketCtor,
      fetchFn: fetchFn as unknown as typeof fetch,
      onEvent: (event) => events.push(event),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    sockets[0].open();
    expect(client.sendFrame({
      id: 'cloudflare-request-failed',
      method: 'session.submit',
      params: { message: 'relay me' },
    })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(events).toContainEqual(expect.objectContaining({
      event: 'projection_input_response',
      request_id: 'cloudflare-request-failed',
      http_status: 503,
      status: 'failed',
    }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'web_ui_input_transport_failed',
      request_id: 'cloudflare-request-failed',
      reason_code: 'projection_input_failed',
      message: 'relay unavailable',
    }));
    expect(storageValues.has('cloudflare-failed-input-test')).toBe(false);
    client.close();
  });

  it('binds submit and pending recovery evidence to the endpoint, session, and socket generation', () => {
    const sockets: FakeSocket[] = [];
    const storageValues = new Map<string, string>();
    const events: unknown[] = [];
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/correlation-events',
      sessionId: 'session-correlated',
      pendingInputStorageKey: 'correlation-input-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      WebSocketCtor,
      onEvent: (event) => events.push(event),
    });

    sockets[0].open();
    const submitted = submitOperatorInput('run startup sequence', client);
    expect(submitted.localEvent).toMatchObject({
      event: 'operator_input_submitted',
      request_id: submitted.requestId,
      transport: 'local-websocket',
      endpoint: 'ws://127.0.0.1/correlation-events',
      session_id: 'session-correlated',
      socket_generation: 1,
    });
    expect(JSON.parse(storageValues.get('correlation-input-test') ?? '[]')).toEqual([
      expect.objectContaining({
        request_id: submitted.requestId,
        transport: 'local-websocket',
        endpoint: 'ws://127.0.0.1/correlation-events',
        session_id: 'session-correlated',
        socket_generation: 1,
      }),
    ]);

    sockets[0].emit('message', { data: JSON.stringify({
      event: 'input_event_queued',
      request_id: submitted.requestId,
      event_id: 'wrong-session-event',
      session_id: 'session-other',
    }) });
    expect(events).toContainEqual(expect.objectContaining({
      event: 'web_ui_session_correlation_mismatch',
      expected_session_id: 'session-correlated',
      observed_session_id: 'session-other',
      socket_generation: 1,
    }));
    expect(storageValues.get('correlation-input-test')).toContain(submitted.requestId);
    client.close();
  });

  it('clears a pending input when NARS omits request_id but supplies input_event_id', () => {
    const sockets: FakeSocket[] = [];
    const storageValues = new Map<string, string>();
    const events: unknown[] = [];
    const WebSocketCtor = class extends FakeSocket {
      static OPEN = 1;
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const client = createNarsClient({
      endpoint: 'ws://127.0.0.1/missing-request-id-events',
      sessionId: 'session-missing-request-id',
      pendingInputStorageKey: 'missing-request-id-test',
      pendingInputStorage: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => { storageValues.set(key, value); },
        removeItem: (key) => { storageValues.delete(key); },
      },
      WebSocketCtor,
      onEvent: (event) => events.push(event),
    });

    sockets[0].open();
    const submitted = submitOperatorInput('correlate by input event id', client);
    expect(storageValues.get('missing-request-id-test')).toContain(submitted.requestId);
    sockets[0].emit('message', { data: JSON.stringify({
      event: 'input_event_queued',
      input_event_id: 'input-event-only-1',
      method: 'session.submit',
      session_id: 'session-missing-request-id',
    }) });

    expect(events).toContainEqual(expect.objectContaining({
      event: 'input_event_queued',
      input_event_id: 'input-event-only-1',
    }));
    expect(storageValues.has('missing-request-id-test')).toBe(false);
    client.close();
  });
});

class FakeSocket {
  readyState = 0;
  readonly url: string;
  private listeners = new Map<string, Array<(event?: { data: string }) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(name: string, listener: (event?: { data: string }) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  open() {
    this.readyState = 1;
    this.emit('open');
  }

  emit(name: string, event: { data: string } = { data: '' }) {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  sentFrames: string[] = [];

  send(payload: string) {
    this.sentFrames.push(payload);
  }
}
