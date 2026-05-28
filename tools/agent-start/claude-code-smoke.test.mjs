import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runClaudeCodeSmoke } from './claude-code-smoke.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-claude-smoke-'));
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

test('claude-code smoke skips with blocker when runtime is unavailable', () => {
  const siteRoot = tempSite();
  writePolicy(siteRoot);
  const proof = runClaudeCodeSmoke({
    siteRoot,
    pcSiteRoot: tempPcSite(),
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
      throw new Error('spawn must not run when smoke is skipped');
    },
    now: '2026-05-15T21:37:00.000Z',
  });
  const persisted = JSON.parse(fs.readFileSync(proof.smoke_proof_path, 'utf8'));

  assert.equal(proof.status, 'skipped_with_blocker');
  assert.equal(proof.operational_success_claimed, false);
  assert.match(proof.blocker, /not found on PATH/);
  assert.equal(fs.existsSync(proof.launch_result_path), true);
  assert.equal(fs.existsSync(proof.process_attempt_path), true);
  assert.equal(fs.existsSync(proof.live_launch_evidence_path), true);
  assert.deepEqual(proof.lifecycle_event_paths, []);
  assert.equal(proof.reconstruction.current_state, 'unknown');
  assert.equal(persisted.raw_transcript_recorded, false);
  assert.equal(persisted.raw_secret_values_recorded, false);
});

test('claude-code smoke records no-effect lifecycle, reconstruction, and mediated effect evidence', () => {
  const siteRoot = tempSite();
  const runtimePath = path.join(siteRoot, 'bin', 'claude');
  const calls = [];
  writePolicy(siteRoot);
  const proof = runClaudeCodeSmoke({
    siteRoot,
    pcSiteRoot: tempPcSite(),
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
      return { pid: 5151 };
    },
    now: '2026-05-15T21:37:01.000Z',
  });
  const persistedText = fs.readFileSync(proof.smoke_proof_path, 'utf8');
  const liveLaunchEvidence = JSON.parse(fs.readFileSync(proof.live_launch_evidence_path, 'utf8'));
  const effectEvidence = JSON.parse(fs.readFileSync(proof.effect_mediation.evidence_path, 'utf8'));

  assert.equal(proof.status, 'passed_no_effect');
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].options.env).sort(), [
    'NARADA_AGENT_CONTEXT_DB',
    'NARADA_AGENT_ID',
    'NARADA_AGENT_START_EVENT_ID',
    'NARADA_CARRIER_SESSION_ID',
    'NARADA_PC_SITE_ROOT',
    'NARADA_SITE_ROOT',
  ]);
  assert.equal(calls[0].options.env.SECRET_TOKEN, undefined);
  assert.equal(proof.operational_success_claimed, true);
  assert.equal(proof.lifecycle_event_paths.length, 5);
  for (const evidencePath of [
    proof.launch_result_path,
    proof.process_attempt_path,
    proof.live_launch_evidence_path,
    proof.smoke_proof_path,
    ...proof.lifecycle_event_paths,
  ]) {
    assert.equal(fs.existsSync(evidencePath), true);
  }
  assert.equal(proof.latest_readback.current_state, 'closed');
  assert.equal(proof.reconstruction.current_state, 'closed');
  assert.equal(proof.reconstruction.effectful_narada_authority_admitted, false);
  assert.equal(proof.effect_mediation.status, 'inert_candidate');
  assert.equal(proof.effect_mediation.carrier_mutation_admitted, false);
  assert.equal(liveLaunchEvidence.environment_projection.parent_environment_inherited, false);
  assert.equal(liveLaunchEvidence.environment_projection.raw_secret_values_recorded, false);
  assert.equal(effectEvidence.envelope.raw_payload_recorded, false);
  assert.equal(effectEvidence.envelope.raw_secret_values_recorded, false);
  assert.equal(proof.direct_task_mutation, false);
  assert.equal(proof.direct_publication_mutation, false);
  assert.equal(proof.operator_commands.launch, 'node tools\\agent-start\\start-agent.mjs narada.builder --runtime claude-code --exec --json');
  assert.doesNotMatch(persistedText, /SECRET|TOKEN|PASSWORD/);
});
