import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { normalizeControlInputRecord } from '@narada2/carrier-protocol';
import { isNarsSessionCoreMethod } from '@narada2/nars-session-core/session-control-contract';

const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_MAX_READ_BYTES = 64 * 1024;
const DEFAULT_MAX_LINE_CHARS = 1024 * 1024;

function reportError(onError, error, line = null) {
  try {
    onError?.(error, line);
  } catch {
    // Diagnostics must not terminate the carrier input owner.
  }
}

function requestFromControlLine(line) {
  const parsed = JSON.parse(line);
  if (parsed && typeof parsed === 'object' && isNarsSessionCoreMethod(parsed.method)) return parsed;
  return requestFromControlRecord(normalizeControlInputRecord(parsed, { transport: 'control_jsonl' }));
}

function requestFromControlRecord(record) {
  const input = record.input;
  const { event_id: eventId, ...inputFields } = input;
  return {
    ...inputFields,
    id: eventId,
    method: 'session.submit',
    content: input.content,
  };
}

/**
 * Consume the append-only carrier control sideband without treating file
 * exhaustion as input EOF. The sideband is the durable input owner for
 * detached runtime servers; the output stream remains open until shutdown.
 */
export function createControlInputBridge({
  path,
  output,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxReadBytes = DEFAULT_MAX_READ_BYTES,
  maxLineChars = DEFAULT_MAX_LINE_CHARS,
  onError = null,
} = {}) {
  if (typeof path !== 'string' || path.trim().length === 0) throw new TypeError('control_input_path_required');
  if (!output || typeof output.write !== 'function') throw new TypeError('control_input_output_required');

  let offset = 0;
  let partialLine = '';
  let decoder = new StringDecoder('utf8');
  let timer = null;
  let pumping = false;
  let started = false;
  let closed = false;

  function schedule(delayMs = pollIntervalMs) {
    if (closed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void pump();
    }, Math.max(0, delayMs));
  }

  function emitLine(line) {
    if (!line.trim() || closed || output.destroyed || output.writableEnded) return;
    try {
      output.write(`${JSON.stringify(requestFromControlLine(line))}\n`);
    } catch (error) {
      reportError(onError, error, line);
    }
  }

  function consumeChunk(chunk) {
    partialLine += decoder.write(chunk);
    let newlineIndex = partialLine.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = partialLine.slice(0, newlineIndex).replace(/\r$/, '');
      partialLine = partialLine.slice(newlineIndex + 1);
      emitLine(line);
      newlineIndex = partialLine.indexOf('\n');
    }
    if (partialLine.length > maxLineChars) {
      reportError(onError, new Error('control_input_line_too_large'));
      partialLine = '';
    }
  }

  async function readAvailable() {
    let handle = null;
    try {
      handle = await open(path, 'r');
      const stats = await handle.stat();
      if (stats.size < offset) {
        offset = 0;
        partialLine = '';
        decoder = new StringDecoder('utf8');
      }
      const readLength = Math.min(maxReadBytes, Math.max(0, stats.size - offset));
      if (readLength === 0) return false;
      const buffer = Buffer.allocUnsafe(readLength);
      const result = await handle.read(buffer, 0, readLength, offset);
      if (result.bytesRead === 0) return false;
      offset += result.bytesRead;
      consumeChunk(buffer.subarray(0, result.bytesRead));
      return result.bytesRead >= readLength && stats.size > offset;
    } catch (error) {
      if (error?.code !== 'ENOENT') reportError(onError, error);
      return false;
    } finally {
      if (handle) await handle.close().catch((error) => reportError(onError, error));
    }
  }

  async function pump() {
    if (closed || pumping) return;
    pumping = true;
    let more = false;
    try {
      more = await readAvailable();
    } finally {
      pumping = false;
      schedule(more ? 0 : pollIntervalMs);
    }
  }

  return Object.freeze({
    async start() {
      if (started || closed) return;
      started = true;
      await pump();
    },
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    get state() {
      return Object.freeze({ closed, offset, has_partial_line: partialLine.length > 0 });
    },
  });
}

export const CONTROL_INPUT_BRIDGE_DEFAULTS = Object.freeze({
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  maxReadBytes: DEFAULT_MAX_READ_BYTES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS,
});
