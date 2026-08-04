#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(resolve(root, 'dist'), { recursive: true, force: true });
const tscArgs = ['exec', 'tsc', '-p', resolve(root, 'tsconfig.build.json')];
const result = spawnSync(
  process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'pnpm',
  process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm', ...tscArgs] : tscArgs,
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
