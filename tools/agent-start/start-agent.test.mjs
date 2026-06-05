import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaRoot = join(__dirname, '..', '..');
const packagedAgentStart = join(naradaRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');

function runJson(entrypoint, extraArgs = []) {
  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    entrypoint,
    'narada.architect',
    '--site-root', naradaRoot,
    '--target-site-root', naradaRoot,
    '--runtime', 'agent-cli',
    '--dry-run',
    '--json',
    ...extraArgs,
  ], {
    cwd: naradaRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaRoot,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function assertModernAgentCliLaunch(result) {
  assert.equal(result.schema, 'narada.agent_start.result.v0');
  assert.equal(result.runtime, 'agent-cli');
  assert.equal(result.runtime_substrate_kind, 'agent-cli');
  assert.equal(result.tool_fabric_adapter_kind, 'narada-agent-cli-mcp-client');
  assert.equal(result.agent_cli_launch.schema, 'narada.agent_start.agent_cli.v0');
  assert.equal(result.agent_cli_launch.control_transport, 'jsonl_sideband_file');
  assert.equal(result.agent_cli_launch.carrier_relation, 'interactive_agent_cli');
  assert.equal(result.agent_cli_launch.command, process.execPath);
  assert.equal(result.runtime_args[0].endsWith('narada-agent-cli.mjs'), true);
  assert.equal(result.runtime_args.includes('--session'), true);
  assert.equal(result.runtime_args.includes(result.carrier_session.carrier_session_id), true);
  assert.equal(result.runtime_args.includes('--control-jsonl'), true);
  assert.equal(result.runtime_args.includes(result.agent_cli_launch.control_path), true);
  assert.match(result.agent_cli_launch.control_path, /[\\/]\.narada[\\/]crew[\\/]nars-sessions[\\/]carrier_/);
}

test('packaged agent-start emits modern Narada proper agent-cli launch evidence', () => {
  assertModernAgentCliLaunch(runJson(packagedAgentStart));
});

test('packaged agent-start defaults Narada proper startup to agent-cli', () => {
  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    packagedAgentStart,
    'narada.architect',
    '--site-root', naradaRoot,
    '--target-site-root', naradaRoot,
    '--dry-run',
    '--json',
  ], {
    cwd: naradaRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaRoot,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const launch = JSON.parse(result.stdout);
  assert.equal(launch.runtime, 'agent-cli');
  assert.equal(launch.runtime_substrate_kind, 'agent-cli');
});
