#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('quiet_command_requires_command');
  process.exit(2);
}

let childCommand = command;
let childArgs = args;
let shell = false;
if (command === 'pnpm') {
  const packageManagerScript = process.env.npm_execpath?.trim();
  const bunPackageManager = packageManagerScript && /(?:^|[\\/])bun(?:\.exe)?$/i.test(packageManagerScript);
  if (packageManagerScript && !bunPackageManager && /\.(?:cjs|mjs|js)$/i.test(packageManagerScript)) {
    childCommand = process.execPath;
    childArgs = [packageManagerScript, ...args];
  } else if (bunPackageManager) {
    childCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    shell = process.platform === 'win32';
  } else {
    childCommand = packageManagerScript ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
    shell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(childCommand);
  }
}

const result = spawnSync(childCommand, childArgs, {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  shell,
  windowsHide: true,
});

if (result.error) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.error(result.error.message);
  process.exit(1);
}

const exitCode = result.status ?? 1;
if (exitCode !== 0) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

process.exit(exitCode);
