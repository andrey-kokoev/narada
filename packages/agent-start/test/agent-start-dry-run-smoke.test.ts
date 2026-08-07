import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runHiddenPostureCommandSync } from '@narada-core/process-launch-posture';

const require: any = createRequire(import.meta.url);
const __dirname: any = dirname(fileURLToPath(import.meta.url));
const packageRoot: any = resolve(__dirname, '..');
const naradaProperRoot: any = resolve(packageRoot, '..', '..');
const tsxLoaderPath: any = pathToFileURL(require.resolve('tsx')).href;

function parseJsonOutput(output: any) : any{
  const text: any = String(output ?? '').trim();
  const start: any = text.indexOf('{');
  const end: any = text.lastIndexOf('}');
  assert.ok(start >= 0 && end >= start, `json object missing from output: ${text.slice(0, 500)}`);
  return JSON.parse(text.slice(start, end + 1));
}

test('agent-start dry-run emits coherent agent-cli/NARS launch JSON', () => {
  const result: any = runHiddenPostureCommandSync(process.execPath, [
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
    '--dry-run',
    '--json',
  ], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
      NARADA_AI_MODEL: 'decoy-model',
      CLOUDFLARE_CARRIER_AI_MODEL: 'decoy-cloudflare-model',
    },
    posture: 'test_child',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const launch: any = parseJsonOutput(result.stdout);
  assert.equal(launch.status, 'dry_run');
  assert.equal(launch.identity, 'narada.architect');
  assert.equal(launch.carrier_kind, 'agent-cli');
  assert.equal(launch.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(launch.runtime_engine_kind, 'rust');
  assert.equal(launch.runtime_engine_selection.runtime_engine_kind, 'rust');
  assert.equal(launch.tool_fabric_adapter_kind, 'narada-agent-runtime-server-mcp-client');
  assert.equal(launch.required_environment.NARADA_AGENT_ID, 'narada.architect');
  assert.equal(launch.intelligence_selection_authority.launcher_selection, false);
  assert.equal(launch.required_environment.NARADA_INTELLIGENCE_PROVIDER, undefined);
  assert.equal(launch.required_environment.NARADA_AI_MODEL, undefined);
  assert.equal(launch.required_environment.CLOUDFLARE_CARRIER_AI_MODEL, undefined);
});

test('agent-start dry-run selects the Bun runtime engine without changing the NARS host contract', () => {
  const result: any = runHiddenPostureCommandSync(process.execPath, [
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
    '--runtime-engine',
    'bun',
    '--dry-run',
    '--json',
  ], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NARADA_RUNTIME_ENGINE: undefined,
      NARADA_INTELLIGENCE_PROVIDER: 'codex-subscription',
    },
    posture: 'test_child',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const launch: any = parseJsonOutput(result.stdout);
  assert.equal(launch.status, 'dry_run');
  assert.equal(launch.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(launch.runtime_engine_kind, 'bun');
  assert.equal(launch.runtime_engine_selection.source_field, 'runtime_engine');
  assert.equal(launch.nars_launch.runtime_engine_kind, 'bun');
  assert.equal(launch.carrier_session.record.runtime_engine_kind, 'bun');
});
