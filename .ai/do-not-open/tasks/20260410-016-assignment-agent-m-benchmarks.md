# Agent M Assignment: Performance Benchmarks

## Mission
Establish performance baselines and regression detection for sync operations.

## Scope
`packages/exchange-fs-sync/` - Benchmark suite

## Deliverables

### 1. Benchmark Framework

```typescript
// test/benchmarks/framework.ts
export interface BenchmarkOptions {
  warmupRuns: number;       // default: 3
  measurementRuns: number;  // default: 10
  maxDurationMs: number;    // default: 60000
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
}

export async function benchmark(
  name: string,
  fn: () => Promise<void>,
  options?: Partial<BenchmarkOptions>
): Promise<BenchmarkResult>;
```

### 2. Core Benchmarks

```typescript
// test/benchmarks/sync.bench.ts
describe('Sync Performance', () => {
  bench('sync 100 messages', async () => {
    const { adapter, store } = await setup({ messageCount: 100 });
    await syncOnce(adapter, store);
  });

  bench('sync 1,000 messages', async () => {
    const { adapter, store } = await setup({ messageCount: 1000 });
    await syncOnce(adapter, store);
  });

  bench('sync 10,000 messages', async () => {
    const { adapter, store } = await setup({ messageCount: 10000 });
    await syncOnce(adapter, store);
  });
});

// test/benchmarks/adapter.bench.ts
describe('Graph Adapter', () => {
  bench('normalize message ID', () => {
    normalizeMessageId('AQMkADAwATM0MDAAMS0xMzUALTA0MjAARgAAA...');
  });

  bench('parse Graph response', async () => {
    parseMessageResponse(largeResponse);
  });
});

// test/benchmarks/store.bench.ts
describe('Message Store', () => {
  bench('write single message', async () => {
    await store.write(createMockMessage());
  });

  bench('write 100 message batch', async () => {
    await store.writeBatch(createMockMessages(100));
  });

  bench('read random message', async () => {
    await store.read(randomMessageId());
  });
});

// test/benchmarks/view.bench.ts
describe('View Queries', () => {
  bench('query by date range', async () => {
    await viewStore.query({
      receivedAfter: '2024-01-01',
      receivedBefore: '2024-02-01'
    });
  });

  bench('full-text search', async () => {
    await viewStore.search('project proposal');
  });
});
```

### 3. Memory Benchmarks

```typescript
// test/benchmarks/memory.bench.ts
export async function memoryBenchmark(
  fn: () => Promise<void>
): Promise<{
  heapBeforeMB: number;
  heapAfterMB: number;
  heapMaxMB: number;
  leakedMB: number;
}> {
  if (global.gc) global.gc();  // force gc if available
  
  const before = process.memoryUsage().heapUsed;
  let max = before;
  
  // Run and track max memory
  await fn();
  
  const after = process.memoryUsage().heapUsed;
  
  return {
    heapBeforeMB: before / 1024 / 1024,
    heapAfterMB: after / 1024 / 1024,
    heapMaxMB: max / 1024 / 1024,
    leakedMB: (after - before) / 1024 / 1024,
  };
}

// Usage:
bench('memory: sync 1000 messages', async () => {
  const mem = await memoryBenchmark(async () => {
    await syncMessages(1000);
  });
  
  // Assert no significant leak
  expect(mem.leakedMB).toBeLessThan(50);
});
```

### 4. I/O Benchmarks

```typescript
// test/benchmarks/io.bench.ts
export async function ioBenchmark(
  fn: () => Promise<void>
): Promise<{
  readOps: number;
  writeOps: number;
  readBytes: number;
  writeBytes: number;
}>;

// Use fs hooks or strace on Linux to count I/O ops
```

### 5. Baseline Storage

```typescript
// test/benchmarks/baseline.ts
export interface Baseline {
  version: string;
  commit: string;
  timestamp: string;
  results: BenchmarkResult[];
}

export async function saveBaseline(baseline: Baseline): Promise<void>;
export async function loadBaseline(version: string): Promise<Baseline | null>;

// Stored in: .benchmarks/baselines/{version}.json
```

### 6. Regression Detection

```typescript
// test/benchmarks/regression.ts
export interface RegressionCheck {
  benchmark: string;
  current: number;
  baseline: number;
  changePercent: number;
  threshold: number;
  passed: boolean;
}

export async function checkRegressions(
  current: BenchmarkResult[],
  baseline: BenchmarkResult[],
  threshold: number  // e.g., 10% regression = fail
): Promise<RegressionCheck[]>;

// CI usage:
// 1. Load baseline from main branch
// 2. Run benchmarks on PR
// 3. Compare
// 4. Fail if any benchmark regressed > threshold
```

### 7. Benchmark CI

```yaml
# .github/workflows/benchmark.yml
name: Benchmark
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build
      
      - name: Run benchmarks
        run: pnpm benchmark --reporter json > results.json
      
      - name: Compare with baseline
        run: |
          pnpm benchmark:compare results.json .benchmarks/baseline.json
      
      - name: Update baseline (main only)
        if: github.ref == 'refs/heads/main'
        run: |
          cp results.json .benchmarks/baseline.json
          git add .benchmarks/baseline.json
          git commit -m "Update benchmark baseline"
          git push
```

### 8. Profiling Tools

```typescript
// scripts/profile.ts
import { writeFileSync } from 'fs';
import { Session } from 'inspector';

export async function profileSync(
  durationMs: number
): Promise<void> {
  const session = new Session();
  session.connect();
  
  await new Promise<void>((resolve) => {
    session.post('Profiler.enable', () => {
      session.post('Profiler.start', () => {
        setTimeout(() => {
          session.post('Profiler.stop', (err, { profile }) => {
            writeFileSync('profile.cpuprofile', JSON.stringify(profile));
            resolve();
          });
        }, durationMs);
      });
    });
  });
}

// Usage: node --inspect scripts/profile.ts
```

### 9. Benchmark Reports

```typescript
// Generate markdown report
export function generateReport(
  results: BenchmarkResult[],
  baseline?: BenchmarkResult[]
): string {
  return `
# Performance Report

| Benchmark | Current | Baseline | Change |
|-----------|---------|----------|--------|
${results.map(r => {
  const b = baseline?.find(b => b.name === r.name);
  const change = b ? ((r.meanMs - b.meanMs) / b.meanMs * 100).toFixed(1) : '-';
  const emoji = parseFloat(change) > 10 ? '🔴' : parseFloat(change) < -10 ? '🟢' : '⚪';
  return `| ${r.name} | ${r.meanMs.toFixed(0)}ms | ${b?.meanMs.toFixed(0) || '-'}ms | ${emoji} ${change}% |`;
}).join('\n')}

## Memory Usage
${results.map(r => `- ${r.name}: ${r.memoryDeltaMB.toFixed(1)}MB`).join('\n')}
  `;
}
```

## Definition of Done

- [ ] Benchmark framework with statistical rigor
- [ ] Benchmarks for: sync, adapter, store, views
- [ ] Memory leak detection
- [ ] Baseline storage and loading
- [ ] Regression detection in CI
- [ ] CPU profiling script
- [ ] Markdown report generation
- [ ] Documented performance targets
- [ ] Benchmarks run in <5 minutes total

## Dependencies
- Agent E's test infrastructure (vitest setup)
- Agent F's batch processing (benchmark scale)
- Agent B's mock adapter (controlled test data)

## Time Estimate
2 hours
