import { createHash, randomBytes } from 'node:crypto';
import { Socket } from 'node:net';

type JsonRecord = Record<string, unknown>;
type ProjectionInputMethod = 'conversation.send' | 'conversation.enqueue' | 'conversation.steer' | 'conversation.interrupt';
type ProjectionInputBuildArgs = {
  session_id: string;
  site_id: string | null;
  projection_id: string;
  input_id: string;
  method: string;
  payload: Record<string, unknown>;
  authority_epoch?: number | null;
  authority_runtime_id?: string | null;
};

const INPUT_EVENT_SCHEMA = 'narada.carrier.input_event.v1';
const MAX_INLINE_CONTENT = 20_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export async function deliverProjectionInputToNars(args: {
  event_endpoint: string;
  session_id: string;
  site_id: string | null;
  projection_id: string;
  input_id: string;
  method: string;
  payload: Record<string, unknown>;
  authority_epoch?: number | null;
  authority_runtime_id?: string | null;
  timeout_ms?: number;
}) {
  const method = projectionInputMethod(args.method);
  if (method === 'conversation.interrupt') {
    const identity = projectionInputIdentity(args);
    const { inputKey, inputEventId, directiveId, requestId, inputId } = identity;
    return deliverProjectionInterruptToNars(args, { inputKey, inputEventId, directiveId, requestId, inputId });
  }
  const built = buildProjectionInputForNars(args);
  const { inputKey, inputEventId, directiveId, requestId, inputId, delivery, input } = built;
  const response = await requestWebSocket(args.event_endpoint, {
    id: requestId,
    method: 'carrier.input.deliver',
    params: { input, delivery_constructor: delivery },
  }, {
    timeout_ms: args.timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS,
    wait_for: (message) => inputDeliveryResponse(message, requestId),
  });
  if (isErrorMessage(response)) {
    throw new Error(`nars_projection_input_refused:${String(response.code ?? response.message ?? 'unknown')}`);
  }
  const event = eventNameOf(response);
  return {
    schema: 'narada.cloudflare_nars_projection.input_admission.v1',
    status: 'admitted' as const,
    admission: event === 'input_event_queued' ? 'queued' : 'accepted',
    session_id: args.session_id,
    site_id: args.site_id,
    request_id: requestId,
    input_event_id: inputEventId,
    directive_id: directiveId,
    delivery,
    protocol_method: 'carrier.input.deliver',
    evidence: { event, request_id: requestId, input_id: inputId, idempotency_key: inputKey },
  };
}

export function buildProjectionInputForNars(args: ProjectionInputBuildArgs) {
  const identity = projectionInputIdentity(args);
  const method = projectionInputMethod(args.method);
  if (method === 'conversation.interrupt') throw new Error('cloudflare_projection_interrupt_is_not_input_event');
  const delivery = deliveryForMethod(method);
  const content = inputContent(args.payload);
  const input = {
    schema: INPUT_EVENT_SCHEMA,
    event_id: identity.inputEventId,
    idempotency_key: identity.inputKey,
    source_kind: 'operator',
    source_id: `cloudflare-projection:${args.projection_id}`,
    source: delivery === 'steer' ? 'operator_steering' : 'operator_control',
    transport: 'carrier_server_api',
    delivery_mode: delivery === 'send' ? 'admit_for_current_turn' : 'admit_after_active_turn',
    hold_condition: null,
    content,
    created_at: new Date().toISOString(),
    authority_ref: `cloudflare-projection:${args.site_id ?? 'site'}:${args.session_id}:${args.authority_epoch ?? 'unknown'}`,
    directive_id: identity.directiveId,
    metadata: {
      input_source: 'cloudflare_projection',
      directive_provenance: {
        kind: 'explicit_operator_directive_surface',
        surface_id: 'cloudflare-nars-projection',
      },
      nars_session_input: {
        delivery_constructor: delivery,
        idempotency_key: identity.inputKey,
        target_session_id: args.session_id,
        target_site_id: args.site_id,
        authority_epoch: args.authority_epoch ?? null,
        authority_runtime_id: args.authority_runtime_id ?? null,
        caller_carrier_session_id: null,
      },
      cloudflare_projection_input: {
        input_id: identity.inputId,
        idempotency_key: identity.inputKey,
        method,
        projection_id: args.projection_id,
      },
    },
  };
  return { ...identity, method, delivery, input };
}

function projectionInputIdentity(args: Pick<ProjectionInputBuildArgs, 'input_id' | 'payload' | 'projection_id'>) {
  const payloadIdempotencyKey = typeof args.payload.idempotency_key === 'string' && args.payload.idempotency_key.trim()
    ? args.payload.idempotency_key.trim()
    : null;
  const inputId = args.input_id.trim();
  if (!inputId) throw new Error('cloudflare_projection_input_id_required');
  const inputKey = payloadIdempotencyKey ?? inputId;
  const digest = createHash('sha256').update(`${args.projection_id}:${inputKey}`).digest('hex').slice(0, 32);
  return {
    inputId,
    inputKey,
    inputEventId: `input_cloudflare_${digest}`,
    directiveId: `dir_cloudflare_projection_${digest}`,
    requestId: `cloudflare_projection_input_${digest}`,
  };
}

function interruptResponse(message: JsonRecord, requestId: string): boolean {
  if (messageRequestId(message) !== requestId) return false;
  return ['session_cancel', 'error', 'websocket_error'].includes(eventNameOf(message));
}

function projectionInputMethod(method: string): ProjectionInputMethod {
  if (method === 'conversation.send' || method === 'conversation.enqueue' || method === 'conversation.steer' || method === 'conversation.interrupt') return method;
  throw new Error(`cloudflare_projection_input_method_unsupported:${method}`);
}

function deliveryForMethod(method: Exclude<ProjectionInputMethod, 'conversation.interrupt'>): 'send' | 'enqueue' | 'steer' {
  if (method === 'conversation.send') return 'send';
  if (method === 'conversation.enqueue') return 'enqueue';
  return 'steer';
}

async function deliverProjectionInterruptToNars(args: {
  event_endpoint: string;
  session_id: string;
  site_id: string | null;
  projection_id: string;
  payload: Record<string, unknown>;
  timeout_ms?: number;
}, identity: { inputId: string; inputKey: string; inputEventId: string; directiveId: string; requestId: string }) {
  const response = await requestWebSocket(args.event_endpoint, {
    id: identity.requestId,
    method: 'session.cancel',
    params: {
      reason: typeof args.payload.reason === 'string' && args.payload.reason.trim()
        ? args.payload.reason.trim()
        : typeof args.payload.message === 'string' && args.payload.message.trim()
          ? args.payload.message.trim()
          : 'operator_interrupt',
    },
  }, {
    timeout_ms: args.timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS,
    wait_for: (message) => interruptResponse(message, identity.requestId),
  });
  if (isErrorMessage(response)) {
    throw new Error(`nars_projection_input_refused:${String(response.code ?? response.message ?? 'unknown')}`);
  }
  const event = eventNameOf(response);
  return {
    schema: 'narada.cloudflare_nars_projection.input_admission.v1',
    status: 'admitted' as const,
    admission: 'accepted' as const,
    session_id: args.session_id,
    site_id: args.site_id,
    request_id: identity.requestId,
    input_event_id: identity.inputEventId,
    directive_id: identity.directiveId,
    delivery: 'interrupt' as const,
    protocol_method: 'session.cancel',
    evidence: { event, request_id: identity.requestId, input_id: identity.inputId, idempotency_key: identity.inputKey },
  };
}

function inputContent(payload: Record<string, unknown>): string {
  const content = typeof payload.message === 'string' ? payload.message : payload.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('cloudflare_projection_input_content_required');
  if (content.length > MAX_INLINE_CONTENT) throw new Error(`cloudflare_projection_input_content_too_large:${MAX_INLINE_CONTENT}`);
  return content;
}

function inputDeliveryResponse(message: JsonRecord, requestId: string): boolean {
  if (messageRequestId(message) !== requestId) return false;
  return [
    'input_event_accepted',
    'input_event_queued',
    'input_event_started',
    'input_completed',
    'input_event_completed',
    'user_message',
    'turn_started',
    'error',
    'websocket_error',
  ].includes(eventNameOf(message));
}

async function requestWebSocket(endpoint: string, request: JsonRecord, args: {
  timeout_ms: number;
  wait_for: (message: JsonRecord) => boolean;
}): Promise<JsonRecord> {
  const url = new URL(endpoint);
  if (url.protocol !== 'ws:') throw new Error(`nars_projection_websocket_protocol_unsupported:${url.protocol}`);
  const port = Number(url.port || 80);
  const path = `${url.pathname || '/'}${url.search || ''}`;
  const key = randomBytes(16).toString('base64');
  const expectedAccept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  const handshake = [
    `GET ${path} HTTP/1.1`,
    `Host: ${url.hostname}:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');

  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;
    let handshake_complete = false;
    let request_sent = false;
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let timer: ReturnType<typeof setTimeout>;
    const subscriptionRequestId = `${String(request.id)}_events`;
    const settle = (error: Error | null, value: JsonRecord | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value ?? {});
    };
    timer = setTimeout(() => settle(new Error(`nars_projection_input_timeout:${String(request.id)}`)), args.timeout_ms);
    socket.once('error', (error) => settle(new Error(`nars_projection_websocket_failed:${error.message}`)));
    socket.once('close', () => {
      if (!settled) settle(new Error('nars_projection_websocket_closed_before_response'));
    });
    socket.connect(port, url.hostname, () => socket.write(handshake));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshake_complete) {
        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd < 0) return;
        const header = buffer.subarray(0, headerEnd).toString('utf8');
        if (!/^HTTP\/1\.1 101\b/.test(header)) return settle(new Error(`nars_projection_websocket_handshake_failed:${header.split(/\r?\n/)[0] ?? 'unknown'}`));
        if (!header.toLowerCase().includes(`sec-websocket-accept: ${expectedAccept.toLowerCase()}`)) return settle(new Error('nars_projection_websocket_accept_mismatch'));
        buffer = buffer.subarray(headerEnd + 4);
        handshake_complete = true;
        socket.write(encodeClientFrame(JSON.stringify({
          id: subscriptionRequestId,
          method: 'session.events.subscribe',
          params: {
            subscription_id: `cloudflare_projection_${String(request.id)}`,
            filters: { request_id: request.id },
            include_replay: false,
            max_replay: 0,
          },
        })));
      }
      for (const frame of decodeServerFrames(buffer)) {
        buffer = frame.rest;
        if (frame.opcode === 0x9) {
          socket.write(encodeClientFrame(frame.payload, 0xA));
          continue;
        }
        if (frame.opcode === 0x8) return settle(new Error('nars_projection_websocket_closed_before_response'));
        if (frame.opcode !== 0x1) continue;
        let message: JsonRecord;
        try { message = asRecord(JSON.parse(frame.payload)); } catch { continue; }
        if (eventNameOf(message) === 'websocket_connected') continue;
        if (eventNameOf(message) === 'session_events_subscription_started' && message.request_id === subscriptionRequestId && !request_sent) {
          request_sent = true;
          socket.write(encodeClientFrame(JSON.stringify(request)));
          continue;
        }
        if (args.wait_for(message)) settle(null, message);
      }
    });
  });
}

function decodeServerFrames(input: Buffer): Array<{ opcode: number; payload: string; rest: Buffer }> {
  const frames: Array<{ opcode: number; payload: string; rest: Buffer }> = [];
  let buffer = input;
  while (buffer.length >= 2) {
    const first = buffer[0];
    const second = buffer[1];
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) break;
      length = buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buffer.length < 10) break;
      const longLength = Number(buffer.readBigUInt64BE(2));
      if (!Number.isSafeInteger(longLength) || longLength > 4 * 1024 * 1024) throw new Error('nars_projection_websocket_frame_too_large');
      length = longLength;
      offset = 10;
    }
    const masked = (second & 0x80) !== 0;
    const maskOffset = masked ? 4 : 0;
    if (buffer.length < offset + maskOffset + length) break;
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    const payloadOffset = offset + maskOffset;
    const payloadBuffer = Buffer.from(buffer.subarray(payloadOffset, payloadOffset + length));
    if (mask) for (let index = 0; index < payloadBuffer.length; index += 1) payloadBuffer[index] ^= mask[index % 4];
    buffer = buffer.subarray(payloadOffset + length);
    frames.push({ opcode: first & 0x0f, payload: payloadBuffer.toString('utf8'), rest: buffer });
  }
  return frames;
}

function encodeClientFrame(text: string, opcode = 0x1): Buffer {
  const body = Buffer.from(text, 'utf8');
  const mask = randomBytes(4);
  let header: Buffer;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) masked[index] = body[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function eventNameOf(message: JsonRecord): string {
  if (message.event === 'session_event') {
    const payload = asRecord(message.payload);
    if (payload.event || payload.event_kind || payload.type) return eventNameOf(payload);
  }
  return String(message.event ?? message.event_kind ?? message.type ?? '');
}

function messageRequestId(message: JsonRecord): unknown {
  return message.request_id ?? asRecord(message.payload).request_id;
}

function isErrorMessage(message: JsonRecord): boolean {
  return eventNameOf(message) === 'error' || eventNameOf(message) === 'websocket_error' || typeof message.error === 'object';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
