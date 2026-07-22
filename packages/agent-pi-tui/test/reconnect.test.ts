import { describe, expect, it } from 'vitest';
import { NarsAttachClient } from '../src/nars-client/attach-client.js';
import type { WebSocketLike } from '../src/types.js';

class FakeSocket implements WebSocketLike {
  static sockets: FakeSocket[] = [];
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();
  throwOnSend = false;

  constructor(_endpoint: string) {
    FakeSocket.sockets.push(this);
  }

  addEventListener(event: string, listener: (value: unknown) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event: string, listener: (value: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  send(data: string): void {
    if (this.throwOnSend) throw new Error('write failed');
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    for (const listener of this.listeners.get('close') ?? []) listener({});
  }

  open(): void {
    this.readyState = 1;
    for (const listener of this.listeners.get('open') ?? []) listener({});
  }

  message(value: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data: JSON.stringify(value) });
  }
}

describe('agent-pi-tui NARS attachment', () => {
  it('replays, deduplicates overlap, and detaches without closing NARS', async () => {
    FakeSocket.sockets = [];
    const client = new NarsAttachClient({ endpoint: 'ws://127.0.0.1/events', WebSocketImpl: FakeSocket, reconnect: false });
    const events: string[] = [];
    client.onEvent(({ event }) => events.push(String(event.event)));
    const connected = client.connect();
    await Promise.resolve();
    const socket = FakeSocket.sockets[0]!;
    socket.open();
    await connected;
    expect(JSON.parse(socket.sent[0]!).method).toBe('session.events.subscribe');
    socket.message({ event: 'session_started', event_id: 'one', event_sequence: 1 });
    socket.message({ event: 'session_events_replay_completed', event_id: 'replay', event_sequence: 2 });
    socket.message({ event: 'session_started', event_id: 'one', event_sequence: 1 });
    expect(client.getState().phase).toBe('live');
    expect(events).toEqual(['session_started', 'session_events_replay_completed']);
    await client.disconnect();
    expect(socket.sent.some((frame) => JSON.parse(frame).method === 'session.close')).toBe(false);
  });

  it('does not automatically resend an ambiguously written submission', async () => {
    FakeSocket.sockets = [];
    const client = new NarsAttachClient({ endpoint: 'ws://127.0.0.1/events', WebSocketImpl: FakeSocket, reconnect: false });
    const connected = client.connect();
    await Promise.resolve();
    const socket = FakeSocket.sockets[0]!;
    socket.open();
    await connected;
    socket.message({ event: 'session_events_replay_completed', event_id: 'replay', event_sequence: 1 });
    socket.throwOnSend = true;
    const result = await client.submit('do not resend');
    expect(result.transport).toBe('ambiguous');
    expect(result.retryAllowed).toBe(false);
    expect(client.getPendingInputs()[0]?.phase).toBe('ambiguous_transport');
  });

  it('keeps connection-local websocket errors out of the durable projection', async () => {
    FakeSocket.sockets = [];
    const client = new NarsAttachClient({ endpoint: 'ws://127.0.0.1/events', WebSocketImpl: FakeSocket, reconnect: false });
    const projected: string[] = [];
    const transportErrors: string[] = [];
    client.onEvent(({ event }) => projected.push(String(event.event)));
    client.onTransportError(({ error }) => transportErrors.push(error.message));
    const connected = client.connect();
    await Promise.resolve();
    const socket = FakeSocket.sockets[0]!;
    socket.open();
    await connected;
    socket.message({ event: 'session_events_replay_completed', event_id: 'replay', event_sequence: 1 });
    socket.message({ event: 'websocket_error', code: 'invalid_request', message: 'not admitted', request_id: 'req-1' });
    expect(projected).not.toContain('websocket_error');
    expect(transportErrors).toEqual(['not admitted']);
    await client.disconnect();
  });
});
