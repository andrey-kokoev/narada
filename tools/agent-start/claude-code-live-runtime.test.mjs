import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLaunchPlanFromArgs, writeLaunchResult } from './start-agent.mjs';
import {
  bridgeClaudeCodeLiveLaunch,
  carrierEnvironment,
  discoverClaudeCodeRuntime,
  readinessFromDiscovery,
} from './claude-code-live-runtime.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-claude-live-'));
}

function tempPcSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-pc-site-'));
}

function writePolicy(siteRoot) {
  fs.mkdirSync(path.join(siteRoot, '.narada', 'agent-carriers'), { recursive: true });
  fs.writeFileSync(
    path.join(siteRoot, '.narada', 'agent-carriers', 'claude-code-execution-policy.v0.json'),
    `${JSON.stringify({
      schema: 'narada.agent_start.claude_code_execution_policy.v0',
      carrier_kind: 'claude_code_carrier',
      target_locus: 'narada_proper',
      process_launch_admitted: true,
      authority_basis: 'test',
      withheld_authorities: [
        'task_lifecycle_mutation_authority',
        'inbox_mutation_authority',
        'outbox_transport_authority',
        'repository_publication_authority',
        'site_mutation_authority',
        'credential_access',
        'native_shell_authority',
        'external_site_authority',
      ],
    }, null, 2)}\n`,
    'utf8',
  );
}

function launchPacket(siteRoot) {
  const pcSiteRoot = tempPcSite();
  writePolicy(siteRoot);
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T21:35:00.000Z' });
  writeLaunchResult(result, siteRoot);
  return result;
}

test('claude-code runtime discovery reports configured available runtime', () => {
  const runtimePath = path.join(tempSite(), 'bin', process.platform === 'win32' ? 'claude.cmd' : 'claude');
  const discovery = discoverClaudeCodeRuntime({
    env: { NARADA_CLAUDE_CODE_RUNTIME_COMMAND: runtimePath },
    fileExists: (candidate) => candidate === runtimePath,
  });
  const readiness = readinessFromDiscovery(discovery);

  assert.equal(discovery.status, 'available');
  assert.equal(discovery.source, 'configured_absolute_runtime_reference');
  assert.equal(discovery.resolved_path, runtimePath);
  assert.equal(readiness.readiness_state, 'available');
  assert.equal(readiness.launch_admitted, true);
  assert.equal(readiness.raw_secret_values_recorded, false);
});

test('claude-code runtime discovery refuses unavailable and ambiguous PATH states', () => {
  const unavailable = discoverClaudeCodeRuntime({
    env: { PATH: path.join(tempSite(), 'empty') },
    platform: 'linux',
    pathDelimiter: path.delimiter,
    fileExists: () => false,
  });
  const first = path.join('A:\\bin', 'claude.cmd');
  const second = path.join('B:\\bin', 'claude.cmd');
  const ambiguous = discoverClaudeCodeRuntime({
    env: { PATH: ['A:\\bin', 'B:\\bin'].join(';') },
    platform: 'win32',
    pathDelimiter: ';',
    fileExists: (candidate) => candidate === first || candidate === second,
  });

  assert.equal(unavailable.status, 'unavailable');
  assert.match(readinessFromDiscovery(unavailable).refusal_diagnostic, /not found on PATH/);
  assert.equal(ambiguous.status, 'ambiguous');
  assert.match(readinessFromDiscovery(ambiguous).refusal_diagnostic, /multiple candidates/);
});

test('live launch bridge writes refused evidence when runtime is unavailable', () => {
  const siteRoot = tempSite();
  const packet = launchPacket(siteRoot);
  const result = bridgeClaudeCodeLiveLaunch({
    siteRoot,
    launchPacket: packet,
    discovery: {
      schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
      status: 'unavailable',
      source: 'path_runtime_resolution',
      command: 'claude',
      resolved_path: null,
      candidates: [],
      diagnostic: 'Claude Code runtime command was not found on PATH: claude',
    },
    spawnRuntime: () => {
      throw new Error('spawn must not run for unavailable runtime');
    },
    now: '2026-05-15T21:35:01.000Z',
  });
  const evidence = JSON.parse(fs.readFileSync(result.evidence_path, 'utf8'));

  assert.equal(result.status, 'refused');
  assert.equal(evidence.phase, 'before_process_start');
  assert.equal(evidence.closeout_readback.status, 'not_started');
  assert.equal(evidence.direct_task_mutation, false);
  assert.equal(evidence.raw_transcript_recorded, false);
});

test('live launch bridge starts configured runtime and records bounded handle evidence', () => {
  const siteRoot = tempSite();
  const packet = launchPacket(siteRoot);
  const runtimePath = path.join(siteRoot, 'bin', 'claude');
  const calls = [];
  const result = bridgeClaudeCodeLiveLaunch({
    siteRoot,
    launchPacket: packet,
    discovery: {
      schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
      status: 'available',
      source: 'configured_absolute_runtime_reference',
      command: runtimePath,
      resolved_path: runtimePath,
      candidates: [runtimePath],
      diagnostic: null,
    },
    spawnRuntime: (command, args, options) => {
      calls.push({ command, args, options });
      return { pid: 4242 };
    },
    now: '2026-05-15T21:35:02.000Z',
  });
  const evidenceText = fs.readFileSync(result.evidence_path, 'utf8');
  const evidence = JSON.parse(evidenceText);

  assert.equal(result.status, 'started');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, runtimePath);
  assert.deepEqual(calls[0].args, packet.runtime_args);
  assert.equal(calls[0].options.cwd, siteRoot);
  assert.equal(calls[0].options.stdio, 'ignore');
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(Object.keys(calls[0].options.env).sort(), Object.keys(packet.required_environment).filter((key) => key.startsWith('NARADA_')).sort());
  assert.equal(calls[0].options.env.SECRET_TOKEN, undefined);
  assert.equal(calls[0].options.env.PASSWORD, undefined);
  assert.equal(evidence.phase, 'after_process_start');
  assert.equal(evidence.runtime_handle.pid, 4242);
  assert.equal(evidence.startup_command_posture.startup_command.name, 'agent_context_startup_sequence');
  assert.equal(evidence.environment_projection.parent_environment_inherited, false);
  assert.ok(evidence.withheld_authorities.includes('credential_access'));
  assert.equal(evidence.raw_secret_values_recorded, false);
  assert.equal(evidence.raw_transcript_recorded, false);
  assert.doesNotMatch(evidenceText, /SECRET|TOKEN|PASSWORD/);
});

test('carrier environment allowlist omits ambient and launch-packet secret-like variables', () => {
  const env = carrierEnvironment({
    required_environment: {
      NARADA_AGENT_ID: 'narada.builder',
      NARADA_CARRIER_SESSION_ID: 'carrier_session_env',
      SECRET_TOKEN: 'must-not-pass',
      PASSWORD: 'must-not-pass',
      PATH: 'must-not-pass',
    },
  });

  assert.deepEqual(env, {
    NARADA_AGENT_ID: 'narada.builder',
    NARADA_CARRIER_SESSION_ID: 'carrier_session_env',
  });
});
