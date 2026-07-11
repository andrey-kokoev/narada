#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPublicationReleaseSet,
  canonicalPublicationPackageNames,
} from './publication-release-set.js';

function run(command: string, environment: Record<string, string> = {}): void {
  execSync(command, {
    stdio: 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

function output(command: string): string {
  return execSync(command, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

function changesetFiles(): string[] {
  return readdirSync('.changeset').filter((name) => name.endsWith('.md'));
}

function fail(message: string): never {
  console.error(`\nPublish aborted: ${message}`);
  process.exit(1);
}

function main(): void {
  const dirty = output('git status --porcelain');
  if (dirty.length > 0) {
    fail('git worktree is not clean');
  }

  try {
    const user = output('npm whoami');
    console.log(`npm auth ok: ${user}`);
  } catch {
    fail('npm auth is missing; run npm login for the narada2 org first');
  }

  const changesets = changesetFiles();
  if (changesets.length === 0) {
    fail('no changeset files found in .changeset/');
  }

  console.log(`found ${changesets.length} changeset(s)`);
  let releasePackages: string[];
  try {
    releasePackages = assertPublicationReleaseSet();
    console.log(`canonical release set: ${releasePackages.join(', ')}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  console.log('\n==> Prepublish checks');
  run('pnpm prepublish-check');

  console.log('\n==> Version packages');
  run('pnpm version-packages');

  console.log('\n==> Rebuild after versioning');
  run('pnpm build');

  console.log('\n==> Tarball smoke check');
  run('pnpm pack:check');

  console.log('\n==> Publish to npm');
  const admissionRoot = mkdtempSync(join(tmpdir(), 'narada-publication-admission-'));
  const admissionPath = join(admissionRoot, 'admission.json');
  const admissionToken = randomUUID();
  writeFileSync(admissionPath, JSON.stringify({
    schema: 'narada.npm_publication_admission.v1',
    token: admissionToken,
    expires_at_ms: Date.now() + 30 * 60 * 1000,
    packages: canonicalPublicationPackageNames(),
  }));
  try {
    run('pnpm --config.node-linker=hoisted exec changeset publish', {
      NARADA_PUBLICATION_ADMISSION_FILE: admissionPath,
      NARADA_PUBLICATION_ADMISSION_TOKEN: admissionToken,
    });
  } finally {
    rmSync(admissionRoot, { recursive: true, force: true });
  }

  console.log('\nPublish complete. Commit the version bumps and generated changelog files.');
}

main();
