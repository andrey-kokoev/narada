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
} from '../src/app/lib/browserPreferences.js';
import { createNarsClient } from '../src/protocol/narsClient';
import { useRuntimeTopology } from '../src/app/composables/useRuntimeTopology';
import { buildIntelligenceReconfigureFrame } from '../src/app/lib/narsFrames';
import type { SessionProtocolFrame, SessionTransport } from '../src/protocol/sessionTransport';

describe('agent-web-ui runtime boundaries', () => {
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

  send() {}
}
