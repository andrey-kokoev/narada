/**
 * Memory profiling and monitoring utilities
 */

/**
 * Memory usage statistics
 */
export interface MemoryUsage {
  /** Resident Set Size in MB */
  rssMB: number;
  /** Heap total in MB */
  heapTotalMB: number;
  /** Heap used in MB */
  heapUsedMB: number;
  /** External memory in MB */
  externalMB: number;
  /** Array buffers in MB */
  arrayBuffersMB: number;
}

/**
 * Get current memory usage in MB
 */
export function getMemoryUsage(): MemoryUsage {
  const usage = process.memoryUsage();
  return {
    rssMB: Math.round((usage.rss / 1024 / 1024) * 100) / 100,
    heapTotalMB: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100,
    heapUsedMB: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
    externalMB: Math.round((usage.external / 1024 / 1024) * 100) / 100,
    arrayBuffersMB: Math.round(((usage.arrayBuffers ?? 0) / 1024 / 1024) * 100) / 100,
  };
}

/**
 * Format memory usage for logging
 */
export function formatMemoryUsage(usage?: MemoryUsage): string {
  const mem = usage ?? getMemoryUsage();
  return `RSS: ${mem.rssMB}MB | Heap: ${mem.heapUsedMB}/${mem.heapTotalMB}MB | External: ${mem.externalMB}MB`;
}

/**
 * Log a memory snapshot with a label
 */
export function logMemorySnapshot(label: string, logger?: (message: string) => void): void {
  const mem = getMemoryUsage();
  const message = `[Memory:${label}] ${formatMemoryUsage(mem)}`;

  if (logger) {
    logger(message);
  } else {
    // eslint-disable-next-line no-console
    console.log(message);
  }
}

/**
 * Memory monitor that tracks growth over time
 */
export class MemoryMonitor {
  private baseline = 0;
  private peak = 0;
  private startTime = 0;
  private samples: Array<{ timestamp: number; heapUsed: number }> = [];
  private maxSamples: number;

  constructor(options: { maxSamples?: number } = {}) {
    this.maxSamples = options.maxSamples ?? 100;
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.startTime = Date.now();
    this.baseline = process.memoryUsage().heapUsed;
    this.peak = this.baseline;
    this.samples = [{ timestamp: this.startTime, heapUsed: this.baseline }];
  }

  /**
   * Record a sample
   */
  sample(): void {
    const now = Date.now();
    const heapUsed = process.memoryUsage().heapUsed;

    this.peak = Math.max(this.peak, heapUsed);

    this.samples.push({ timestamp: now, heapUsed });

    // Limit sample history
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * Check current memory state
   */
  check(): { ok: boolean; growthMB: number; growthPercent: number } {
    const current = process.memoryUsage().heapUsed;
    const growth = current - this.baseline;
    const growthMB = Math.round((growth / 1024 / 1024) * 100) / 100;
    const growthPercent = Math.round((growth / this.baseline) * 1000) / 10;

    return {
      ok: growth < 500 * 1024 * 1024, // 500MB threshold
      growthMB,
      growthPercent,
    };
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    baselineMB: number;
    currentMB: number;
    peakMB: number;
    growthMB: number;
    durationMs: number;
    sampleCount: number;
  } {
    const current = process.memoryUsage().heapUsed;
    return {
      baselineMB: Math.round((this.baseline / 1024 / 1024) * 100) / 100,
      currentMB: Math.round((current / 1024 / 1024) * 100) / 100,
      peakMB: Math.round((this.peak / 1024 / 1024) * 100) / 100,
      growthMB: Math.round(((current - this.baseline) / 1024 / 1024) * 100) / 100,
      durationMs: Date.now() - this.startTime,
      sampleCount: this.samples.length,
    };
  }

  /**
   * Get growth trend (positive = growing, negative = shrinking)
   */
  getTrend(): { trend: "growing" | "stable" | "shrinking"; rateMBPerMinute: number } {
    if (this.samples.length < 2) {
      return { trend: "stable", rateMBPerMinute: 0 };
    }

    const first = this.samples[0]!;
    const last = this.samples[this.samples.length - 1]!;
    const durationMinutes = (last.timestamp - first.timestamp) / 1000 / 60;

    if (durationMinutes < 0.1) {
      return { trend: "stable", rateMBPerMinute: 0 };
    }

    const growthMB = (last.heapUsed - first.heapUsed) / 1024 / 1024;
    const rateMBPerMinute = Math.round((growthMB / durationMinutes) * 100) / 100;

    let trend: "growing" | "stable" | "shrinking" = "stable";
    if (rateMBPerMinute > 10) trend = "growing";
    else if (rateMBPerMinute < -10) trend = "shrinking";

    return { trend, rateMBPerMinute };
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Reset monitoring
   */
  reset(): void {
    this.start();
  }
}

/**
 * Memory threshold alert callback
 */
export type MemoryAlertCallback = (usage: MemoryUsage, threshold: number) => void;

/**
 * Memory watcher that alerts when thresholds are exceeded
 */
export class MemoryWatcher {
  private thresholdMB: number;
  private intervalMs: number;
  private callback: MemoryAlertCallback;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastAlert = 0;
  private alertCooldownMs: number;

  constructor(
    options: {
      thresholdMB: number;
      intervalMs?: number;
      alertCooldownMs?: number;
      onAlert: MemoryAlertCallback;
    },
  ) {
    this.thresholdMB = options.thresholdMB;
    this.intervalMs = options.intervalMs ?? 5000;
    this.alertCooldownMs = options.alertCooldownMs ?? 60000;
    this.callback = options.onAlert;
  }

  /**
   * Start watching memory
   */
  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      const usage = getMemoryUsage();

      if (usage.heapUsedMB > this.thresholdMB) {
        const now = Date.now();

        // Respect cooldown
        if (now - this.lastAlert > this.alertCooldownMs) {
          this.lastAlert = now;
          this.callback(usage, this.thresholdMB);
        }
      }
    }, this.intervalMs);
  }

  /**
   * Stop watching memory
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Update threshold
   */
  setThreshold(thresholdMB: number): void {
    this.thresholdMB = thresholdMB;
  }
}

/**
 * Heap dump for debugging (requires --heapsnapshot-near-heap-limit flag)
 */
export function triggerHeapSnapshot(filename?: string): string | null {
  try {
    // @ts-expect-error - require is not typed
    const v8 = require("v8");
    const path = require("path");

    const snapshotPath = filename
      ? path.resolve(filename)
      : path.join(process.cwd(), `heap-${Date.now()}.heapsnapshot`);

    v8.writeHeapSnapshot(snapshotPath);
    return snapshotPath;
  } catch {
    return null;
  }
}

/**
 * Estimate size of an object in bytes (rough approximation)
 */
export function estimateObjectSize(obj: unknown): number {
  const seen = new Set<unknown>();

  function sizeOf(value: unknown): number {
    if (value === null || value === undefined) return 0;

    if (typeof value === "boolean") return 4;
    if (typeof value === "number") return 8;
    if (typeof value === "string") return value.length * 2;
    if (typeof value === "symbol") return 0; // Can't measure
    if (typeof value === "function") return 0; // Can't measure

    if (seen.has(value)) return 0; // Circular reference
    seen.add(value);

    if (Array.isArray(value)) {
      return value.reduce((acc, item) => acc + sizeOf(item), 0);
    }

    if (value instanceof Date) return 8;
    if (value instanceof RegExp) return (value.source.length + value.flags.length) * 2;
    if (value instanceof Map) {
      let size = 0;
      for (const [k, v] of value.entries()) {
        size += sizeOf(k) + sizeOf(v);
      }
      return size;
    }
    if (value instanceof Set) {
      let size = 0;
      for (const item of value.values()) {
        size += sizeOf(item);
      }
      return size;
    }

    if (typeof value === "object") {
      return Object.entries(value).reduce(
        (acc, [key, val]) => acc + key.length * 2 + sizeOf(val),
        0,
      );
    }

    return 0;
  }

  return sizeOf(obj);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${Math.round(value * 100) / 100} ${units[unitIndex]}`;
}
