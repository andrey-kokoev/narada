/**
 * Metrics collection for production monitoring
 *
 * Collects counters, gauges, and histograms with tag support.
 * Designed for low overhead (<1% impact on performance).
 */

export interface MetricsSnapshot {
  /** ISO 8601 timestamp when snapshot was taken */
  timestamp: string;
  /** Counter values by name */
  counters: Record<string, number>;
  /** Gauge values by name */
  gauges: Record<string, number>;
  /** Histogram values by name (array of samples) */
  histograms: Record<string, number[]>;
}

interface HistogramEntry {
  samples: number[];
  count: number;
  sum: number;
  min: number;
  max: number;
}

/**
 * Thread-safe (single-threaded Node.js) metrics collector
 *
 * Uses Map for O(1) updates and minimal overhead.
 * No external dependencies for maximum compatibility.
 */
export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, HistogramEntry>();
  private startTimes = new Map<string, number>();

  /**
   * Increment a counter metric
   *
   * Counters only increase (or reset to 0 on snapshot/reset).
   * Use for: event counts, operation totals, error counts
   */
  increment(counter: string, tags?: Record<string, string>, value = 1): void {
    const key = this.formatKey(counter, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  /**
   * Set a gauge metric to a specific value
   *
   * Gauges can go up or down.
   * Use for: current queue size, memory usage, active connections
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.formatKey(name, tags);
    this.gauges.set(key, value);
  }

  /**
   * Record a value in a histogram
   *
   * Tracks distribution of values (latencies, sizes).
   * Automatically computes count, sum, min, max.
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.formatKey(name, tags);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.samples.push(value);
      existing.count++;
      existing.sum += value;
      if (value < existing.min) existing.min = value;
      if (value > existing.max) existing.max = value;
    } else {
      this.histograms.set(key, {
        samples: [value],
        count: 1,
        sum: value,
        min: value,
        max: value,
      });
    }

    // Keep sample size bounded to prevent memory growth
    const entry = this.histograms.get(key)!;
    if (entry.samples.length > 10000) {
      // Downsample: keep every other sample
      entry.samples = entry.samples.filter((_, i) => i % 2 === 0);
    }
  }

  /**
   * Time a function execution and record to histogram
   *
   * Automatically handles async functions and errors.
   * Records timing even if function throws.
   */
  async timing<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T>;
  timing<T>(name: string, fn: () => T, tags?: Record<string, string>): T;
  timing<T>(
    name: string,
    fn: () => T | Promise<T>,
    tags?: Record<string, string>,
  ): T | Promise<T> {
    const start = performance.now();

    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - start;
          this.histogram(name, duration, tags);
        }) as Promise<T>;
      }
      const duration = performance.now() - start;
      this.histogram(name, duration, tags);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.histogram(name, duration, tags);
      throw error;
    }
  }

  /**
   * Start a timer that can be stopped later
   *
   * Useful for async operations where you need explicit start/stop.
   */
  startTimer(name: string, _tags?: Record<string, string>): string {
    const timerId = `${name}:${Date.now()}:${Math.random()}`;
    this.startTimes.set(timerId, performance.now());
    return timerId;
  }

  /**
   * Stop a timer and record the duration
   */
  stopTimer(timerId: string, name: string, tags?: Record<string, string>): number {
    const start = this.startTimes.get(timerId);
    if (start === undefined) {
      throw new Error(`Timer ${timerId} not found`);
    }
    this.startTimes.delete(timerId);
    const duration = performance.now() - start;
    this.histogram(name, duration, tags);
    return duration;
  }

  /**
   * Get a snapshot of all current metrics
   *
   * Returns a copy - safe to modify without affecting collector.
   */
  snapshot(): MetricsSnapshot {
    const histograms: Record<string, number[]> = {};
    for (const [key, entry] of this.histograms) {
      histograms[key] = [...entry.samples];
    }

    return {
      timestamp: new Date().toISOString(),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms,
    };
  }

  /**
   * Get computed histogram statistics
   */
  getHistogramStats(name: string, tags?: Record<string, string>): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50?: number;
    p95?: number;
    p99?: number;
  } | null {
    const key = this.formatKey(name, tags);
    const entry = this.histograms.get(key);
    if (!entry) return null;

    const sorted = [...entry.samples].sort((a, b) => a - b);
    const percentile = (p: number): number => {
      const index = Math.floor((sorted.length - 1) * p);
      return sorted[index]!;
    };
    return {
      count: entry.count,
      sum: entry.sum,
      min: entry.min,
      max: entry.max,
      avg: entry.sum / entry.count,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    };
  }

  /**
   * Reset all metrics to zero/empty
   *
   * Use when starting a new collection period.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.startTimes.clear();
  }

  /**
   * Get the value of a counter
   */
  getCounter(name: string, tags?: Record<string, string>): number {
    return this.counters.get(this.formatKey(name, tags)) ?? 0;
  }

  /**
   * Get the value of a gauge
   */
  getGauge(name: string, tags?: Record<string, string>): number | undefined {
    return this.gauges.get(this.formatKey(name, tags));
  }

  private formatKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${tagStr}}`;
  }
}

/** Global singleton for application-wide metrics */
export const metrics = new MetricsCollector();

/**
 * Predefined metric names for consistency
 */
export const MetricNames = {
  // Sync operations
  SYNC_TOTAL: 'sync.total',
  SYNC_SUCCESS: 'sync.success',
  SYNC_FAILED: 'sync.failed',
  SYNC_DURATION_MS: 'sync.duration_ms',
  MESSAGES_FETCHED: 'sync.messages_fetched',
  MESSAGES_WRITTEN: 'sync.messages_written',
  MESSAGES_SKIPPED: 'sync.messages_skipped',

  // Graph API
  GRAPH_REQUESTS: 'graph.requests',
  GRAPH_RATE_LIMITED: 'graph.rate_limited',
  GRAPH_ERRORS: 'graph.errors',
  GRAPH_LATENCY_MS: 'graph.latency_ms',

  // Storage
  STORAGE_READS: 'storage.reads',
  STORAGE_WRITES: 'storage.writes',
  STORAGE_BYTES_READ: 'storage.bytes_read',
  STORAGE_BYTES_WRITTEN: 'storage.bytes_written',
  STORAGE_LATENCY_MS: 'storage.latency_ms',

  // Errors
  ERRORS_TOTAL: 'errors.total',
  ERRORS_CONSECUTIVE: 'errors.consecutive',
} as const;
