/**
 * OpenTelemetry-compatible tracing hooks
 *
 * Provides distributed tracing for key operations.
 * Works without OpenTelemetry for zero-dependency operation.
 */

export interface SpanContext {
  /** Unique trace ID */
  traceId: string;
  /** Unique span ID */
  spanId: string;
  /** Parent span ID (if any) */
  parentSpanId?: string;
  /** Whether this span is sampled */
  sampled: boolean;
}

export interface Span {
  /** Span name */
  readonly name: string;
  /** Span context */
  readonly context: SpanContext;
  /** Start time (high-res) */
  readonly startTime: number;
  /** End time (high-res, undefined if active) */
  endTime?: number;
  /** Span status */
  status: 'unset' | 'ok' | 'error';
  /** Status message (if error) */
  statusMessage?: string;
  /** Span attributes */
  attributes: Record<string, unknown>;
  /** Span events */
  events: SpanEvent[];

  /** Set an attribute */
  setAttribute(key: string, value: unknown): void;
  /** Add an event */
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  /** Record an exception */
  recordException(error: Error): void;
  /** Set status to OK */
  setOk(): void;
  /** Set status to error */
  setError(message?: string): void;
  /** End the span */
  end(): void;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Tracer {
  /**
   * Start a new span
   */
  startSpan(name: string, options?: { parent?: Span; attributes?: Record<string, unknown> }): Span;

  /**
   * Execute a function within a span
   */
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>, options?: {
    attributes?: Record<string, unknown>;
  }): Promise<T>;
}

/** Global ID generator for trace/span IDs */
function generateId(): string {
  // 16 hex characters (64 bits)
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

/** Generate trace ID (32 hex chars = 128 bits) */
function generateTraceId(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

/** No-op span for when tracing is disabled */
const noopSpan: Span = {
  name: 'noop',
  context: { traceId: '', spanId: '', sampled: false },
  startTime: 0,
  status: 'unset',
  attributes: {},
  events: [],
  setAttribute: () => {},
  addEvent: () => {},
  recordException: () => {},
  setOk: () => {},
  setError: () => {},
  end: () => {},
};

/** Internal span implementation */
class SpanImpl implements Span {
  readonly name: string;
  readonly context: SpanContext;
  readonly startTime: number;
  endTime?: number;
  status: 'unset' | 'ok' | 'error' = 'unset';
  statusMessage?: string;
  attributes: Record<string, unknown> = {};
  events: SpanEvent[] = [];
  private ended = false;
  private onEnd?: (span: Span) => void;

  constructor(
    name: string,
    context: SpanContext,
    onEnd?: (span: Span) => void,
  ) {
    this.name = name;
    this.context = context;
    this.startTime = performance.now();
    this.onEnd = onEnd;
  }

  setAttribute(key: string, value: unknown): void {
    if (this.ended) return;
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    if (this.ended) return;
    this.events.push({
      name,
      timestamp: performance.now(),
      attributes,
    });
  }

  recordException(error: Error): void {
    if (this.ended) return;
    this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack,
    });
    this.setError(error.message);
  }

  setOk(): void {
    if (this.ended) return;
    this.status = 'ok';
  }

  setError(message?: string): void {
    if (this.ended) return;
    this.status = 'error';
    this.statusMessage = message;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.endTime = performance.now();
    this.onEnd?.(this);
  }
}

/** Span exporter interface */
export interface SpanExporter {
  export(spans: Span[]): void | Promise<void>;
}

/** Console span exporter for debugging */
class ConsoleSpanExporter implements SpanExporter {
  export(spans: Span[]): void {
    for (const span of spans) {
      const duration = span.endTime! - span.startTime;
      const status = span.status === 'error' ? '❌' : span.status === 'ok' ? '✓' : '?';
      // eslint-disable-next-line no-console
      console.error(`[TRACE] ${status} ${span.name} (${duration.toFixed(2)}ms)`);
    }
  }
}

/** Tracer implementation */
class TracerImpl implements Tracer {
  private spans: Span[] = [];
  private exporter: SpanExporter;
  private enabled: boolean;

  constructor(options: { exporter?: SpanExporter; enabled?: boolean } = {}) {
    this.exporter = options.exporter ?? new ConsoleSpanExporter();
    this.enabled = options.enabled ?? true;
  }

  startSpan(
    name: string,
    options: { parent?: Span; attributes?: Record<string, unknown> } = {},
  ): Span {
    if (!this.enabled) {
      return noopSpan;
    }

    const context: SpanContext = {
      traceId: options?.parent?.context.traceId ?? generateTraceId(),
      spanId: generateId(),
      parentSpanId: options?.parent?.context.spanId,
      sampled: true,
    };

    const span = new SpanImpl(name, context, (s) => this.onSpanEnd(s));

    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        span.setAttribute(key, value);
      }
    }

    return span;
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => T | Promise<T>,
    options: { attributes?: Record<string, unknown> } = {},
  ): Promise<T> {
    const span = this.startSpan(name, { attributes: options.attributes });

    try {
      const result = fn(span);
      if (result instanceof Promise) {
        return await result;
      }
      span.setOk();
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  }

  private onSpanEnd(span: Span): void {
    this.spans.push(span);

    // Export batch when we have enough spans
    if (this.spans.length >= 100) {
      const batch = this.spans.splice(0, 100);
      this.exporter.export(batch);
    }
  }

  /** Flush remaining spans */
  flush(): void {
    if (this.spans.length > 0) {
      this.exporter.export([...this.spans]);
      this.spans = [];
    }
  }
}

/** Global tracer instance */
let globalTracer: Tracer = new TracerImpl({ enabled: false });

/**
 * Create a new tracer
 */
export function createTracer(options?: { exporter?: SpanExporter; enabled?: boolean }): Tracer {
  return new TracerImpl(options);
}

/**
 * Set the global tracer
 */
export function setGlobalTracer(tracer: Tracer): void {
  globalTracer = tracer;
}

/**
 * Get the global tracer
 */
export function getTracer(): Tracer {
  return globalTracer;
}

/**
 * Create a span within the global tracer
 */
export function createSpan(
  name: string,
  options?: { parent?: Span; attributes?: Record<string, unknown> },
): Span {
  return globalTracer.startSpan(name, options);
}

/**
 * Execute a function within a traced span
 *
 * Example:
 * ```typescript
 * const result = await trace('fetchMessages', async (span) => {
 *   span.setAttribute('count', 10);
 *   return await api.fetch();
 * });
 * ```
 */
export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: { attributes?: Record<string, unknown> },
): Promise<T> {
  return globalTracer.withSpan(name, fn, options);
}

/**
 * Initialize tracing with configuration
 */
export function initTracing(options: { enabled?: boolean; debug?: boolean } = {}): void {
  globalTracer = new TracerImpl({
    enabled: options.enabled ?? true,
    exporter: options.debug ? new ConsoleSpanExporter() : undefined,
  });
}

// Re-export types
export type { Span, SpanContext, SpanEvent, Tracer, SpanExporter };
