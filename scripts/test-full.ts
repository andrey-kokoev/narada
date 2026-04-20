#!/usr/bin/env tsx
/**
 * Full Test Suite Runner
 *
 * Runs the complete recursive test suite across all workspace packages.
 * Requires explicit opt-in via ALLOW_FULL_TESTS=1 or NARADA_FULL_VERIFY=1
 * to prevent accidental expensive execution.
 */

import {
  runStep,
  recordRun,
  classifyStep,
  printMetricsHint,
  type StepTiming,
} from "./test-telemetry.js";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

if (!process.env.ALLOW_FULL_TESTS && !process.env.NARADA_FULL_VERIFY) {
  console.error(`${colors.red}Full test suite blocked.${colors.reset}`);
  console.error("");
  console.error("The full recursive suite is expensive (~2 min) and should not be run casually.");
  console.error("");
  console.error("  Fast verification:     pnpm verify              (~8 sec)");
  console.error("  Unit tests only:       pnpm test:unit           (~8 sec)");
  console.error("  Control-plane only:    pnpm test:control-plane  (~5 sec)");
  console.error("  Daemon only:           pnpm test:daemon         (~90 sec)");
  console.error("  Full suite:            ALLOW_FULL_TESTS=1 pnpm test:full");
  console.error("  Alternative guard:     NARADA_FULL_VERIFY=1 pnpm test:full");
  console.error("");
  process.exit(1);
}

console.log(`${colors.dim}=== Full Test Suite ===${colors.reset}\n`);

const startedAt = new Date().toISOString();
const stepTimings: StepTiming[] = [];

const result = runStep({
  name: "Full recursive test suite",
  command: 'pnpm --recursive --filter="!." test',
  stdio: "pipe",
});

// Replay captured output so the user still sees test progress/results.
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);

stepTimings.push({
  name: "Full recursive test suite",
  command: 'pnpm --recursive --filter="!." test',
  durationMs: result.durationMs,
  exitStatus: result.exitStatus,
});

const stepClass = classifyStep(result.exitStatus, result.stderr, result.stdout);
const classification = stepClass;

const finishedAt = new Date().toISOString();

recordRun({
  command: "ALLOW_FULL_TESTS=1 pnpm test:full",
  startedAt,
  finishedAt,
  durationMs: result.durationMs,
  exitStatus: result.exitStatus,
  exitSignal: null,
  stepTimings,
  classification,
  summary:
    classification === "known-teardown-noise"
      ? "Tests passed; known better-sqlite3 teardown noise at exit"
      : result.exitStatus === 0
        ? "Full suite passed"
        : "Full suite failed",
});

printMetricsHint();

if (result.exitStatus !== 0 && classification !== "known-teardown-noise") {
  process.exit(1);
}

if (classification === "known-teardown-noise") {
  console.log(
    `\n${colors.yellow}⚠ Known teardown noise detected (${result.exitStatus}).${colors.reset}`,
  );
  console.log(
    `${colors.dim}   This is a harmless better-sqlite3 cleanup artifact that occurs after all tests pass.${colors.reset}`,
  );
  console.log(
    `${colors.dim}   It does not indicate a product regression. See AGENTS.md for details.${colors.reset}\n`,
  );
}
