import { PassThrough } from 'node:stream';
import { createEventHub, startEventStreamProjection } from '@narada2/agent-runtime-server';
import { describe, expect, it } from 'vitest';
import { NarsAttachClient } from '../src/nars-client/attach-client.js';

interface LiveFixture {
  input: PassThrough;
  projection: Awaited<ReturnType<typeof startEventStreamProjection>>;
  hub: ReturnType<typeof createEventHub>;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('live_attach_fixture_timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startFixture(): Promise<LiveFixture> {
  const input = new PassThrough();
  const hub = createEventHub();
  const projection = await startEventStreamProjection({
    childStdin: input,
    eventHub: hub,
    host: '127.0.0.1',
    port: 0,
  });
  return { input, projection, hub };
}

async function stopFixture(fixture: LiveFixture, clients: readonly NarsAttachClient[]): Promise<void> {
  await Promise.all(clients.map((client) => client.disconnect()));
  fixture.projection.closeConnections();
  await new Promise<void>((resolve, reject) => {
    if (!fixture.projection.server.listening) {
      resolve();
      return;
    }
    fixture.projection.server.close((error) => error ? reject(error) : resolve());
  });
  fixture.input.destroy();
}

describe('agent-pi-tui live NARS attachment', () => {
  it('attaches four projection clients, replays, delivers, and detaches locally', async () => {
    const fixture = await startFixture();
    const clients = Array.from({ length: 4 }, () => new NarsAttachClient({
      endpoint: fixture.projection.url,
      reconnect: false,
    }));
    const eventNames = clients.map(() => [] as string[]);
    clients.forEach((client, index) => client.onEvent(({ event }) => {
      if (event.event === 'session_started'
        || event.event === 'user_message'
        || event.event === 'assistant_message'
        || event.event === 'turn_complete') eventNames[index]?.push(String(event.event));
    }));
    fixture.hub.publish({ event: 'session_started', event_id: 'session-started' });
    fixture.hub.publish({ event: 'user_message', event_id: 'user-1', request_id: 'request-1', content: 'hello' });

    try {
      await Promise.all(clients.map((client) => client.connect()));
      await waitFor(() => eventNames.every((events) => events.length === 2));
      fixture.hub.publish({ event: 'assistant_message', event_id: 'assistant-1', turn_id: 'turn-1', content: 'hello back' });
      fixture.hub.publish({ event: 'turn_complete', event_id: 'turn-complete', turn_id: 'turn-1' });
      await waitFor(() => eventNames.every((events) => events.length === 4));
      expect(eventNames.every((events) => events.join('|') === eventNames[0]!.join('|'))).toBe(true);

      let inputText = '';
      fixture.input.setEncoding('utf8');
      fixture.input.on('data', (chunk) => { inputText += String(chunk); });
      const submission = await clients[0]!.submit('a durable request');
      await waitFor(() => inputText.includes('a durable request'));
      const frame = JSON.parse(inputText.trim()) as { method: string; params: Record<string, unknown> };
      expect(submission).toMatchObject({ transport: 'written', durableAdmission: 'unknown', retryAllowed: false });
      expect(frame).toMatchObject({ method: 'session.submit', params: { content: 'a durable request' } });
      expect(typeof frame.params.idempotency_key).toBe('string');

      const beforeDetach = inputText;
      await clients[0]!.disconnect();
      expect(inputText).toBe(beforeDetach);
      expect(inputText).not.toContain('session.close');
    } finally {
      await stopFixture(fixture, clients);
    }
  });

  it('reconnects from the durable cursor without replaying an event twice', async () => {
    const fixture = await startFixture();
    const client = new NarsAttachClient({
      endpoint: fixture.projection.url,
      reconnect: true,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 50,
      maxReconnectAttempts: 3,
    });
    const events: string[] = [];
    client.onEvent(({ event }) => {
      if (event.event === 'user_message') events.push(String(event.event_id));
    });
    fixture.hub.publish({ event: 'user_message', event_id: 'before-reconnect', content: 'before' });
    try {
      await client.connect();
      await waitFor(() => events.length === 1);
      fixture.projection.closeConnections();
      await waitFor(() => client.getState().phase === 'reconnect_wait');
      fixture.hub.publish({ event: 'user_message', event_id: 'during-reconnect', content: 'during' });
      await waitFor(() => client.getState().phase === 'live' && events.includes('during-reconnect'));
      fixture.hub.publish({ event: 'user_message', event_id: 'during-reconnect', content: 'duplicate' });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(events).toEqual(['before-reconnect', 'during-reconnect']);
    } finally {
      await stopFixture(fixture, [client]);
    }
  });
});
