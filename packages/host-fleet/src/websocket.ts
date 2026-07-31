import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { HostKey, HostRecord } from './contract.js';

export interface HostFleetWebSocketRelayOptions {
  record: HostRecord;
  host: HostKey;
  session_id: string;
  credential: string;
  client: Duplex;
  request: IncomingMessage;
  head: Buffer;
  timeout_ms?: number;
  on_refusal?: (status: number, reason: string) => void;
}

function header(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? null : null;
}

function admittedWebSocketPath(record: HostRecord, sessionId: string): string {
  const path = `/sessions/${encodeURIComponent(sessionId)}/events`;
  const admitted = record.gateway.admitted_paths.some((candidate) => candidate.endsWith('/*')
    ? path.startsWith(candidate.slice(0, -1))
    : path === candidate);
  if (!admitted) throw new Error(`host_gateway_path_not_admitted:${path}`);
  return path;
}

function refuse(client: Duplex, status: number, reason: string, onRefusal?: (status: number, reason: string) => void): void {
  onRefusal?.(status, reason);
  if (client.destroyed) return;
  const phrase = status === 400 ? 'Bad Request' : status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : 'Bad Gateway';
  const body = JSON.stringify({ schema: 'narada.host_fleet.refusal.v1', status: 'refused', reason });
  client.write(`HTTP/1.1 ${status} ${phrase}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  client.destroy();
}

/** Relay one already-resolved session through the server-side host gateway. */
export function relayHostGatewayWebSocket(options: HostFleetWebSocketRelayOptions): void {
  const timeoutMs = options.timeout_ms ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    refuse(options.client, 400, 'host_gateway_websocket_timeout_invalid', options.on_refusal);
    return;
  }
  const key = header(options.request, 'sec-websocket-key');
  if (!key || header(options.request, 'upgrade')?.toLowerCase() !== 'websocket') {
    refuse(options.client, 400, 'host_gateway_websocket_handshake_invalid', options.on_refusal);
    return;
  }
  let path: string;
  let target: URL;
  try {
    path = admittedWebSocketPath(options.record, options.session_id);
    target = new URL(path, `${options.record.gateway.endpoint}/`);
  } catch (error) {
    refuse(options.client, 404, error instanceof Error ? error.message : String(error), options.on_refusal);
    return;
  }
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
  const upstream = target.protocol === 'https:'
    ? connectTls({ host: target.hostname, port, servername: target.hostname })
    : connectTcp({ host: target.hostname, port });
  let closed = false;
  let handshakeComplete = false;
  let handshakeBuffer = Buffer.alloc(0);
  const close = (status?: number, reason?: string): void => {
    if (closed) return;
    closed = true;
    if (status !== undefined) refuse(options.client, status, reason ?? 'host_gateway_websocket_unavailable', options.on_refusal);
    else options.client.destroy();
    upstream.destroy();
  };
  options.client.pause();
  options.client.once('error', () => close());
  options.client.once('close', () => { if (!closed) close(); });
  upstream.once('error', () => close(502, 'host_gateway_websocket_upstream_unavailable'));
  upstream.once('close', () => { if (!closed && !handshakeComplete) close(502, 'host_gateway_websocket_upstream_closed'); });
  upstream.setTimeout(timeoutMs, () => close(504, 'host_gateway_websocket_handshake_timeout'));
  const onData = (chunk: Buffer): void => {
    if (closed || handshakeComplete) return;
    handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
    if (handshakeBuffer.byteLength > 4 * 1024 * 1024) {
      close(502, 'host_gateway_websocket_handshake_too_large');
      return;
    }
    const headerEnd = handshakeBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) return;
    const response = handshakeBuffer.subarray(0, headerEnd).toString('latin1');
    if (!/^HTTP\/1\.1 101(?:\s|$)/u.test(response)) {
      close(502, 'host_gateway_websocket_upstream_rejected');
      return;
    }
    handshakeComplete = true;
    upstream.removeListener('data', onData);
    upstream.setTimeout(0);
    options.client.write(handshakeBuffer.subarray(0, headerEnd + 4));
    const remainder = handshakeBuffer.subarray(headerEnd + 4);
    if (remainder.byteLength > 0) options.client.write(remainder);
    if (options.head.byteLength > 0) upstream.write(options.head);
    options.client.pipe(upstream);
    upstream.pipe(options.client);
    options.client.resume();
  };
  upstream.on('data', onData);
  upstream.once(target.protocol === 'https:' ? 'secureConnect' : 'connect', () => {
    const lines = [
      `GET ${target.pathname}${target.search} HTTP/1.1`,
      `Host: ${target.host}`,
      'Connection: Upgrade',
      'Upgrade: websocket',
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: ${header(options.request, 'sec-websocket-version') ?? '13'}`,
      `x-narada-host-id: ${options.host.host_id}`,
      `x-narada-host-instance-id: ${options.host.host_instance_id}`,
      `x-narada-operator-console-bridge-token: ${options.credential}`,
    ];
    const protocol = header(options.request, 'sec-websocket-protocol');
    if (protocol) lines.push(`Sec-WebSocket-Protocol: ${protocol}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
  });
}
