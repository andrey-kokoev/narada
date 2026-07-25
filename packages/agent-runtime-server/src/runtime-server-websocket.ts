import { createHash } from 'node:crypto';

export function websocketAcceptValue(key: any) {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

export function encodeWebSocketTextFrame(payload: any) {
  const body: any = Buffer.from(String(payload), 'utf8');
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65536) {
    const header: any = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header: any = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

export function decodeWebSocketFrames(buffer: any) {
  const frames: any = [];
  let offset: any = 0;
  while (offset + 2 <= buffer.length) {
    const first: any = buffer[offset];
    const second: any = buffer[offset + 1];
    const opcode: any = first & 0x0f;
    const masked: any = (second & 0x80) !== 0;
    let length: any = second & 0x7f;
    let headerLength: any = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength: any = masked ? 4 : 0;
    const frameEnd: any = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    let payload: any = buffer.subarray(offset + headerLength + maskLength, frameEnd);
    if (masked) {
      const mask: any = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte: any, index: any) => byte ^ mask[index % 4]));
    }
    frames.push({ opcode, text: payload.toString('utf8') });
    offset = frameEnd;
  }
  return { frames, rest: buffer.subarray(offset) };
}
