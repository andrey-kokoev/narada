#!/usr/bin/env node
/**
 * Pre-publish check script
 *
 * Runs comprehensive checks before publishing to ensure package quality.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
}

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command: string, cwd?: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

function validateSemver(version: string): boolean {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const packages = [
    'packages/exchange-fs-sync',
    'packages/exchange-fs-sync-cli',
    'packages/exchange-fs-sync-daemon',
    'packages/exchange-fs-sync-search',
  ];

  // Check 1: All tests pass
  log('\n📋 Running tests...', 'blue');
  const testResult = runCommand('pnpm test');
  checks.push({
    name: 'Tests pass',
    passed: testResult.success,
    error: testResult.success ? undefined : 'Tests failed',
  });
  log(testResult.success ? '  ✓ Tests passed' : '  ✗ Tests failed', testResult.success ? 'green' : 'red');

  // Check 2: Builds succeed
  log('\n📋 Building packages...', 'blue');
  const buildResult = runCommand('pnpm build');
  checks.push({
    name: 'Build succeeds',
    passed: buildResult.success,
    error: buildResult.success ? undefined : 'Build failed',
  });
  log(buildResult.success ? '  ✓ Build succeeded' : '  ✗ Build failed', buildResult.success ? 'green' : 'red');

  // Check 3: No uncommitted changes
  log('\n📋 Checking for uncommitted changes...', 'blue');
  const gitStatus = runCommand('git status --porcelain');
  const hasUncommitted = gitStatus.success && gitStatus.output.trim().length > 0;
  checks.push({
    name: 'No uncommitted changes',
    passed: !hasUncommitted,
    error: hasUncommitted ? 'There are uncommitted changes' : undefined,
  });
  log(hasUncommitted ? '  ✗ Uncommitted changes found' : '  ✓ No uncommitted changes', hasUncommitted ? 'red' : 'green');

  // Check 4: Valid semver versions
  log('\n📋 Validating package versions...', 'blue');
  let allVersionsValid = true;
  for (const pkgPath of packages) {
    const packageJsonPath = join(pkgPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const isValid = validateSemver(pkg.version);
      if (!isValid) {
        allVersionsValid = false;
        log(`  ✗ Invalid version in ${pkgPath}: ${pkg.version}`, 'red');
      }
    }
  }
  checks.push({
    name: 'Valid semver versions',
    passed: allVersionsValid,
    error: allVersionsValid ? undefined : 'Invalid semver version found',
  });
  if (allVersionsValid) {
    log('  ✓ All versions are valid semver', 'green');
  }

  // Check 5: README exists in all packages
  log('\n📋 Checking for README files...', 'blue');
  let allReadmesExist = true;
  for (const pkgPath of packages) {
    const readmePath = join(pkgPath, 'README.md');
    if (!existsSync(readmePath)) {
      allReadmesExist = false;
      log(`  ✗ Missing README in ${pkgPath}`, 'red');
    }
  }
  checks.push({
    name: 'README files exist',
    passed: allReadmesExist,
    error: allReadmesExist ? undefined : 'Missing README files',
  });
  if (allReadmesExist) {
    log('  ✓ All README files exist', 'green');
  }

  // Check 6: LICENSE file present
  log('\n📋 Checking for LICENSE files...', 'blue');
  let allLicensesExist = true;
  for (const pkgPath of packages) {
    const licensePath = join(pkgPath, 'LICENSE');
    if (!existsSync(licensePath)) {
      allLicensesExist = false;
      log(`  ✗ Missing LICENSE in ${pkgPath}`, 'red');
    }
  }
  checks.push({
    name: 'LICENSE files exist',
    passed: allLicensesExist,
    error: allLicensesExist ? undefined : 'Missing LICENSE files',
  });
  if (allLicensesExist) {
    log('  ✓ All LICENSE files exist', 'green');
  }

  // Check 7: No console.log in production code (excluding cli/ scripts)
  log('\n📋 Checking for console.log statements...', 'blue');
  const consoleLogCheck = runCommand('grep -r "console.log" packages/*/src/ --include="*.ts" || true');
  const hasConsoleLogs = consoleLogCheck.success && consoleLogCheck.output.trim().length > 0;
  // This is a warning, not a failure
  if (hasConsoleLogs) {
    log('  ⚠ console.log statements found (review recommended):', 'yellow');
    consoleLogCheck.output.split('\n').slice(0, 5).forEach(line => {
      if (line.trim()) log(`    ${line}`, 'yellow');
    });
  } else {
    log('  ✓ No console.log statements found', 'green');
  }

  // Check 8: No file: dependencies in published packages
  log('\n📋 Checking for file: dependencies...', 'blue');
  let noFileDependencies = true;
  for (const pkgPath of packages) {
    const packageJsonPath = join(pkgPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name, version] of Object.entries(deps)) {
        if (typeof version === 'string' && version.startsWith('file:')) {
          noFileDependencies = false;
          log(`  ✗ file: dependency found in ${pkgPath}: ${name}@${version}`, 'red');
        }
      }
    }
  }
  checks.push({
    name: 'No file: dependencies',
    passed: noFileDependencies,
    error: noFileDependencies ? undefined : 'file: dependencies found',
  });
  if (noFileDependencies) {
    log('  ✓ No file: dependencies found', 'green');
  }

  return checks;
}

async function main(): Promise<void> {
  log('🔍 Running pre-publish checks...\n', 'blue');

  const checks = await runChecks();
  const failures = checks.filter(c => !c.passed);

  log('\n' + '='.repeat(50), 'blue');
  log(`Results: ${checks.length - failures.length}/${checks.length} checks passed`, failures.length === 0 ? 'green' : 'red');
  log('='.repeat(50), 'blue');

  if (failures.length > 0) {
    log('\n❌ Pre-publish checks failed:', 'red');
    failures.forEach(f => {
      log(`  - ${f.name}: ${f.error}`, 'red');
    });
    process.exit(1);
  } else {
    log('\n✅ All pre-publish checks passed!', 'green');
    log('\nReady to publish with: pnpm release', 'green');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
