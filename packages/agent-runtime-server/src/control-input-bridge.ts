import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { normalizeControlInputRecord } from '@narada-core/carrier-protocol';
import { isNarsSessionCoreMethod } from '@narada-core/nars-session-core/session-control-contract';

const DEFAULT_POLL_INTERVAL_MS: any = 100;
const DEFAULT_MAX_READ_BYTES: any = 64 * 1024;
const DEFAULT_MAX_LINE_CHARS: any = 1024 * 1024;

function errorCode(error: any) {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim();
  const message: any = error instanceof Error ? error.message : String(error ?? 'unknown_error');
  return message.split(':', 1)[0].trim() || 'control_input_bridge_error';
}

function reportError(onError: any, error: any, line: any = null, diagnostic: any = null) {
  try {
    onError?.(error, line, diagnostic);
  } catch {
    // Diagnostics must not terminate the carrier input owner.
  }
}

function requestFromControlLine(line: any) {
  const parsed: any = JSON.parse(line);
  if (parsed && typeof parsed === 'object' && parsed.method === 'system_directive.deliver') {
    return requestFromSystemDirectiveDelivery(parsed);
  }
  if (parsed && typeof parsed === 'object' && isNarsSessionCoreMethod(parsed.method)) return parsed;
  return requestFromControlRecord(normalizeControlInputRecord(parsed, { transport: 'control_jsonl' }));
}

function requestFromSystemDirectiveDelivery(record: any) {
  const params: any = record.params && typeof record.params === 'object' && !Array.isArray(record.params)
    ? record.params
    : {};
  const directive: any = params.directive && typeof params.directive === 'object' && !Array.isArray(params.directive)
    ? params.directive
    : {};
  const directiveId: any = typeof params.directive_id === 'string' && params.directive_id.trim()
    ? params.directive_id.trim()
    : typeof directive.directive_id === 'string' && directive.directive_id.trim()
      ? directive.directive_id.trim()
      : null;
  const source: any = directive.source && typeof directive.source === 'object' && !Array.isArray(directive.source)
    ? directive.source
    : {};
  const message: any = typeof params.message === 'string'
    ? params.message
    : typeof directive.content?.text === 'string'
      ? directive.content.text
      : '';
  const eventId: any = `input_${directiveId ?? String(record.id ?? 'system_directive').replace(/[^A-Za-z0-9_-]+/g, '_')}`;
  return {
    id: record.id ?? eventId,
    event_id: eventId,
    method: 'session.submit',
    source_kind: 'system',
    source_id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : 'narada.site_loop',
    transport: 'control_jsonl',
    delivery_mode: 'admit_after_active_turn',
    content: message,
    directive_id: directiveId,
    authority_ref: typeof params.authority_ref === 'string' && params.authority_ref.trim()
      ? params.authority_ref.trim()
      : directiveId,
  };
}

function requestFromControlRecord(record: any) {
  const input: any = record.input;
  const { event_id: eventId, ...inputFields }: any = input;
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
}: any = {}) {
  if (typeof path !== 'string' || path.trim().length === 0) throw new TypeError('control_input_path_required');
  if (!output || typeof output.write !== 'function') throw new TypeError('control_input_output_required');

  let offset: any = 0;
  let partialLine: any = '';
  let decoder: any = new StringDecoder('utf8');
  let timer: any = null;
  let pumping: any = false;
  let started: any = false;
  let closed: any = false;
  let readCount: any = 0;
  let emittedCount: any = 0;
  let errorCount: any = 0;
  let lastReadAt: any = null;
  let lastReadStatus: any = 'not_started';
  let lastEmittedAt: any = null;
  let lastError: any = null;
  let closedAt: any = null;

  function recordError(error: any, line: any = null) {
    const message: any = error instanceof SyntaxError
      ? 'control_input_record_invalid'
      : error instanceof Error ? error.message : String(error ?? 'unknown_error');
    const code: any = error instanceof SyntaxError ? 'control_input_record_invalid' : errorCode(error);
    errorCount += 1;
    const diagnostic: any = Object.freeze({
      code,
      message: message.slice(0, 240),
      at: now(),
    });
    lastError = diagnostic;
    reportError(onError, error, line, diagnostic);
  }

  function schedule(delayMs: any = pollIntervalMs) {
    if (closed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void pump();
    }, Math.max(0, delayMs));
  }

  function emitLine(line: any) {
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

  function consumeChunk(chunk: any) {
    partialLine += decoder.write(chunk);
    let newlineIndex: any = partialLine.indexOf('\n');
    while (newlineIndex !== -1) {
      const line: any = partialLine.slice(0, newlineIndex).replace(/\r$/, '');
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
    let handle: any = null;
    readCount += 1;
    lastReadAt = now();
    try {
      handle = await open(path, 'r');
      const stats: any = await handle.stat();
      lastReadStatus = 'available';
      if (stats.size < offset) {
        offset = 0;
        partialLine = '';
        decoder = new StringDecoder('utf8');
      }
      const readLength: any = Math.min(maxReadBytes, Math.max(0, stats.size - offset));
      if (readLength === 0) {
        lastReadStatus = 'empty';
        return false;
      }
      const buffer: any = Buffer.allocUnsafe(readLength);
      const result: any = await handle.read(buffer, 0, readLength, offset);
      if (result.bytesRead === 0) return false;
      offset += result.bytesRead;
      consumeChunk(buffer.subarray(0, result.bytesRead));
      return result.bytesRead >= readLength && stats.size > offset;
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (errorCode === 'ENOENT') lastReadStatus = 'missing';
      else {
        lastReadStatus = 'error';
        recordError(error);
      }
      return false;
    } finally {
      if (handle) await handle.close().catch((error: any) => recordError(error));
    }
  }

  async function pump() {
    if (closed || pumping) return;
    pumping = true;
    let more: any = false;
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

export const CONTROL_INPUT_BRIDGE_DEFAULTS: any = Object.freeze({
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  maxReadBytes: DEFAULT_MAX_READ_BYTES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS,
});
