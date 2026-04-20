#!/usr/bin/env tsx
/**
 * Integration-test runner across the workspace.
 *
 * Runs integration tests in packages that define a test:integration script.
 */

import {
  runStep,
  recordRun,
  classifyStep,
  printMetricsHint,
  type StepTiming,
} from "./test-telemetry.js";

const INTEGRATION_PACKAGES = ["@narada2/control-plane", "@narada2/daemon"];

const startedAt = new Date().toISOString();
const stepTimings: StepTiming[] = [];
const stepClassifications: Array<ReturnType<typeof classifyStep>> = [];
let failed = false;

for (const pkg of INTEGRATION_PACKAGES) {
  console.log(`\n▶ ${pkg} (integration tests)`);
  const result = runStep({
    name: `${pkg} integration tests`,
    command: `pnpm --filter='${pkg}' run test:integration`,
    stdio: "pipe",
  });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  stepTimings.push({
    name: `${pkg} integration tests`,
    command: `pnpm --filter='${pkg}' run test:integration`,
    durationMs: result.durationMs,
    exitStatus: result.exitStatus,
  });
  const stepClass = classifyStep(result.exitStatus, result.stderr, result.stdout);
  stepClassifications.push(stepClass);
  if (result.exitStatus !== 0 && stepClass !== "known-teardown-noise") {
    failed = true;
  }
}

const finishedAt = new Date().toISOString();
const totalDuration = stepTimings.reduce((sum, s) => sum + s.durationMs, 0);

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
  command: "pnpm test:integration",
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
      ? "All integration tests passed"
      : "Some integration tests failed",
});

printMetricsHint();

if (failed) {
  process.exit(1);
}
