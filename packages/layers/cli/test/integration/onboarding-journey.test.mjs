import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const workspaceLauncher = resolve(process.env.NARADA_USER_SITE_ROOT ?? resolve(homedir(), 'Narada'), 'Start-NaradaWorkspace.ps1');

test('Windows PowerShell onboarding handoff delegates to the CLI without advanced selection', { skip: process.platform !== 'win32' }, () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const result = spawnSync('pwsh', [
    '-File', workspaceLauncher,
    '-Onboarding',
    '-DryRun',
  ], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaProperRoot,
    },
  });

  assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  assert.match(result.stdout, /Narada User Site onboarding/);
  assert.match(result.stdout, /Assistant: General assistant \(resident\)/);
  assert.match(result.stdout, /Surface: /);
  assert.match(result.stdout, /Runtime: /);
  assert.match(result.stdout, /Intelligence: .+/);
  assert.match(result.stdout, /Readiness: not_started/);
  assert.doesNotMatch(result.stdout, /workspace_launch\.plan\.v1/);
  assert.doesNotMatch(result.stdout, /Advanced launch options/);
});
