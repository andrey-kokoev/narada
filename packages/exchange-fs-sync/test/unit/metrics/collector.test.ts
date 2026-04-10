import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, MetricNames } from '../../../src/metrics.js';

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  describe('counters', () => {
    it('should increment counters', () => {
      metrics.increment(MetricNames.SYNC_TOTAL);
      metrics.increment(MetricNames.SYNC_TOTAL);
      metrics.increment(MetricNames.SYNC_TOTAL);

      expect(metrics.getCounter(MetricNames.SYNC_TOTAL)).toBe(3);
    });

    it('should increment by custom value', () => {
      metrics.increment(MetricNames.MESSAGES_FETCHED, undefined, 5);
      expect(metrics.getCounter(MetricNames.MESSAGES_FETCHED)).toBe(5);
    });

    it('should handle tags in counters', () => {
      metrics.increment('requests', { method: 'GET' });
      metrics.increment('requests', { method: 'POST' });
      metrics.increment('requests', { method: 'GET' });

      expect(metrics.getCounter('requests', { method: 'GET' })).toBe(2);
      expect(metrics.getCounter('requests', { method: 'POST' })).toBe(1);
    });

    it('should return 0 for unset counters', () => {
      expect(metrics.getCounter('nonexistent')).toBe(0);
    });
  });

  describe('gauges', () => {
    it('should set gauge values', () => {
      metrics.gauge('memory', 1024);
      expect(metrics.getGauge('memory')).toBe(1024);

      metrics.gauge('memory', 2048);
      expect(metrics.getGauge('memory')).toBe(2048);
    });

    it('should return undefined for unset gauges', () => {
      expect(metrics.getGauge('nonexistent')).toBeUndefined();
    });
  });

  describe('histograms', () => {
    it('should record histogram values', () => {
      metrics.histogram('latency', 100);
      metrics.histogram('latency', 200);
      metrics.histogram('latency', 300);

      const stats = metrics.getHistogramStats('latency');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(3);
      expect(stats!.min).toBe(100);
      expect(stats!.max).toBe(300);
      expect(stats!.avg).toBe(200);
    });

    it('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        metrics.histogram('values', i);
      }

      const stats = metrics.getHistogramStats('values');
      expect(stats!.p50).toBe(50);
      expect(stats!.p95).toBe(95);
      expect(stats!.p99).toBe(99);
    });

    it('should return null for unset histograms', () => {
      expect(metrics.getHistogramStats('nonexistent')).toBeNull();
    });
  });

  describe('timing', () => {
    it('should time synchronous functions', () => {
      const result = metrics.timing('sync_op', () => {
        // Simulate work
        const sum = Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
        return sum;
      });

      expect(result).toBe(499500);
      const stats = metrics.getHistogramStats('sync_op');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);
    });

    it('should time asynchronous functions', async () => {
      const result = await metrics.timing('async_op', async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'done';
      });

      expect(result).toBe('done');
      const stats = metrics.getHistogramStats('async_op');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);
    });

    it('should record timing even when function throws', () => {
      expect(() => {
        metrics.timing('failing_op', () => {
          throw new Error('test error');
        });
      }).toThrow('test error');

      const stats = metrics.getHistogramStats('failing_op');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);
    });
  });

  describe('timer', () => {
    it('should start and stop timers', async () => {
      const timerId = metrics.startTimer('manual');
      await new Promise(r => setTimeout(r, 10));
      const duration = metrics.stopTimer(timerId, 'manual_timer');

      expect(duration).toBeGreaterThan(0);
      const stats = metrics.getHistogramStats('manual_timer');
      expect(stats!.count).toBe(1);
    });

    it('should throw for invalid timer', () => {
      expect(() => {
        metrics.stopTimer('invalid', 'test');
      }).toThrow('Timer invalid not found');
    });
  });

  describe('snapshot', () => {
    it('should capture all metrics in snapshot', () => {
      metrics.increment('counter1', undefined, 5);
      metrics.gauge('gauge1', 100);
      metrics.histogram('hist1', 50);
      metrics.histogram('hist1', 150);

      const snapshot = metrics.snapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.counters['counter1']).toBe(5);
      expect(snapshot.gauges['gauge1']).toBe(100);
      expect(snapshot.histograms['hist1']).toEqual([50, 150]);
    });

    it('should return immutable snapshot', () => {
      metrics.increment('test', undefined, 1);
      const snapshot = metrics.snapshot();
      
      // Modify snapshot should not affect original
      snapshot.counters['test'] = 999;
      expect(metrics.getCounter('test')).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      metrics.increment('counter1');
      metrics.gauge('gauge1', 100);
      metrics.histogram('hist1', 50);

      metrics.reset();

      expect(metrics.getCounter('counter1')).toBe(0);
      expect(metrics.getGauge('gauge1')).toBeUndefined();
      expect(metrics.getHistogramStats('hist1')).toBeNull();
    });
  });

  describe('performance', () => {
    it('should handle high volume of increments with low overhead', () => {
      const start = performance.now();
      
      for (let i = 0; i < 10000; i++) {
        metrics.increment('high_volume');
      }
      
      const duration = performance.now() - start;
      
      // Should complete 10k increments in under 50ms
      expect(duration).toBeLessThan(50);
      expect(metrics.getCounter('high_volume')).toBe(10000);
    });
  });
});
