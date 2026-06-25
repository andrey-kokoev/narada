import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildConversationSendFrame,
  buildOperatorInputAction,
  buildSubscribeFrame,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
  resolveAttachConfig,
  startAgentWebUi,
  summarizeRuntimeEvent,
} from '../src/agent-web-ui.js';
import {
  buildClientConfig,
  parseAgentWebUiArgs,
  startAgentWebUiServer,
} from '../bin/narada-agent-web-ui.mjs';
import {
  createEventHub,
  startEventStreamProjection,
  startHealthProjection,
} from '@narada2/agent-runtime-server/test-fixtures';

async function connectWebSocket(url) {
  assert.equal(typeof WebSocket, 'function');
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener('message', (message) => {
    const parsed = JSON.parse(String(message.data));
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  await once(socket, 'open');
  return {
    sendJson(payload) { socket.send(JSON.stringify(payload)); },
    async nextJson() {
      if (queue.length) return queue.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() { socket.close(); },
  };
}

function readInjectedBrowserConfig(html) {
  const match = html.match(/<script type="application\/json" id="nars-config">([^<]+)<\/script>/);
  assert.ok(match, 'expected injected NARS config script');
  return JSON.parse(match[1]);
}

test('agent-web-ui emits admitted NARS methods for event attach and operator input', () => {
  const subscribe = buildSubscribeFrame({ id: 'sub-1', maxReplay: 25, includeReplay: true });
  assert.equal(subscribe.method, 'session.events.subscribe');
  assert.deepEqual(subscribe.params, { include_replay: true, max_replay: 25 });
  assert.equal(isAgentWebUiProtocolFrame(subscribe), true);

  const input = buildConversationSendFrame('run startup sequence', { id: 'input-1' });
  assert.deepEqual(input, {
    id: 'input-1',
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(isAgentWebUiProtocolFrame(input), true);
  assert.equal(buildConversationSendFrame('   '), null);

  assert.equal(buildOperatorInputAction('/status', { id: 'status-1' }).frame.method, 'session.status');
  assert.equal(buildOperatorInputAction('/health', { id: 'health-1' }).frame.method, 'session.health');
  assert.equal(buildOperatorInputAction('/events', { id: 'events-1' }).frame.method, 'session.events.subscribe');
  assert.equal(buildOperatorInputAction('/recovery', { id: 'recovery-1' }).frame.method, 'session.recovery');
  assert.equal(buildOperatorInputAction('/ops', { id: 'ops-1' }).frame.method, 'session.operations');
  assert.equal(buildOperatorInputAction('/interrupt', { id: 'interrupt-1' }).frame.method, 'conversation.interrupt');
  assert.equal(buildOperatorInputAction('/tools mcp', { id: 'tools-1' }).frame.method, 'carrier.command.execute');
  assert.deepEqual(buildOperatorInputAction('/observer mute', { id: 'mute-1' }).frame, { id: 'mute-1', method: 'observer.mute', params: {} });
  assert.equal(buildOperatorInputAction('/clear').kind, 'local_clear');
  assert.equal(buildOperatorInputAction('/help').kind, 'local_help');

  for (const method of ['command.execute', 'session.sync']) {
    assert.equal(isAgentWebUiNarsMethod(method), false, method);
    assert.equal(isAgentWebUiProtocolFrame({ id: 'blocked', method, params: {} }), false, method);
  }
});

test('browser startup subscribes to events and submits operator text over the same WebSocket', async () => {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
      this.children = [];
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
    }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
  }
  const elements = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'events', 'operator-form', 'operator-input']) {
    elements.set(id, new FakeElement(id));
  }
  elements.get('nars-config').textContent = JSON.stringify({ eventEndpoint: 'ws://127.0.0.1/events', healthEndpoint: '/api/health', maxReplay: 4 });
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement() { return new FakeElement(); },
  };
  class FakeWebSocket {
    static OPEN = 1;
    static instances = [];
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.OPEN;
      this.sent = [];
      this.listeners = new Map();
      FakeWebSocket.instances.push(this);
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    send(frame) { this.sent.push(JSON.parse(frame)); }
    emit(name, event = {}) { this.listeners.get(name)?.(event); }
  }
  const reconnectTimers = [];
  const windowRef = {
    location: { search: '' },
    WebSocket: FakeWebSocket,
    setInterval() { return 'timer-1'; },
    setTimeout(fn, delay) {
      reconnectTimers.push({ fn, delay });
      return `reconnect-${reconnectTimers.length}`;
    },
    fetch: async () => ({ status: 200, json: async () => ({ status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }) }),
  };

  const started = startAgentWebUi({ windowRef, documentRef });
  const socket = FakeWebSocket.instances[0];
  assert.equal(started.socket, socket);
  assert.equal(socket.url, 'ws://127.0.0.1/events');
  socket.emit('open');
  assert.deepEqual(socket.sent[0], { id: 'agent-web-ui-events-subscribe', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 4 } });

  elements.get('operator-input').value = 'run startup sequence';
  elements.get('operator-form').submit();
  assert.equal(elements.get('operator-input').value, '');
  assert.deepEqual(socket.sent[1], {
    id: socket.sent[1].id,
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(elements.get('events').children.at(-1).children.at(1).textContent, 'run startup sequence');

  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 42 }, payload: { event: 'assistant_message', content: 'ack', event_sequence: 42 } }) });
  socket.emit('close');
  assert.equal(elements.get('stream').textContent, 'reconnecting');
  assert.equal(reconnectTimers[0].delay, 1000);
  reconnectTimers[0].fn();
  const reconnectedSocket = FakeWebSocket.instances[1];
  reconnectedSocket.emit('open');
  assert.deepEqual(reconnectedSocket.sent[0], {
    id: 'agent-web-ui-events-subscribe',
    method: 'session.events.subscribe',
    params: { include_replay: true, max_replay: 4, since_sequence: 42 },
  });

  elements.get('operator-input').value = '/status';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[1].method, 'session.status');

  elements.get('operator-input').value = '/exit';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[2].method, 'session.close');
  assert.equal(started.connection.closed, true);
});

test('attach config resolves one event endpoint and one health endpoint from query or injected config', () => {
  assert.deepEqual(resolveAttachConfig('?event_endpoint=ws://nars/events&health_endpoint=http://nars/health&max_replay=7'), {
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    maxReplay: 7,
  });
  assert.deepEqual(resolveAttachConfig('', { eventEndpoint: 'ws://injected/events', healthEndpoint: '/api/health' }), {
    eventEndpoint: 'ws://injected/events',
    healthEndpoint: '/api/health',
    maxReplay: 100,
  });
});

test('runtime event summaries unwrap NARS session_event envelopes', () => {
  assert.equal(summarizeRuntimeEvent({ event: 'session_events_subscription_started', replay_count: 3 }), '3 replayed event(s)');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), 'hello');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'tool_call', tool_name: 'narada-site.whoami' } }), 'narada-site.whoami');
});

test('static HTML exposes operator input composer without hidden privileged controls', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.match(html, /<form[^>]+id="operator-form"/i);
  assert.match(html, /<textarea[^>]+id="operator-input"/i);
  assert.match(html, /<button[^>]+type="submit"/i);
  assert.doesNotMatch(html, /command\.execute|conversation\.interrupt/i);
});

test('package server injects operator-capable config and proxies health with GET only', async () => {
  const upstream = createServer((request, response) => {
    assert.equal(request.method, 'GET');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ schema: 'narada.nars.health.v1', status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }));
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => {
      upstream.off('error', reject);
      resolve();
    });
  });
  const upstreamAddress = upstream.address();
  const healthEndpoint = `http://127.0.0.1:${upstreamAddress.port}/health`;
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: 'ws://127.0.0.1:1234/events', healthEndpoint });
  try {
    const index = await fetch(web.url).then((response) => response.text());
    assert.match(index, /"eventEndpoint":"ws:\/\/127\.0\.0\.1:1234\/events"/);
    assert.match(index, /"healthEndpoint":"\/api\/health"/);
    assert.match(index, /"operatorInput":true/);
    assert.match(index, /"conversation.send"/);
    assert.match(index, /"carrier.command.execute"/);

    const health = await fetch(new URL('/api/health', web.url)).then((response) => response.json());
    assert.equal(health.status, 'healthy');
    assert.equal(health.session_id, 'carrier_test');
  } finally {
    web.server.close();
    upstream.close();
  }
});

test('served web UI config attaches to live NARS health and event projections', async () => {
  const childStdin = new PassThrough();
  childStdin.setEncoding('utf8');
  const childFrames = [];
  let stdinBuffer = '';
  let healthProjection = null;
  const waiters = [];
  const notifyWaiters = () => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.predicate()) {
        waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  };
  const waitForFrame = (predicate) => {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve) => waiters.push({ predicate, resolve }));
  };
  childStdin.on('data', (chunk) => {
    stdinBuffer += chunk;
    const lines = stdinBuffer.split(/\r?\n/);
    stdinBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = JSON.parse(line);
      childFrames.push(frame);
      if (frame.method === 'session.health') {
        healthProjection?.observe({
          event: 'session_health',
          request_id: frame.id,
          status: 'healthy',
          agent_id: 'narada.test',
          session_id: 'carrier_test',
        });
      }
    }
    notifyWaiters();
  });

  const eventHub = createEventHub();
  eventHub.publish({ event: 'session_started', agent_id: 'narada.test', session_id: 'carrier_test' });
  const eventProjection = await startEventStreamProjection({ childStdin, eventHub, host: '127.0.0.1', port: 0 });
  healthProjection = await startHealthProjection({ childStdin, host: '127.0.0.1', port: 0 });
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: eventProjection.url, healthEndpoint: healthProjection.url });
  const client = await connectWebSocket(eventProjection.url);
  try {
    const html = await fetch(web.url).then((response) => response.text());
    const config = readInjectedBrowserConfig(html);
    assert.equal(config.eventEndpoint, eventProjection.url);
    assert.equal(config.healthEndpoint, '/api/health');
    assert.equal(config.operatorInput, true);
    assert.equal(config.admittedMethods.includes('conversation.send'), true);
    assert.equal(config.admittedMethods.includes('conversation.interrupt'), true);

    const health = await fetch(new URL('/api/health', web.url)).then((response) => response.json());
    assert.equal(health.status, 'healthy');
    assert.equal(health.session_id, 'carrier_test');
    assert.equal(childFrames.some((frame) => frame.method === 'session.health'), true);

    assert.equal((await client.nextJson()).event, 'websocket_connected');
    client.sendJson({ id: 'events-1', method: 'session.events.subscribe', params: { include_replay: true, max_replay: 10 } });
    const subscribed = await client.nextJson();
    assert.equal(subscribed.event, 'session_events_subscription_started');
    assert.equal(subscribed.replay_count, 1);
    const replay = await client.nextJson();
    assert.equal(replay.event, 'session_event');
    assert.equal(replay.payload.event, 'session_started');

    client.sendJson({ id: 'input-1', method: 'conversation.send', params: { message: 'run startup sequence', source: 'agent-web-ui' } });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'input-1'));
    assert.deepEqual(childFrames.find((frame) => frame.id === 'input-1'), {
      id: 'input-1',
      method: 'conversation.send',
      params: { message: 'run startup sequence', source: 'agent-web-ui' },
    });

    client.sendJson({ id: 'interrupt-1', method: 'conversation.interrupt', params: {} });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'interrupt-1'));
    assert.equal(childFrames.find((frame) => frame.id === 'interrupt-1').method, 'conversation.interrupt');

    for (const [id, method, params] of [
      ['status-1', 'session.status', {}],
      ['recovery-1', 'session.recovery', {}],
      ['ops-1', 'session.operations', {}],
      ['tools-1', 'carrier.command.execute', { command: '/tools', value: 'mcp' }],
      ['close-1', 'session.close', {}],
    ]) {
      client.sendJson({ id, method, params });
      await waitForFrame(() => childFrames.some((frame) => frame.id === id));
      assert.deepEqual(childFrames.find((frame) => frame.id === id), { id, method, params });
    }
  } finally {
    client.close();
    web.server.close();
    eventProjection.server.close();
    healthProjection.server.close();
  }
});

test('CLI args and client config keep runtime authority outside the web package', () => {
  const options = parseAgentWebUiArgs(['--event-endpoint', 'ws://nars/events', '--health-endpoint', 'http://nars/health', '--port', '4888']);
  assert.deepEqual(options, {
    host: '127.0.0.1',
    port: 4888,
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
  });
  assert.deepEqual(buildClientConfig(options), {
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: '/api/health',
    maxReplay: 100,
    operatorInput: true,
    admittedMethods: ['session.events.subscribe', 'conversation.send', 'session.status', 'session.health', 'session.recovery', 'session.operations', 'observers.status', 'observer.mute', 'observer.unmute', 'carrier.command.execute', 'conversation.interrupt', 'session.close'],
  });
});
