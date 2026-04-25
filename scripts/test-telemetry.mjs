#!/usr/bin/env node
/**
 * Test Runtime Telemetry
 *
 * Shared helper for recording timing, exit status, and classification
 * of test commands. Appends to `.ai/metrics/test-runtimes.json`.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const METRICS_DIR = join(process.cwd(), ".ai", "metrics");
const METRICS_FILE = join(METRICS_DIR, "test-runtimes.json");

function ensureMetricsDir() {
  if (!existsSync(METRICS_DIR)) {
    mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function loadEntries() {
  ensureMetricsDir();
  if (!existsSync(METRICS_FILE)) return [];
  try {
    const raw = readFileSync(METRICS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  ensureMetricsDir();
  writeFileSync(METRICS_FILE, JSON.stringify(entries, null, 2) + "\n");
}

function hasTestSuitePassedEvidence(stderr, stdout) {
  const combined = stderr + stdout;
  if (/Test Files\s+\d+\s+passed\s*\(\d+\)/m.test(combined)) return true;

  const lines = combined.split("\n");
  const hasFailingFile = lines.some(
    (l) => l.includes("❯") && l.includes(".test.ts") && l.includes("failed"),
  );
  if (hasFailingFile) return false;

  const hasFailMarks = lines.some((l) => l.includes("✗"));
  if (hasFailMarks) return false;

  const hasPassingFiles = lines.some(
    (l) => l.includes("✓") && l.includes(".test.ts"),
  );
  return hasPassingFiles;
}

export function classifyStep(exitStatus, stderr, stdout) {
  const combined = stderr + stdout;

  if (exitStatus === 0) return "success";

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
    if (hasTestSuitePassedEvidence(stderr, stdout)) {
      return "known-teardown-noise";
    }
    return "infrastructure-failure";
  }

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

export function runStep(opts) {
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
  } catch (err) {
    exitStatus = err.status ?? 1;
    stdout = err.stdout?.toString() ?? "";
    stderr = err.stderr?.toString() ?? "";
  }

  const durationMs = Date.now() - start;
  return { exitStatus, stdout, stderr, durationMs };
}

export function recordRun(entry) {
  const entries = loadEntries();
  const trimmed = entries.slice(-199);
  trimmed.push(entry);
  saveEntries(trimmed);
}

export function printMetricsHint() {
  console.log("\n📊 Test runtime metrics: .ai/metrics/test-runtimes.json\n");
}
