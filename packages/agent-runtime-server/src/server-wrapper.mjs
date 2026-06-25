import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { createCarrierRuntimeContext } from '@narada2/carrier-runtime/carrier-runtime-context';
import { createCarrierRuntimeDependencies } from '@narada2/carrier-runtime/runtime-dependencies';
import { runCarrierServerMode } from '@narada2/carrier-runtime/server-mode';
import { createProjectedTerminalBridge } from '@narada2/carrier-terminal-projection/projected-terminal';
import {
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
} from './runtime-server-events.mjs';
import {
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
} from './lifecycle-hooks.mjs';

function websocketAcceptValue(key) {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

function encodeWebSocketTextFrame(payload) {
  const body = Buffer.from(String(payload), 'utf8');
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function decodeWebSocketFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    let payload = buffer.subarray(offset + headerLength + maskLength, frameEnd);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    frames.push({ opcode, text: payload.toString('utf8') });
    offset = frameEnd;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function startEventStreamProjection({ childStdin, eventHub, host, port }) {
  const server = createServer((request, response) => {
    response.writeHead(426, { 'content-type': 'application/json' });
    response.end(`${JSON.stringify({ error: 'upgrade_required', transport: 'websocket', path: '/events' })}\n`);
  });
  server.on('upgrade', (request, socket) => {
    if (request.url?.split('?')[0] !== '/events') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    const key = request.headers['sec-websocket-key'];
    if (!key) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${websocketAcceptValue(String(key))}`,
      '',
      '',
    ].join('\r\n'));
    const send = (payload) => socket.write(encodeWebSocketTextFrame(JSON.stringify(payload)));
    const subscriptions = new Set();
    let pending = Buffer.alloc(0);
    send({ schema: 'narada.nars.websocket.v1', event: 'websocket_connected', transport: 'websocket', cursor: eventHub.cursor() });
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const decoded = decodeWebSocketFrames(pending);
      pending = decoded.rest;
      for (const frame of decoded.frames) {
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode !== 0x1) continue;
        let message;
        try {
          message = JSON.parse(frame.text);
        } catch (error) {
          send({ schema: 'narada.nars.websocket.error.v1', event: 'websocket_error', code: 'invalid_json', message: error instanceof Error ? error.message : String(error) });
          continue;
        }
        if (message.method === 'session.events.subscribe') {
          const params = message.params ?? {};
          const filters = params.filters && typeof params.filters === 'object' ? params.filters : {};
          const subscriptionId = params.subscription_id ?? `sub_${message.id ?? Date.now()}`;
          const subscription = eventHub.subscribe({ subscriptionId, filters, send });
          subscriptions.add(subscription);
          const replay = params.include_replay === false ? [] : eventHub.replayFor({
            sinceSequence: params.since_sequence,
            sinceTimestamp: params.since_timestamp,
            filters,
            maxReplay: params.max_replay ?? 100,
          });
          send({
            schema: 'narada.nars.events.subscription.v1',
            event: 'session_events_subscription_started',
            request_id: message.id ?? null,
            subscription_id: subscriptionId,
            transport: 'websocket',
            replay_count: replay.length,
            cursor: eventHub.cursor(),
            filters,
          });
          for (const event of replay) {
            send({ schema: 'narada.nars.events.envelope.v1', event: 'session_event', subscription_id: subscriptionId, cursor: { sequence: event.event_sequence, next_sequence: event.event_sequence + 1 }, payload: event });
          }
          continue;
        }
        const stdin = typeof childStdin === 'function' ? childStdin() : childStdin;
        if (!stdin?.writable) {
          send({ schema: 'narada.nars.websocket.error.v1', event: 'websocket_error', request_id: message.id ?? null, code: 'child_stdin_unavailable' });
          continue;
        }
        stdin.write(`${JSON.stringify(message)}\n`);
      }
    });
    socket.on('close', () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
      subscriptions.clear();
    });
    socket.on('error', () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
      subscriptions.clear();
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({ server, url: `ws://${host}:${boundPort}/events` });
    });
  });
}

function parseEventStreamOptions(args, env = process.env) {
  const forwardedArgs = [];
  let enabled = env.NARADA_AGENT_RUNTIME_EVENTS_ENABLED !== '0';
  let host = env.NARADA_AGENT_RUNTIME_EVENTS_HOST || '127.0.0.1';
  let port = Number.parseInt(env.NARADA_AGENT_RUNTIME_EVENTS_PORT || '0', 10);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-events') {
      enabled = false;
      continue;
    }
    if (arg === '--event-host') {
      host = args[index + 1] || host;
      index += 1;
      continue;
    }
    if (arg === '--event-port') {
      port = Number.parseInt(args[index + 1] || '0', 10);
      index += 1;
      continue;
    }
    forwardedArgs.push(arg);
  }
  return {
    forwardedArgs,
    events: {
      enabled,
      host,
      port: Number.isFinite(port) && port >= 0 ? port : 0,
    },
  };
}

async function loadRuntimeDependencies(runtimeContext = {}) {
  const runtimeDependencies = createCarrierRuntimeDependencies({ runtimeContext });
  return {
    ...runtimeDependencies,
    createProjectedTerminalBridge,
  };
}

function eventMatchesFilters(event, filters = {}) {
  if (!filters || typeof filters !== 'object') return true;
  const eventKind = event.event ?? event.event_kind ?? null;
  const kinds = Array.isArray(filters.event_kinds) ? filters.event_kinds : Array.isArray(filters.kinds) ? filters.kinds : null;
  if (kinds && !kinds.includes(eventKind)) return false;
  const families = Array.isArray(filters.families) ? filters.families : null;
  if (families?.length) {
    const family = String(eventKind ?? '').startsWith('session_') ? 'session' : 'turn';
    if (!families.includes(family)) return false;
  }
  if (filters.request_id && event.request_id !== filters.request_id) return false;
  if (filters.turn_id && event.turn_id !== filters.turn_id) return false;
  return true;
}

function createEventHub({ maxBuffer = 1000 } = {}) {
  const buffer = [];
  const subscribers = new Map();
  let sequence = 0;
  const replayFor = ({ sinceSequence = null, sinceTimestamp = null, filters = {}, maxReplay = 100 } = {}) => {
    const sinceSeq = sinceSequence == null ? null : Number.parseInt(String(sinceSequence), 10);
    const sinceTime = sinceTimestamp ? Date.parse(String(sinceTimestamp)) : null;
    const replayLimit = Math.max(0, Math.min(Number.parseInt(String(maxReplay), 10) || 0, maxBuffer));
    return buffer.filter((event) => {
      if (Number.isFinite(sinceSeq) && Number(event.event_sequence ?? event.sequence ?? 0) <= sinceSeq) return false;
      if (Number.isFinite(sinceTime)) {
        const eventTime = Date.parse(String(event.timestamp ?? event.generated_at ?? ''));
        if (Number.isFinite(eventTime) && eventTime <= sinceTime) return false;
      }
      return eventMatchesFilters(event, filters);
    }).slice(-replayLimit);
  };
  return {
    publish(event) {
      if (!event || typeof event !== 'object') return null;
      const existingSequence = Number(event.event_sequence ?? event.sequence);
      if (Number.isFinite(existingSequence) && existingSequence > 0) {
        sequence = Math.max(sequence, existingSequence);
      } else {
        sequence += 1;
      }
      const sequencedEvent = {
        event_sequence: Number.isFinite(existingSequence) && existingSequence > 0 ? existingSequence : sequence,
        sequence: Number.isFinite(existingSequence) && existingSequence > 0 ? existingSequence : sequence,
        ...event,
      };
      buffer.push(sequencedEvent);
      while (buffer.length > maxBuffer) buffer.shift();
      for (const [subscriptionId, subscriber] of subscribers.entries()) {
        if (!eventMatchesFilters(sequencedEvent, subscriber.filters)) continue;
        try {
          subscriber.send({
            schema: 'narada.nars.events.envelope.v1',
            event: 'session_event',
            subscription_id: subscriptionId,
            cursor: { sequence: sequencedEvent.event_sequence, next_sequence: sequencedEvent.event_sequence + 1 },
            payload: sequencedEvent,
          });
        } catch {
          subscribers.delete(subscriptionId);
        }
      }
      return sequencedEvent;
    },
    subscribe({ subscriptionId = `sub_${Date.now()}_${subscribers.size + 1}`, filters = {}, send }) {
      subscribers.set(subscriptionId, { filters, send });
      return {
        subscriptionId,
        unsubscribe: () => subscribers.delete(subscriptionId),
      };
    },
    replayFor,
    cursor() {
      return { last_sequence: sequence || null, next_sequence: sequence + 1 };
    },
    subscriberCount() {
      return subscribers.size;
    },
  };
}

function parseHealthOptions(args, env = process.env) {
  const forwardedArgs = [];
  let enabled = env.NARADA_AGENT_RUNTIME_HEALTH_ENABLED !== '0';
  let host = env.NARADA_AGENT_RUNTIME_HEALTH_HOST || '127.0.0.1';
  let port = Number.parseInt(env.NARADA_AGENT_RUNTIME_HEALTH_PORT || '0', 10);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-health') {
      enabled = false;
      continue;
    }
    if (arg === '--health-host') {
      host = args[index + 1] || host;
      index += 1;
      continue;
    }
    if (arg === '--health-port') {
      port = Number.parseInt(args[index + 1] || '0', 10);
      index += 1;
      continue;
    }
    forwardedArgs.push(arg);
  }
  return {
    forwardedArgs,
    health: {
      enabled,
      host,
      port: Number.isFinite(port) && port >= 0 ? port : 0,
    },
  };
}

function carrierRuntimeArgs(forwardedArgs = []) {
  return forwardedArgs.filter((arg) => arg !== '--server');
}

function argValue(args = [], name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return typeof value === 'string' && value.length > 0 && !value.startsWith('--') ? value : null;
}

function authorityModeFromArgs(args = [], env = process.env) {
  const value = argValue(args, '--authority') ?? env.NARADA_AUTHORITY_MODE ?? env.NARADA_DELEGATED_AUTHORITY_MODE ?? null;
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ['read', 'write', 'command', 'mutation', 'mutating'].includes(normalized) ? normalized : null;
}

function delegatedAuthorityRef({ args = [], env = process.env, binding } = {}) {
  const explicit = env.NARADA_AUTHORITY_REF ?? env.NARADA_DELEGATED_AUTHORITY_REF ?? null;
  if (explicit) return explicit;
  const authorityMode = authorityModeFromArgs(args, env);
  if (!authorityMode || authorityMode === 'read') return null;
  const sessionId = binding?.session_id ?? argValue(args, '--session') ?? env.NARADA_CARRIER_SESSION_ID ?? 'unknown-session';
  return `nars-delegated:${authorityMode}:${sessionId}`;
}

function createDelegatedAuthorityHandoff({ args = [], env = process.env, generatedAt = new Date().toISOString() } = {}) {
  const binding = lifecycleBindingFromArgs(args, env);
  const authorityMode = authorityModeFromArgs(args, env);
  return {
    schema: 'narada.nars.delegated_authority_handoff.v1',
    crossing_regime: 'nars_runtime_server_to_carrier_substrate',
    source: {
      package: '@narada2/agent-runtime-server',
      entrypoint: 'narada-agent-runtime-server',
    },
    target: {
      package: '@narada2/carrier-runtime',
      mode: 'in-process',
    },
    generated_at: generatedAt,
    agent_id: binding.agent_id,
    session_id: binding.session_id,
    authority_ref: delegatedAuthorityRef({ args, env, binding }),
    authority_mode: authorityMode,
    evidence: {
      site_root: binding.metadata.site_root ?? null,
      agent_start_event_id: binding.metadata.agent_start_event_id ?? null,
      codex_admission_id: env.NARADA_CODEX_ADMISSION_ID ?? null,
      authority_source: (env.NARADA_AUTHORITY_REF ?? env.NARADA_DELEGATED_AUTHORITY_REF) ? 'env_ref' : authorityMode ? 'argv_authority' : null,
    },
  };
}

function startHealthProjection({ childStdin, host, port, timeoutMs = 2000 }) {
  const pending = new Map();
  let sequence = 0;
  const requestHealth = () => new Promise((resolve, reject) => {
    const stdin = typeof childStdin === 'function' ? childStdin() : childStdin;
    if (!stdin?.writable) {
      reject(new Error('child_stdin_unavailable'));
      return;
    }
    sequence += 1;
    const requestId = `http-health-${Date.now()}-${sequence}`;
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('session_health_timeout'));
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    stdin.write(`${JSON.stringify({ id: requestId, method: 'session.health', params: {} })}\n`);
  });
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url?.split('?')[0] !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ error: 'not_found' })}\n`);
      return;
    }
    try {
      const health = await requestHealth();
      response.writeHead(health.status === 'unhealthy' ? 503 : 200, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify(health)}\n`);
    } catch (error) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ schema: 'narada.nars.health.v1', status: 'unhealthy', error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        url: `http://${host}:${boundPort}/health`,
        observe(event) {
          if (event?.event !== 'session_health' || !pending.has(event.request_id)) return;
          const entry = pending.get(event.request_id);
          pending.delete(event.request_id);
          clearTimeout(entry.timer);
          entry.resolve(event);
        },
        rejectAll(error) {
          for (const [requestId, entry] of pending.entries()) {
            pending.delete(requestId);
            clearTimeout(entry.timer);
            entry.reject(error);
          }
        },
      });
    });
  });
}

function renderWrapperEvents({ event, wrapperEventsJsonl, state }) {
  if (wrapperEventsJsonl) {
    const statusEvent = formatWrapperStatusEvent(event);
    if (statusEvent) console.error(JSON.stringify(statusEvent));
  }
  const summary = formatStartupMcpSummary(event);
  if (summary && !state.startupSummaryPrinted) {
    console.error(summary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatStartupMcpEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.startupSummaryPrinted = true;
  }
  const runtimeFaultSummary = formatRuntimeMcpFaultSummary(event);
  if (runtimeFaultSummary && !state.runtimeFaultSummaries.has(runtimeFaultSummary)) {
    console.error(runtimeFaultSummary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatRuntimeMcpFaultEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.runtimeFaultSummaries.add(runtimeFaultSummary);
  }
  for (const [workflowSummary, wrapperEvent] of [
    [formatSessionWorkflowSummary(event), formatSessionWorkflowEvent(event)],
    [formatSessionOperationsSummary(event), formatSessionOperationsEvent(event)],
    [formatPreflightWorkflowSummary(event), formatPreflightWorkflowEvent(event)],
  ]) {
    if (!workflowSummary || state.workflowSummaries.has(workflowSummary)) continue;
    console.error(workflowSummary);
    if (wrapperEventsJsonl && wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    state.workflowSummaries.add(workflowSummary);
  }
}

async function main() {
  const requestedArgs = process.argv.slice(2);
  const wrapperEventsJsonl = requestedArgs.includes('--wrapper-events-jsonl');
  const rawJsonl = requestedArgs.includes('--raw-jsonl');
  const parsedHealth = parseHealthOptions(requestedArgs.filter((arg) => arg !== '--wrapper-events-jsonl' && arg !== '--raw-jsonl'));
  const parsedEvents = parseEventStreamOptions(parsedHealth.forwardedArgs);
  const args = carrierRuntimeArgs(parsedEvents.forwardedArgs);
  const lifecycleDispatcher = createNarsLifecycleHookDispatcher();
  const lifecycleBinding = lifecycleBindingFromArgs(args, process.env);
  const delegatedAuthorityHandoff = createDelegatedAuthorityHandoff({ args, env: process.env });
  try {
    const result = await dispatchNarsLifecycleHook(lifecycleDispatcher, 'beforeSessionBind', lifecycleBinding);
    for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
  } catch (error) {
    console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  let healthProjection = null;
  let eventStreamProjection = null;
  const eventHub = createEventHub();
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  if (parsedHealth.health.enabled) {
    healthProjection = await startHealthProjection({
      childStdin: () => runtimeInput,
      host: parsedHealth.health.host,
      port: parsedHealth.health.port,
    });
    process.env.NARADA_HEALTH_URL = healthProjection.url;
  }
  if (parsedEvents.events.enabled) {
    eventStreamProjection = await startEventStreamProjection({
      childStdin: () => runtimeInput,
      eventHub,
      host: parsedEvents.events.host,
      port: parsedEvents.events.port,
    });
    process.env.NARADA_EVENT_STREAM_URL = eventStreamProjection.url;
    process.env.NARADA_WEBSOCKET_URL = eventStreamProjection.url;
  }
  process.env.NARADA_NARS_AUTHORITY_HANDOFF = JSON.stringify(delegatedAuthorityHandoff);

  const runtimeContext = createCarrierRuntimeContext({
    identity: lifecycleBinding.agent_id,
    session: lifecycleBinding.session_id,
    siteRoot: process.env.NARADA_SITE_ROOT,
    intelligenceProvider: process.env.NARADA_INTELLIGENCE_PROVIDER,
    narsDelegatedAuthorityHandoff: delegatedAuthorityHandoff,
    providerSettings: {
      model: process.env.NARADA_AI_MODEL ?? process.env.CODEX_MODEL,
      thinking: process.env.NARADA_AI_THINKING,
      stream: process.env.NARADA_AGENT_CLI_STREAM !== '0',
    },
    displaySettings: {
      toolOutputs: process.env.NARADA_AGENT_CLI_TOOL_OUTPUTS !== '0',
    },
    operationHeartbeatDirectiveEnabled: process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_ENABLED === '1',
    operationHeartbeatDirectiveIntervalMs: Number.parseInt(process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INTERVAL_MS ?? '60000', 10),
    operationHeartbeatDirectiveInitialDelayMs: Number.parseInt(process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INITIAL_DELAY_MS ?? '60000', 10),
    healthUrl: process.env.NARADA_HEALTH_URL ?? null,
    eventStreamUrl: process.env.NARADA_EVENT_STREAM_URL ?? null,
  });
  const runtimeDependencies = await loadRuntimeDependencies(runtimeContext);

  const state = {
    startupSummaryPrinted: false,
    runtimeFaultSummaries: new Set(),
    workflowSummaries: new Set(),
  };
  let stdoutBuffer = '';
  let writeProjectedOutput = (text) => process.stdout.write(text);
  let renderProjectedEvent = () => [];

  if (!rawJsonl) {
    const projectedTerminal = runtimeDependencies.createProjectedTerminalBridge({
      input: process.stdin,
      output: process.stdout,
      childStdin: runtimeInput,
    });
    writeProjectedOutput = projectedTerminal.writeProjectedOutput;
    renderProjectedEvent = projectedTerminal.renderEvent;
  } else {
    process.stdin.pipe(runtimeInput);
  }
  runtimeOutput.on('data', (chunk) => {
    const text = String(chunk);
    if (rawJsonl) process.stdout.write(text);
    stdoutBuffer += text;
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        healthProjection?.observe(event);
        eventHub.publish(event);
        dispatchNarsLifecycleHooksForEvent(lifecycleDispatcher, event)
          .then((result) => {
            for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
          })
          .catch((error) => console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
        if (!rawJsonl) {
          for (const rendered of renderProjectedEvent(event)) {
            if (typeof rendered === 'string') {
              writeProjectedOutput(`${rendered}\n`, { preserveCurrentLine: rendered.startsWith('\n') });
            } else if (rendered?.raw) {
              writeProjectedOutput(rendered.raw, { preserveCurrentLine: rendered.raw.startsWith('\n'), prompt: rendered.newline !== false });
              if (rendered.newline) writeProjectedOutput('\n', { preserveCurrentLine: true });
            }
          }
        }
        renderWrapperEvents({ event, wrapperEventsJsonl, state });
      } catch {}
    }
  });

  try {
    await runCarrierServerMode({
      input: runtimeInput,
      output: runtimeOutput,
      callChatApiFn: runtimeDependencies.callChatApiFn,
      runtimeContext,
      dependencies: runtimeDependencies.dependencies,
    });
    healthProjection?.rejectAll(new Error('carrier_closed'));
    healthProjection?.server.close();
    eventStreamProjection?.server.close();
    process.exit(0);
  } catch (error) {
    healthProjection?.rejectAll(error);
    healthProjection?.server.close();
    eventStreamProjection?.server.close();
    console.error(`[agent-runtime-server] carrier runtime failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export {
  parseHealthOptions,
  parseEventStreamOptions,
  carrierRuntimeArgs,
  loadRuntimeDependencies,
  createDelegatedAuthorityHandoff,
  createEventHub,
  startHealthProjection,
  startEventStreamProjection,
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
  main,
};
