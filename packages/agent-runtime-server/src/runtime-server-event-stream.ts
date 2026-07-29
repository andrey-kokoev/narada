import { createServer } from 'node:http';
import { normalizeInputEvent } from '@narada2/carrier-protocol';
import {
  NARS_SESSION_EVENT_DEFAULT_VIEW,
  normalizeNarsSessionEventView,
  readNarsEventLogPage,
} from '@narada2/nars-session-core/event-log';
import { isNarsSessionCoreMethod } from '@narada2/nars-session-core/session-control-contract';
import { decodeWebSocketFrames, encodeWebSocketPongFrame, encodeWebSocketTextFrame, websocketAcceptValue } from './runtime-server-websocket.js';
import { isNarsRuntimeServerMethod } from './runtime-control-contract.js';
import { parseEndpointOptions } from './runtime-server-options.js';

let eventStreamConnectionSequence: any = 0;

export function translateCarrierInputDelivery(message: any) {
  if (message?.method !== 'carrier.input.deliver') return { ok: true, request: message };
  const rawInput: any = message?.params?.input;
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, code: 'invalid_carrier_input', message: 'carrier.input.deliver requires params.input.' };
  }
  try {
    const input: any = normalizeInputEvent(rawInput);
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

function resolveEventStreamParams(params: any = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { ok: false, code: 'invalid_session_event_params' };
  }
  const requestedView: any = params.view ?? NARS_SESSION_EVENT_DEFAULT_VIEW;
  const view: any = normalizeNarsSessionEventView(requestedView);
  if (!view) return { ok: false, code: 'invalid_session_event_view', view: requestedView };
  for (const field of ['page_size', 'max_replay', 'limit']) {
    if (params[field] === undefined) continue;
    const value: any = Number(params[field]);
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
  const pageSize: any = Number(params.page_size ?? params.max_replay ?? params.limit ?? 100);
  const filters: any = params.filters === undefined ? { view } : { ...params.filters, view };
  return { ok: true, view, pageSize, filters };
}

function streamCursor({ replayPage, eventHub, eventsPath }: any) {
  if (replayPage?.cursor) return { namespace: 'durable', ...replayPage.cursor };
  if (!eventsPath) return { namespace: 'live', ...eventHub.cursor() };
  return { namespace: 'durable', last_sequence: null, next_sequence: 1 };
}

function liveSubscriptionPayload(payload: any, { subscriptionId, eventsPath }: any) {
  if (!eventsPath || payload?.event !== 'session_event') {
    return { ...payload, subscription_id: subscriptionId };
  }
  const event: any = payload?.payload;
  const durableSequence: any = Number(event?.durable_event_sequence);
  if (Number.isFinite(durableSequence)) {
    const durableEvent: any = { ...event };
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
  const liveEvent: any = { ...event };
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

function websocketError(send: any, { requestId, code, message, view, method }: any = {}) {
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

function unsubscribeAll(subscriptions: any) {
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
}: any) {
  const params: any = message.params === undefined ? {} : message.params;
  const streamParams: any = resolveEventStreamParams(params);
  if (!streamParams.ok) return streamParams;
  const { filters, view, pageSize }: any = streamParams;
  const subscriptionId: any = String(params.subscription_id ?? `sub_${connectionId}_${nextSubscriptionId()}`);
  const existing: any = subscriptions.get(subscriptionId);
  if (existing) {
    existing.unsubscribe();
    subscriptions.delete(subscriptionId);
  }
  const hubSubscriptionId: any = `${connectionId}:${subscriptionId}`;
  const subscription: any = eventHub.subscribe({
    subscriptionId: hubSubscriptionId,
    filters,
    send: (payload: any) => {
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
  const replayPage: any = params.include_replay === false || !eventsPath ? null : readNarsEventLogPage({
    eventsPath,
    afterSequence: params.since_sequence,
    sinceTimestamp: params.since_timestamp,
    filters,
    view,
    limit: pageSize,
    direction: params.since_sequence != null || params.since_timestamp ? 'forward' : 'backward',
  });
  const replay: any = params.include_replay === false
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
    const sequence: any = Number(event.event_sequence ?? event.sequence);
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

function readEventStreamPage({ eventsPath, message }: any) {
  const params: any = message.params === undefined ? {} : message.params;
  const streamParams: any = resolveEventStreamParams(params);
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

export function startEventStreamProjection({ childStdin, eventHub, host, port, eventsPath = null }: any) {
  const server: any = createServer((request: any, response: any) => {
    response.writeHead(426, { 'content-type': 'application/json' });
    response.end(`${JSON.stringify({ error: 'upgrade_required', transport: 'websocket', path: '/events' })}\n`);
  });
  const sockets: any = new Set();
  const subscribeRequests: any = [];
  const readRequests: any = [];
  const replayBatches: any = [];
  server.on('upgrade', (request: any, socket: any) => {
    if (request.url?.split('?')[0] !== '/events') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    const key: any = request.headers['sec-websocket-key'];
    if (!key) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const connectionId: any = `ws_${++eventStreamConnectionSequence}`;
    sockets.add(socket);
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${websocketAcceptValue(String(key))}`,
      '',
      '',
    ].join('\r\n'));
    const send: any = (payload: any) => socket.write(encodeWebSocketTextFrame(JSON.stringify(payload)));
    const subscriptions: any = new Map();
    let nextSubscriptionId: any = 0;
    let pending: any = Buffer.alloc(0);
    send({
      schema: 'narada.nars.websocket.v1',
      event: 'websocket_connected',
      transport: 'websocket',
      cursor: eventsPath
        ? { namespace: 'durable', last_sequence: null, next_sequence: 1 }
        : { namespace: 'live', ...eventHub.cursor() },
    });
    socket.on('data', (chunk: any) => {
      pending = Buffer.concat([pending, chunk]);
      const decoded: any = decodeWebSocketFrames(pending);
      pending = decoded.rest;
      for (const frame of decoded.frames) {
        if (frame.opcode === 0x9) {
          socket.write(encodeWebSocketPongFrame(frame.payload));
          continue;
        }
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode !== 0x1) continue;
        let message: any;
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
          const result: any = subscribeToEventStream({
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
          const result: any = readEventStreamPage({ eventsPath, message });
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
        const translated: any = translateCarrierInputDelivery(message);
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
        const request: any = translated.request;
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
        const stdin: any = typeof childStdin === 'function' ? childStdin() : childStdin;
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
  return new Promise((resolve: any, reject: any) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address: any = server.address();
      const boundPort: any = typeof address === 'object' && address ? address.port : port;
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

export function parseEventStreamOptions(args: any, env: any = process.env): any {
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

