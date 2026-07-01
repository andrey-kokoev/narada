#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packagesRoot = join(repoRoot, 'packages');
const scanFileExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);
const ignoredPathFragments = [
  `${join('packages', 'site-paths')}`,
  `${join('packages', '_archive')}`,
];

const manualNarsSessionRootPattern = /join\s*\([^\n)]*['"]\.narada['"][^\n)]*['"]crew['"][^\n)]*['"]nars-sessions['"]/;

function hasIgnoredFragment(path) {
  const normalized = path.replaceAll('\\', '/');
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment.replaceAll('\\', '/')));
}

function extensionOf(path) {
  const match = /\.[^.\\/]+$/.exec(path);
  return match?.[0] ?? '';
}

function isTestFile(path) {
  return /(?:^|[\\/.])(?:test|spec)\.[cm]?[jt]sx?$/.test(path) || /[\\/]test[\\/]/.test(path);
}

function isProductionPackageSource(path) {
  const normalized = path.replaceAll('\\', '/');
  return normalized.includes('/src/') || normalized.includes('/bin/');
}

function walk(dir, visitor) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      walk(path, visitor);
      continue;
    }
    visitor(path);
  }
}

const findings = [];

walk(packagesRoot, (filePath) => {
  if (hasIgnoredFragment(filePath)) return;
  if (!isProductionPackageSource(filePath)) return;
  if (isTestFile(filePath)) return;
  if (!scanFileExtensions.has(extensionOf(filePath))) return;
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (manualNarsSessionRootPattern.test(line)) {
      findings.push({
        path: relative(repoRoot, filePath).replaceAll('\\', '/'),
        line: index + 1,
        text: line.trim(),
      });
    }
  });
});

if (findings.length > 0) {
  console.error('manual_nars_session_path_derivation_detected');
  console.error('Use @narada2/site-paths resolveNaradaSitePaths() instead of join(siteRoot, \'.narada\', ...).');
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line}: ${finding.text}`);
  }
  process.exitCode = 1;
} else {
  console.log('site path semantics guard passed');
}
