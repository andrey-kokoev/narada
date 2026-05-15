import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const BUILD_MANIFEST_SCHEMA = 'narada.cli.dist_build_manifest.v0';
export const BUILD_MANIFEST_PATH = join('packages', 'layers', 'cli', 'dist', 'build-manifest.json');

export function cliBuildInputFiles(siteRoot) {
  const candidates = [
    join(siteRoot, 'packages', 'layers', 'cli', 'package.json'),
    join(siteRoot, 'packages', 'layers', 'cli', 'tsconfig.json'),
    join(siteRoot, 'pnpm-lock.yaml'),
    ...walk(join(siteRoot, 'packages', 'layers', 'cli', 'src')).filter((file) => file.endsWith('.ts')),
  ];
  return candidates.filter((file) => existsSync(file)).sort((a, b) => normalize(siteRoot, a).localeCompare(normalize(siteRoot, b)));
}

export function computeCliBuildSourceHash(siteRoot) {
  const hash = createHash('sha256');
  const files = cliBuildInputFiles(siteRoot);
  for (const file of files) {
    hash.update(normalize(siteRoot, file));
    hash.update('\n');
    hash.update(readFileSync(file));
    hash.update('\n');
  }
  return {
    algorithm: 'sha256',
    source_hash: hash.digest('hex'),
    input_count: files.length,
    inputs: files.map((file) => normalize(siteRoot, file)),
  };
}

export function readCliDistBuildManifest(siteRoot) {
  const manifestPath = join(siteRoot, BUILD_MANIFEST_PATH);
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function checkCliDistFreshness(siteRoot) {
  const packageJson = join(siteRoot, 'packages', 'layers', 'cli', 'package.json');
  if (!existsSync(packageJson)) {
    return { status: 'not_applicable', reason: 'cli_package_not_found' };
  }
  const manifestPath = join(siteRoot, BUILD_MANIFEST_PATH);
  const current = computeCliBuildSourceHash(siteRoot);
  const manifest = readCliDistBuildManifest(siteRoot);
  if (!manifest) {
    return { status: 'stale', reason: 'missing_build_manifest', manifest_path: manifestPath, current, required_command: 'pnpm --filter @narada2/cli build' };
  }
  if (manifest.source_hash !== current.source_hash) {
    return { status: 'stale', reason: 'source_hash_mismatch', manifest_path: manifestPath, manifest_source_hash: manifest.source_hash, current, required_command: 'pnpm --filter @narada2/cli build' };
  }
  return { status: 'current', manifest_path: manifestPath, source_hash: current.source_hash, input_count: current.input_count };
}

function walk(root) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(root, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function normalize(siteRoot, file) {
  return relative(siteRoot, file).replaceAll('\\', '/');
}
