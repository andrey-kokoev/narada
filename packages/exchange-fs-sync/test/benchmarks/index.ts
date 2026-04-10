/**
 * Benchmark Suite
 *
 * Exports all benchmark utilities and framework functions.
 */

// Framework
export { benchmark, compareResults, formatResult, type BenchmarkResult, type BenchmarkOptions } from './framework.js';

// Baseline management
export {
  saveBaseline,
  loadBaseline,
  listBaselines,
  compareWithBaseline,
  systemMatches,
  type Baseline,
} from './baseline.js';

// Regression detection
export {
  checkRegressions,
  checkMemoryRegressions,
  formatRegressionReport,
  printRegressionReport,
  getExitCode,
  type RegressionCheck,
  type RegressionReport,
} from './regression.js';

// Report generation
export {
  generateReport,
  generateCompactReport,
  generateJsonReport,
  printReport,
  type ReportOptions,
} from './report.js';

// Memory benchmarking
export { memoryBenchmark, type MemoryResult } from './memory.bench.js';

// I/O benchmarking
export { type IoResult } from './io.bench.js';
