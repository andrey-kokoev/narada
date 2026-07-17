#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const requestedArgs = process.argv.slice(2).filter((value, index) => !(index === 0 && value === '--'));
const testFiles = requestedArgs.filter((value) => /\.(?:test|spec)\.[cm]?[tj]sx?$/.test(value));

if (testFiles.length !== 1) {
  console.error('launcher_verification_test_file_required: pass exactly one launcher test file.');
  process.exit(2);
}

function run(command, args, label) {
  console.log(`[launcher-verification] ${label}`);
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`[launcher-verification] ${label}_failed: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const packageManagerScript = process.env.npm_execpath;
if (!packageManagerScript) {
  console.error('[launcher-verification] launcher_verification_runner_invalid: run this script through pnpm.');
  process.exit(2);
}

const typecheckExit = run(packageManagerScript, ['run', 'typecheck'], 'typecheck');
if (typecheckExit !== 0) {
  console.error('[launcher-verification] launcher_verification_typecheck_failed: behavioral tests were not started.');
  process.exit(typecheckExit);
}

const testExit = run(
  process.execPath,
  ['scripts/run-vitest-quiet.mjs', 'run', '--silent', ...requestedArgs],
  `behavioral test ${testFiles[0]}`,
);
process.exit(testExit);
