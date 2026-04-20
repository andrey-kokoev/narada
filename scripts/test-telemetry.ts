#!/usr/bin/env tsx
/**
 * Test Runtime Telemetry
 *
 * Shared helper for recording timing, exit status, and classification
 * of test commands. Appends to `.ai/metrics/test-runtimes.json`.
 */

import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const METRICS_DIR = join(process.cwd(), ".ai", "metrics");
const METRICS_FILE = join(METRICS_DIR, "test-runtimes.json");

export interface StepTiming {
  name: string;
  command: string;
  durationMs: number;
  exitStatus: number;
}

export interface TelemetryEntry {
  command: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitStatus: number | null;
  exitSignal: string | null;
  stepTimings: StepTiming[];
  classification:
    | "success"
    | "assertion-failure"
    | "infrastructure-failure"
    | "known-teardown-noise";
  summary?: string;
}

function ensureMetricsDir(): void {
  if (!existsSync(METRICS_DIR)) {
    mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function loadEntries(): TelemetryEntry[] {
  ensureMetricsDir();
  if (!existsSync(METRICS_FILE)) return [];
  try {
    const raw = readFileSync(METRICS_FILE, "utf8");
    return JSON.parse(raw) as TelemetryEntry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: TelemetryEntry[]): void {
  ensureMetricsDir();
  writeFileSync(METRICS_FILE, JSON.stringify(entries, null, 2) + "\n");
}

/**
 * Heuristic: does the captured output contain evidence that the test suite
 * completed with all tests passing? This is used to distinguish harmless
 * better-sqlite3 teardown crashes from genuine infrastructure failures.
 */
function hasTestSuitePassedEvidence(stderr: string, stdout: string): boolean {
  const combined = stderr + stdout;
  // Vitest "all passed" summary signature: "Test Files  12 passed (12)"
  // If any failed, Vitest prints: "Test Files  11 passed | 1 failed (12)"
  if (/Test Files\s+\d+\s+passed\s*\(\d+\)/m.test(combined)) return true;

  // Fallback: Vitest sometimes crashes before printing the summary line.
  // Inspect individual test file lines to determine pass/fail status.
  const lines = combined.split("\n");

  // Failing test files are marked with ❯ and contain "| N failed"
  const hasFailingFile = lines.some(
    (l) => l.includes("❯") && l.includes(".test.ts") && l.includes("failed"),
  );
  if (hasFailingFile) return false;

  // Individual failing tests within a file are marked with ✗
  const hasFailMarks = lines.some((l) => l.includes("✗"));
  if (hasFailMarks) return false;

  // Passing test files are marked with ✓
  const hasPassingFiles = lines.some(
    (l) => l.includes("✓") && l.includes(".test.ts"),
  );
  return hasPassingFiles;
}

export function classifyStep(
  exitStatus: number,
  stderr: string,
  stdout: string,
): TelemetryEntry["classification"] {
  const combined = stderr + stdout;

  if (exitStatus === 0) return "success";

  // Known better-sqlite3 / V8 teardown noise signatures
  const teardownSignatures = [
    "Fatal JavaScript invalid size error",
    "V8_Fatal",
    "Trace/breakpoint trap",
    "SIGTRAP",
  ];
  const looksLikeTeardownCrash = teardownSignatures.some((s) =>
    combined.includes(s),
  );

  if (exitStatus === 133 || looksLikeTeardownCrash) {
    // Step-level classification must be evidence-based. Without proof that
    // the suite completed successfully, a crash is treated as a genuine
    // infrastructure failure rather than harmless teardown noise.
    if (hasTestSuitePassedEvidence(stderr, stdout)) {
      return "known-teardown-noise";
    }
    return "infrastructure-failure";
  }

  // Test assertion failures typically show vitest/pnpm error patterns
  const assertionPatterns = [
    "AssertionError",
    "expect(",
    "FAIL",
    "✗",
    "failed",
  ];
  const hasAssertionFailure = assertionPatterns.some((p) =>
    combined.includes(p),
  );

  if (hasAssertionFailure) {
    return "assertion-failure";
  }

  return "infrastructure-failure";
}


export interface RunOptions {
  name: string;
  command: string;
  stdio?: ExecSyncOptions["stdio"];
  env?: Record<string, string | undefined>;
}

export interface RunResult {
  exitStatus: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function runStep(opts: RunOptions): RunResult {
  const start = Date.now();
  let exitStatus = 0;
  let stdout = "";
  let stderr = "";

  try {
    const output = execSync(opts.command, {
      stdio: opts.stdio ?? "pipe",
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, ...opts.env },
    });
    stdout = output;
  } catch (err: any) {
    exitStatus = err.status ?? 1;
    stdout = err.stdout?.toString() ?? "";
    stderr = err.stderr?.toString() ?? "";
  }

  const durationMs = Date.now() - start;
  return { exitStatus, stdout, stderr, durationMs };
}

export function recordRun(entry: TelemetryEntry): void {
  const entries = loadEntries();
  // Keep last 200 entries to prevent unbounded growth
  const trimmed = entries.slice(-199);
  trimmed.push(entry);
  saveEntries(trimmed);
}

export function makeSummary(entry: TelemetryEntry): string {
  const parts: string[] = [];
  parts.push(`Command: ${entry.command}`);
  parts.push(`Duration: ${(entry.durationMs / 1000).toFixed(1)}s`);
  parts.push(`Classification: ${entry.classification}`);
  if (entry.stepTimings.length > 0) {
    const slowest = [...entry.stepTimings].sort((a, b) => b.durationMs - a.durationMs)[0];
    parts.push(`Slowest step: ${slowest.name} (${(slowest.durationMs / 1000).toFixed(1)}s)`);
  }

  return parts.join(" | ");
}

export function printMetricsHint(): void {
  console.log(
    "\n📊 Test runtime metrics: .ai/metrics/test-runtimes.json\n",
  );
}

export function printRecentSummary(limit = 5): void {
  const entries = loadEntries().slice(-limit);
  if (entries.length === 0) return;
  console.log("\n📊 Recent test runs:\n");
  for (const entry of entries) {
    const status =
      entry.classification === "success"
        ? "✓"
        : entry.classification === "known-teardown-noise"
          ? "⚠"
          : "✗";
    console.log(
      `  ${status} ${entry.command} — ${(entry.durationMs / 1000).toFixed(1)}s — ${entry.classification}`,
    );
  }
  console.log("");
}
