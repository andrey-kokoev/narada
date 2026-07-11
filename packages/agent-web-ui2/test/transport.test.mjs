import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentWebUiConversationSendFrame, buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import { CloudflareSessionTransport } from '../src/transport/cloudflare-session-transport.ts';
import { NarsSessionTransport } from '../src/transport/session-transport.ts';

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  addEventListener(kind, listener) {
    const listeners = this.listeners.get(kind) ?? [];
    listeners.push(listener);
    this.listeners.set(kind, listeners);
  }

  send(frame) { this.sent.push(frame); }
  close() { this.emit('close', {}); }
  emit(kind, payload) { for (const listener of this.listeners.get(kind) ?? []) listener(payload); }
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('local transport subscribes on WebSocket open and forwards runtime frames', () => {
  FakeWebSocket.instances = [];
  const transport = new NarsSessionTransport({ eventEndpoint: 'ws://127.0.0.1:8765/events', WebSocketCtor: FakeWebSocket });
  const messages = [];
  transport.onMessage((message) => messages.push(message));
  transport.connect();
  const socket = FakeWebSocket.instances[0];
  socket.emit('open', {});
  assert.equal(JSON.parse(socket.sent[0]).method, 'session.events.subscribe');
  assert.equal(transport.supportsProtocolMethod('session.submit'), true);
  assert.equal(transport.supportsProtocolMethod('conversation.send'), false);
  assert.equal(transport.sendFrame({ id: 'legacy', method: 'conversation.send', params: {} }), false);
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', payload: { event: 'assistant_message', content: 'ready' } }) });
  assert.equal(messages[0].event, 'session_event');
  transport.close();
});

test('Cloudflare transport replays, upgrades, and delivers input through one interface', async () => {
  FakeWebSocket.instances = [];
  const calls = [];
  const transport = new CloudflareSessionTransport({
    eventEndpoint: 'https://projection.example/api/events',
    inputEndpoint: 'https://projection.example/api/input',
    browserToken: 'fingerprint:projection:browser',
    WebSocketCtor: FakeWebSocket,
    fetchFn: async (url, init = {}) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ events: [{ event_sequence: 7, payload: { event: 'assistant_message', content: 'replayed' } }] }) };
    },
  });
  const messages = [];
  transport.onMessage((message) => messages.push(message));
  transport.connect();
  await tick();
  await tick();
  assert.match(calls[0].url, /max_events=100/);
  assert.equal(calls[0].init.headers['x-narada-browser-token-fingerprint'], 'fingerprint:projection:browser');
  assert.equal(messages[0].event, 'session_event');
  const socket = FakeWebSocket.instances[0];
  assert.match(socket.url, /\/events\/websocket/);
  assert.match(socket.url, /browser_token=fingerprint%3Aprojection%3Abrowser/);
  socket.emit('open', {});
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', payload: { event: 'assistant_message', content: 'live' }, cursor: { sequence: 8 } }) });
  assert.equal(messages[1].payload.content, 'live');
  assert.equal(transport.supportsProtocolMethod('session.submit'), true);
  assert.equal(transport.supportsProtocolMethod('conversation.send'), true);
  assert.equal(transport.sendFrame(buildAgentWebUiConversationSendFrame('operator request')), true);
  assert.equal(transport.sendFrame(buildAgentWebUiOperatorInputAction('/interrupt', { id: 'interrupt-1' }).frame), true);
  assert.equal(transport.sendFrame(buildAgentWebUiOperatorInputAction('/exit', { id: 'exit-1' }).frame), true);
  await tick();
  const posts = calls.filter((call) => call.init.method === 'POST');
  assert.equal(posts.length, 3);
  assert.equal(posts[0].url, 'https://projection.example/api/input');
  assert.deepEqual(posts.map((call) => JSON.parse(call.init.body).method), ['conversation.send', 'conversation.interrupt', 'session.close']);
  transport.close();
});
