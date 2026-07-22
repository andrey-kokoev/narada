import { describe, expect, it } from 'vitest';
import { PiTuiApp } from '../src/app.js';
import { loadPiTuiSubstrate } from '../src/pi-tui-substrate.js';
import type { AttachState, NarsEvent } from '../src/types.js';
import type { NarsAttachClient } from '../src/nars-client/attach-client.js';

const initialState: AttachState = {
  phase: 'live',
  endpoint: 'ws://127.0.0.1/events',
  transportReady: true,
  reconnectAttempt: 0,
  lastEventSequence: 0,
  replayAttempt: 1,
  subscriptionId: 'pty-fixture',
  lastTransportError: null,
};

class FixtureClient {
  private readonly eventListeners = new Set<(detail: { event: NarsEvent }) => void>();
  private readonly stateListeners = new Set<(state: AttachState) => void>();
  private state = initialState;

  onEvent(listener: (detail: { event: NarsEvent }) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onState(listener: (state: AttachState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  onTransportError(_listener: (detail: { error: Error }) => void): () => void {
    return () => undefined;
  }

  getState(): AttachState {
    return { ...this.state };
  }

  getPendingInputs(): [] {
    return [];
  }

  async connect(): Promise<void> {
    return undefined;
  }

  async disconnect(): Promise<void> {
    this.state = { ...this.state, phase: 'closed', transportReady: false };
    for (const listener of this.stateListeners) listener(this.state);
  }

  async sendFrame(): Promise<{ transport: 'written'; durableAdmission: 'unknown'; retryAllowed: false }> {
    return { transport: 'written', durableAdmission: 'unknown', retryAllowed: false };
  }

  emit(event: NarsEvent): void {
    this.state = {
      ...this.state,
      lastEventSequence: Number(event.event_sequence ?? this.state.lastEventSequence),
    };
    for (const listener of this.eventListeners) listener({ event });
  }
}

function appFixture(): { app: PiTuiApp; client: FixtureClient } {
  const client = new FixtureClient();
  const app = new PiTuiApp({
    client: client as unknown as NarsAttachClient,
    projection: undefined,
  });
  return { app, client };
}

describe('agent-pi-tui terminal acceptance', () => {
  it('renders an initial frame, preserves composer input, and keeps streamed rows stable', () => {
    const { app, client } = appFixture();
    app.setViewportRows(10);
    const initial = app.renderLines(80);
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.some((line) => line.includes('>'))).toBe(true);

    app.handleInput('\u001b[200~hello NARS\u001b[201~');
    expect(app.state.snapshot().composerDraft).toBe('hello NARS');
    client.emit({ event: 'assistant_message_stream', event_id: 'stream-1', event_sequence: 1, request_id: 'turn-1', content: 'hello' });
    client.emit({ event: 'assistant_message_stream', event_id: 'stream-2', event_sequence: 2, request_id: 'turn-1', content: 'hello world' });
    const rendered = app.renderLines(80);
    expect(rendered.join('\n')).toContain('hello world');
    expect(app.transcript.allRows()).toHaveLength(1);
    expect(app.state.snapshot().composerDraft).toBe('hello NARS');
    app.dispose();
  });

  it('does not steal an operator-controlled transcript position on new events', () => {
    const { app, client } = appFixture();
    app.setViewportRows(8);
    for (let sequence = 1; sequence <= 8; sequence += 1) {
      client.emit({ event: 'user_message', event_id: `event-${sequence}`, event_sequence: sequence, content: `message ${sequence}` });
    }
    app.state.scrollBy(2, app.transcript.rows('conversation').length, 4);
    expect(app.state.snapshot().scrollMode).toBe('operator_controlled');
    const before = app.state.snapshot().scrollOffset;
    client.emit({ event: 'user_message', event_id: 'event-9', event_sequence: 9, content: 'new message' });
    app.renderLines(80);
    expect(app.state.snapshot().scrollOffset).toBe(before);
    app.dispose();
  });

  it('loads the pi-tui substrate without loading a Pi runtime', async () => {
    const substrate = await loadPiTuiSubstrate();
    expect(typeof substrate.TUI).toBe('function');
    expect(typeof substrate.ProcessTerminal).toBe('function');
    expect(typeof substrate.Editor).toBe('function');
  });
});
