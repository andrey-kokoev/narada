import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  buildConversationSendFrame,
  buildConversationEnqueueFrame,
  buildConversationSteerFrame,
  buildEventsReadFrame,
  buildOperatorInputAction,
  buildSubscribeFrame,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
  resolveAttachConfig,
  reconnectDelayForAttempt,
  projectRuntimeEvent,
  shouldRenderRuntimeEvent,
  startAgentWebUi,
  summarizeRuntimeEvent,
} from '../src/agent-web-ui.js';
import {
  buildClientConfig,
  parseAgentWebUiArgs,
  startAgentWebUiServer,
} from '../src/server.js';
import { createSessionProjection } from '../src/session-projection.js';
import {
  createEventHub,
  startEventStreamProjection,
  startHealthProjection,
} from '@narada2/agent-runtime-server/test-fixtures';
import { createCloudflareNarsProjectionWorker } from '@narada2/cloudflare-nars-projection/worker';
import { registerProjectionRemotely, startLocalProjectionBridgeOnce, deliverRemoteProjectionInputsOnce } from '@narada2/cloudflare-nars-projection/node';
import { appendEvent } from '../src/render.js';

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

function createFakeAgentWebUiElements() {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
      this.tagName = String(id ?? '').toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
      this.dataset = {};
      this.className = '';
    }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
    change() { this.listeners.get('change')?.({}); }
    setAttribute(name, value) { this[name] = value; }
  }
  const byId = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'authority-status', 'authority-reattach', 'projection-verbosity', 'events', 'operator-form', 'operator-input']) {
    byId.set(id, new FakeElement(id));
  }
  const documentRef = {
    getElementById(id) { return byId.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) { return { tagName: '#TEXT', textContent: String(text ?? ''), children: [], dataset: {} }; },
  };
  return { byId, documentRef };
}

function textOfNode(node) {
  if (!node) return '';
  return `${node.textContent ?? ''}${(node.children ?? []).map(textOfNode).join('')}`;
}

function createLocalProjectionSite() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-web-ui-projection-'));
  const sessionId = 'carrier_web_ui_e2e';
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  const sessionDir = sitePaths.narsSessionDir;
  mkdirSync(sessionDir, { recursive: true });
  const eventsPath = join(sessionDir, 'events.jsonl');
  const sessionPath = join(sessionDir, 'session.jsonl');
  writeFileSync(sessionPath, '');
  writeFileSync(eventsPath, `${JSON.stringify({ event: 'assistant_message', event_sequence: 1, content: 'hello from local NARS' })}\n`);
  const recordPath = join(sessionDir, 'session-index-record.json');
  writeFileSync(recordPath, `${JSON.stringify({
    schema: 'narada.nars.session_index_record.v1',
    session_id: sessionId,
    carrier_session_id: sessionId,
    agent_id: 'resident',
    site_id: 'narada.sonar',
    site_root: siteRoot,
    events_path: eventsPath,
    session_path: sessionPath,
    health_endpoint: 'http://127.0.0.1:9/health',
  }, null, 2)}\n`);
  writeFileSync(join(sitePaths.narsSessionsRoot, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index.v1',
    site_root: siteRoot,
    sessions: [{ session_id: sessionId, carrier_session_id: sessionId, record_path: recordPath }],
  }, null, 2)}\n`);
  return siteRoot;
}

function readInjectedBrowserConfig(html) {
  const match = html.match(/<script type="application\/json" id="nars-config">([^<]+)<\/script>/);
  assert.ok(match, 'expected injected NARS config script');
  return JSON.parse(match[1]);
}

function findHeadlessBrowser() {
  return [
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((path) => existsSync(path)) ?? null;
}

async function captureHeadlessScreenshot({ browserPath, url, screenshotPath }) {
  await new Promise((resolve, reject) => {
    const child = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=900,700',
      `--screenshot=${screenshotPath}`,
      url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('headless_browser_screenshot_timeout'));
    }, 20000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`headless_browser_screenshot_failed:${code}:${stderr.slice(0, 500)}`));
    });
  });
}

test('agent-web-ui emits admitted NARS methods for event attach and operator input', () => {
  const subscribe = buildSubscribeFrame({ id: 'sub-1', maxReplay: 25, includeReplay: true });
  assert.equal(subscribe.method, 'session.events.subscribe');
  assert.deepEqual(subscribe.params, { include_replay: true, max_replay: 25 });
  assert.equal(isAgentWebUiProtocolFrame(subscribe), true);

  const readPage = buildEventsReadFrame({ id: 'read-1', beforeSequence: 50, direction: 'backward', limit: 25 });
  assert.deepEqual(readPage, { id: 'read-1', method: 'session.events.read', params: { limit: 25, before_sequence: 50, direction: 'backward' } });
  assert.equal(isAgentWebUiProtocolFrame(readPage), true);

  const input = buildConversationSendFrame('run startup sequence', { id: 'input-1' });
  assert.deepEqual(input, {
    id: 'input-1',
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(isAgentWebUiProtocolFrame(input), true);
  assert.deepEqual(buildConversationEnqueueFrame('run after this', { id: 'enqueue-1', activeTurnId: 'turn_1' }), {
    id: 'enqueue-1',
    method: 'conversation.enqueue',
    params: { message: 'run after this', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });
  assert.equal(buildConversationSendFrame('   '), null);
  assert.deepEqual(buildConversationSteerFrame('change course', { id: 'steer-1', activeTurnId: 'turn_1' }), {
    id: 'steer-1',
    method: 'conversation.steer',
    params: { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_1' },
  });
  assert.equal(isAgentWebUiProtocolFrame(buildConversationSteerFrame('change course', { id: 'steer-1' })), true);

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

test('browser startup can use Cloudflare projection replay, live WebSocket, and input endpoints', async () => {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
      this.tagName = String(id ?? '').toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
      this.dataset = {};
    }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
    change() { this.listeners.get('change')?.({}); }
  }
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
  const elements = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'authority-status', 'authority-reattach', 'projection-verbosity', 'events', 'operator-form', 'operator-input']) {
    elements.set(id, new FakeElement(id));
  }
  elements.get('nars-config').textContent = JSON.stringify({
    cloudflareProjectionId: 'proj_test',
    cloudflareApiBaseUrl: 'https://projection.example.test',
    maxReplay: 4,
  });
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) { return { tagName: '#TEXT', textContent: String(text ?? ''), children: [], dataset: {} }; },
  };
  const fetchCalls = [];
  const timers = [];
  const windowRef = {
    location: { search: '' },
    WebSocket: FakeWebSocket,
    setInterval() { return 'timer-1'; },
    setTimeout(fn) { timers.push(fn); return `timer-${timers.length}`; },
    clearTimeout() {},
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).includes('/input')) return { ok: true, status: 200, json: async () => ({ ok: true, acknowledgement: 'requires_nars_admission' }) };
      if (String(url).includes('/events')) return { ok: true, status: 200, json: async () => ({ events: [{ payload: { event: 'assistant_message', event_sequence: 1, content: 'remote hello' }, event_sequence: 1 }] }) };
      return { ok: true, status: 200, json: async () => ({ status: 'healthy' }) };
    },
  };

  const started = startAgentWebUi({ windowRef, documentRef });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(started.config.mode, 'cloudflare_projection');
  assert.equal(started.config.artifactBasePath, 'https://projection.example.test/api/nars/projections/proj_test/artifacts');
  for (let attempt = 0; attempt < 5 && FakeWebSocket.instances.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'wss://projection.example.test/api/nars/projections/proj_test/events/websocket?since_sequence=1&max_events=4');
  socket.emit('open');
  assert.equal(elements.get('stream').textContent, 'stream connected');
  assert.equal(elements.get('events').children.at(-1).dataset.eventKind, 'assistant_message');
  assert.equal(fetchCalls.find((call) => call.url.includes('/events')).url.includes('max_events=4'), true);
  assert.equal(timers.length, 0, 'Cloudflare projection WebSocket mode must not keep a competing long-poll timer');
  socket.emit('message', { data: JSON.stringify({ event: 'assistant_message', event_sequence: 2, content: 'live projection hello' }) });
  assert.equal(elements.get('events').children.some((child) => textOfNode(child).includes('live projection hello')), true);

  const inputBodies = () => fetchCalls
    .filter((call) => call.url.endsWith('/input'))
    .map((call) => JSON.parse(call.init.body));

  elements.get('operator-input').value = 'run startup sequence';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const inputCall = fetchCalls.find((call) => call.url.endsWith('/input'));
  assert.ok(inputCall);
  assert.equal(JSON.parse(inputCall.init.body).method, 'conversation.send');

  socket.emit('message', { data: JSON.stringify({ event: 'turn_started', event_sequence: 3, turn_id: 'turn_cf_projection' }) });
  elements.get('operator-input').value = 'queue after active turn';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(inputBodies().at(-1), {
    method: 'conversation.enqueue',
    payload: { message: 'queue after active turn', source: 'agent-web-ui', active_turn_id: 'turn_cf_projection' },
    request_id: inputBodies().at(-1).request_id,
  });

  elements.get('operator-input').value = '/json {"id":"steer-projection","method":"conversation.steer","params":{"message":"steer projection","source":"agent-web-ui","active_turn_id":"turn_cf_projection"}}';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(inputBodies().at(-1), {
    method: 'conversation.steer',
    payload: { message: 'steer projection', source: 'agent-web-ui', active_turn_id: 'turn_cf_projection' },
    request_id: 'steer-projection',
  });

  elements.get('operator-input').value = '/interrupt';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(inputBodies().at(-1).method, 'conversation.interrupt');

  socket.emit('message', { data: JSON.stringify({ event: 'projection_revoked', projection_id: 'proj_test', code: 'projection_revoked' }) });
  elements.get('projection-verbosity').value = 'diagnostics';
  elements.get('projection-verbosity').change();
  const revokedRow = elements.get('events').children.find((child) => child.dataset?.eventKind === 'projection_revoked');
  assert.ok(revokedRow, 'expected Cloudflare projection revocation to be visible in diagnostics');
  assert.equal(revokedRow.dataset.eventDisposition, 'diagnostic_signal');

  elements.get('operator-input').value = '/exit';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(inputBodies().at(-1).method, 'session.close');
  assert.equal(started.connection.closed, true);
});

test('browser startup can attach to Cloudflare-origin authority session over replay, live WebSocket, and HTTP input', async () => {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
      this.tagName = String(id ?? '').toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
      this.dataset = {};
      this.className = '';
    }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
    change() { this.listeners.get('change')?.({}); }
    setAttribute(name, value) { this[name] = value; }
  }
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
  const elements = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'projection-verbosity', 'events', 'operator-form', 'operator-input']) {
    elements.set(id, new FakeElement(id));
  }
  elements.get('nars-config').textContent = JSON.stringify({
    cloudflareAuthoritySessionId: 'cf_session_surface_1',
    cloudflareApiBaseUrl: 'https://projection.example.test',
    maxReplay: 3,
  });
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) { return { tagName: '#TEXT', textContent: String(text ?? ''), children: [], dataset: {} }; },
  };
  const fetchCalls = [];
  const windowRef = {
    location: { search: '' },
    WebSocket: FakeWebSocket,
    setInterval() { return 'timer-1'; },
    setTimeout() { return 'timer-2'; },
    clearTimeout() {},
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).includes('/input')) return { ok: true, status: 200, json: async () => ({ status: 'admitted', execution_kind: 'cloudflare_runtime_tool_adapter' }) };
      if (String(url).includes('/events')) return { ok: true, status: 200, json: async () => ({ status: 'ok', events: [{ payload: { event: 'assistant_message', event_sequence: 1, content: 'hello from cloudflare authority' }, event_sequence: 1 }] }) };
      return { ok: true, status: 200, json: async () => ({ status: 'healthy' }) };
    },
  };

  const started = startAgentWebUi({ windowRef, documentRef });
  assert.equal(started.config.mode, 'cloudflare_authority');
  assert.equal(started.config.eventEndpoint, 'https://projection.example.test/api/nars/authority/sessions/cf_session_surface_1/events');
  for (let attempt = 0; attempt < 5 && FakeWebSocket.instances.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(fetchCalls.some((call) => call.url.startsWith('https://projection.example.test/api/nars/authority/sessions/cf_session_surface_1/events?')), true);
  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'wss://projection.example.test/api/nars/authority/sessions/cf_session_surface_1/events/websocket?since_sequence=1&max_events=3');
  socket.emit('open');
  assert.equal(elements.get('stream').textContent, 'stream connected');
  assert.equal(elements.get('events').children.some((child) => child.dataset?.eventKind === 'assistant_message'), true);
  socket.emit('message', { data: JSON.stringify({ event: 'assistant_message', event_sequence: 2, content: 'live cloudflare authority message' }) });
  assert.equal(elements.get('events').children.some((child) => textOfNode(child).includes('live cloudflare authority message')), true);

  const inputBodies = () => fetchCalls
    .filter((call) => call.url.endsWith('/input'))
    .map((call) => JSON.parse(call.init.body));

  elements.get('operator-input').value = 'continue';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const inputCall = fetchCalls.find((call) => call.url.endsWith('/input'));
  assert.ok(inputCall);
  assert.equal(inputCall.url, 'https://projection.example.test/api/nars/authority/sessions/cf_session_surface_1/input');
  const inputBody = JSON.parse(inputCall.init.body);
  assert.equal(inputBody.method, 'conversation.send');
  assert.deepEqual(inputBody.payload, { message: 'continue', source: 'agent-web-ui' });

  socket.emit('message', { data: JSON.stringify({ event: 'turn_started', event_sequence: 3, turn_id: 'turn_cf_authority' }) });
  elements.get('operator-input').value = 'queue on cloudflare authority';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(inputBodies().at(-1), {
    method: 'conversation.enqueue',
    payload: { message: 'queue on cloudflare authority', source: 'agent-web-ui', active_turn_id: 'turn_cf_authority' },
    request_id: inputBodies().at(-1).request_id,
  });

  elements.get('operator-input').value = '/json {"id":"steer-authority","method":"conversation.steer","params":{"message":"steer authority","source":"agent-web-ui","active_turn_id":"turn_cf_authority"}}';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(inputBodies().at(-1), {
    method: 'conversation.steer',
    payload: { message: 'steer authority', source: 'agent-web-ui', active_turn_id: 'turn_cf_authority' },
    request_id: 'steer-authority',
  });

  elements.get('operator-input').value = '/interrupt';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(inputBodies().at(-1).method, 'conversation.interrupt');

  socket.emit('message', { data: JSON.stringify({ event: 'authority_session_revoked', event_sequence: 3, code: 'session_revoked', session_id: 'cf_session_surface_1' }) });
  elements.get('projection-verbosity').value = 'diagnostics';
  elements.get('projection-verbosity').change();
  const revokedRow = elements.get('events').children.find((child) => child.dataset?.eventKind === 'authority_session_revoked');
  assert.ok(revokedRow, 'expected Cloudflare authority revocation to be visible in diagnostics');
  assert.equal(revokedRow.dataset.eventDisposition, 'diagnostic_signal');

  elements.get('operator-input').value = '/exit';
  elements.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(inputBodies().at(-1).method, 'session.close');
  assert.equal(started.connection.closed, true);
});

test('hosted agent-web-ui can read and write a published local NARS session through Cloudflare projection', async () => {
  const siteRoot = createLocalProjectionSite();
  const sessionId = 'carrier_web_ui_e2e';
  const worker = createCloudflareNarsProjectionWorker({ now: () => '2026-07-01T15:00:00.000Z' });
  const fetchViaWorker = (input, init) => worker.fetch(new Request(input, init));
  const registration = await registerProjectionRemotely({
    site_id: 'narada.sonar',
    site_root: siteRoot,
    nars_session_id: sessionId,
    projection_id: 'proj_hosted_web_ui_e2e',
    dry_run: false,
    cloudflare_api_base_url: 'https://projection.example.test',
    fetch_impl: fetchViaWorker,
  });
  assert.equal(registration.status, 'registered_remotely');
  const bridge = await startLocalProjectionBridgeOnce({
    site_root: siteRoot,
    projection_id: 'proj_hosted_web_ui_e2e',
    cloudflare_api_base_url: 'https://projection.example.test',
    fetch_impl: fetchViaWorker,
    health_probe: () => 'healthy',
  });
  assert.equal(bridge.status, 'connected');
  assert.equal(bridge.projected_event_count, 1);

  const browserToken = registration.remote_access.browser_access_tokens[0].token_fingerprint;
  const elements = createFakeAgentWebUiElements();
  const fetchCalls = [];
  const timers = [];
  const windowRef = {
    location: { search: `?cloudflare_projection_id=proj_hosted_web_ui_e2e&cloudflare_api_base_url=https://projection.example.test&cloudflare_browser_token=${encodeURIComponent(browserToken)}` },
    WebSocket: false,
    setInterval() { return 'interval-1'; },
    setTimeout(fn) { timers.push(fn); return `timer-${timers.length}`; },
    clearTimeout() {},
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), init });
      return fetchViaWorker(url, init);
    },
  };

  const started = startAgentWebUi({ windowRef, documentRef: elements.documentRef });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(started.config.mode, 'cloudflare_projection');
  assert.equal(started.config.browserToken, browserToken);
  assert.equal(elements.byId.get('stream').textContent, 'long-poll connected');
  assert.equal(elements.byId.get('events').children.some((child) => child.dataset?.eventKind === 'assistant_message'), true);
  assert.equal(fetchCalls.some((call) => call.url.includes('/events') && call.init.headers?.['x-narada-browser-token-fingerprint'] === browserToken), true);
  assert.equal(fetchCalls.some((call) => call.url.includes('/health') && call.init.headers?.['x-narada-browser-token-fingerprint'] === browserToken), true);

  const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir;
  writeFileSync(join(sessionDir, 'events.jsonl'), `${JSON.stringify({ event: 'assistant_message', event_sequence: 1, content: 'hello from local NARS' })}\n${JSON.stringify({ event: 'assistant_message', event_sequence: 2, content: 'hello after hosted page opened' })}\n`);
  await startLocalProjectionBridgeOnce({
    site_root: siteRoot,
    projection_id: 'proj_hosted_web_ui_e2e',
    cloudflare_api_base_url: 'https://projection.example.test',
    fetch_impl: fetchViaWorker,
    health_probe: () => 'healthy',
  });
  assert.ok(timers.length > 0, 'expected Cloudflare projection long-poll timer');
  timers.shift()();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(elements.byId.get('events').children.some((child) => textOfNode(child).includes('hello after hosted page opened')), true);

  elements.byId.get('operator-input').value = 'remote operator input';
  elements.byId.get('operator-form').submit();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fetchCalls.some((call) => call.url.endsWith('/input') && call.init.headers?.['x-narada-browser-token-fingerprint'] === browserToken), true);

  const admitted = [];
  const delivery = await deliverRemoteProjectionInputsOnce({
    site_root: siteRoot,
    projection_id: 'proj_hosted_web_ui_e2e',
    cloudflare_api_base_url: 'https://projection.example.test',
    fetch_impl: fetchViaWorker,
    submit_nars_input: (input) => {
      admitted.push(input);
      appendFileSync(join(sessionDir, 'events.jsonl'), `${JSON.stringify({ event: 'input_admitted_to_turn', event_sequence: 3, input_event_id: input.input_id, terminal_state: 'accepted' })}\n`);
      return { status: 'accepted_by_nars', method: input.method };
    },
  });
  assert.equal(delivery.status, 'delivered');
  assert.equal(admitted[0].method, 'conversation.send');
  assert.equal(admitted[0].payload.message, 'remote operator input');

  elements.byId.get('projection-verbosity').value = 'raw';
  await startLocalProjectionBridgeOnce({
    site_root: siteRoot,
    projection_id: 'proj_hosted_web_ui_e2e',
    cloudflare_api_base_url: 'https://projection.example.test',
    fetch_impl: fetchViaWorker,
    health_probe: () => 'healthy',
  });
  assert.ok(timers.length > 0, 'expected Cloudflare projection reconcile timer after remote input delivery');
  timers.shift()();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(elements.byId.get('events').children.some((child) => textOfNode(child).includes(admitted[0].input_id)), true);
});

test('browser startup shows degraded Cloudflare projection stream failures', async () => {
  class FakeElement {
    constructor(id = null) { this.id = id; this.tagName = String(id ?? '').toUpperCase(); this.children = []; this.listeners = new Map(); this.textContent = ''; this.value = ''; this.dataset = {}; }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
  }
  const elements = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'projection-verbosity', 'events', 'operator-form', 'operator-input']) elements.set(id, new FakeElement(id));
  elements.get('nars-config').textContent = JSON.stringify({ cloudflareProjectionId: 'proj_test', cloudflareApiBaseUrl: 'https://projection.example.test' });
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) { return { tagName: '#TEXT', textContent: String(text ?? ''), children: [], dataset: {} }; },
  };
  startAgentWebUi({
    windowRef: {
      location: { search: '' },
      WebSocket: false,
      setInterval() { return 'timer-1'; },
      setTimeout() { return 'timer-2'; },
      fetch: async (url) => {
        if (String(url).includes('/events')) throw new Error('projection down');
        return { ok: false, status: 503, json: async () => ({ status: 'unavailable' }) };
      },
    },
    documentRef,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(elements.get('stream').textContent, 'remote projection unavailable');
});

test('browser startup renders stale authority and blocks ordinary source input', () => {
  const { byId: elements, documentRef } = createFakeAgentWebUiElements();
  elements.get('nars-config').textContent = JSON.stringify({
    eventEndpoint: 'ws://127.0.0.1/events',
    healthEndpoint: '/api/health',
    authorityTransition: {
      authority_runtime_host: 'local',
      authority_epoch: 3,
      authority_transition_state: 'target_active',
      source_write_admission: 'sealed',
      superseded_by_session_id: 'carrier_target',
      stale_source: true,
      input_policy: 'disabled_source_sealed',
      reattach: { target_session_id: 'carrier_target', target_locator_ref: 'authority-locator:target' },
    },
  });
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
  startAgentWebUi({
    windowRef: {
      location: { search: '' },
      WebSocket: FakeWebSocket,
      setInterval() { return 'timer-1'; },
      setTimeout() { return 'timer-2'; },
      fetch: async () => ({ status: 200, json: async () => ({ status: 'healthy' }) }),
    },
    documentRef,
  });
  const socket = FakeWebSocket.instances[0];
  socket.emit('open');
  assert.equal(elements.get('authority-status').textContent, 'local e3 · target_active · writes sealed');
  assert.match(elements.get('authority-reattach').textContent, /reattach to carrier_target/i);

  elements.get('operator-input').value = 'send from stale source';
  elements.get('operator-form').submit();

  assert.equal(socket.sent.length, 1, 'only the subscribe frame should be sent');
  assert.equal(elements.get('operator-input').value, 'send from stale source');
  const refusal = elements.get('events').children.at(-1);
  assert.equal(refusal.dataset.eventKind, 'web_ui_input_not_sent');
  assert.match(refusal.children.at(1).children.at(0).textContent, /source authority is sealed/i);
});

test('browser startup subscribes to events and submits operator text over the same WebSocket', async () => {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
      this.tagName = String(id ?? '').toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
      this.dataset = {};
    }
    append(...children) { this.children.push(...children); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
    change() { this.listeners.get('change')?.({}); }
  }
  const elements = new Map();
  for (const id of ['nars-config', 'event-endpoint', 'health-endpoint', 'stream', 'health', 'projection-verbosity', 'events', 'operator-form', 'operator-input']) {
    elements.set(id, new FakeElement(id));
  }
  elements.get('nars-config').textContent = JSON.stringify({ eventEndpoint: 'ws://127.0.0.1/events', healthEndpoint: '/api/health', artifactBasePath: '/api/nars', maxReplay: 4 });
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) { return { tagName: '#TEXT', textContent: String(text ?? ''), children: [], dataset: {} }; },
  };
  const eventRows = () => elements.get('events').children;
  const activityRow = () => eventRows().find((child) => String(child.dataset.eventKind ?? '').startsWith('activity_')) ?? null;
  const durableRows = () => eventRows().filter((child) => !String(child.dataset.eventKind ?? '').startsWith('activity_'));
  const findDescendant = (root, predicate) => {
    if (!root) return null;
    if (predicate(root)) return root;
    for (const child of root.children ?? []) {
      const match = findDescendant(child, predicate);
      if (match) return match;
    }
    return null;
  };
  const findByClass = (root, className) => findDescendant(root, (node) => String(node.className ?? '').split(/\s+/).includes(className));
  const findByTag = (root, tagName) => findDescendant(root, (node) => node.tagName === tagName.toUpperCase());
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
  assert.equal(elements.get('projection-verbosity').value, 'conversation');
  assert.equal(socket.url, 'ws://127.0.0.1/events');
  assert.equal(elements.get('health-endpoint').textContent, '/api/health (http-proxy)');
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
  const operatorEchoRow = durableRows().at(-1);
  assert.equal(operatorEchoRow.dataset.eventKind, 'operator_input_submitted');
  assert.equal(operatorEchoRow.dataset.eventTone, 'operator');
  assert.equal(operatorEchoRow.children.at(1).children.at(0).textContent, 'run startup sequence');
  assert.equal(activityRow().dataset.eventKind, 'activity_queued');
  assert.equal(activityRow().children.at(1).children.at(0).children.at(1).textContent, 'Waiting for agent...');

  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 40 }, payload: { event: 'user_message', request_id: socket.sent[1].id, content: 'run startup sequence', event_sequence: 40 } }) });
  assert.equal(durableRows().at(-1), operatorEchoRow);
  assert.equal(operatorEchoRow.dataset.eventKind, 'user_message');
  assert.equal(operatorEchoRow.dataset.eventTone, 'operator');

  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 41 }, payload: { event: 'turn_started', turn_id: 'turn_active', event_sequence: 41 } }) });
  assert.equal(activityRow().dataset.eventKind, 'activity_thinking');
  elements.get('operator-input').value = 'change course';
  elements.get('operator-form').submit();
  assert.equal(socket.sent[2].method, 'conversation.enqueue');
  assert.deepEqual(socket.sent[2].params, { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_active' });
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 42 }, payload: { event: 'assistant_message_stream', turn_id: 'turn_active', content: 'a', event_sequence: 42 } }) });
  const assistantStreamRow = durableRows().at(-1);
  const beforeStreamCount = durableRows().length;
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 42 }, payload: { event: 'assistant_message_stream', turn_id: 'turn_active', content: 'a', event_sequence: 42 } }) });
  assert.equal(durableRows().length, beforeStreamCount);
  assert.equal(activityRow().dataset.eventKind, 'activity_streaming');
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 43 }, payload: { event: 'assistant_message_stream', turn_id: 'turn_active', content: 'c', event_sequence: 43 } }) });
  assert.equal(durableRows().length, beforeStreamCount);
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 44 }, payload: { event: 'assistant_message', turn_id: 'turn_active', content: 'ack', event_sequence: 44 } }) });
  const assistantFinalRow = durableRows().at(-1);
  assert.equal(durableRows().length, beforeStreamCount);
  assert.equal(assistantFinalRow.dataset.eventKind, 'assistant_message');
  assert.equal(assistantFinalRow.children.at(1).children.at(0).textContent, 'ack');
  assert.equal(activityRow(), null);
  const beforeProviderAssistantCount = durableRows().length;
  socket.emit('message', { data: JSON.stringify({ agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.started', item: { id: 'provider_stream_1', type: 'agent_message', text: 'I am hydrating context first.' } } }) });
  assert.equal(durableRows().length, beforeProviderAssistantCount);
  assert.equal(activityRow().dataset.eventKind, 'activity_streaming');
  socket.emit('message', { data: JSON.stringify({ agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_final_1', type: 'agent_message', text: 'I am hydrating context first.\n\nStartup sequence completed.' } } }) });
  assert.equal(durableRows().length, beforeProviderAssistantCount);
  assert.equal(activityRow(), null);
  socket.emit('message', { data: JSON.stringify({ event: 'assistant_message', request_id: 'input_provider_final', content: 'I am hydrating context first.\n\nStartup sequence completed.', agent_id: 'resident', session_id: 'carrier_test' }) });
  assert.equal(durableRows().length, beforeProviderAssistantCount + 1);
  const providerFinalRow = durableRows().at(-1);
  assert.equal(providerFinalRow.dataset.eventKind, 'assistant_message');
  assert.equal(providerFinalRow.children.at(1).children.at(0).textContent, 'I am hydrating context first.\n\nStartup sequence completed.');
  socket.emit('message', { data: JSON.stringify({ event: 'assistant_message', request_id: 'input_provider_final_echo', content: 'I am hydrating context first.\n\nStartup sequence completed.', agent_id: 'resident', session_id: 'carrier_test' }) });
  assert.equal(durableRows().length, beforeProviderAssistantCount + 1);
  assert.equal(durableRows().at(-1), providerFinalRow);
  socket.emit('message', { data: JSON.stringify({ event: 'assistant_message', request_id: 'input_markdown', content: 'markdown\n# Sample Report\n\n| Item | Status | Owner |\n|---|---|---|\n| Intake review | Done | Alex |\n| Implementation | In progress | Priya |\n| Verification | Pending | Sam |\n\n## Notes\n\n- Keep rows short and scannable.\n- Use clear status labels.\n- Add links or dates when needed.', agent_id: 'resident', session_id: 'carrier_test' }) });
  const markdownRow = durableRows().at(-1);
  const markdownFrame = findByClass(markdownRow, 'rendered-part-frame');
  assert.ok(markdownFrame, 'expected rendered markdown frame');
  assert.equal(findByClass(markdownFrame, 'rendered-part-title'), null, 'content type title should not be persistently visible');
  assert.ok(findByClass(markdownFrame, 'rendered-part-tabs'), 'expected right-edge view tabs');
  assert.ok(findByClass(markdownFrame, 'rendered-part-copy'), 'expected copy button in Code view');
  assert.equal(findByClass(markdownFrame, 'rendered-part-code-title')?.textContent, 'markdown');
  const markdownBody = findByClass(markdownFrame, 'message-markdown');
  assert.ok(markdownBody, 'expected rendered markdown body');
  assert.ok(findByTag(markdownBody, 'table'), 'expected rendered markdown table');
  assert.ok(findByTag(markdownBody, 'ul'), 'expected rendered markdown list');
  socket.emit('message', { data: JSON.stringify({
    event: 'assistant_message',
    request_id: 'input_artifact',
    content: [
      { type: 'markdown', text: 'Here is the generated report:' },
      { type: 'artifact_ref', artifact_id: 'art_test_html', kind: 'html', title: 'Report preview', render_hint: 'inline' },
    ],
    agent_id: 'resident',
    session_id: 'carrier_test',
  }) });
  const artifactRow = durableRows().at(-1);
  const artifactCard = findByClass(artifactRow, 'artifact-card');
  assert.ok(artifactCard, 'expected artifact reference card');
  assert.equal(findByClass(artifactCard, 'artifact-title')?.textContent, 'Report preview');
  const iframe = findByTag(artifactCard, 'iframe');
  assert.ok(iframe, 'expected html artifact iframe preview');
  assert.equal(iframe.src, '/api/nars/sessions/carrier_test/artifacts/art_test_html/content');
  assert.doesNotMatch(artifactRow.children.at(1).textContent, /\[object Object\]/);
  elements.get('nars-config').textContent = JSON.stringify({
    eventEndpoint: 'ws://127.0.0.1/events',
    healthEndpoint: 'https://projection.example.test/api/nars/projections/proj_test/health',
    artifactBasePath: 'https://projection.example.test/api/nars/projections/proj_test/artifacts',
    artifactTransport: 'cloudflare-projection',
    maxReplay: 4,
  });
  socket.emit('message', { data: JSON.stringify({
    event: 'assistant_message',
    request_id: 'input_artifact_cloudflare',
    content: [{ type: 'artifact_ref', artifact_id: 'art_cloudflare_html', kind: 'html', title: 'Remote report', render_hint: 'inline' }],
    agent_id: 'resident',
    session_id: 'carrier_test',
  }) });
  const cloudflareArtifactCard = findByClass(durableRows().at(-1), 'artifact-card');
  assert.equal(findByTag(cloudflareArtifactCard, 'iframe').src, 'https://projection.example.test/api/nars/projections/proj_test/artifacts/art_cloudflare_html/content');
  assert.doesNotMatch(durableRows().at(-1).children.at(1).textContent, /\[object Object\]/);
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 45 }, payload: { event: 'turn_complete', turn_id: 'turn_active', terminal_state: 'interrupted', event_sequence: 45 } }) });
  const beforeStatusNoiseCount = elements.get('events').children.length;
  socket.emit('message', { data: JSON.stringify({ event: 'session_health', status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }) });
  socket.emit('message', { data: JSON.stringify({ event: 'websocket_connected', cursor: { last_sequence: 45, next_sequence: 46 } }) });
  assert.equal(elements.get('events').children.length, beforeStatusNoiseCount);
  elements.get('projection-verbosity').value = 'diagnostics';
  elements.get('projection-verbosity').change();
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'session_health'), false);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'websocket_connected'), false);
  elements.get('projection-verbosity').value = 'raw';
  elements.get('projection-verbosity').change();
  socket.emit('message', { data: JSON.stringify({ event: 'unclassified_future_event', content: 'raw only' }) });
  assert.equal(durableRows().at(-1).dataset.eventKind, 'unclassified_future_event');
  assert.equal(durableRows().at(-1).children.at(1).children.length, 2);
  elements.get('projection-verbosity').value = 'operations';
  elements.get('projection-verbosity').change();
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'unclassified_future_event'), false);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'session_health'), false);
  socket.emit('message', { data: JSON.stringify({ event_sequence: 46, sequence: 46, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.started', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', status: 'in_progress' } } }) });
  const toolRow = durableRows().at(-1);
  assert.equal(toolRow.dataset.eventKind, 'tool_call');
  assert.equal(activityRow().dataset.eventKind, 'activity_tool');
  socket.emit('message', { data: JSON.stringify({ event_sequence: 47, sequence: 47, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', status: 'completed', result: { content: [{ type: 'text', text: '{"status":"ok"}' }] } } } }) });
  assert.equal(durableRows().at(-1), toolRow);
  assert.equal(toolRow.dataset.eventKind, 'tool_result');
  assert.equal(toolRow.children.at(1).children.at(0).textContent, 'narada-sonar-agent-context.agent_context_startup_sequence complete');
  assert.notEqual(toolRow.children.at(1).children.at(0).textContent, '[object Object]');
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 48 }, payload: { event: 'turn_complete', turn_id: 'turn_after_tool', terminal_state: 'completed', event_sequence: 48 } }) });
  elements.get('projection-verbosity').value = 'conversation';
  elements.get('projection-verbosity').change();
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'tool_call'), false);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'tool_result'), false);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'turn_complete'), false);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'assistant_message'), true);
  elements.get('operator-input').value = 'new turn';
  elements.get('operator-form').submit();
  assert.equal(socket.sent[3].method, 'conversation.send');
  socket.emit('close');
  assert.equal(elements.get('stream').textContent, 'reconnecting in 1s · disconnected 0s');
  assert.equal(reconnectTimers[0].delay, 1000);
  reconnectTimers[0].fn();
  const reconnectedSocket = FakeWebSocket.instances[1];
  reconnectedSocket.emit('open');
  assert.deepEqual(reconnectedSocket.sent[0], {
    id: 'agent-web-ui-events-subscribe',
    method: 'session.events.subscribe',
    params: { include_replay: true, max_replay: 4, since_sequence: 48 },
  });

  elements.get('operator-input').value = '/status';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[1].method, 'session.status');

  elements.get('operator-input').value = '/health';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[2].method, 'session.health');

  elements.get('operator-input').value = '/json {"id":"steer-local","method":"conversation.steer","params":{"message":"steer local","source":"agent-web-ui","active_turn_id":"turn_after_tool"}}';
  elements.get('operator-form').submit();
  assert.deepEqual(reconnectedSocket.sent[3], {
    id: 'steer-local',
    method: 'conversation.steer',
    params: { message: 'steer local', source: 'agent-web-ui', active_turn_id: 'turn_after_tool' },
  });

  elements.get('operator-input').value = '/interrupt';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[4].method, 'conversation.interrupt');

  elements.get('operator-input').value = '/exit';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[5].method, 'session.close');
  assert.equal(started.connection.closed, true);
});
test('event stream reconnect uses bounded backoff and visible disconnected duration', () => {
  assert.equal(reconnectDelayForAttempt(1), 1000);
  assert.equal(reconnectDelayForAttempt(2), 2000);
  assert.equal(reconnectDelayForAttempt(5), 10000);
  assert.equal(reconnectDelayForAttempt(20), 10000);
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
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), 'hello');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'tool_call', tool_name: 'narada-site.whoami' } }), 'narada-site.whoami');
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

test('conversation projection keeps artifact presentation and lifecycle message while hiding provider notes', () => {
  const events = [
    { event_sequence: 63, sequence: 63, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.' } } },
    { event_sequence: 67, sequence: 67, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_art_1', content: [{ type: 'text', text: 'Here is the registered HTML artifact rendered inline.' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }] },
    { event_sequence: 69, sequence: 69, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_11', type: 'agent_message', text: 'Done. Created and presented the artifact.' } } },
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.Done. Created and presented the artifact.' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 2);
  assert.equal(Array.isArray(assistantRows[0].summary), true);
  assert.match(assistantRows[1].summary, /Done/);
  assert.equal(projection.rows.some((row) => row.kind === 'provider_agent_message'), false);
});

test('DOM renderer keeps artifact presentation and lifecycle message while hiding provider notes', () => {
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
  const elements = new Map([
    ['events', new FakeElement('ul')],
    ['projection-verbosity', new FakeElement('select')],
    ['nars-config', new FakeElement('script')],
  ]);
  elements.get('projection-verbosity').value = 'conversation';
  elements.get('nars-config').textContent = JSON.stringify({ artifactBasePath: '/sessions' });
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) {
      const node = new FakeElement('#text');
      node.textContent = String(text ?? '');
      return node;
    },
  };
  const events = [
    { event_sequence: 63, sequence: 63, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.' } } },
    { event_sequence: 67, sequence: 67, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_art_1', content: [{ type: 'text', text: 'Here is the registered HTML artifact rendered inline.' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }] },
    { event_sequence: 69, sequence: 69, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_11', type: 'agent_message', text: 'Done. Created and presented the artifact.' } } },
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.Done. Created and presented the artifact.' },
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
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
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
  const elements = new Map([
    ['events', new FakeElement('ul')],
    ['projection-verbosity', new FakeElement('select')],
  ]);
  elements.get('projection-verbosity').value = 'conversation';
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) {
      const node = new FakeElement('#text');
      node.textContent = String(text ?? '');
      return node;
    },
  };
  appendEvent({ event: 'operator_input_submitted', request_id: 'local_echo', content: 'run startup sequence' }, documentRef, { verbosity: 'conversation' });
  appendEvent({ event: 'user_message', request_id: 'nars_input', session_id: 'carrier_test', content: 'run startup sequence' }, documentRef, { verbosity: 'conversation' });
  const rows = elements.get('events').children.filter((child) => child?.dataset?.eventKind === 'operator_input_submitted' || child?.dataset?.eventKind === 'user_message');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.eventKind, 'user_message');
});

test('session projection reduces routine health into state and clears completed tool activity', () => {
  const events = [
    { event: 'session_health', status: 'healthy', agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'session_health', status: 'healthy', agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:00:10.000Z' },
    { event_sequence: 10, sequence: 10, agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:00:11.000Z', event: { type: 'item.started', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence' } } },
    { event_sequence: 11, sequence: 11, agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:00:12.000Z', event: { type: 'item.completed', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', result: { content: [{ type: 'text', text: '{"status":"ok"}' }] } } } },
    { event: 'session_health', status: 'healthy', agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:04:00.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'diagnostics', nowMs: Date.parse('2026-06-30T15:04:36.000Z') });
  assert.equal(projection.health.status, 'healthy');
  assert.equal(projection.health.healthySampleCount, 3);
  assert.equal(projection.rows.some((row) => row.kind === 'session_health'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'websocket_connected'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'tool_result'), false);
  assert.equal(projection.activity.active, true);
  assert.equal(projection.activity.state, 'thinking');
  assert.notEqual(projection.activity.state, 'tool');

  const completeProjection = createSessionProjection([...events, { event: 'turn_complete', turn_id: 'turn_after_tool', terminal_state: 'completed', timestamp: '2026-06-30T15:04:37.000Z' }], { verbosity: 'diagnostics' });
  assert.equal(completeProjection.activity.active, false);
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

test('Vue operator components expose composer without hidden privileged controls', async () => {
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  assert.match(composer, /id="operator-form"/i);
  assert.match(composer, /id="operator-input"/i);
  assert.match(composer, /type="submit"/i);
  assert.match(composer, /placeholder="Enter to submit\. Shift\+Enter for new line"/i);
  assert.match(composer, /inputRef\.value\?\.focus\(\)/);
  assert.match(composer, /@keydown="handleKeydown"/);
  assert.match(composer, /event\.key !== 'Enter' \|\| event\.shiftKey/);
  assert.doesNotMatch(composer, /command\.execute|conversation\.interrupt/i);
});

test('Vue layout smoke covers shell, status, event list, composer, and event tone styles', async () => {
  const shell = await readFile(new URL('../src/app/components/NarsSessionShell.vue', import.meta.url), 'utf8');
  const transcript = await readFile(new URL('../src/app/components/ConversationTranscript.vue', import.meta.url), 'utf8');
  const status = await readFile(new URL('../src/app/components/SessionStatusBar.vue', import.meta.url), 'utf8');
  const retainedEvents = await readFile(new URL('../src/app/composables/useRetainedEvents.ts', import.meta.url), 'utf8');
  const projectionVerbosity = await readFile(new URL('../src/app/composables/useProjectionVerbosity.ts', import.meta.url), 'utf8');
  const selectorComponent = await readFile(new URL('../src/app/components/ProjectionVerbositySelect.vue', import.meta.url), 'utf8');
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');
  for (const marker of ['class="shell"', '<SessionStatusBar', '<ConversationTranscript', '<OperatorComposer']) {
    assert.equal(shell.includes(marker), true, marker);
  }
  for (const marker of ['id="events"', 'id="projection-verbosity"', 'class="composer"', 'id="operator-input"']) {
    assert.equal([transcript, status, selectorComponent, composer].some((source) => source.includes(marker)), true, marker);
  }
  assert.match(shell, /sessionIdentity: SessionIdentitySummary/);
  assert.match(shell, /\{\{ sessionIdentity\.title \}\}/);
  assert.match(shell, /\{\{ sessionIdentity\.subtitle \}\}/);
  assert.match(shell, /follow-latest-revision="followLatestRevision"/);
  assert.match(transcript, /followLatestRevision/);
  assert.match(transcript, /nextTick\(scrollToBottom\)/);
  assert.match(status, /verbosity === 'diagnostics' \|\| verbosity === 'raw'/);
  assert.match(status, /routine status update\{\{ summarizedStateSampleCount === 1 \? '' : 's' \}\} folded into State/);
  assert.match(retainedEvents, /Number\.POSITIVE_INFINITY/);
  assert.doesNotMatch(projectionVerbosity, /agent-web-ui\.js/);
  assert.match(css, /content-visibility:\s*auto/);
  assert.doesNotMatch(transcript, /visibleItems|ResizeObserver|event-virtual-item/);
  assert.doesNotMatch(transcript, /scrollTop\s*</);
  assert.doesNotMatch(transcript, /loadOlder|history-loading/);
  assert.doesNotMatch(css, /\.history-loading/);
  for (const cssSelector of ['.shell', '.status', '.status select', '.events', '.events-scroll', '.composer', '.event-tone-assistant', '.event-tone-error']) {
    assert.equal(css.includes(cssSelector), true, cssSelector);
  }
});

test('agent-web-ui CSS enforces theme-token discipline for new color declarations', async () => {
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');
  const root = postcss.parse(css, { from: 'agent-web-ui.css' });
  const violations = rawColorDeclarationViolations(root);
  assert.deepEqual(violations, []);

  const lightTokens = rawColorTokensInRoot(root, { dark: false });
  const darkTokens = rawColorTokensInRoot(root, { dark: true });
  const missingDarkTokens = [...lightTokens].filter((token) => !darkTokens.has(token));
  assert.deepEqual(missingDarkTokens, []);
});

function rawColorDeclarationViolations(root) {
  const violations = [];
  root.walkDecls((declaration) => {
    if (!hasRawColor(declaration.value)) return;
    const parentRule = nearestRule(declaration);
    if (parentRule?.selector === ':root' && declaration.prop.startsWith('--')) return;
    violations.push(`${locationLabel(declaration)} ${parentRule?.selector ?? '<root>'} { ${declaration.prop}: ${declaration.value}; }`);
  });
  return violations;
}

function rawColorTokensInRoot(root, { dark }) {
  const tokens = new Set();
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith('--') || !hasRawColor(declaration.value)) return;
    const parentRule = nearestRule(declaration);
    if (parentRule?.selector !== ':root') return;
    if (isInsideDarkMedia(declaration) !== dark) return;
    tokens.add(declaration.prop);
  });
  return tokens;
}

function nearestRule(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'rule') return current;
    current = current.parent;
  }
  return null;
}

function isInsideDarkMedia(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'atrule' && current.name === 'media' && current.params.includes('prefers-color-scheme: dark')) return true;
    current = current.parent;
  }
  return false;
}

function hasRawColor(value) {
  return /#[0-9a-fA-F]{3,8}|rgba?\(/.test(value);
}

function locationLabel(node) {
  return `${node.source?.start?.line ?? '?'}:${node.source?.start?.column ?? '?'}`;
}

test('Vue message content renderer has typed parts, inline code, and lazy Mermaid fallback', async () => {
  const eventRow = await readFile(new URL('../src/app/components/EventRow.vue', import.meta.url), 'utf8');
  const projectionSelect = await readFile(new URL('../src/app/components/ProjectionVerbositySelect.vue', import.meta.url), 'utf8');
  const messageContent = await readFile(new URL('../src/app/components/content/MessageContent.vue', import.meta.url), 'utf8');
  const markdownPart = await readFile(new URL('../src/app/components/content/MarkdownTextPart.vue', import.meta.url), 'utf8');
  const mermaidPart = await readFile(new URL('../src/app/components/content/MermaidDiagramPart.vue', import.meta.url), 'utf8');
  const renderedFrame = await readFile(new URL('../src/app/components/content/RenderedPartFrame.vue', import.meta.url), 'utf8');
  const parser = await readFile(new URL('../src/app/lib/messageContent.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');

  assert.match(eventRow, /<MessageContent :content="row\.summary"/);
  assert.match(eventRow, /event-view-\$\{props\.verbosity\}/);
  assert.match(eventRow, /event-disposition-\$\{String\(row\.disposition/);
  assert.match(eventRow, /v-if="verbosity !== 'conversation'" class="event-kind"/);
  assert.match(projectionSelect, /conversation: 'Chat'/);
  assert.match(projectionSelect, /aria-label="View"/);
  assert.match(messageContent, /parseMessageContent/);
  assert.match(parser, /normalizeTextPart/);
  assert.match(parser, /markdown\|md/);
  for (const renderKind of ['plain_text', 'markdown', 'code_block', 'mermaid_diagram', 'json_block']) {
    assert.equal(messageContent.includes(renderKind), true, renderKind);
    assert.equal(parser.includes(renderKind), true, renderKind);
  }
  assert.match(markdownPart, /MarkdownIt/);
  assert.match(markdownPart, /RenderedPartFrame/);
  assert.match(markdownPart, /html: false/);
  assert.match(markdownPart, /linkify: true/);
  assert.match(markdownPart, /v-html="renderedMarkdown"/);
  assert.match(renderedFrame, /activeView = ref<'render' \| 'code'>\('render'\)/);
  assert.match(renderedFrame, /copySource/);
  assert.match(renderedFrame, /class="rendered-part-copy"/);
  assert.doesNotMatch(renderedFrame, /rendered-part-title/);
  assert.match(renderedFrame, />Code<\/button>/);
  assert.match(renderedFrame, />Render<\/button>/);
  assert.match(css, /\.rendered-part-tabs[\s\S]*?flex-direction: column/);
  assert.doesNotMatch(css, /\.rendered-part-tab[\s\S]*?writing-mode/);
  assert.match(css, /\.rendered-part-tab[\s\S]*?text-align: left/);
  assert.match(css, /\.rendered-part-code pre[\s\S]*?white-space: pre-wrap/);
  assert.match(css, /\.rendered-part-copy[\s\S]*?cursor: pointer/);
  assert.equal(parser.includes('(?:^|\\n)\\s*[-*+]\\s+'), true);
  assert.match(mermaidPart, /import\('mermaid'\)/);
  assert.match(mermaidPart, /nextMermaidInstanceId/);
  assert.match(mermaidPart, /securityLevel: 'strict'/);
  assert.match(mermaidPart, /Mermaid render failed/);
  assert.match(css, /\.event-view-operations\.event-disposition-conversation_fact[\s\S]*?box-shadow: none/);
  assert.match(css, /\.event-view-operations\.event-disposition-operation_fact[\s\S]*?border-color: var\(--line-strong\)/);
  assert.match(css, /\.event-view-diagnostics[\s\S]*?grid-template-columns: 170px minmax\(0, 1fr\)/);
  assert.match(css, /\.event-view-diagnostics\.event-disposition-diagnostic_signal[\s\S]*?border-color: var\(--error-border\)/);
  assert.doesNotMatch(css, /\.event-agent-activity[\s\S]*?margin-left: 210px/);
  assert.doesNotMatch(css, /@media \(max-width: 680px\)[\s\S]*?\.event-agent-activity[\s\S]*?margin-left: 0/);
  assert.match(css, /\.event-view-raw[\s\S]*?box-shadow: none/);
  assert.match(css, /\.event-view-raw \.event-summary[\s\S]*?color: var\(--muted\)/);
  for (const cssSelector of ['.message-content', '.inline-code-token', '.code-block-part', '.json-block-part', '.rendered-part-frame', '.rendered-part-tab', '.mermaid-diagram']) {
    assert.equal(css.includes(cssSelector), true, cssSelector);
  }
});

test('browser screenshot smoke renders the served shell', async () => {
  const browserPath = findHeadlessBrowser();
  assert.ok(browserPath, 'expected an installed Chromium-family browser for screenshot smoke');
  const tmpDir = new URL('../.tmp-tests/agent-web-ui-screenshot/', import.meta.url);
  const screenshotUrl = new URL('shell.png', tmpDir);
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: null, healthEndpoint: null });
  try {
    await captureHeadlessScreenshot({ browserPath, url: web.url, screenshotPath: fileURLToPath(screenshotUrl) });
    const screenshot = await readFile(screenshotUrl);
    assert.deepEqual([...screenshot.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok((await stat(screenshotUrl)).size > 5000, 'expected non-empty rendered PNG screenshot');
  } finally {
    web.server.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('package server injects operator-capable config and proxies health with GET only', async () => {
  const upstream = createServer((request, response) => {
    assert.equal(request.method, 'GET');
    if (request.url === '/sessions/carrier_test/artifacts/art_html') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ schema: 'narada.nars.artifact_read.v1', artifact: { artifact_id: 'art_html', kind: 'html', title: 'HTML artifact' } }));
      return;
    }
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
    assert.match(index, /"healthTransport":"http-proxy"/);
    assert.match(index, /"artifactBasePath":"\/api\/nars"/);
    assert.match(index, /"protocolHealthMethod":"session.health"/);
    assert.match(index, /"operatorInput":true/);
    assert.match(index, /"conversation.send"/);
    assert.match(index, /"carrier.command.execute"/);

    const health = await fetch(new URL('/api/health', web.url)).then((response) => response.json());
    assert.equal(health.status, 'healthy');
    assert.equal(health.session_id, 'carrier_test');
    const artifact = await fetch(new URL('/api/nars/sessions/carrier_test/artifacts/art_html', web.url)).then((response) => response.json());
    assert.equal(artifact.artifact.title, 'HTML artifact');
  } finally {
    web.server.close();
    upstream.close();
  }
});

test('package server serves browser-loadable modules without workspace bare imports', async () => {
  const web = await startAgentWebUiServer({ host: '127.0.0.1', port: 0, eventEndpoint: 'ws://127.0.0.1:1234/events', healthEndpoint: 'http://127.0.0.1:1235/health' });
  try {
    const root = new URL(web.url);
    const appModule = await fetch(new URL('/agent-web-ui.js', root)).then((response) => response.text());
    const runtimeModule = await fetch(new URL('/runtime-events.js', root)).then((response) => response.text());
    const vendorModule = await fetch(new URL('/vendor/nars-client-projection-contract.js', root)).then((response) => response.text());
    const vueVendorModule = await fetch(new URL('/vendor/vue.js', root)).then((response) => response.text());
    assert.doesNotMatch(appModule, /from ['"]@narada2\//);
    assert.doesNotMatch(appModule, /vue-app/);
    assert.doesNotMatch(runtimeModule, /from ['"]@narada2\//);
    assert.match(appModule, /from ['"]\.\/vendor\/nars-client-projection-contract\.js['"]/);
    assert.match(runtimeModule, /from ['"]\.\/vendor\/nars-client-projection-contract\.js['"]/);
    assert.match(vendorModule, /export const AGENT_WEB_UI_NARS_METHOD_LIST/);
    assert.match(vendorModule, /export const AGENT_WEB_UI_NARS_METHOD_LIST/);
    assert.match(vendorModule, /export function projectNarsClientEvent/);
    assert.match(vueVendorModule, /createApp/);
  } finally {
    web.server.close();
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
    assert.equal(config.healthTransport, 'http-proxy');
    assert.equal(config.artifactBasePath, '/api/nars');
    assert.equal(config.protocolHealthMethod, 'session.health');
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

    client.sendJson({ id: 'enqueue-1', method: 'conversation.enqueue', params: { message: 'after current turn', source: 'agent-web-ui', active_turn_id: 'turn_ws' } });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'enqueue-1'));
    assert.deepEqual(childFrames.find((frame) => frame.id === 'enqueue-1'), {
      id: 'enqueue-1',
      method: 'conversation.enqueue',
      params: { message: 'after current turn', source: 'agent-web-ui', active_turn_id: 'turn_ws' },
    });

    client.sendJson({ id: 'steer-1', method: 'conversation.steer', params: { message: 'steer now', source: 'agent-web-ui', active_turn_id: 'turn_ws' } });
    await waitForFrame(() => childFrames.some((frame) => frame.id === 'steer-1'));
    assert.deepEqual(childFrames.find((frame) => frame.id === 'steer-1'), {
      id: 'steer-1',
      method: 'conversation.steer',
      params: { message: 'steer now', source: 'agent-web-ui', active_turn_id: 'turn_ws' },
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
    healthTransport: 'http-proxy',
    artifactBasePath: '/api/nars',
    artifactTransport: 'local-nars-proxy',
    projectionControl: null,
    authorityTransition: null,
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
    operatorInput: true,
    admittedMethods: ['session.events.subscribe', 'session.events.read', 'session.artifacts.register', 'session.artifacts.read', 'conversation.send', 'conversation.enqueue', 'session.status', 'session.health', 'session.recovery', 'session.operations', 'observers.status', 'observer.mute', 'observer.unmute', 'carrier.command.execute', 'conversation.interrupt', 'conversation.steer', 'session.close'],
  });
});

test('local client config exposes Cloudflare projection control only with session authority', () => {
  assert.equal(buildClientConfig({ eventEndpoint: 'ws://nars/events', healthEndpoint: 'http://nars/health' }).projectionControl, null);
  assert.deepEqual(buildClientConfig({
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    sessionId: 'carrier_1',
    siteRoot: 'D:/code/narada.sonar',
    siteId: 'narada.sonar',
    cloudflareApiBaseUrl: 'https://projection.example.test/',
  }).projectionControl, {
    cloudflare: {
      available: true,
      startEndpoint: '/api/projections/cloudflare/start',
      statusEndpoint: '/api/projections/cloudflare/status',
      defaultApiBaseUrl: 'https://projection.example.test',
    },
  });
});

test('local projection control refuses browser-supplied session authority and starts from server context', async () => {
  let captured = null;
  const web = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    sessionId: 'carrier_server',
    siteRoot: 'D:/code/narada.sonar',
    siteId: 'narada.sonar',
    agentId: 'resident',
    cloudflareApiBaseUrl: 'https://projection.example.test/',
  }, {
    startCloudflareProjection: async (input) => {
      captured = input;
      return {
        schema: 'narada.agent_web_ui.cloudflare_projection_start.v1',
        status: 'published',
        projection_id: 'proj_server',
        remote_url: 'https://projection.example.test/?cloudflare_projection_id=proj_server&cloudflare_api_base_url=https%3A%2F%2Fprojection.example.test',
      };
    },
  });
  try {
    const refused = await fetch(`${web.url}api/projections/cloudflare/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cloudflare_api_base_url: 'https://projection.example.test', site_root: 'D:/other' }),
    });
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).reason, /projection_authority_override_refused:site_root/);

    const accepted = await fetch(`${web.url}api/projections/cloudflare/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(captured, {
      siteId: 'narada.sonar',
      siteRoot: 'D:/code/narada.sonar',
      sessionId: 'carrier_server',
      agentId: 'resident',
      cloudflareApiBaseUrl: 'https://projection.example.test',
      projectionId: undefined,
      eventPolicy: undefined,
      inputPolicy: undefined,
      cachePolicy: undefined,
      artifactPolicy: undefined,
    });
    assert.equal((await accepted.json()).remote_url.includes('cloudflare_projection_id=proj_server'), true);
  } finally {
    web.server.close();
  }
});

test('resolveAttachConfig supports Cloudflare projection API mode', () => {
  const config = resolveAttachConfig('?cloudflare_projection_id=proj_1&cloudflare_api_base_url=https://projection.example.test&cloudflare_browser_token=browser_test');
  assert.equal(config.mode, 'cloudflare_projection');
  assert.equal(config.eventEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/events');
  assert.equal(config.healthEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/health');
  assert.equal(config.inputEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/input');
  assert.equal(config.browserToken, 'browser_test');
  assert.equal(config.cacheEndpoint, 'https://projection.example.test/api/nars/projections/proj_1/events/cache');
  assert.equal(config.healthTransport, 'cloudflare-projection');
  assert.equal(config.artifactBasePath, 'https://projection.example.test/api/nars/projections/proj_1/artifacts');
  assert.equal(config.artifactTransport, 'cloudflare-projection');
});
