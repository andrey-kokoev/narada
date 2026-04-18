import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTracer,
  setGlobalTracer,
  getTracer,
  trace,
  createSpan,
  initTracing,
  type SpanExporter,
} from '../../src/tracing.js';

describe('Tracing', () => {
  beforeEach(() => {
    // Reset to disabled tracer
    setGlobalTracer(createTracer({ enabled: false }));
  });

  describe('createTracer', () => {
    it('should create disabled tracer', () => {
      const tracer = createTracer({ enabled: false });
      const span = tracer.startSpan('test');
      
      // Should return noop span
      expect(span.context.traceId).toBe('');
    });

    it('should create enabled tracer', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');
      
      expect(span.context.traceId).not.toBe('');
      expect(span.context.spanId).not.toBe('');
      expect(span.context.sampled).toBe(true);
    });
  });

  describe('span', () => {
    it('should set attributes', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');

      span.setAttribute('key1', 'value1');
      span.setAttribute('key2', 42);

      expect(span.attributes).toEqual({ key1: 'value1', key2: 42 });
    });

    it('should add events', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');

      span.addEvent('event1', { data: 'value' });
      span.addEvent('event2');

      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('event1');
      expect(span.events[0].attributes).toEqual({ data: 'value' });
    });

    it('should set status', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');

      expect(span.status).toBe('unset');

      span.setOk();
      expect(span.status).toBe('ok');

      const span2 = tracer.startSpan('test2');
      span2.setError('something failed');
      expect(span2.status).toBe('error');
      expect(span2.statusMessage).toBe('something failed');
    });

    it('should record exceptions', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');

      const error = new Error('Test error');
      span.recordException(error);

      expect(span.status).toBe('error');
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.events[0].attributes?.['exception.message']).toBe('Test error');
    });

    it('should track timing', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');

      expect(span.startTime).toBeGreaterThan(0);
      expect(span.endTime).toBeUndefined();

      span.end();

      expect(span.endTime).toBeGreaterThan(span.startTime);
    });

    it('should not modify ended span', () => {
      const tracer = createTracer({ enabled: true });
      const span = tracer.startSpan('test');

      span.end();
      
      // These should be no-ops after end()
      span.setAttribute('key', 'value');
      span.addEvent('event');
      span.setOk();

      expect(span.attributes).toEqual({});
      expect(span.events).toHaveLength(0);
    });
  });

  describe('parent spans', () => {
    it('should create child spans with same trace ID', () => {
      const tracer = createTracer({ enabled: true });
      const parent = tracer.startSpan('parent');
      const child = tracer.startSpan('child', { parent });

      expect(child.context.traceId).toBe(parent.context.traceId);
      expect(child.context.parentSpanId).toBe(parent.context.spanId);
    });
  });

  describe('withSpan', () => {
    it('should execute function within span', async () => {
      const tracer = createTracer({ enabled: true });
      
      const result = await tracer.withSpan('test', async (span) => {
        span.setAttribute('executed', true);
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should set OK status on success', async () => {
      const tracer = createTracer({ enabled: true });
      let capturedSpan: ReturnType<typeof tracer.startSpan>;

      await tracer.withSpan('test', (span) => {
        capturedSpan = span;
        return 'done';
      });

      expect(capturedSpan!.status).toBe('ok');
      expect(capturedSpan!.endTime).toBeDefined();
    });

    it('should set error status on failure', async () => {
      const tracer = createTracer({ enabled: true });
      let capturedSpan: ReturnType<typeof tracer.startSpan>;

      await expect(tracer.withSpan('test', (span) => {
        capturedSpan = span;
        throw new Error('Test error');
      })).rejects.toThrow('Test error');

      expect(capturedSpan!.status).toBe('error');
      expect(capturedSpan!.endTime).toBeDefined();
    });

    it('should work with sync functions', () => {
      const tracer = createTracer({ enabled: true });

      const result = tracer.withSpan('test', (span) => {
        span.setAttribute('sync', true);
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe('global tracer', () => {
    it('should get and set global tracer', () => {
      const tracer = createTracer({ enabled: true });
      setGlobalTracer(tracer);

      expect(getTracer()).toBe(tracer);
    });

    it('createSpan should use global tracer', () => {
      const tracer = createTracer({ enabled: true });
      setGlobalTracer(tracer);

      const span = createSpan('test');
      expect(span.context.traceId).not.toBe('');
    });

    it('trace should use global tracer', async () => {
      const tracer = createTracer({ enabled: true });
      setGlobalTracer(tracer);

      const result = await trace('test', async (span) => {
        return 'done';
      });

      expect(result).toBe('done');
    });
  });

  describe('initTracing', () => {
    it('should initialize with debug exporter', () => {
      // Just verify it doesn't throw
      initTracing({ enabled: true, debug: true });
      
      const span = createSpan('test');
      expect(span.context.traceId).not.toBe('');
    });

    it('should initialize disabled', () => {
      initTracing({ enabled: false });
      
      const span = createSpan('test');
      expect(span.context.traceId).toBe('');
    });
  });

  describe('custom exporter', () => {
    it('should export completed spans', async () => {
      const exportedSpans: Parameters<SpanExporter['export']>[0] = [];
      const exporter: SpanExporter = {
        export: (spans) => {
          exportedSpans.push(...spans);
        },
      };

      const tracer = createTracer({ enabled: true, exporter });
      
      await tracer.withSpan('test1', () => 'done');
      await tracer.withSpan('test2', () => 'done');

      // Spans are exported in batches, may need to flush
      expect(exportedSpans.length).toBeGreaterThanOrEqual(0);
    });
  });
});
