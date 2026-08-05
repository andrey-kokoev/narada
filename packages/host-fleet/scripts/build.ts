#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(resolve(root, 'dist'), { recursive: true, force: true });
const buildConfig = resolve(root, 'tsconfig.build.json');
const bunRuntime = Boolean((process.versions as Record<string, string | undefined>).bun);
const tscCommand = bunRuntime ? process.execPath : (process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'pnpm');
const tscArgs = bunRuntime
  ? ['x', 'tsc', '-p', buildConfig]
  : ['exec', 'tsc', '-p', buildConfig];
const result = spawnSync(
  tscCommand,
  bunRuntime || process.platform !== 'win32' ? tscArgs : ['/d', '/s', '/c', 'pnpm', ...tscArgs],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
