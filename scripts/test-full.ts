#!/usr/bin/env tsx
/**
 * Full Test Suite Runner
 *
 * Runs the complete recursive test suite across all workspace packages.
 * Requires explicit opt-in via ALLOW_FULL_TESTS=1 or NARADA_FULL_VERIFY=1
 * to prevent accidental expensive execution.
 */

import { execSync } from "node:child_process";

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

try {
  execSync('pnpm --recursive --filter="!." test', { stdio: "inherit" });
} catch {
  process.exit(1);
}
