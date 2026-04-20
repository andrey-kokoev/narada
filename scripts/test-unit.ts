#!/usr/bin/env tsx
/**
 * Unit-test runner across the workspace.
 *
 * For packages with heavy integration suites (kernel, daemon), only unit tests
 * are run. For all other packages, the full package test suite runs (which is
 * already unit-test only).
 */

import {
  runStep,
  recordRun,
  classifyStep,
  printMetricsHint,
  type StepTiming,
} from "./test-telemetry.js";

const HEAVY_PACKAGES = ["@narada2/control-plane", "@narada2/daemon"];

const startedAt = new Date().toISOString();
const stepTimings: StepTiming[] = [];
const stepClassifications: Array<ReturnType<typeof classifyStep>> = [];
let failed = false;
let combinedStdout = "";
let combinedStderr = "";

for (const pkg of HEAVY_PACKAGES) {
  console.log(`\n▶ ${pkg} (unit tests only)`);
  const result = runStep({
    name: `${pkg} unit tests`,
    command: `pnpm --filter='${pkg}' run test:unit`,
    stdio: "pipe",
  });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  stepTimings.push({
    name: `${pkg} unit tests`,
    command: `pnpm --filter='${pkg}' run test:unit`,
    durationMs: result.durationMs,
    exitStatus: result.exitStatus,
  });
  const stepClass = classifyStep(result.exitStatus, result.stderr, result.stdout);
  stepClassifications.push(stepClass);
  combinedStdout += result.stdout;
  combinedStderr += result.stderr;
  if (result.exitStatus !== 0 && stepClass !== "known-teardown-noise") {
    failed = true;
  }
}

console.log(`\n▶ Remaining packages`);
const result = runStep({
  name: "Remaining packages",
  command: `pnpm --recursive --filter='!.' --filter='!@narada2/control-plane' --filter='!@narada2/daemon' test`,
  stdio: "pipe",
});
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
stepTimings.push({
  name: "Remaining packages",
  command: "pnpm --recursive test (excluding heavy)",
  durationMs: result.durationMs,
  exitStatus: result.exitStatus,
});
const remainingClass = classifyStep(result.exitStatus, result.stderr, result.stdout);
stepClassifications.push(remainingClass);
combinedStdout += result.stdout;
combinedStderr += result.stderr;
if (result.exitStatus !== 0 && remainingClass !== "known-teardown-noise") {
  failed = true;
}

const finishedAt = new Date().toISOString();
const totalDuration = stepTimings.reduce((sum, s) => sum + s.durationMs, 0);

// Overall classification: most severe among step classifications
// precedence: assertion-failure > infrastructure-failure > known-teardown-noise > success
function severity(c: ReturnType<typeof classifyStep>): number {
  switch (c) {
    case "assertion-failure": return 3;
    case "infrastructure-failure": return 2;
    case "known-teardown-noise": return 1;
    case "success": return 0;
  }
}
const classification = stepClassifications.reduce((worst, current) =>
  severity(current) > severity(worst) ? current : worst,
);

recordRun({
  command: "pnpm test:unit",
  startedAt,
  finishedAt,
  durationMs: totalDuration,
  exitStatus: failed ? 1 : 0,
  exitSignal: null,
  stepTimings,
  classification,
  summary: classification === "known-teardown-noise"
    ? "Tests passed; known better-sqlite3 teardown noise"
    : classification === "success"
      ? "All unit tests passed"
      : "Some unit tests failed",
});

printMetricsHint();

if (failed) {
  process.exit(1);
}
