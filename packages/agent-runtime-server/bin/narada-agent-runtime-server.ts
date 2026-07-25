#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The launcher invokes this package bin with plain Node. Re-exec the source
// entrypoint that invokes the exported server main with tsx's supported
// --import mode rather than using
// module.register(), which tsx 4.21 rejects as a deprecated --loader path.
const require = createRequire(import.meta.url);
const tsxLoader = pathToFileURL(require.resolve('tsx')).href;
const sourceEntrypoint = fileURLToPath(new URL('../src/runtime-server-entrypoint.ts', import.meta.url));
const child = spawn(process.execPath, [
  '--import',
  tsxLoader,
  sourceEntrypoint,
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});

child.once('error', (error) => {
  console.error(`[agent-runtime-server] failed to start carrier: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
