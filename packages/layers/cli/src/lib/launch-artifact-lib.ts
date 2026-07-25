import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const LAUNCH_ARTIFACT_SCHEMA = 'narada.launch_artifact.v1';
export const LAUNCH_ARTIFACT_MANIFEST_NAME = 'narada-launch-artifact.json';

export interface LaunchArtifactDescriptor {
  schema: typeof LAUNCH_ARTIFACT_SCHEMA;
  target: string;
  package_name: string;
  package_root: string;
  package_root_relative: string;
  output_root: string;
  output_root_relative: string;
  build_script: string;
  required_outputs: string[];
  package_json: PackageJson;
}

export interface LaunchArtifactCheck {
  status: 'current' | 'stale' | 'not_applicable';
  target: string;
  reason?: string;
  package?: string;
  package_root?: string;
  output_root?: string;
  artifact_root?: string;
  artifact_manifest_path?: string;
  required_command?: string;
  source_hash?: string;
  input_count?: number;
  [key: string]: unknown;
}

export interface LaunchArtifactCheckOptions {
  packageRoot?: string;
  published?: boolean;
}

interface PackageJson {
  name?: string;
  packageManager?: string;
  narada?: {
    launch_artifact?: {
      target?: string;
      output_root?: string;
      build_script?: string;
      required_outputs?: unknown[];
    };
  };
  scripts?: Record<string, string | undefined>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bundleDependencies?: string[];
  [key: string]: unknown;
}

interface PackageEntry {
  root: string;
  packageJson: PackageJson;
}

interface LaunchArtifactSourceClosure {
  algorithm: string;
  source_hash: string;
  input_count: number;
  inputs: string[];
  packages: string[];
}

interface WalkFilesOptions {
  excludedRoots?: Array<string | null>;
}

interface OutputSnapshot {
  algorithm: string;
  tree_hash: string;
  file_count: number;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  required_missing: string[];
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.ai',
  '.narada',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'test-results',
]);

export function resolveLaunchArtifactDescriptor(
  siteRoot: string,
  target: string,
  options: { packageRoot?: string } = {},
): LaunchArtifactDescriptor {
  const root = resolve(siteRoot);
  const packageRoot = options.packageRoot ? resolve(root, options.packageRoot) : null;
  if (packageRoot && !isWithin(root, packageRoot)) {
    throw new Error(`launch_artifact_package_root_outside_workspace:${packageRoot}`);
  }
  const packageEntries: PackageEntry[] = packageRoot
    ? [{ root: packageRoot, packageJson: readPackageJson(packageRoot) ?? {} }]
    : discoverPackages(root);
  const entry = packageEntries.find(({ packageJson }) => packageJson?.narada?.launch_artifact?.target === target);
  if (!entry) throw new Error(`launch_artifact_declaration_missing:${target}`);

  const launchArtifact = entry.packageJson.narada?.launch_artifact;
  if (!launchArtifact) throw new Error(`launch_artifact_declaration_missing:${target}`);
  const outputRootRelative = normalizeRelativePath(launchArtifact.output_root ?? 'dist');
  const outputRoot = resolve(entry.root, outputRootRelative);
  if (!isWithin(entry.root, outputRoot)) {
    throw new Error(`launch_artifact_output_root_outside_package:${outputRoot}`);
  }
  return {
    schema: LAUNCH_ARTIFACT_SCHEMA,
    target,
    package_name: String(entry.packageJson.name ?? ''),
    package_root: entry.root,
    package_root_relative: normalizeRelativePath(relative(root, entry.root)),
    output_root: outputRoot,
    output_root_relative: outputRootRelative,
    build_script: String(launchArtifact.build_script ?? 'build'),
    required_outputs: Array.isArray(launchArtifact.required_outputs)
      ? launchArtifact.required_outputs.map((value: unknown) => String(value))
      : [],
    package_json: entry.packageJson,
  };
}

export function computeLaunchArtifactSourceClosure(
  siteRoot: string,
  descriptor: LaunchArtifactDescriptor,
): LaunchArtifactSourceClosure {
  const root = resolve(siteRoot);
  const packageMap = new Map(discoverPackages(root).map((entry) => [entry.packageJson.name, entry]));
  const entries = new Map<string, PackageEntry>();
  const queue: string[] = [descriptor.package_name];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (!packageName || visited.has(packageName)) continue;
    visited.add(packageName);
    const entry = packageMap.get(packageName);
    if (!entry) continue;
    entries.set(entry.root, entry);
    for (const dependency of workspaceDependencyNames(entry.packageJson)) {
      if (!visited.has(dependency) && packageMap.has(dependency)) queue.push(dependency);
    }
  }

  const files = new Set<string>();
  for (const path of [
    join(root, 'package.json'),
    join(root, 'pnpm-lock.yaml'),
    join(root, 'pnpm-workspace.yaml'),
  ]) {
    if (existsSync(path)) files.add(path);
  }
  for (const entry of entries.values()) {
    for (const file of walkFiles(entry.root, {
      excludedRoots: [entry.root === descriptor.package_root ? descriptor.output_root : null],
    })) {
      files.add(file);
    }
  }

  const inputs = [...files]
    .sort((left, right) => normalizeRelativePath(relative(root, left)).localeCompare(normalizeRelativePath(relative(root, right))))
    .map((file) => normalizeRelativePath(relative(root, file)));
  const hash = createHash('sha256');
  for (const input of inputs) {
    hash.update(input);
    hash.update('\n');
    hash.update(readFileSync(join(root, input)));
    hash.update('\n');
  }
  return {
    algorithm: 'sha256',
    source_hash: hash.digest('hex'),
    input_count: inputs.length,
    inputs,
    packages: [...entries.values()]
      .map((entry) => entry.packageJson.name)
      .filter((name): name is string => Boolean(name))
      .sort(),
  };
}

export function checkLaunchArtifact(
  siteRoot: string,
  target: string,
  options: LaunchArtifactCheckOptions = {},
): LaunchArtifactCheck {
  const root = resolve(siteRoot);
  let descriptor;
  try {
    descriptor = resolveLaunchArtifactDescriptor(root, target, options);
  } catch (error) {
    return {
      status: 'not_applicable',
      target,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const manifestPath = join(descriptor.output_root, LAUNCH_ARTIFACT_MANIFEST_NAME);
  const requiredCommand = `pnpm --filter ${descriptor.package_name} ${descriptor.build_script}`;
  const base = {
    target,
    package: descriptor.package_name,
    package_root: descriptor.package_root,
    output_root: descriptor.output_root,
    artifact_root: descriptor.output_root,
    artifact_manifest_path: manifestPath,
    required_command: requiredCommand,
  };
  if (!existsSync(manifestPath)) {
    return { ...base, status: 'stale', reason: 'launch_artifact_manifest_missing' };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { ...base, status: 'stale', reason: 'launch_artifact_manifest_invalid', detail: String(error) };
  }
  const published = options.published === true;
  const manifestIdentityMatches = manifest.schema === LAUNCH_ARTIFACT_SCHEMA
    && manifest.target === target
    && manifest.package === descriptor.package_name
    && (published || manifest.package_root === descriptor.package_root_relative)
    && manifest.output_root === descriptor.output_root_relative
    && manifest.build_script === descriptor.build_script
    && stableStringify(manifest.required_outputs) === stableStringify(descriptor.required_outputs);
  if (!manifestIdentityMatches) {
    return { ...base, status: 'stale', reason: 'launch_artifact_manifest_identity_mismatch', manifest };
  }

  const sourceClosure = published ? null : computeLaunchArtifactSourceClosure(root, descriptor);
  const toolchain = published ? null : computeToolchainFingerprint(root);
  const recipe = published ? null : computeBuildRecipe(descriptor);
  const outputSnapshot = snapshotOutputs(descriptor);
  const checks: Array<[boolean, string]> = [
    [published || manifest.source_closure?.source_hash === sourceClosure?.source_hash, 'source_closure_changed'],
    [published || stableStringify(manifest.toolchain) === stableStringify(toolchain), 'toolchain_changed'],
    [published || manifest.recipe_hash === recipe?.recipe_hash, 'build_recipe_changed'],
    [manifest.outputs?.tree_hash === outputSnapshot.tree_hash, 'published_outputs_changed'],
    [outputSnapshot.required_missing.length === 0, 'required_outputs_missing'],
  ];
  const failed = checks.find(([passed]) => !passed);
  if (failed) {
    return {
      ...base,
      status: 'stale',
      reason: failed[1],
      manifest,
      source_closure: sourceClosure,
      toolchain,
      recipe,
      outputs: outputSnapshot,
    };
  }
  return {
    ...base,
    status: 'current',
    built_at: manifest.built_at ?? null,
    source_hash: sourceClosure?.source_hash,
    input_count: sourceClosure?.input_count,
    source_closure: sourceClosure,
    toolchain,
    recipe,
    outputs: outputSnapshot,
  };
}

export function writeLaunchArtifactManifest({
  siteRoot,
  target,
  packageRoot,
}: {
  siteRoot?: string;
  target: string;
  packageRoot?: string;
}): Record<string, unknown> {
  const root = resolve(siteRoot ?? resolve(import.meta.dirname, '..', '..', '..', '..', '..'));
  const descriptor = resolveLaunchArtifactDescriptor(root, target, packageRoot ? { packageRoot } : {});
  const sourceClosure = computeLaunchArtifactSourceClosure(root, descriptor);
  const toolchain = computeToolchainFingerprint(root);
  const recipe = computeBuildRecipe(descriptor);
  const outputs = snapshotOutputs(descriptor);
  if (outputs.required_missing.length > 0) {
    throw new Error(`launch_artifact_required_outputs_missing:${target}:${outputs.required_missing.join(',')}`);
  }

  mkdirSync(descriptor.output_root, { recursive: true });
  const manifestPath = join(descriptor.output_root, LAUNCH_ARTIFACT_MANIFEST_NAME);
  const manifest = {
    schema: LAUNCH_ARTIFACT_SCHEMA,
    target,
    package: descriptor.package_name,
    package_root: descriptor.package_root_relative,
    output_root: descriptor.output_root_relative,
    required_outputs: descriptor.required_outputs,
    build_script: descriptor.build_script,
    built_at: new Date().toISOString(),
    source_closure: sourceClosure,
    toolchain,
    recipe: recipe.recipe,
    recipe_hash: recipe.recipe_hash,
    outputs,
  };
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (existsSync(manifestPath)) rmSync(manifestPath, { force: true });
  renameSync(temporaryPath, manifestPath);
  return { ...manifest, artifact_manifest_path: manifestPath, artifact_root: descriptor.output_root };
}

export function computeToolchainFingerprint(siteRoot: string): { node: string; package_manager: string | null } {
  const rootPackage = readPackageJson(resolve(siteRoot));
  return {
    node: process.version,
    package_manager: rootPackage?.packageManager ?? null,
  };
}

export function computeBuildRecipe(descriptor: LaunchArtifactDescriptor): {
  recipe: Record<string, unknown>;
  recipe_hash: string;
} {
  const scripts = descriptor.package_json.scripts ?? {};
  const recipe = {
    package: descriptor.package_name,
    target: descriptor.target,
    build_script: descriptor.build_script,
    required_outputs: descriptor.required_outputs,
    scripts: {
      prebuild: scripts.prebuild ?? null,
      build: scripts.build ?? null,
      postbuild: scripts.postbuild ?? null,
    },
  };
  return {
    recipe,
    recipe_hash: sha256(stableStringify(recipe)),
  };
}

function snapshotOutputs(descriptor: LaunchArtifactDescriptor): OutputSnapshot {
  const files = walkFiles(descriptor.output_root)
    .filter((file) => !isMetadataFile(file))
    .map((file) => ({
      path: normalizeRelativePath(relative(descriptor.output_root, file)),
      bytes: readFileSync(file).byteLength,
      sha256: sha256(readFileSync(file)),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const treeHash = sha256(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join(''));
  const requiredMissing = descriptor.required_outputs.filter((pattern) => !files.some((file) => matchesPattern(file.path, pattern)));
  return {
    algorithm: 'sha256',
    tree_hash: treeHash,
    file_count: files.length,
    files,
    required_missing: requiredMissing,
  };
}

function discoverPackages(siteRoot: string): PackageEntry[] {
  const packagesRoot = join(siteRoot, 'packages');
  return walkFiles(packagesRoot)
    .filter((file) => file.endsWith(`${sep}package.json`) || file.endsWith('/package.json'))
    .map((file) => ({ root: dirname(file), packageJson: readPackageJson(dirname(file)) }))
    .filter((entry): entry is PackageEntry => Boolean(entry.packageJson && typeof entry.packageJson.name === 'string'));
}

function workspaceDependencyNames(packageJson: PackageJson): string[] {
  const names = new Set<string>();
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies']) {
    const value = packageJson[key];
    if (Array.isArray(value)) value.forEach((name) => names.add(String(name)));
    else if (value && typeof value === 'object') Object.keys(value).forEach((name) => names.add(name));
  }
  return [...names];
}

function walkFiles(root: string, options: WalkFilesOptions = {}): string[] {
  if (!root || !existsSync(root)) return [];
  const excludedRoots = (options.excludedRoots ?? [])
    .filter((path): path is string => Boolean(path))
    .map((path) => resolve(path));
  const files: string[] = [];
  function visit(directory: string): void {
    if (excludedRoots.some((excludedRoot) => directory === excludedRoot || directory.startsWith(`${excludedRoot}${sep}`))) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  visit(resolve(root));
  return files;
}

function readPackageJson(packageRoot: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function isMetadataFile(file: string): boolean {
  return file.endsWith(`${sep}${LAUNCH_ARTIFACT_MANIFEST_NAME}`)
    || file.endsWith(`${sep}build-manifest.json`);
}

function matchesPattern(path: string, pattern: string): boolean {
  if (!pattern.includes('*')) return path === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '__NARADA_GLOBSTAR__')
    .replaceAll('*', '[^/]*')
    .replaceAll('__NARADA_GLOBSTAR__', '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isWithin(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.includes(':'));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
