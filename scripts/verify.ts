#!/usr/bin/env tsx
/**
 * Fast Verification Script
 *
 * Runs a narrow, reliable verification pipeline:
 *   task-file guard → typecheck → build → fast package tests
 *
 * Excludes slow or crash-prone suites (control-plane unit tests, daemon
 * unit tests, CLI tests) which must be run explicitly via package-scoped
 * commands when needed.
 */

import {
  runStep,
  recordRun,
  classifyStep,
  printMetricsHint,
  type StepTiming,
} from "./test-telemetry.js";

interface Step {
  name: string;
  command: string;
}

const steps: Step[] = [
  { name: "Task file guard", command: "node --import tsx scripts/task-file-guard.ts" },
  { name: "CLI output admission guard", command: "node scripts/cli-output-admission-guard.mjs" },
  { name: "Typecheck", command: "pnpm typecheck" },
  { name: "Build", command: "pnpm build" },
  { name: "Task lifecycle snapshot guard", command: "pnpm narada:guard-task-db" },
  { name: "Task-governance smoke tests", command: "pnpm --filter @narada2/task-governance test:smoke" },
  { name: "Charters tests", command: "pnpm --filter @narada2/charters test" },
  { name: "Ops-kit tests", command: "pnpm --filter @narada2/ops-kit test" },
];

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

const startedAt = new Date().toISOString();
const stepTimings: StepTiming[] = [];
const stepClassifications: Array<ReturnType<typeof classifyStep>> = [];
let failed = false;
let failedStep = "";

console.log(`${colors.dim}=== Fast Verification (${steps.length} steps) ===${colors.reset}\n`);

for (const step of steps) {
  process.stdout.write(`${step.name} ... `);
  const result = runStep({ name: step.name, command: step.command, stdio: "pipe" });
  stepTimings.push({
    name: step.name,
    command: step.command,
    durationMs: result.durationMs,
    exitStatus: result.exitStatus,
  });
  const stepClass = classifyStep(result.exitStatus, result.stderr, result.stdout);
  stepClassifications.push(stepClass);

  if (result.exitStatus === 0) {
    console.log(`${colors.green}✓${colors.reset} ${colors.dim}(${(result.durationMs / 1000).toFixed(1)}s)${colors.reset}`);
  } else {
    console.log(`${colors.red}✗${colors.reset}`);
    console.error(`\n${colors.red}--- ${step.name} failed ---${colors.reset}`);
    console.error(result.stderr || result.stdout || "Unknown error");
    failed = true;
    failedStep = step.name;
    break;
  }
}

console.log("");

const finishedAt = new Date().toISOString();
const totalDuration = stepTimings.reduce((sum, s) => sum + s.durationMs, 0);

function severity(c: ReturnType<typeof classifyStep>): number {
  switch (c) {
    case "assertion-failure": return 3;
    case "infrastructure-failure": return 2;
    case "success": return 0;
    default: return 2;
  }
}
const classification = stepClassifications.reduce((worst, current) =>
  severity(current) > severity(worst) ? current : worst,
);

recordRun({
  command: "pnpm verify",
  startedAt,
  finishedAt,
  durationMs: totalDuration,
  exitStatus: failed ? 1 : 0,
  exitSignal: null,
  stepTimings,
  classification,
  summary: failed ? `Failed at: ${failedStep}` : "All steps passed",
});

if (failed) {
  console.log(`${colors.red}Verification failed.${colors.reset}`);
  console.log(`${colors.dim}Fix the failing step above, then run \`pnpm verify\` again.${colors.reset}`);
  printMetricsHint();
  process.exit(1);
} else {
  console.log(`${colors.green}All ${steps.length} verification steps passed.${colors.reset}`);
  console.log(`${colors.dim}Run package-scoped tests (e.g. \`pnpm test:control-plane\`) when you change those packages.${colors.reset}`);
  console.log(`${colors.dim}Run \`ALLOW_FULL_TESTS=1 pnpm test:full\` for the complete suite.${colors.reset}`);
  printMetricsHint();
}
