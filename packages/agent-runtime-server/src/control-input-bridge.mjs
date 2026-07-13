import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { normalizeControlInputRecord } from '@narada2/carrier-protocol';
import { isNarsSessionCoreMethod } from '@narada2/nars-session-core/session-control-contract';

const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_MAX_READ_BYTES = 64 * 1024;
const DEFAULT_MAX_LINE_CHARS = 1024 * 1024;

function errorCode(error) {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim();
  const message = error instanceof Error ? error.message : String(error ?? 'unknown_error');
  return message.split(':', 1)[0].trim() || 'control_input_bridge_error';
}

function reportError(onError, error, line = null, diagnostic = null) {
  try {
    onError?.(error, line, diagnostic);
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
  now = () => new Date().toISOString(),
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
  let readCount = 0;
  let emittedCount = 0;
  let errorCount = 0;
  let lastReadAt = null;
  let lastReadStatus = 'not_started';
  let lastEmittedAt = null;
  let lastError = null;
  let closedAt = null;

  function recordError(error, line = null) {
    const message = error instanceof SyntaxError
      ? 'control_input_record_invalid'
      : error instanceof Error ? error.message : String(error ?? 'unknown_error');
    const code = error instanceof SyntaxError ? 'control_input_record_invalid' : errorCode(error);
    errorCount += 1;
    const diagnostic = Object.freeze({
      code,
      message: message.slice(0, 240),
      at: now(),
    });
    lastError = diagnostic;
    reportError(onError, error, line, diagnostic);
  }

  function schedule(delayMs = pollIntervalMs) {
    if (closed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void pump();
    }, Math.max(0, delayMs));
  }

  function emitLine(line) {
    if (!line.trim() || closed) return;
    if (output.destroyed || output.writableEnded) {
      recordError(new Error('control_input_output_unavailable'), line);
      return;
    }
    try {
      output.write(`${JSON.stringify(requestFromControlLine(line))}\n`);
      emittedCount += 1;
      lastEmittedAt = now();
    } catch (error) {
      recordError(error, line);
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
      recordError(new Error('control_input_line_too_large'));
      partialLine = '';
    }
  }

  async function readAvailable() {
    let handle = null;
    readCount += 1;
    lastReadAt = now();
    try {
      handle = await open(path, 'r');
      const stats = await handle.stat();
      lastReadStatus = 'available';
      if (stats.size < offset) {
        offset = 0;
        partialLine = '';
        decoder = new StringDecoder('utf8');
      }
      const readLength = Math.min(maxReadBytes, Math.max(0, stats.size - offset));
      if (readLength === 0) {
        lastReadStatus = 'empty';
        return false;
      }
      const buffer = Buffer.allocUnsafe(readLength);
      const result = await handle.read(buffer, 0, readLength, offset);
      if (result.bytesRead === 0) return false;
      offset += result.bytesRead;
      consumeChunk(buffer.subarray(0, result.bytesRead));
      return result.bytesRead >= readLength && stats.size > offset;
    } catch (error) {
      if (error?.code === 'ENOENT') lastReadStatus = 'missing';
      else {
        lastReadStatus = 'error';
        recordError(error);
      }
      return false;
    } finally {
      if (handle) await handle.close().catch((error) => recordError(error));
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
      closedAt = now();
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    get state() {
      return Object.freeze({
        path,
        status: closed ? 'closed' : !started ? 'created' : pumping ? 'reading' : timer !== null ? 'polling' : 'idle',
        started,
        closed,
        offset,
        has_partial_line: partialLine.length > 0,
        read_count: readCount,
        emitted_count: emittedCount,
        error_count: errorCount,
        last_read_at: lastReadAt,
        last_read_status: lastReadStatus,
        last_emitted_at: lastEmittedAt,
        last_error: lastError,
        closed_at: closedAt,
      });
    },
  });
}

export const CONTROL_INPUT_BRIDGE_DEFAULTS = Object.freeze({
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  maxReadBytes: DEFAULT_MAX_READ_BYTES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS,
});
