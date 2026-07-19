import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import {
  checkLaunchArtifact,
  resolveLaunchArtifactDescriptor,
  type LaunchArtifactCheck,
} from '../../scripts/launch-artifact-lib.mjs';

const DEFAULT_NARADA_PROPER_ROOT = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));

export function naradaProperRoot(): string {
  return resolve(process.env.NARADA_PROPER_ROOT ?? DEFAULT_NARADA_PROPER_ROOT);
}

export interface EnsureLaunchArtifactOptions {
  packageRoot?: string;
  published?: boolean;
}

export function ensureLaunchArtifact(
  siteRoot: string,
  target: string,
  options: EnsureLaunchArtifactOptions = {},
): LaunchArtifactCheck & { status: 'current' } {
  const root = resolve(siteRoot);
  let result = checkLaunchArtifact(root, target, options);
  if (result.status === 'current') return result as LaunchArtifactCheck & { status: 'current' };
  if (result.status !== 'stale' || options.published) {
    throw new Error(`narada_launch_artifact_unavailable:${target}:${result.reason ?? 'not_applicable'}`);
  }

  const release = acquireLaunchArtifactBuildLock(root, target);
  try {
    result = checkLaunchArtifact(root, target, options);
    if (result.status === 'current') return result as LaunchArtifactCheck & { status: 'current' };
    if (result.status !== 'stale') {
      throw new Error(`narada_launch_artifact_unavailable:${target}:${result.reason ?? 'not_applicable'}`);
    }

    const descriptor = resolveLaunchArtifactDescriptor(root, target, options);
    const build = runGovernedCommandSync('pnpm', ['--filter', descriptor.package_name, descriptor.build_script], {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (build.status !== 0) {
      const stdout = String(build.stdout ?? '').trim();
      const stderr = String(build.stderr ?? '').trim();
      throw new Error(`narada_launch_artifact_build_failed:${target}:exit_${build.status}:${stderr || stdout}`);
    }

    result = checkLaunchArtifact(root, target, options);
    if (result.status !== 'current') {
      throw new Error(`narada_launch_artifact_stale_after_build:${target}:${result.reason ?? 'unknown'}`);
    }
    return result as LaunchArtifactCheck & { status: 'current' };
  } finally {
    release();
  }
}

function acquireLaunchArtifactBuildLock(siteRoot: string, target: string): () => void {
  const lockRoot = join(siteRoot, '.narada', 'runtime', 'launch-artifact-locks');
  const lockPath = join(lockRoot, `${target.replace(/[^A-Za-z0-9._-]+/g, '_')}.lock`);
  const deadline = Date.now() + 180_000;
  mkdirSync(lockRoot, { recursive: true });

  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }) + '\n', 'utf8');
      return () => rmSync(lockPath, { recursive: true, force: true });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 10 * 60 * 1000) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
        readFileSync(join(lockPath, 'owner.json'), 'utf8');
      } catch {
        // The owner can be between directory creation and owner-file publication.
      }
      if (Date.now() >= deadline) {
        throw new Error(`narada_launch_artifact_build_lock_timeout:${target}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
