#!/usr/bin/env tsx
/**
 * Benchmark Comparison Script
 *
 * Compares current benchmark results with baselines.
 *
 * Usage:
 *   pnpm benchmark:compare [current.json] [baseline.json]
 */

import { readFile, existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const readFileAsync = promisify(readFile);

interface BenchmarkResult {
  name: string;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  stdDev: number;
  opsPerSecond: number;
  memoryDeltaMB: number;
}

interface Baseline {
  version: string;
  commit: string;
  timestamp: string;
  results: BenchmarkResult[];
}

interface ComparisonResult {
  name: string;
  current: number;
  baseline: number;
  changePercent: number;
  status: 'improved' | 'regressed' | 'stable' | 'new';
}

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = await readFileAsync(path, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function compareResults(
  current: BenchmarkResult[],
  baseline: BenchmarkResult[],
  threshold = 10,
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  for (const curr of current) {
    const base = baseline.find(b => b.name === curr.name);

    if (!base) {
      results.push({
        name: curr.name,
        current: curr.meanMs,
        baseline: 0,
        changePercent: 0,
        status: 'new',
      });
      continue;
    }

    const changePercent = ((curr.meanMs - base.meanMs) / base.meanMs) * 100;

    let status: 'improved' | 'regressed' | 'stable';
    if (changePercent < -threshold) {
      status = 'improved';
    } else if (changePercent > threshold) {
      status = 'regressed';
    } else {
      status = 'stable';
    }

    results.push({
      name: curr.name,
      current: curr.meanMs,
      baseline: base.meanMs,
      changePercent,
      status,
    });
  }

  return results;
}

function formatComparison(results: ComparisonResult[]): string {
  const lines: string[] = [];

  lines.push('# Benchmark Comparison\n');

  // Group by status
  const regressed = results.filter(r => r.status === 'regressed');
  const improved = results.filter(r => r.status === 'improved');
  const stable = results.filter(r => r.status === 'stable');
  const new_ = results.filter(r => r.status === 'new');

  if (regressed.length > 0) {
    lines.push('## 🔴 Regressions\n');
    for (const r of regressed) {
      lines.push(
        `- ${r.name}: +${r.changePercent.toFixed(1)}% (${r.current.toFixed(1)}ms vs ${r.baseline.toFixed(1)}ms)`,
      );
    }
    lines.push('');
  }

  if (improved.length > 0) {
    lines.push('## 🟢 Improvements\n');
    for (const r of improved) {
      lines.push(
        `- ${r.name}: ${r.changePercent.toFixed(1)}% (${r.current.toFixed(1)}ms vs ${r.baseline.toFixed(1)}ms)`,
      );
    }
    lines.push('');
  }

  if (stable.length > 0) {
    lines.push('## ⚪ Stable\n');
    for (const r of stable.slice(0, 10)) {
      // Show first 10
      const sign = r.changePercent > 0 ? '+' : '';
      lines.push(
        `- ${r.name}: ${sign}${r.changePercent.toFixed(1)}% (${r.current.toFixed(1)}ms vs ${r.baseline.toFixed(1)}ms)`,
      );
    }
    if (stable.length > 10) {
      lines.push(`- ... and ${stable.length - 10} more`);
    }
    lines.push('');
  }

  if (new_.length > 0) {
    lines.push('## 🆕 New Benchmarks\n');
    for (const r of new_) {
      lines.push(`- ${r.name}: ${r.current.toFixed(1)}ms`);
    }
    lines.push('');
  }

  // Summary
  lines.push('## Summary\n');
  lines.push(`- Regressed: ${regressed.length}`);
  lines.push(`- Improved: ${improved.length}`);
  lines.push(`- Stable: ${stable.length}`);
  lines.push(`- New: ${new_.length}`);
  lines.push('');

  const hasRegressions = regressed.length > 0;
  lines.push(hasRegressions ? '❌ FAILED: Regressions detected' : '✅ PASSED: No regressions');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const currentPath = args[0] || join(process.cwd(), 'benchmark-results.json');
  const baselinePath =
    args[1] || join(process.cwd(), '.benchmarks', 'baselines', 'latest.json');

  console.log('Loading current results:', currentPath);
  console.log('Loading baseline:', baselinePath);
  console.log();

  const current = await loadJson<{ results: BenchmarkResult[] }>(currentPath);
  const baseline = await loadJson<Baseline>(baselinePath);

  if (!current) {
    console.error('Error: Could not load current results from', currentPath);
    console.error('Run benchmarks first: pnpm benchmark');
    process.exit(1);
  }

  if (!baseline) {
    console.error('Error: Could not load baseline from', baselinePath);
    console.error('Create a baseline first: pnpm benchmark --baseline');
    process.exit(1);
  }

  const comparison = compareResults(current.results, baseline.results);
  const report = formatComparison(comparison);

  console.log(report);

  // Exit with error code if regressions found
  const hasRegressions = comparison.some(c => c.status === 'regressed');
  process.exit(hasRegressions ? 1 : 0);
}

main().catch(err => {
  console.error('Comparison failed:', err);
  process.exit(1);
});
