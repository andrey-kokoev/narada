#!/usr/bin/env tsx
/**
 * Focused Test Runner with Telemetry
 *
 * Runs a single focused test command and records timing + classification
 * to `.ai/metrics/test-runtimes.json`. This makes focused verification
 * visible alongside broad wrapper commands.
 *
 * Usage:
 *   pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"
 *   pnpm test:focused "pnpm --filter @narada2/charters test"
 */

import {
  runStep,
  recordRun,
  classifyStep,
  printMetricsHint,
} from "./test-telemetry.js";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

const rawCommand = process.argv.slice(2).join(" ");

if (!rawCommand) {
  console.error(`${colors.red}Usage: pnpm test:focused "<command>"${colors.reset}`);
  console.error("");
  console.error("Examples:");
  console.error('  pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"');
  console.error('  pnpm test:focused "pnpm --filter @narada2/charters test"');
  console.error('  pnpm test:focused "pnpm --filter @narada2/control-plane test:unit"');
  process.exit(1);
}

console.log(`${colors.dim}=== Focused Test ===${colors.reset}`);
console.log(`${colors.dim}Command:${colors.reset} ${rawCommand}\n`);

const startedAt = new Date().toISOString();
const result = runStep({
  name: "Focused test",
  command: rawCommand,
  stdio: "inherit",
});
const finishedAt = new Date().toISOString();

const classification = classifyStep(result.exitStatus, result.stderr, result.stdout);

recordRun({
  command: rawCommand,
  startedAt,
  finishedAt,
  durationMs: result.durationMs,
  exitStatus: result.exitStatus,
  exitSignal: null,
  stepTimings: [
    {
      name: "Focused test",
      command: rawCommand,
      durationMs: result.durationMs,
      exitStatus: result.exitStatus,
    },
  ],
  classification,
  summary:
    classification === "known-teardown-noise"
      ? "Tests passed; known better-sqlite3 teardown noise"
      : classification === "success"
        ? "Focused test passed"
        : "Focused test failed",
});

printMetricsHint();

if (result.exitStatus !== 0 && classification !== "known-teardown-noise") {
  process.exit(result.exitStatus ?? 1);
}

if (classification === "known-teardown-noise") {
  console.log(
    `\n${colors.yellow}⚠ Known teardown noise detected (${result.exitStatus}).${colors.reset}`,
  );
  console.log(
    `${colors.dim}   This is a harmless better-sqlite3 cleanup artifact that occurs after all tests pass.${colors.reset}`,
  );
}
