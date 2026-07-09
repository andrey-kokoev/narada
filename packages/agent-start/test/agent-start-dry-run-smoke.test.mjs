import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const tsxLoaderPath = pathToFileURL(require.resolve('tsx')).href;

function parseJsonOutput(output) {
  const text = String(output ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  assert.ok(start >= 0 && end >= start, `json object missing from output: ${text.slice(0, 500)}`);
  return JSON.parse(text.slice(start, end + 1));
}

test('agent-start dry-run emits coherent agent-cli/NARS launch JSON', () => {
  const result = runHiddenPostureCommandSync(process.execPath, [
    '--import',
    tsxLoaderPath,
    resolve(packageRoot, 'src', 'narada-agent-start.ts'),
    'narada.architect',
    '--site-root',
    naradaProperRoot,
    '--target-site-root',
    naradaProperRoot,
    '--carrier',
    'agent-cli',
    '--runtime',
    'narada-agent-runtime-server',
    '--intelligence-provider',
    'codex-subscription',
    '--dry-run',
    '--json',
  ], {
    cwd: packageRoot,
    encoding: 'utf8',
    posture: 'test_child',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const launch = parseJsonOutput(result.stdout);
  assert.equal(launch.status, 'dry_run');
  assert.equal(launch.identity, 'narada.architect');
  assert.equal(launch.carrier_kind, 'agent-cli');
  assert.equal(launch.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(launch.tool_fabric_adapter_kind, 'narada-agent-runtime-server-mcp-client');
  assert.equal(launch.required_environment.NARADA_AGENT_ID, 'narada.architect');
});
