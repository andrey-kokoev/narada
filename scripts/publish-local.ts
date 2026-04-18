#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

function run(command: string): void {
  execSync(command, { stdio: 'inherit', encoding: 'utf8' });
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

  console.log('\n==> Prepublish checks');
  run('pnpm prepublish-check');

  console.log('\n==> Version packages');
  run('pnpm version-packages');

  console.log('\n==> Rebuild after versioning');
  run('pnpm build');

  console.log('\n==> Tarball smoke check');
  run('pnpm pack:check');

  console.log('\n==> Publish to npm');
  run('changeset publish');

  console.log('\nPublish complete. Commit the version bumps and generated changelog files.');
}

main();
