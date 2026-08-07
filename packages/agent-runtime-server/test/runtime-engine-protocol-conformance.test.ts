import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const target = fileURLToPath(new URL('./fixtures/runtime-engine-protocol-target.mjs', import.meta.url));
const nativeBinary = join(
  packageRoot,
  '..',
  'native',
  'target',
  'release',
  process.platform === 'win32' ? 'narada-agent-runtime-server-rust.exe' : 'narada-agent-runtime-server-rust',
);

const requests = [
  { id: 'health-1', method: 'session.health' },
  { id: 'tools-1', method: 'mcp.tools.list' },
  { id: 'close-1', method: 'session.close' },
];

async function runEngine(engine: 'node' | 'rust'): Promise<Record<string, unknown>[]> {
  const command = engine === 'node' ? process.execPath : nativeBinary;
  const args = engine === 'node' ? [target, '--protocol-conformance'] : ['--protocol-conformance'];
  const child = spawn(command, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      NARADA_RUNTIME_ENGINE: engine,
      ...(engine === 'rust'
        ? {
            NARADA_RUNTIME_SERVER_SCRIPT: target,
            NARADA_RUNTIME_NODE_COMMAND: process.execPath,
          }
        : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    if (stdout.length > 32_768) child.kill();
  });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`runtime_engine_protocol_timeout:${engine}`));
    }, 5_000);
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
  assert.equal(exitCode, 0, `${engine}: ${stderr}`);
  return stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function normalize(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map(({ runtime_engine_kind: _runtimeEngineKind, ...record }) => record);
}

test('Rust preserves the Node lifecycle, control, health, and MCP protocol sequence', { skip: !existsSync(nativeBinary) }, async () => {
  const [nodeRecords, rustRecords] = await Promise.all([
    runEngine('node'),
    runEngine('rust'),
  ]);
  assert.deepEqual(normalize(rustRecords), normalize(nodeRecords));
  assert.deepEqual(rustRecords.map((record) => record.runtime_engine_kind), ['rust', 'rust', 'rust', 'rust']);
  assert.deepEqual(rustRecords.map((record) => record.event), [
    'session_started',
    'session_health',
    'mcp_tools',
    'session_closed',
  ]);
});
