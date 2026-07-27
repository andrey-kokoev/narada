import assert from 'node:assert/strict';
import test from 'node:test';
import { connect as netConnect } from 'node:net';
import { decodeWebSocketFrames, encodeWebSocketPongFrame } from '../src/runtime-server-websocket.js';
import { startEventStreamProjection } from '../src/runtime-server-event-stream.js';

test('decodes a masked ping and produces an unmasked pong with the same payload', () => {
  const payload = Buffer.from('heartbeat', 'utf8');
  const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const maskedPayload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % mask.length]));
  const ping = Buffer.concat([
    Buffer.from([0x89, 0x80 | payload.length]),
    mask,
    maskedPayload,
  ]);

  const decoded = decodeWebSocketFrames(ping);
  assert.equal(decoded.rest.length, 0);
  assert.equal(decoded.frames.length, 1);
  assert.equal(decoded.frames[0]?.opcode, 0x9);
  assert.deepEqual(decoded.frames[0]?.payload, payload);
  assert.deepEqual(
    encodeWebSocketPongFrame(decoded.frames[0]?.payload),
    Buffer.concat([Buffer.from([0x8a, payload.length]), payload]),
  );
});

test('event stream responds to a masked WebSocket ping with a pong', async () => {
  const projection: any = await startEventStreamProjection({
    childStdin: { writable: false },
    eventHub: { cursor: () => ({ last_sequence: null, next_sequence: 1 }) },
    host: '127.0.0.1',
    port: 0,
  });
  const address: any = projection.server.address();
  const payload: any = Buffer.from('ping-payload', 'utf8');
  const mask: any = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const maskedPayload: any = Buffer.from(payload.map((byte: any, index: any) => byte ^ mask[index % mask.length]));
  const ping: any = Buffer.concat([
    Buffer.from([0x89, 0x80 | payload.length]),
    mask,
    maskedPayload,
  ]);
  let socket: any;
  try {
    const pong: any = await new Promise((resolve: any, reject: any) => {
      socket = netConnect({ host: '127.0.0.1', port: address.port });
      let buffer: any = Buffer.alloc(0);
      let handshakeComplete: any = false;
      let settled: any = false;
      const timer: any = setTimeout(() => finish(reject, new Error('pong_timeout')), 3000);
      const finish: any = (callback: any, value: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      socket.on('error', (error: any) => finish(reject, error));
      socket.on('connect', () => {
        socket.write([
          'GET /events HTTP/1.1',
          'Host: 127.0.0.1',
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'));
      });
      socket.on('data', (chunk: any) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!handshakeComplete) {
          const headerEnd: any = buffer.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd < 0) return;
          buffer = buffer.subarray(headerEnd + 4);
          handshakeComplete = true;
          socket.write(ping);
        }
        while (buffer.length >= 2) {
          const first: any = buffer[0];
          const second: any = buffer[1];
          let payloadLength: any = second & 0x7f;
          let headerLength: any = 2;
          if (payloadLength === 126) {
            if (buffer.length < 4) return;
            payloadLength = buffer.readUInt16BE(2);
            headerLength = 4;
          } else if (payloadLength === 127) {
            if (buffer.length < 10) return;
            payloadLength = Number(buffer.readBigUInt64BE(2));
            headerLength = 10;
          }
          const frameLength: any = headerLength + payloadLength;
          if (buffer.length < frameLength) return;
          const opcode: any = first & 0x0f;
          const framePayload: any = buffer.subarray(headerLength, frameLength);
          buffer = buffer.subarray(frameLength);
          if (opcode === 0x0a) {
            finish(resolve, framePayload);
            return;
          }
        }
      });
    });
    assert.deepEqual(pong, payload);
  } finally {
    socket?.destroy();
    projection.closeConnections();
    await new Promise((resolve: any) => projection.server.close(resolve));
  }
});
