#!/usr/bin/env node
/**
 * Pre-publish check script
 *
 * Runs deterministic checks before publishing to ensure package quality.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
}

const PACK_ONLY = process.argv.includes('--pack-only');
const PACKAGES = [
  'packages/layers/control-plane',
  'packages/layers/cli',
  'packages/layers/daemon',
  'packages/verticals/search',
  'packages/domains/charters',
] as const;

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
    const output = error instanceof Error && 'message' in error ? String(error.message) : String(error);
    return { success: false, output };
  }
}

function validateSemver(version: string): boolean {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

function packageJson(pkgPath: string): any {
  return JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
}

function runPackSmokeCheck(): CheckResult {
  log('\n📋 Running package tarball smoke check...', 'blue');
  const tmp = mkdtempSync(join(tmpdir(), 'narada-pack-'));

  try {
    for (const pkgPath of PACKAGES) {
      const before = new Set(readdirSync(tmp));
      const result = runCommand(`pnpm pack --pack-destination ${JSON.stringify(tmp)}`, pkgPath);
      if (!result.success) {
        return {
          name: 'Pack smoke check',
          passed: false,
          error: `Failed to pack ${pkgPath}`,
        };
      }

      const after = readdirSync(tmp).filter((name) => !before.has(name) && name.endsWith('.tgz'));
      if (after.length !== 1) {
        return {
          name: 'Pack smoke check',
          passed: false,
          error: `Unexpected pack output for ${pkgPath}`,
        };
      }
    }

    log('  ✓ All packages produced tarballs', 'green');
    return { name: 'Pack smoke check', passed: true };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function runChecks(): CheckResult[] {
  const checks: CheckResult[] = [];

  if (!PACK_ONLY) {
    log('\n📋 Running tests...', 'blue');
    const testResult = runCommand('ALLOW_FULL_TESTS=1 pnpm test:full');
    checks.push({
      name: 'Tests pass',
      passed: testResult.success,
      error: testResult.success ? undefined : 'Tests failed',
    });
    log(testResult.success ? '  ✓ Tests passed' : '  ✗ Tests failed', testResult.success ? 'green' : 'red');

    log('\n📋 Building packages...', 'blue');
    const buildResult = runCommand('pnpm build');
    checks.push({
      name: 'Build succeeds',
      passed: buildResult.success,
      error: buildResult.success ? undefined : 'Build failed',
    });
    log(buildResult.success ? '  ✓ Build succeeded' : '  ✗ Build failed', buildResult.success ? 'green' : 'red');

    log('\n📋 Checking for uncommitted changes...', 'blue');
    const gitStatus = runCommand('git status --porcelain');
    const hasUncommitted = gitStatus.success && gitStatus.output.trim().length > 0;
    checks.push({
      name: 'No uncommitted changes',
      passed: !hasUncommitted,
      error: hasUncommitted ? 'There are uncommitted changes' : undefined,
    });
    log(hasUncommitted ? '  ✗ Uncommitted changes found' : '  ✓ No uncommitted changes', hasUncommitted ? 'red' : 'green');
  }

  log('\n📋 Validating package versions...', 'blue');
  let allVersionsValid = true;
  for (const pkgPath of PACKAGES) {
    const pkg = packageJson(pkgPath);
    const isValid = validateSemver(pkg.version);
    if (!isValid) {
      allVersionsValid = false;
      log(`  ✗ Invalid version in ${pkgPath}: ${pkg.version}`, 'red');
    }
  }
  checks.push({
    name: 'Valid semver versions',
    passed: allVersionsValid,
    error: allVersionsValid ? undefined : 'Invalid semver version found',
  });
  if (allVersionsValid) log('  ✓ All versions are valid semver', 'green');

  log('\n📋 Checking for README files...', 'blue');
  const missingReadmes = PACKAGES.filter((pkgPath) => !existsSync(join(pkgPath, 'README.md')));
  checks.push({
    name: 'README files exist',
    passed: missingReadmes.length === 0,
    error: missingReadmes.length === 0 ? undefined : `Missing README files: ${missingReadmes.join(', ')}`,
  });
  log(missingReadmes.length === 0 ? '  ✓ All README files exist' : `  ✗ Missing README files: ${missingReadmes.join(', ')}`, missingReadmes.length === 0 ? 'green' : 'red');

  log('\n📋 Checking for LICENSE file...', 'blue');
  const hasRootLicense = existsSync('LICENSE');
  checks.push({
    name: 'Root LICENSE exists',
    passed: hasRootLicense,
    error: hasRootLicense ? undefined : 'Missing root LICENSE',
  });
  log(hasRootLicense ? '  ✓ Root LICENSE exists' : '  ✗ Missing root LICENSE', hasRootLicense ? 'green' : 'red');

  log('\n📋 Checking publish metadata...', 'blue');
  let metadataOk = true;
  for (const pkgPath of PACKAGES) {
    const pkg = packageJson(pkgPath);
    if (!pkg.repository?.url || !pkg.homepage || !pkg.bugs?.url) {
      metadataOk = false;
      log(`  ✗ Missing repository/homepage/bugs in ${pkgPath}`, 'red');
    }
  }
  checks.push({
    name: 'Publish metadata complete',
    passed: metadataOk,
    error: metadataOk ? undefined : 'Missing publish metadata in one or more package manifests',
  });
  if (metadataOk) log('  ✓ Repository, homepage, and bugs metadata present', 'green');

  log('\n📋 Checking for file: dependencies...', 'blue');
  let noFileDependencies = true;
  for (const pkgPath of PACKAGES) {
    const pkg = packageJson(pkgPath);
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && version.startsWith('file:')) {
        noFileDependencies = false;
        log(`  ✗ file: dependency found in ${pkgPath}: ${name}@${version}`, 'red');
      }
    }
  }
  checks.push({
    name: 'No file: publish dependencies',
    passed: noFileDependencies,
    error: noFileDependencies ? undefined : 'file: dependencies found in publish surface',
  });
  if (noFileDependencies) log('  ✓ No file: publish dependencies found', 'green');

  checks.push(runPackSmokeCheck());
  return checks;
}

function main(): void {
  log(`🔍 Running ${PACK_ONLY ? 'pack-only ' : ''}pre-publish checks...\n`, 'blue');

  const checks = runChecks();
  const failures = checks.filter((c) => !c.passed);

  log('\n' + '='.repeat(50), 'blue');
  log(`Results: ${checks.length - failures.length}/${checks.length} checks passed`, failures.length === 0 ? 'green' : 'red');
  log('='.repeat(50), 'blue');

  if (failures.length > 0) {
    log('\n❌ Pre-publish checks failed:', 'red');
    for (const failure of failures) {
      log(`  - ${failure.name}: ${failure.error}`, 'red');
    }
    process.exit(1);
  }

  log(`\n✅ ${PACK_ONLY ? 'Pack check passed.' : 'All pre-publish checks passed!'}`, 'green');
  log('\nReady for changeset versioning and publish.', 'green');
}

main();
