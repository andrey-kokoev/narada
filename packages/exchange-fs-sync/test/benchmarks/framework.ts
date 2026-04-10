/**
 * Benchmark Framework
 *
 * Provides statistical rigor for performance measurements with:
 * - Warmup runs to stabilize JIT
 * - Multiple measurement runs for statistical significance
 * - Memory tracking
 * - Outlier rejection
 */

export interface BenchmarkOptions {
  /** Number of warmup runs (default: 3) */
  warmupRuns: number;
  /** Number of measurement runs (default: 10) */
  measurementRuns: number;
  /** Maximum duration in milliseconds (default: 60000) */
  maxDurationMs: number;
  /** Reject outliers beyond N standard deviations (default: 3) */
  outlierThreshold: number;
}

export interface BenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of runs completed */
  runs: number;
  /** Mean execution time in milliseconds */
  meanMs: number;
  /** Median execution time in milliseconds */
  medianMs: number;
  /** 95th percentile in milliseconds */
  p95Ms: number;
  /** 99th percentile in milliseconds */
  p99Ms: number;
  /** Standard deviation */
  stdDev: number;
  /** Operations per second */
  opsPerSecond: number;
  /** Memory delta in MB */
  memoryDeltaMB: number;
  /** Minimum time */
  minMs: number;
  /** Maximum time */
  maxMs: number;
}

const DEFAULT_OPTIONS: BenchmarkOptions = {
  warmupRuns: 3,
  measurementRuns: 10,
  maxDurationMs: 60000,
  outlierThreshold: 3,
};

/**
 * Run a benchmark with statistical rigor
 *
 * @param name - Benchmark name
 * @param fn - Function to benchmark
 * @param options - Benchmark options
 * @returns Benchmark results with statistics
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  options?: Partial<BenchmarkOptions>,
): Promise<BenchmarkResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const times: number[] = [];

  // Force GC if available to get clean memory baseline
  if (global.gc) {
    global.gc();
  }

  const memBefore = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  // Warmup runs
  for (let i = 0; i < opts.warmupRuns; i++) {
    await fn();
  }

  // Measurement runs
  for (let i = 0; i < opts.measurementRuns; i++) {
    // Check max duration
    if (performance.now() - startTime > opts.maxDurationMs) {
      console.warn(`Benchmark "${name}" exceeded max duration, stopping early`);
      break;
    }

    const runStart = performance.now();
    await fn();
    const runEnd = performance.now();
    times.push(runEnd - runStart);
  }

  const memAfter = process.memoryUsage().heapUsed;

  // Reject outliers
  const filteredTimes = rejectOutliers(times, opts.outlierThreshold);

  // Calculate statistics
  const stats = calculateStats(filteredTimes);

  return {
    name,
    runs: filteredTimes.length,
    meanMs: stats.mean,
    medianMs: stats.median,
    p95Ms: stats.p95,
    p99Ms: stats.p99,
    stdDev: stats.stdDev,
    opsPerSecond: 1000 / stats.mean,
    memoryDeltaMB: (memAfter - memBefore) / 1024 / 1024,
    minMs: stats.min,
    maxMs: stats.max,
  };
}

/**
 * Reject outliers beyond N standard deviations
 */
function rejectOutliers(values: number[], threshold: number): number[] {
  if (values.length < 3) return values;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return values.filter(v => Math.abs(v - mean) < threshold * stdDev);
}

/**
 * Calculate statistical measures
 */
function calculateStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, median, p95, p99, stdDev, min, max };
}

/**
 * Compare two benchmark results
 */
export function compareResults(
  current: BenchmarkResult,
  baseline: BenchmarkResult,
): {
  changePercent: number;
  isRegression: boolean;
  isImprovement: boolean;
} {
  const changePercent = ((current.meanMs - baseline.meanMs) / baseline.meanMs) * 100;
  const isRegression = changePercent > 10; // >10% slower
  const isImprovement = changePercent < -10; // >10% faster

  return { changePercent, isRegression, isImprovement };
}

/**
 * Format benchmark result as human-readable string
 */
export function formatResult(result: BenchmarkResult): string {
  return `${result.name}:
  Runs: ${result.runs}
  Mean: ${result.meanMs.toFixed(2)}ms
  Median: ${result.medianMs.toFixed(2)}ms
  P95: ${result.p95Ms.toFixed(2)}ms
  P99: ${result.p99Ms.toFixed(2)}ms
  StdDev: ${result.stdDev.toFixed(2)}ms
  Ops/sec: ${result.opsPerSecond.toFixed(1)}
  Memory: ${result.memoryDeltaMB.toFixed(2)}MB`;
}
