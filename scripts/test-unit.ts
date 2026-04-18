#!/usr/bin/env tsx
/**
 * Unit-test runner across the workspace.
 *
 * For packages with heavy integration suites (kernel, daemon), only unit tests
 * are run. For all other packages, the full package test suite runs (which is
 * already unit-test only).
 */

import { execSync } from 'node:child_process';

const HEAVY_PACKAGES = ['@narada2/control-plane', '@narada2/daemon'];

let failed = false;

for (const pkg of HEAVY_PACKAGES) {
  console.log(`\n▶ ${pkg} (unit tests only)`);
  try {
    execSync(`pnpm --filter='${pkg}' run test:unit`, { stdio: 'inherit' });
  } catch {
    failed = true;
  }
}

console.log(`\n▶ Remaining packages`);
try {
  execSync(`pnpm --recursive --filter='!.' --filter='!@narada2/control-plane' --filter='!@narada2/daemon' test`, { stdio: 'inherit' });
} catch {
  failed = true;
}

if (failed) {
  process.exit(1);
}
