import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildConversationSendFrame,
  buildConversationSteerFrame,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
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

  const input = buildConversationSendFrame('run startup sequence', { id: 'input-1' });
  assert.deepEqual(input, {
    id: 'input-1',
    method: 'conversation.send',
    params: { message: 'run startup sequence', source: 'agent-web-ui' },
  });
  assert.equal(isAgentWebUiProtocolFrame(input), true);
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

test('browser startup subscribes to events and submits operator text over the same WebSocket', async () => {
  class FakeElement {
    constructor(id = null) {
      this.id = id;
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
  assert.equal(elements.get('projection-verbosity').value, NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY);
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
  const operatorEchoRow = elements.get('events').children.at(-1);
  assert.equal(operatorEchoRow.dataset.eventKind, 'operator_input_submitted');
  assert.equal(operatorEchoRow.dataset.eventTone, 'operator');
  assert.equal(operatorEchoRow.children.at(1).children.at(0).textContent, 'run startup sequence');

  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 40 }, payload: { event: 'user_message', request_id: socket.sent[1].id, content: 'run startup sequence', event_sequence: 40 } }) });
  assert.equal(elements.get('events').children.at(-1), operatorEchoRow);
  assert.equal(operatorEchoRow.dataset.eventKind, 'user_message');
  assert.equal(operatorEchoRow.dataset.eventTone, 'operator');

  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 41 }, payload: { event: 'turn_started', turn_id: 'turn_active', event_sequence: 41 } }) });
  elements.get('operator-input').value = 'change course';
  elements.get('operator-form').submit();
  assert.equal(socket.sent[2].method, 'conversation.steer');
  assert.deepEqual(socket.sent[2].params, { message: 'change course', source: 'agent-web-ui', active_turn_id: 'turn_active' });
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 42 }, payload: { event: 'assistant_message_stream', turn_id: 'turn_active', content: 'a', event_sequence: 42 } }) });
  const assistantStreamRow = elements.get('events').children.at(-1);
  assert.equal(assistantStreamRow.dataset.eventKind, 'assistant_message_stream');
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 43 }, payload: { event: 'assistant_message_stream', turn_id: 'turn_active', content: 'c', event_sequence: 43 } }) });
  assert.equal(elements.get('events').children.at(-1), assistantStreamRow);
  assert.equal(assistantStreamRow.children.at(1).children.at(0).textContent, 'ac');
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 44 }, payload: { event: 'assistant_message', turn_id: 'turn_active', content: 'ack', event_sequence: 44 } }) });
  assert.equal(elements.get('events').children.at(-1), assistantStreamRow);
  assert.equal(assistantStreamRow.dataset.eventKind, 'assistant_message');
  assert.equal(assistantStreamRow.children.at(1).children.at(0).textContent, 'ack');
  const beforeProviderAssistantCount = elements.get('events').children.length;
  socket.emit('message', { data: JSON.stringify({ agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.started', item: { id: 'provider_stream_1', type: 'agent_message', text: 'I am hydrating context first.' } } }) });
  const providerStreamRow = elements.get('events').children.at(-1);
  assert.equal(providerStreamRow.dataset.eventKind, 'assistant_message_stream');
  socket.emit('message', { data: JSON.stringify({ agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_final_1', type: 'agent_message', text: 'I am hydrating context first.\n\nStartup sequence completed.' } } }) });
  assert.equal(elements.get('events').children.length, beforeProviderAssistantCount + 1);
  const providerFinalRow = elements.get('events').children.at(-1);
  assert.notEqual(providerFinalRow, providerStreamRow);
  assert.equal(providerFinalRow.dataset.eventKind, 'assistant_message');
  assert.equal(providerFinalRow.children.at(1).children.at(0).textContent, 'I am hydrating context first.\n\nStartup sequence completed.');
  socket.emit('message', { data: JSON.stringify({ agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_final_echo_1', type: 'agent_message', text: 'I am hydrating context first.\n\nStartup sequence completed.' } } }) });
  assert.equal(elements.get('events').children.length, beforeProviderAssistantCount + 1);
  assert.equal(elements.get('events').children.at(-1), providerFinalRow);
  socket.emit('message', { data: JSON.stringify({ event: 'session_event', cursor: { sequence: 45 }, payload: { event: 'turn_complete', turn_id: 'turn_active', terminal_state: 'interrupted', event_sequence: 45 } }) });
  const beforeStatusNoiseCount = elements.get('events').children.length;
  socket.emit('message', { data: JSON.stringify({ event: 'session_health', status: 'healthy', agent_id: 'narada.test', session_id: 'carrier_test' }) });
  socket.emit('message', { data: JSON.stringify({ event: 'websocket_connected', cursor: { last_sequence: 45, next_sequence: 46 } }) });
  assert.equal(elements.get('events').children.length, beforeStatusNoiseCount);
  elements.get('projection-verbosity').value = 'diagnostics';
  elements.get('projection-verbosity').change();
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'session_health'), true);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'websocket_connected'), true);
  elements.get('projection-verbosity').value = 'raw';
  elements.get('projection-verbosity').change();
  socket.emit('message', { data: JSON.stringify({ event: 'unclassified_future_event', content: 'raw only' }) });
  assert.equal(elements.get('events').children.at(-1).dataset.eventKind, 'unclassified_future_event');
  assert.equal(elements.get('events').children.at(-1).children.at(1).children.length, 2);
  elements.get('projection-verbosity').value = 'operations';
  elements.get('projection-verbosity').change();
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'unclassified_future_event'), false);
  assert.equal(elements.get('events').children.some((child) => child.dataset.eventKind === 'session_health'), false);
  socket.emit('message', { data: JSON.stringify({ event_sequence: 46, sequence: 46, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.started', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', status: 'in_progress' } } }) });
  const toolRow = elements.get('events').children.at(-1);
  assert.equal(toolRow.dataset.eventKind, 'tool_call');
  socket.emit('message', { data: JSON.stringify({ event_sequence: 47, sequence: 47, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', status: 'completed', result: { content: [{ type: 'text', text: '{"status":"ok"}' }] } } } }) });
  assert.equal(elements.get('events').children.at(-1), toolRow);
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

  elements.get('operator-input').value = '/exit';
  elements.get('operator-form').submit();
  assert.equal(reconnectedSocket.sent[3].method, 'session.close');
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
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    healthTransport: 'http-proxy',
    protocolHealthMethod: 'session.health',
    maxReplay: 7,
  });
  assert.deepEqual(resolveAttachConfig('', { eventEndpoint: 'ws://injected/events', healthEndpoint: '/api/health' }), {
    eventEndpoint: 'ws://injected/events',
    healthEndpoint: '/api/health',
    healthTransport: 'http-proxy',
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
  });
});

test('runtime event summaries unwrap NARS session_event envelopes', () => {
  assert.equal(summarizeRuntimeEvent({ event: 'session_events_subscription_started', replay_count: 3 }), '3 replayed event(s)');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), 'hello');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'tool_call', tool_name: 'narada-site.whoami' } }), 'narada-site.whoami');
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
  assert.equal(assistantProjection.kind, 'assistant_message');
  assert.equal(assistantProjection.summary, 'Startup sequence completed.');
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }, { verbosity: 'raw' }), true);
  assert.equal(shouldRenderRuntimeEvent({ event: 'websocket_connected' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'ok' } }), true);
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
  const selectorComponent = await readFile(new URL('../src/app/components/ProjectionVerbositySelect.vue', import.meta.url), 'utf8');
  const composer = await readFile(new URL('../src/app/components/OperatorComposer.vue', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');
  for (const marker of ['class="shell"', '<SessionStatusBar', '<ConversationTranscript', '<OperatorComposer']) {
    assert.equal(shell.includes(marker), true, marker);
  }
  for (const marker of ['id="events"', 'id="projection-verbosity"', 'class="composer"', 'id="operator-input"']) {
    assert.equal([transcript, status, selectorComponent, composer].some((source) => source.includes(marker)), true, marker);
  }
  for (const cssSelector of ['.shell', '.status', '.status select', '.events', '.composer', '.event-tone-assistant', '.event-tone-error']) {
    assert.equal(css.includes(cssSelector), true, cssSelector);
  }
});

test('Vue message content renderer has typed parts, inline code, and lazy Mermaid fallback', async () => {
  const eventRow = await readFile(new URL('../src/app/components/EventRow.vue', import.meta.url), 'utf8');
  const messageContent = await readFile(new URL('../src/app/components/content/MessageContent.vue', import.meta.url), 'utf8');
  const markdownPart = await readFile(new URL('../src/app/components/content/MarkdownTextPart.vue', import.meta.url), 'utf8');
  const mermaidPart = await readFile(new URL('../src/app/components/content/MermaidDiagramPart.vue', import.meta.url), 'utf8');
  const renderedFrame = await readFile(new URL('../src/app/components/content/RenderedPartFrame.vue', import.meta.url), 'utf8');
  const parser = await readFile(new URL('../src/app/lib/messageContent.ts', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/agent-web-ui.css', import.meta.url), 'utf8');

  assert.match(eventRow, /<MessageContent :content="row\.summary"/);
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
  assert.match(renderedFrame, />Code<\/button>/);
  assert.match(renderedFrame, />Render<\/button>/);
  assert.equal(parser.includes('\\n\\s*\\|?\\s*:?-{3,}:?\\s*\\|'), true);
  assert.match(mermaidPart, /import\('mermaid'\)/);
  assert.match(mermaidPart, /nextMermaidInstanceId/);
  assert.match(mermaidPart, /securityLevel: 'strict'/);
  assert.match(mermaidPart, /Mermaid render failed/);
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
    assert.match(index, /"protocolHealthMethod":"session.health"/);
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
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
    operatorInput: true,
    admittedMethods: ['session.events.subscribe', 'conversation.send', 'session.status', 'session.health', 'session.recovery', 'session.operations', 'observers.status', 'observer.mute', 'observer.unmute', 'carrier.command.execute', 'conversation.interrupt', 'conversation.steer', 'session.close'],
  });
});
