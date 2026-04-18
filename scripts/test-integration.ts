#!/usr/bin/env tsx
/**
 * Integration-test runner across the workspace.
 *
 * Runs integration tests in packages that define a test:integration script.
 */

import { execSync } from 'node:child_process';

const INTEGRATION_PACKAGES = ['@narada2/control-plane', '@narada2/daemon'];

let failed = false;

for (const pkg of INTEGRATION_PACKAGES) {
  console.log(`\n▶ ${pkg} (integration tests)`);
  try {
    execSync(`pnpm --filter='${pkg}' run test:integration`, { stdio: 'inherit' });
  } catch {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
