#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, 'bin'), { recursive: true });

for (const file of ['site-loop-store.mjs', 'runner.mjs', 'runtime.mjs', 'server.mjs', 'loop-module.mjs', 'policy.mjs', 'site-operating-loop-state.mjs']) {
  cpSync(resolve(root, 'src', file), resolve(dist, file));
}

const binSource = readFileSync(resolve(root, 'bin', 'narada-site-loop.mjs'), 'utf8')
  .replace("../src/site-loop-store.mjs", "../site-loop-store.mjs")
  .replace("../src/runtime.mjs", "../runtime.mjs")
  .replace("../src/server.mjs", "../server.mjs")
  .replace("../src/loop-module.mjs", "../loop-module.mjs");
writeFileSync(resolve(dist, 'bin', 'narada-site-loop.mjs'), binSource, 'utf8');
