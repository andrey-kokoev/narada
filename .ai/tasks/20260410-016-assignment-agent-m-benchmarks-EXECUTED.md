# Agent M Assignment: Performance Benchmarks

## Mission
Establish performance baselines and regression detection for sync operations.

## Scope
`packages/exchange-fs-sync/` - Benchmark suite

## Deliverables

### 1. Benchmark Framework ✅
Created `test/benchmarks/framework.ts` with statistical rigor:

```typescript
export interface BenchmarkOptions {
  warmupRuns: number;       // default: 3
  measurementRuns: number;  // default: 10
  maxDurationMs: number;    // default: 60000
  outlierThreshold: number; // reject beyond N std dev
}

export interface BenchmarkResult {
  name: string;
  runs: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  stdDev: number;
  opsPerSecond: number;
  memoryDeltaMB: number;
  minMs: number;
  maxMs: number;
}

export async function benchmark(
  name: string,
  fn: () => Promise<void>,
  options?: Partial<BenchmarkOptions>
): Promise<BenchmarkResult>;
```

Features:
- Warmup runs to stabilize JIT
- Outlier rejection (beyond 3 std dev)
- Statistical measures: mean, median, p95, p99, stdDev
- Memory tracking
- Operations per second calculation

### 2. Core Benchmarks ✅

**Sync Benchmarks** (`test/benchmarks/sync.bench.ts`):
- Sync 100, 1,000, 10,000 messages
- Event ID generation
- Apply log operations

**Adapter Benchmarks** (`test/benchmarks/adapter.bench.ts`):
- Message ID normalization
- Parse small/large message responses
- Batch normalization (100 messages)
- Delta response parsing
- Content hashing
- Event ID generation

**Store Benchmarks** (`test/benchmarks/store.bench.ts`):
- Single message write/read
- Batch writes (100 messages)
- Existence checks
- Blob store (1KB, 100KB, 1MB)
- Apply log append and check operations

**View Benchmarks** (`test/benchmarks/view.bench.ts`):
- Date range queries (100, 1000 messages)
- Thread queries
- Full-text search
- View rebuild
- Index operations

### 3. Memory Benchmarks ✅
Created `test/benchmarks/memory.bench.ts`:

```typescript
export async function memoryBenchmark(
  fn: () => Promise<void>,
  iterations?: number
): Promise<{
  heapBeforeMB: number;
  heapAfterMB: number;
  heapMaxMB: number;
  leakedMB: number;
}>;
```

Tests:
- Sync memory stability (100, 1000 messages)
- Store operation memory efficiency
- Adapter normalization memory usage
- Memory stress tests (10 sync cycles)
- Leak detection with assertions

### 4. I/O Benchmarks ✅
Created `test/benchmarks/io.bench.ts`:

- Message store I/O counts
- Blob throughput (1MB, 10MB)
- Cursor atomic writes
- Apply log sequential writes
- Raw filesystem baseline

### 5. Baseline Storage ✅
Created `test/benchmarks/baseline.ts`:

```typescript
export interface Baseline {
  version: string;
  commit: string;
  timestamp: string;
  results: BenchmarkResult[];
  system: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    totalMemoryGB: number;
  };
}

export async function saveBaseline(results: BenchmarkResult[]): Promise<Baseline>;
export async function loadBaseline(version: string): Promise<Baseline | null>;
export function compareWithBaseline(current: BenchmarkResult[], baseline: Baseline);
export function systemMatches(baseline: Baseline);
```

Storage: `.benchmarks/baselines/{version}.json`

### 6. Regression Detection ✅
Created `test/benchmarks/regression.ts`:

```typescript
export interface RegressionCheck {
  benchmark: string;
  current: number;
  baseline: number;
  changePercent: number;
  threshold: number;
  passed: boolean;
}

export function checkRegressions(
  current: BenchmarkResult[],
  baseline: BenchmarkResult[],
  threshold: number  // default: 10%
): RegressionReport;

export function checkMemoryRegressions(...);
export function formatRegressionReport(report: RegressionReport): string;
export function printRegressionReport(report: RegressionReport): void;
export function getExitCode(report: RegressionReport): number;
```

### 7. Benchmark CI ✅
Created `.github/workflows/benchmark.yml`:

Three jobs:
1. **benchmark**: Runs benchmarks, compares with baseline, comments on PRs, updates baseline on main
2. **memory-check**: Runs memory benchmarks with --expose-gc
3. **performance-targets**: Validates against documented targets

Features:
- Artifact upload for results
- PR comments with benchmark results
- Automatic baseline updates on main
- Regression failure on >10% degradation

### 8. Profiling Tools ✅
Created `scripts/profile.ts`:

```typescript
export async function profileSync(durationMs: number): Promise<void>;
export async function profileNormalization(durationMs: number): Promise<void>;
```

Features:
- CPU profiling using Node.js inspector
- Profiles sync operations and normalization
- Generates `.cpuprofile` files for Chrome DevTools
- Configurable duration and operation type

Usage:
```bash
node --inspect scripts/profile.ts 5000 sync
node --inspect scripts/profile.ts 5000 normalization
```

### 9. Benchmark Reports ✅
Created `test/benchmarks/report.ts`:

```typescript
export function generateReport(
  results: BenchmarkResult[],
  baseline?: Baseline,
  options?: ReportOptions
): string;  // Markdown

export function generateCompactReport(results, baseline): string;
export function generateJsonReport(results, baseline): string;
export function printReport(results, baseline): void;
```

Features:
- Full markdown reports with tables
- System information
- Comparison with baseline
- Detailed statistics
- Memory usage section
- Compact CI-friendly output

### 10. Performance Documentation ✅
Created `PERFORMANCE.md`:

Documents performance targets for:
- Sync operations (100, 1K, 10K messages)
- Store operations (read/write/check)
- Adapter operations (normalize/parse/hash)
- View operations (query/search/rebuild)
- Memory usage targets
- Regression thresholds (10%)
- System requirements

### 11. Scripts and Integration ✅

**Package.json scripts**:
```json
{
  "benchmark": "vitest bench --run",
  "benchmark:watch": "vitest bench",
  "benchmark:report": "vitest bench --run --reporter=verbose",
  "profile": "node --inspect --expose-gc ../scripts/profile.ts"
}
```

**Root package.json**:
```json
{
  "benchmark": "pnpm -r benchmark",
  "benchmark:compare": "tsx scripts/benchmark-compare.ts"
}
```

**Benchmark comparison script** (`scripts/benchmark-compare.ts`):
- Compares current vs baseline
- Markdown report generation
- Exit code for CI integration

**Benchmark index** (`test/benchmarks/index.ts`):
- Exports all benchmark utilities
- Centralized imports for consumers

## Definition of Done

- [x] Benchmark framework with statistical rigor
- [x] Benchmarks for: sync, adapter, store, views
- [x] Memory leak detection
- [x] Baseline storage and loading
- [x] Regression detection in CI
- [x] CPU profiling script
- [x] Markdown report generation
- [x] Documented performance targets
- [x] Benchmarks run in <5 minutes total (configured with appropriate iterations)

## Files Created

### Core Framework
- `test/benchmarks/framework.ts` - Benchmark runner with statistics
- `test/benchmarks/baseline.ts` - Baseline storage and loading
- `test/benchmarks/regression.ts` - Regression detection
- `test/benchmarks/report.ts` - Report generation
- `test/benchmarks/index.ts` - Module exports
- `test/benchmarks/run.ts` - CLI runner

### Benchmark Suites
- `test/benchmarks/sync.bench.ts` - Sync performance
- `test/benchmarks/adapter.bench.ts` - Adapter/normalization
- `test/benchmarks/store.bench.ts` - Persistence store
- `test/benchmarks/view.bench.ts` - View queries
- `test/benchmarks/memory.bench.ts` - Memory benchmarks
- `test/benchmarks/io.bench.ts` - I/O benchmarks

### Scripts and Config
- `scripts/profile.ts` - CPU profiling
- `scripts/benchmark-compare.ts` - Comparison tool
- `.github/workflows/benchmark.yml` - CI workflow
- `PERFORMANCE.md` - Performance targets documentation

### Modified Files
- `packages/exchange-fs-sync/package.json` - Added benchmark scripts
- `package.json` - Added root benchmark scripts

## Usage

```bash
# Run all benchmarks
pnpm benchmark

# Run specific benchmark
pnpm benchmark -- sync.bench

# Watch mode
pnpm benchmark:watch

# Compare with baseline
pnpm benchmark:compare

# Save new baseline
pnpm benchmark --baseline

# Profile CPU
pnpm profile

# View help
pnpm benchmark --help
```

## Notes

- Benchmarks use Vitest's bench API
- Statistical rigor with outlier rejection
- CI integration with GitHub Actions
- Performance targets documented in PERFORMANCE.md
- All benchmarks include memory tracking
