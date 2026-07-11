#!/usr/bin/env node
/**
 * Pre-publish check script
 *
 * Runs deterministic checks before publishing to ensure package quality.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface PackageManifest {
  name: string;
  version: string;
  private?: boolean;
  repository?: { url?: string };
  homepage?: string;
  bugs?: { url?: string };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundleDependencies?: string[];
}

const PACK_ONLY = process.argv.includes('--pack-only');
const PUBLICATION_MANIFEST_PATH = 'config/npm-publication-packages.json';
const publicationManifest = JSON.parse(
  readFileSync(PUBLICATION_MANIFEST_PATH, 'utf8'),
) as {
  schema: string;
  packages: Array<{ name: string; path: string }>;
};
const PACKAGES = publicationManifest.packages.map(({ path }) => path);

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
    const record = error !== null && typeof error === 'object'
      ? error as Record<string, unknown>
      : {};
    const output = [record.message, record.stdout, record.stderr]
      .filter((value) => value !== undefined && value !== '')
      .map(String)
      .join('\n');
    return { success: false, output };
  }
}

function validateSemver(version: string): boolean {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

function packageJson(pkgPath: string): PackageManifest {
  return JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8')) as PackageManifest;
}

function runPackSmokeCheck(): CheckResult {
  log('\n📋 Running package tarball smoke check...', 'blue');
  const tmp = mkdtempSync(join(tmpdir(), 'narada-pack-'));

  try {
    for (const pkgPath of PACKAGES) {
      const before = new Set(readdirSync(tmp));
      const packCommand = pkgPath === 'packages/layers/cli'
        ? `pnpm --config.node-linker=hoisted pack --pack-destination ${JSON.stringify(tmp)}`
        : `pnpm pack --pack-destination ${JSON.stringify(tmp)}`;
      const result = runCommand(packCommand, pkgPath);
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

      if (pkgPath === 'packages/layers/cli') {
        const consumer = mkdtempSync(join(tmp, 'cli-consumer-'));
        writeFileSync(
          join(consumer, 'package.json'),
          JSON.stringify({ name: 'narada-cli-pack-smoke', private: true }, null, 2),
        );
        const install = runCommand(
          `pnpm add --prefer-offline --ignore-scripts ${JSON.stringify(join(tmp, after[0]))}`,
          consumer,
        );
        if (!install.success) {
          return {
            name: 'Pack smoke check',
            passed: false,
            error: `CLI tarball failed isolated installation: ${install.output.slice(-2000)}`,
          };
        }
      }
    }

    log('  ✓ All packages produced tarballs and the CLI installed in isolation', 'green');
    return { name: 'Pack smoke check', passed: true };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function runChecks(): CheckResult[] {
  const checks: CheckResult[] = [];

  log('\n📋 Checking canonical publication manifest...', 'blue');
  const publicationManifestValid = publicationManifest.schema === 'narada.npm_publication_packages.v1'
    && publicationManifest.packages.length > 0
    && publicationManifest.packages.every(({ name, path }) => {
      const manifest = packageJson(path);
      return manifest.name === name && manifest.private !== true;
    });
  checks.push({
    name: 'Canonical publication manifest is valid',
    passed: publicationManifestValid,
    error: publicationManifestValid
      ? undefined
      : `Invalid package identity or private package in ${PUBLICATION_MANIFEST_PATH}`,
  });
  log(
    publicationManifestValid
      ? '  ✓ Canonical publication package identities are valid'
      : '  ✗ Canonical publication manifest is invalid',
    publicationManifestValid ? 'green' : 'red',
  );

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

  log('\n📋 Checking CLI runtime dependency closure...', 'blue');
  const cliPackage = packageJson('packages/layers/cli');
  const cliWorkspaceDependencies = Object.entries(cliPackage.dependencies ?? {})
    .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
    .map(([name]) => name);
  const cliBundledDependencies = new Set(
    Array.isArray(cliPackage.bundleDependencies) ? cliPackage.bundleDependencies : [],
  );
  const unbundledCliWorkspaceDependencies = cliWorkspaceDependencies
    .filter((name) => !cliBundledDependencies.has(name));
  const cliClosureBundled = unbundledCliWorkspaceDependencies.length === 0;
  checks.push({
    name: 'CLI runtime dependency closure is distributable',
    passed: cliClosureBundled,
    error: cliClosureBundled
      ? undefined
      : `CLI has unbundled workspace runtime dependencies: ${unbundledCliWorkspaceDependencies.join(', ')}`,
  });
  log(
    cliClosureBundled
      ? '  ✓ CLI workspace runtime dependencies are bundled'
      : '  ✗ CLI workspace runtime dependencies are not bundled',
    cliClosureBundled ? 'green' : 'red',
  );

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
