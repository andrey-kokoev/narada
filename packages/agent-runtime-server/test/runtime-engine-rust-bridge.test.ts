import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const nativeBinary = join(
  packageRoot,
  '..',
  'native',
  'target',
  'release',
  process.platform === 'win32' ? 'narada-agent-runtime-server-rust.exe' : 'narada-agent-runtime-server-rust',
);
const target = fileURLToPath(new URL('./fixtures/runtime-engine-rust-target.mjs', import.meta.url));

test('Rust runtime bridge preserves the selected engine in delegated runtime context', { skip: !existsSync(nativeBinary) }, async () => {
  const child = spawn(nativeBinary, ['--bridge-conformance'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      NARADA_RUNTIME_SERVER_SCRIPT: target,
      NARADA_RUNTIME_NODE_COMMAND: process.execPath,
      // The bridge must override a stale caller value.
      NARADA_RUNTIME_ENGINE: 'node',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
  assert.equal(exitCode, 0, stderr);
  const record = JSON.parse(stdout.trim()) as { schema: string; status: string; runtime_engine_kind: string; argv: string[] };
  assert.deepEqual(record, {
    schema: 'narada.runtime_engine_rust_target.v1',
    status: 'ready',
    runtime_engine_kind: 'rust',
    argv: ['--bridge-conformance'],
  });
});
