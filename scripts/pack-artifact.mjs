#!/usr/bin/env node
/**
 * pack-artifact.mjs — build the self-contained narada CLI release artifact.
 *
 * Usage:
 *   node scripts/pack-artifact.mjs [--workspace <root>] [--out <dir>]
 *                                  [--platform <os>] [--arch <cpu>]
 *
 * Requires a fully installed + built workspace (pnpm install && pnpm build).
 *
 * Produces <out>/narada-cli-<platform>-<arch>.tgz and a matching
 * manifest-<platform>-<arch>.json. The tarball is a standard npm package for
 * @narada-core/cli whose ENTIRE dependency tree — workspace packages and
 * external registry packages alike — is physically bundled under
 * node_modules (npm bundleDependencies semantics). Installing the tarball
 * therefore needs zero registry resolution:
 *
 *   npm install -g narada-cli-win32-x64.tgz
 *
 * The tree contains platform-keyed binaries (esbuild, rolldown, clipboard,
 * pi-tui prebuilds), so one artifact per platform/arch is produced. Cross
 * builds work from a single host via `npm install --os <os> --cpu <arch>`.
 *
 * How it works:
 *   1. The CLI + every workspace package in its bundleDependencies list are
 *      staged into <tmp>/vendor/, with workspace:* specs rewritten to file:
 *      specs pointing at the staged copies.
 *   2. `npm install --omit=dev --install-links` resolves the full external
 *      tree into the staging node_modules (for the target platform).
 *   3. bundleDependencies is set to every package present in node_modules,
 *      then `npm pack` produces the fully self-contained tarball.
 *
 * Context: narada task #2235 (release-artifact install).
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(argValue('--workspace', join(scriptDir, '..')));
const outDir = resolve(argValue('--out', join(workspaceRoot, 'artifacts')));
const targetPlatform = argValue('--platform', process.platform);
const targetArch = argValue('--arch', process.arch);

const CLI_PKG = join(workspaceRoot, 'packages/layers/cli');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'tmp', '.narada', '.ai']);

/** Map every workspace package name -> directory, across the 5-repo layout. */
function buildPackageIndex(root) {
  const index = new Map();
  const scanRoots = [root];
  for (const sib of ['narada-core', 'mcp-surfaces', 'agent-cli', 'agent-tui']) {
    const p = resolve(root, '..', sib);
    if (existsSync(p)) scanRoots.push(p);
  }
  function walk(dir, depth) {
    if (depth > 6) return;
    // Check dir itself: sibling repos can BE a package (e.g. agent-cli's
    // repo root is @narada-core/agent-cli).
    const ownPkgFile = join(dir, 'package.json');
    if (existsSync(ownPkgFile)) {
      try {
        const pkg = JSON.parse(readFileSync(ownPkgFile, 'utf8'));
        if (pkg.name && !index.has(pkg.name)) index.set(pkg.name, dir);
      } catch {
        /* ignore unreadable package.json */
      }
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), depth + 1);
    }
  }
  for (const r of scanRoots) walk(r, 0);
  return index;
}

/**
 * Copy the publishable subset of a package into the staging vendor tree.
 * workspace:* and link: dependency specs are rewritten to file: specs pointing
 * at the staged copies, so plain npm can resolve the whole workspace offline.
 * Workspace devDependencies are promoted to dependencies: some packages import
 * workspace siblings at runtime while declaring them as devDependencies, and
 * --omit=dev would otherwise drop them from the artifact.
 */
function stagePackage(srcDir, destDir, stagingRoot, { keepFiles = false, full = false } = {}) {
  const pkgFile = join(srcDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  mkdirSync(destDir, { recursive: true });

  const rewritten = rewriteWorkspaceSpecs(pkg, destDir, stagingRoot);
  for (const [name, spec] of Object.entries(rewritten.devDependencies ?? {})) {
    if (typeof spec === 'string' && spec.startsWith('file:')) {
      rewritten.dependencies = rewritten.dependencies ?? {};
      if (!rewritten.dependencies[name]) rewritten.dependencies[name] = spec;
    }
  }
  delete rewritten.devDependencies;
  delete rewritten.bundleDependencies;
  if (!keepFiles) {
    // The staged copy IS the publishable subset; a leftover `files` whitelist
    // could reference entries we did not copy (src, ...) and would make npm
    // pack of this staged package silently drop real content. The CLI root
    // keeps its whitelist so vendor/ stays out of the final tarball.
    delete rewritten.files;
  }
  delete rewritten.scripts?.prepack;
  delete rewritten.scripts?.prepublishOnly;
  delete rewritten.scripts?.prepublish;
  delete rewritten.scripts?.prepare;
  delete rewritten.scripts?.postinstall;
  writeFileSync(join(destDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n');

  if (full) {
    // Workspace packages: no reliable `files` whitelist across the repos, and
    // some read runtime data beside dist (e.g. contracts/*.json). Copy
    // everything except VCS/dependency noise.
    const SKIP_COPY = new Set(['node_modules', '.git', 'tmp', '.narada', '.ai', 'coverage', 'package.json']);
    for (const e of readdirSync(srcDir, { withFileTypes: true })) {
      if (SKIP_COPY.has(e.name)) continue;
      if (e.name === 'native' && e.isDirectory() && existsSync(join(srcDir, 'native', 'Cargo.toml'))) {
        stageRustCrate(join(srcDir, 'native'), join(destDir, 'native'));
        continue;
      }
      cpSync(join(srcDir, e.name), join(destDir, e.name), { recursive: true });
    }
  } else {
    const candidates = ['dist', 'scripts', 'bin', 'README.md', 'LICENSE', 'config.example.json'];
    for (const entry of candidates) {
      const src = join(srcDir, entry);
      if (existsSync(src)) cpSync(src, join(destDir, entry), { recursive: true });
    }
  }
  stripIgnoreFiles(destDir);
}

/**
 * npm pack applies .gitignore/.npmignore of bundled packages, which silently
 * drops deliberately staged content (a crate's .gitignore excludes
 * native/target/, so the staged release binary would never reach the
 * tarball). The staged copy IS the curated subset — remove ignore files so
 * npm pack takes it verbatim.
 */
function stripIgnoreFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) stripIgnoreFiles(p);
    else if (e.name === '.gitignore' || e.name === '.npmignore') rmSync(p, { force: true });
  }
}

/** Names referenced via workspace: or link: specs in any dependency field. */
function workspaceRefsOf(pkg) {
  const names = [];
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (typeof spec === 'string' && (spec.startsWith('workspace:') || spec.startsWith('link:'))) {
        names.push(name);
      }
    }
  }
  return names;
}

/**
 * Copy a cargo crate for the artifact. The runtime resolves native binaries at
 * native/target/release, but a full cargo target dir carries hundreds of MB of
 * intermediate artifacts (deps/, .fingerprint/, *.rlib, *.pdb). Ship the crate
 * sources plus only the final release binaries; if the crate was never built
 * on the pack platform, the staged package simply has no binary and the
 * launcher reports not_built.
 */
function stageRustCrate(srcNative, destNative) {
  for (const e of readdirSync(srcNative, { withFileTypes: true })) {
    if (e.name === 'target') continue;
    cpSync(join(srcNative, e.name), join(destNative, e.name), { recursive: true });
  }
  const release = join(srcNative, 'target', 'release');
  if (!existsSync(release)) return;
  for (const e of readdirSync(release, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    // Final artifacts only: *.exe / *.dll (Windows), *.so / *.dylib (Unix), or
    // an extensionless file (Unix executable). Everything else is intermediate.
    if (!/\.(exe|dll|so|dylib)$/.test(e.name) && e.name.includes('.')) continue;
    mkdirSync(join(destNative, 'target', 'release'), { recursive: true });
    cpSync(join(release, e.name), join(destNative, 'target', 'release', e.name));
  }
}

function rewriteWorkspaceSpecs(pkg, pkgDir, stagingRoot) {
  const out = { ...pkg };
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (!out[field]) continue;
    const deps = { ...out[field] };
    for (const [name, spec] of Object.entries(deps)) {
      // workspace:* (pnpm) and link: (cross-repo sibling link, e.g.
      // task-governance -> task-governance-core) both mean "a workspace
      // package staged under vendor/<name>".
      if (typeof spec === 'string' && (spec.startsWith('workspace:') || spec.startsWith('link:'))) {
        const target = join(stagingRoot, 'vendor', ...name.split('/'));
        const rel = relative(pkgDir, target).split(sep).join('/');
        deps[name] = `file:${rel.startsWith('.') ? rel : `./${rel}`}`;
      }
    }
    out[field] = deps;
  }
  return out;
}

/** Replace symlinked dirs under node_modules with real copies (npm pack would
 *  otherwise ship dangling links into vendor/, which stays out of the tarball). */
function materializeSymlinks(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) {
      const real = realpathSync(p);
      if (statSync(real).isDirectory()) {
        rmSync(p, { force: true });
        cpSync(real, p, { recursive: true });
      }
    } else if (e.isDirectory()) {
      materializeSymlinks(p);
    }
  }
}

/** Every package installed at the top level of a node_modules dir. */
function listInstalledPackages(nodeModulesDir) {
  const names = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      for (const sub of readdirSync(join(nodeModulesDir, entry.name), { withFileTypes: true })) {
        if (sub.isDirectory()) names.push(`${entry.name}/${sub.name}`);
      }
    } else {
      names.push(entry.name);
    }
  }
  return names.sort();
}

/** Recursively collect *.node binaries (informational, for the manifest). */
function listNativeBinaries(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listNativeBinaries(p, acc);
    else if (e.name.endsWith('.node')) acc.push(p);
  }
  return acc;
}

function npm(command, cwd, env = {}) {
  // Windows runners default to MAX_PATH=260; nested workspace package paths
  // (e.g. @narada-core/invokable-intelligence-registry) easily exceed it.
  execFileSync(`npm ${command}`, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, npm_config_longpaths: 'true', ...env },
  });
}

function main() {
  const cliPkg = JSON.parse(readFileSync(join(CLI_PKG, 'package.json'), 'utf8'));
  const bundleList = cliPkg.bundleDependencies ?? [];
  if (bundleList.length === 0) throw new Error('CLI package declares no bundleDependencies');

  if (!existsSync(join(CLI_PKG, 'dist/main.js'))) {
    throw new Error('CLI dist not built. Run pnpm install && pnpm build in the workspace first.');
  }

  const index = buildPackageIndex(workspaceRoot);
  const artifactName = `narada-cli-${targetPlatform}-${targetArch}.tgz`;

  // Use a short temp root on Windows CI runners to stay well under MAX_PATH.
  // The default %TEMP% path plus nested node_modules can exceed 260 chars and
  // cause npm to drop files during install.
  const shortTempRoot = process.platform === 'win32' && process.env.CI
    ? 'C:\\np'
    : tmpdir();
  mkdirSync(shortTempRoot, { recursive: true });
  const staging = mkdtempSync(join(shortTempRoot, 'narada-cli-artifact-'));
  try {
    // Stage the CLI at the root and the transitive closure of every workspace
    // package it references — including workspace packages reachable only via
    // devDependencies (some are imported at runtime; --omit=dev would drop
    // them, so they are promoted to dependencies when staged).
    stagePackage(CLI_PKG, staging, staging, { keepFiles: true });
    const toStage = new Set();
    const queue = [...bundleList, ...workspaceRefsOf(cliPkg)];
    while (queue.length > 0) {
      const name = queue.pop();
      if (toStage.has(name)) continue;
      const srcDir = index.get(name);
      if (!srcDir) throw new Error(`workspace dependency not found in workspace: ${name}`);
      toStage.add(name);
      const pkg = JSON.parse(readFileSync(join(srcDir, 'package.json'), 'utf8'));
      queue.push(...workspaceRefsOf(pkg));
    }
    for (const name of toStage) {
      stagePackage(index.get(name), join(staging, 'vendor', ...name.split('/')), staging, { full: true });
    }

    // Resolve the full external tree for the target platform. Do not force
    // symlinks for file: workspace deps: CI Windows runners lack symlink
    // privileges, and copying the staged packages into node_modules is fine
    // because vendor/ is excluded from the final tarball anyway. --ignore-scripts
    // is safe here: every native dep in the tree ships prebuilt binaries, and
    // it keeps cross-platform installs (--os linux on a Windows host) viable.
    npm(
      [
        'install',
        '--omit=dev',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        `--os=${targetPlatform}`,
        `--cpu=${targetArch}`,
      ].join(' '),
      staging,
    );

    // npm can still create symlinks for registry deps (e.g. peer dependency
    // hoisting). Replace symlinked dirs under node_modules with real copies so
    // npm pack ships the content instead of dangling links.
    materializeSymlinks(join(staging, 'node_modules'));

    // Bundle EVERYTHING that landed in node_modules, so install time needs
    // zero registry resolution. npm pack includes bundled deps even under the
    // CLI's `files` whitelist; vendor/ stays out of the tarball.
    const stagedCliPkgFile = join(staging, 'package.json');
    const stagedCliPkg = JSON.parse(readFileSync(stagedCliPkgFile, 'utf8'));
    const installed = listInstalledPackages(join(staging, 'node_modules'));
    stagedCliPkg.bundleDependencies = installed;
    writeFileSync(stagedCliPkgFile, JSON.stringify(stagedCliPkg, null, 2) + '\n');

    mkdirSync(outDir, { recursive: true });
    const tgz = join(outDir, artifactName);
    rmSync(tgz, { force: true });
    npm(`pack --pack-destination "${outDir}"`, staging);
    const produced = join(outDir, `narada-core-cli-${cliPkg.version}.tgz`);
    if (produced !== tgz) {
      if (!existsSync(produced)) throw new Error(`npm pack output not found: ${produced}`);
      cpSync(produced, tgz);
      rmSync(produced);
    }

    const nativeCount = listNativeBinaries(join(staging, 'node_modules')).length;
    const rustBinaryName = targetPlatform === 'win32'
      ? 'narada-agent-runtime-server-rust.exe'
      : 'narada-agent-runtime-server-rust';
    const rustBinaryPath = join(
      staging, 'node_modules', '@narada-core', 'agent-runtime-server',
      'native', 'target', 'release', rustBinaryName,
    );
    const hash = createHash('sha256').update(readFileSync(tgz)).digest('hex');
    const manifest = {
      schema: 'narada.cli_artifact_manifest.v1',
      package: cliPkg.name,
      version: cliPkg.version,
      artifact: artifactName,
      platform: targetPlatform,
      arch: targetArch,
      sha256: hash,
      bytes: readFileSync(tgz).length,
      node_engine: cliPkg.engines?.node ?? '>=22.0.0',
      bundled_workspace_packages: toStage.size,
      bundled_packages_total: installed.length,
      native_binaries: nativeCount,
      rust_runtime_binary: existsSync(rustBinaryPath),
      generated_at: new Date().toISOString(),
    };
    const manifestName = `manifest-${targetPlatform}-${targetArch}.json`;
    writeFileSync(join(outDir, manifestName), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main();
