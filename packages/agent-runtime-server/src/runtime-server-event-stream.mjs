import { createServer } from 'node:http';
import { normalizeInputEvent } from '@narada2/carrier-protocol';
import {
  NARS_SESSION_EVENT_DEFAULT_VIEW,
  normalizeNarsSessionEventView,
  readNarsEventLogPage,
} from '@narada2/nars-session-core/event-log';
import { isNarsSessionCoreMethod } from '@narada2/nars-session-core/session-control-contract';
import { decodeWebSocketFrames, encodeWebSocketTextFrame, websocketAcceptValue } from './runtime-server-websocket.mjs';
import { isNarsRuntimeServerMethod } from './runtime-control-contract.mjs';
import { parseEndpointOptions } from './runtime-server-options.mjs';

let eventStreamConnectionSequence = 0;

export function translateCarrierInputDelivery(message) {
  if (message?.method !== 'carrier.input.deliver') return { ok: true, request: message };
  const rawInput = message?.params?.input;
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, code: 'invalid_carrier_input', message: 'carrier.input.deliver requires params.input.' };
  }
  try {
    const input = normalizeInputEvent(rawInput);
    return {
      ok: true,
      request: {
        ...message,
        method: 'session.submit',
        content: input.content,
        request_id: message.id ?? message.request_id ?? null,
        event_id: input.event_id,
        source_kind: input.source_kind,
        source_id: input.source_id,
        transport: input.transport,
        delivery_mode: input.delivery_mode,
        hold_condition: input.hold_condition,
        authority_ref: input.authority_ref,
        directive_id: input.directive_id,
        idempotency_key: input.idempotency_key ?? null,
        metadata: input.metadata,
        carrier_input_method: 'carrier.input.deliver',
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: 'invalid_carrier_input',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveEventStreamParams(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { ok: false, code: 'invalid_session_event_params' };
  }
  const requestedView = params.view ?? NARS_SESSION_EVENT_DEFAULT_VIEW;
  const view = normalizeNarsSessionEventView(requestedView);
  if (!view) return { ok: false, code: 'invalid_session_event_view', view: requestedView };
  for (const field of ['page_size', 'max_replay', 'limit']) {
    if (params[field] === undefined) continue;
    const value = Number(params[field]);
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, code: 'invalid_session_event_page_size' };
    }
  }
  if (params.filters !== undefined && (!params.filters || typeof params.filters !== 'object' || Array.isArray(params.filters))) {
    return { ok: false, code: 'invalid_session_event_filters' };
  }
  if (params.include_replay !== undefined && typeof params.include_replay !== 'boolean') {
    return { ok: false, code: 'invalid_session_event_include_replay' };
  }
  if (params.subscription_id !== undefined
    && (typeof params.subscription_id !== 'string' || !params.subscription_id.trim())) {
    return { ok: false, code: 'invalid_session_event_subscription_id' };
  }
  const pageSize = Number(params.page_size ?? params.max_replay ?? params.limit ?? 100);
  const filters = params.filters === undefined ? { view } : { ...params.filters, view };
  return { ok: true, view, pageSize, filters };
}

function streamCursor({ replayPage, eventHub, eventsPath }) {
  if (replayPage?.cursor) return { namespace: 'durable', ...replayPage.cursor };
  if (!eventsPath) return { namespace: 'live', ...eventHub.cursor() };
  return { namespace: 'durable', last_sequence: null, next_sequence: 1 };
}

function liveSubscriptionPayload(payload, { subscriptionId, eventsPath }) {
  if (!eventsPath || payload?.event !== 'session_event') {
    return { ...payload, subscription_id: subscriptionId };
  }
  const event = payload?.payload;
  const durableSequence = Number(event?.durable_event_sequence);
  if (Number.isFinite(durableSequence)) {
    const durableEvent = { ...event };
    delete durableEvent.durable_event_sequence;
    durableEvent.event_sequence = durableSequence;
    durableEvent.sequence = durableSequence;
    return {
      ...payload,
      subscription_id: subscriptionId,
      cursor: {
        namespace: 'durable',
        sequence: durableSequence,
        next_sequence: durableSequence + 1,
      },
      payload: durableEvent,
    };
  }
  const liveEvent = { ...event };
  delete liveEvent.durable_event_sequence;
  delete liveEvent.event_sequence;
  delete liveEvent.sequence;
  return {
    ...payload,
    subscription_id: subscriptionId,
    cursor: {
      namespace: 'live',
      sequence: null,
      next_sequence: null,
      live_sequence: payload?.cursor?.sequence ?? null,
    },
    payload: liveEvent,
  };
}

function websocketError(send, { requestId, code, message, view, method } = {}) {
  send({
    schema: 'narada.nars.websocket.error.v1',
    event: 'websocket_error',
    ...(requestId === undefined ? {} : { request_id: requestId }),
    code,
    ...(message === undefined ? {} : { message }),
    ...(view === undefined ? {} : { view }),
    ...(method === undefined ? {} : { method }),
  });
}

function unsubscribeAll(subscriptions) {
  for (const subscription of subscriptions.values()) subscription.unsubscribe();
  subscriptions.clear();
}

function subscribeToEventStream({
  eventHub,
  subscriptions,
  send,
  message,
  eventsPath,
  connectionId,
  nextSubscriptionId,
}) {
  const params = message.params === undefined ? {} : message.params;
  const streamParams = resolveEventStreamParams(params);
  if (!streamParams.ok) return streamParams;
  const { filters, view, pageSize } = streamParams;
  const subscriptionId = String(params.subscription_id ?? `sub_${connectionId}_${nextSubscriptionId()}`);
  const existing = subscriptions.get(subscriptionId);
  if (existing) {
    existing.unsubscribe();
    subscriptions.delete(subscriptionId);
  }
  const hubSubscriptionId = `${connectionId}:${subscriptionId}`;
  const subscription = eventHub.subscribe({
    subscriptionId: hubSubscriptionId,
    filters,
    send: (payload) => {
      if (payload?.subscription_id !== hubSubscriptionId) {
        send(payload);
        return;
      }
      send(liveSubscriptionPayload(payload, { subscriptionId, eventsPath }));
    },
  });
  subscriptions.set(subscriptionId, subscription);
  if (params.include_replay === false) subscription.markLive({ source: 'subscription_without_replay' });
  else subscription.beginReplay({ source: eventsPath ? 'event_log' : 'memory_event_hub' });
  const replayPage = params.include_replay === false || !eventsPath ? null : readNarsEventLogPage({
    eventsPath,
    afterSequence: params.since_sequence,
    sinceTimestamp: params.since_timestamp,
    filters,
    view,
    limit: pageSize,
    direction: params.since_sequence != null || params.since_timestamp ? 'forward' : 'backward',
  });
  const replay = params.include_replay === false
    ? []
    : replayPage ? replayPage.events : eventHub.replayFor({
      sinceSequence: params.since_sequence,
      sinceTimestamp: params.since_timestamp,
      filters,
      maxReplay: pageSize,
    });
  send({
    schema: 'narada.nars.events.subscription.v1',
    event: 'session_events_subscription_started',
    request_id: message.id ?? null,
    subscription_id: subscriptionId,
    transport: 'websocket',
    view,
    page_size: replayPage?.limit ?? pageSize,
    replay_count: replay.length,
    event_count: replayPage?.event_count ?? replay.length,
    has_more: replayPage?.has_more ?? false,
    replay_source: replayPage ? replayPage.source : 'memory_event_hub',
    cursor: streamCursor({ replayPage, eventHub, eventsPath }),
    filters,
  });
  for (const event of replay) {
    const sequence = Number(event.event_sequence ?? event.sequence);
    send({
      schema: 'narada.nars.events.envelope.v1',
      event: 'session_event',
      subscription_id: subscriptionId,
      cursor: {
        namespace: 'durable',
        sequence,
        next_sequence: Number.isFinite(sequence) ? sequence + 1 : null,
      },
      payload: event,
    });
  }
  if (subscription.state === 'replaying') {
    subscription.markLive({
      source: 'replay_complete',
      replay_last_sequence: replayPage?.last_sequence ?? replay.at(-1)?.event_sequence ?? replay.at(-1)?.sequence ?? null,
      ...(eventsPath ? { replay_sequence_field: 'durable_event_sequence' } : {}),
    });
  }
  send({
    schema: 'narada.nars.events.subscription.v1',
    event: 'session_events_replay_completed',
    request_id: message.id ?? null,
    subscription_id: subscriptionId,
    transport: 'websocket',
    view,
    replay_count: replay.length,
    has_more: replayPage?.has_more ?? false,
    cursor: streamCursor({ replayPage, eventHub, eventsPath }),
  });
  return { ok: true, replayEvents: replay };
}

function readEventStreamPage({ eventsPath, message }) {
  const params = message.params === undefined ? {} : message.params;
  const streamParams = resolveEventStreamParams(params);
  if (!streamParams.ok) return streamParams;
  return {
    ok: true,
    streamParams,
    page: readNarsEventLogPage({
      eventsPath,
      afterSequence: params.after_sequence ?? params.since_sequence,
      beforeSequence: params.before_sequence,
      sinceTimestamp: params.since_timestamp,
      filters: streamParams.filters,
      view: streamParams.view,
      limit: params.limit ?? streamParams.pageSize,
      direction: params.direction,
    }),
  };
}

export function startEventStreamProjection({ childStdin, eventHub, host, port, eventsPath = null }) {
  const server = createServer((request, response) => {
    response.writeHead(426, { 'content-type': 'application/json' });
    response.end(`${JSON.stringify({ error: 'upgrade_required', transport: 'websocket', path: '/events' })}\n`);
  });
  const sockets = new Set();
  const subscribeRequests = [];
  const readRequests = [];
  const replayBatches = [];
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
    const connectionId = `ws_${++eventStreamConnectionSequence}`;
    sockets.add(socket);
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${websocketAcceptValue(String(key))}`,
      '',
      '',
    ].join('\r\n'));
    const send = (payload) => socket.write(encodeWebSocketTextFrame(JSON.stringify(payload)));
    const subscriptions = new Map();
    let nextSubscriptionId = 0;
    let pending = Buffer.alloc(0);
    send({
      schema: 'narada.nars.websocket.v1',
      event: 'websocket_connected',
      transport: 'websocket',
      cursor: eventsPath
        ? { namespace: 'durable', last_sequence: null, next_sequence: 1 }
        : { namespace: 'live', ...eventHub.cursor() },
    });
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
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
          websocketError(send, { code: 'invalid_websocket_request', message: 'WebSocket request must be a JSON object.' });
          continue;
        }
        if (message.method === 'session.events.subscribe') {
          subscribeRequests.push(message);
          const result = subscribeToEventStream({
            eventHub,
            subscriptions,
            send,
            message,
            eventsPath,
            connectionId,
            nextSubscriptionId: () => ++nextSubscriptionId,
          });
          if (result.ok) replayBatches.push({ request: message, events: result.replayEvents ?? [] });
          if (!result.ok) websocketError(send, { requestId: message.id ?? null, code: result.code, view: result.view });
          continue;
        }
        if (message.method === 'session.events.read') {
          readRequests.push(message);
          const result = readEventStreamPage({ eventsPath, message });
          if (!result.ok) {
            websocketError(send, { requestId: message.id ?? null, code: result.code, view: result.view });
            continue;
          }
          send({
            ...result.page,
            event: 'session_events_read',
            request_id: message.id ?? null,
            transport: 'websocket',
            cursor: result.page.cursor ? { namespace: 'durable', ...result.page.cursor } : result.page.cursor,
          });
          continue;
        }
        const translated = translateCarrierInputDelivery(message);
        if (!translated.ok) {
          send({
            schema: 'narada.nars.websocket.error.v1',
            event: 'websocket_error',
            request_id: message.id ?? null,
            code: translated.code,
            message: translated.message,
          });
          continue;
        }
        const request = translated.request;
        if (!isNarsSessionCoreMethod(request.method) && !isNarsRuntimeServerMethod(request.method)) {
          send({
            schema: 'narada.nars.websocket.error.v1',
            event: 'websocket_error',
            request_id: message.id ?? null,
            code: 'unsupported_session_control',
            method: request.method ?? null,
          });
          continue;
        }
        const stdin = typeof childStdin === 'function' ? childStdin() : childStdin;
        if (!stdin?.writable) {
          send({ schema: 'narada.nars.websocket.error.v1', event: 'websocket_error', request_id: message.id ?? null, code: 'child_stdin_unavailable' });
          continue;
        }
        stdin.write(`${JSON.stringify(request)}\n`);
      }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      unsubscribeAll(subscriptions);
    });
    socket.on('error', () => {
      sockets.delete(socket);
      unsubscribeAll(subscriptions);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        url: `ws://${host}:${boundPort}/events`,
        subscribeRequests,
        readRequests,
        replayBatches,
        closeConnections() {
          for (const socket of sockets) socket.destroy();
        },
      });
    });
  });
}

export function parseEventStreamOptions(args, env = process.env) {
  return parseEndpointOptions(args, env, {
    disableFlag: '--no-events',
    hostFlag: '--event-host',
    portFlag: '--event-port',
    enabledEnv: 'NARADA_AGENT_RUNTIME_EVENTS_ENABLED',
    hostEnv: 'NARADA_AGENT_RUNTIME_EVENTS_HOST',
    portEnv: 'NARADA_AGENT_RUNTIME_EVENTS_PORT',
    resultKey: 'events',
  });
}

