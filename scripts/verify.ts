#!/usr/bin/env tsx
/**
 * Fast Verification Script
 *
 * Runs the narrow verification ladder: typecheck + build + unit tests.
 * Excludes heavy integration suites (control-plane, daemon integration tests).
 *
 * This is the default verification command. Use `pnpm test:full` for
 * the complete recursive suite (requires ALLOW_FULL_TESTS=1).
 */

import { execSync } from "node:child_process";

interface Step {
  name: string;
  command: string;
}

const steps: Step[] = [
  { name: "Task file guard", command: "tsx scripts/task-file-guard.ts" },
  { name: "Typecheck", command: "pnpm typecheck" },
  { name: "Build", command: "pnpm build" },
  { name: "Control-plane unit tests", command: "pnpm --filter @narada2/control-plane test:unit" },
  { name: "Daemon unit tests", command: "pnpm --filter @narada2/daemon test:unit" },
  { name: "Charters tests", command: "pnpm --filter @narada2/charters test" },
  { name: "Ops-kit tests", command: "pnpm --filter @narada2/ops-kit test" },
  { name: "CLI tests", command: "pnpm --filter @narada2/cli test" },
];

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

let failed = false;

console.log(`${colors.dim}=== Fast Verification (${steps.length} steps) ===${colors.reset}\n`);

for (const step of steps) {
  process.stdout.write(`${step.name} ... `);
  try {
    execSync(step.command, { stdio: "pipe" });
    console.log(`${colors.green}✓${colors.reset}`);
  } catch (err: any) {
    console.log(`${colors.red}✗${colors.reset}`);
    console.error(`\n${colors.red}--- ${step.name} failed ---${colors.reset}`);
    console.error(err.stderr?.toString() || err.stdout?.toString() || err.message);
    failed = true;
    break;
  }
}

console.log("");

if (failed) {
  console.log(`${colors.red}Verification failed.${colors.reset}`);
  console.log(`${colors.dim}Fix the failing step above, then run \`pnpm verify\` again.${colors.reset}`);
  process.exit(1);
} else {
  console.log(`${colors.green}All ${steps.length} verification steps passed.${colors.reset}`);
  console.log(`${colors.dim}Run \`ALLOW_FULL_TESTS=1 pnpm test:full\` for the complete suite.${colors.reset}`);
}
