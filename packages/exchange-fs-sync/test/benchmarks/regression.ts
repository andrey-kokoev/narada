/**
 * Regression Detection
 *
 * Compares current benchmark results against baselines to detect performance regressions.
 */

import type { BenchmarkResult } from './framework.js';
import type { Baseline } from './baseline.js';

export interface RegressionCheck {
  /** Benchmark name */
  benchmark: string;
  /** Current mean time in ms */
  current: number;
  /** Baseline mean time in ms */
  baseline: number;
  /** Change percentage */
  changePercent: number;
  /** Threshold percentage for regression */
  threshold: number;
  /** Whether check passed */
  passed: boolean;
}

export interface RegressionReport {
  /** All checks */
  checks: RegressionCheck[];
  /** Number of passed checks */
  passed: number;
  /** Number of failed checks */
  failed: number;
  /** Number of benchmarks without baseline */
  missing: number;
  /** Overall pass/fail */
  success: boolean;
}

/**
 * Check for regressions
 *
 * @param current - Current benchmark results
 * @param baseline - Baseline results
 * @param threshold - Regression threshold percentage (default: 10%)
 * @returns Regression check results
 */
export function checkRegressions(
  current: BenchmarkResult[],
  baseline: Baseline,
  threshold = 10,
): RegressionReport {
  const checks: RegressionCheck[] = [];
  let passed = 0;
  let failed = 0;
  let missing = 0;

  for (const curr of current) {
    const baseResult = baseline.results.find(b => b.name === curr.name);

    if (!baseResult) {
      missing++;
      checks.push({
        benchmark: curr.name,
        current: curr.meanMs,
        baseline: 0,
        changePercent: 0,
        threshold,
        passed: true, // No baseline to compare against
      });
      continue;
    }

    const changePercent = ((curr.meanMs - baseResult.meanMs) / baseResult.meanMs) * 100;
    const isRegression = changePercent > threshold;

    if (isRegression) {
      failed++;
    } else {
      passed++;
    }

    checks.push({
      benchmark: curr.name,
      current: curr.meanMs,
      baseline: baseResult.meanMs,
      changePercent,
      threshold,
      passed: !isRegression,
    });
  }

  return {
    checks,
    passed,
    failed,
    missing,
    success: failed === 0,
  };
}

/**
 * Check memory regressions
 */
export function checkMemoryRegressions(
  current: BenchmarkResult[],
  baseline: Baseline,
  threshold = 20, // 20% memory increase threshold
): RegressionReport {
  const checks: RegressionCheck[] = [];
  let passed = 0;
  let failed = 0;
  let missing = 0;

  for (const curr of current) {
    const baseResult = baseline.results.find(b => b.name === curr.name);

    if (!baseResult) {
      missing++;
      checks.push({
        benchmark: `${curr.name} (memory)`,
        current: curr.memoryDeltaMB,
        baseline: 0,
        changePercent: 0,
        threshold,
        passed: true,
      });
      continue;
    }

    const changePercent =
      ((curr.memoryDeltaMB - baseResult.memoryDeltaMB) / Math.max(baseResult.memoryDeltaMB, 1)) *
      100;
    const isRegression = changePercent > threshold;

    if (isRegression) {
      failed++;
    } else {
      passed++;
    }

    checks.push({
      benchmark: `${curr.name} (memory)`,
      current: curr.memoryDeltaMB,
      baseline: baseResult.memoryDeltaMB,
      changePercent,
      threshold,
      passed: !isRegression,
    });
  }

  return {
    checks,
    passed,
    failed,
    missing,
    success: failed === 0,
  };
}

/**
 * Format regression report as markdown
 */
export function formatRegressionReport(report: RegressionReport): string {
  const lines: string[] = [];

  lines.push('# Regression Report\n');
  lines.push(`**Status:** ${report.success ? '✅ PASSED' : '❌ FAILED'}\n`);
  lines.push(`- Passed: ${report.passed}`);
  lines.push(`- Failed: ${report.failed}`);
  lines.push(`- Missing baseline: ${report.missing}\n`);

  if (report.checks.some(c => !c.passed)) {
    lines.push('## Regressions Detected\n');
    lines.push('| Benchmark | Current | Baseline | Change | Status |');
    lines.push('|-----------|---------|----------|--------|--------|');

    for (const check of report.checks.filter(c => !c.passed)) {
      const emoji = check.changePercent > 0 ? '🔴' : '🟢';
      lines.push(
        `| ${check.benchmark} | ${check.current.toFixed(2)}ms | ${check.baseline.toFixed(2)}ms | ${emoji} ${check.changePercent.toFixed(1)}% | FAIL |`,
      );
    }
    lines.push('');
  }

  if (report.checks.some(c => c.passed && c.baseline > 0)) {
    lines.push('## Stable Benchmarks\n');
    lines.push('| Benchmark | Current | Baseline | Change |');
    lines.push('|-----------|---------|----------|--------|');

    for (const check of report.checks.filter(c => c.passed && c.baseline > 0)) {
      const emoji = check.changePercent < -10 ? '🟢' : '⚪';
      lines.push(
        `| ${check.benchmark} | ${check.current.toFixed(2)}ms | ${check.baseline.toFixed(2)}ms | ${emoji} ${check.changePercent.toFixed(1)}% |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format regression report as console output
 */
export function printRegressionReport(report: RegressionReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('REGRESSION REPORT');
  console.log('='.repeat(60));

  console.log(`\nStatus: ${report.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`Missing baseline: ${report.missing}`);

  if (report.checks.some(c => !c.passed)) {
    console.log('\n--- REGRESSIONS DETECTED ---');
    for (const check of report.checks.filter(c => !c.passed)) {
      const arrow = check.changePercent > 0 ? '↑' : '↓';
      console.log(
        `❌ ${check.benchmark}: ${arrow}${Math.abs(check.changePercent).toFixed(1)}% (${check.current.toFixed(2)}ms vs ${check.baseline.toFixed(2)}ms)`,
      );
    }
  }

  const improved = report.checks.filter(c => c.passed && c.changePercent < -10);
  if (improved.length > 0) {
    console.log('\n--- IMPROVEMENTS ---');
    for (const check of improved) {
      console.log(
        `✅ ${check.benchmark}: ↓${Math.abs(check.changePercent).toFixed(1)}% (${check.current.toFixed(2)}ms vs ${check.baseline.toFixed(2)}ms)`,
      );
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * CI-friendly exit code generator
 */
export function getExitCode(report: RegressionReport): number {
  return report.success ? 0 : 1;
}
