import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLaunchPlanFromArgs, writeClaudeCodeProcessAttempt, writeLaunchResult } from './start-agent.mjs';
import { materializeLifecycleFixture } from './claude-code-lifecycle.mjs';
import { buildAffordance } from './claude-code-affordance.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-claude-affordance-'));
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

test('claude-code operator affordance exposes launch and session requests from durable evidence', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  writePolicy(siteRoot);
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T20:31:00.000Z' });
  writeLaunchResult(result, siteRoot);
  writeClaudeCodeProcessAttempt(result, siteRoot);
  materializeLifecycleFixture({
    siteRoot,
    launchResult: result,
    processAttempt: result.claude_code_process_attempt,
    now: '2026-05-15T20:31:01.000Z',
  });

  const affordance = buildAffordance({ siteRoot, launchResult: result });

  assert.equal(affordance.schema, 'narada.agent_start.claude_code_operator_affordance.v0');
  assert.equal(affordance.carrier_session_id, result.carrier_session_id);
  assert.equal(affordance.startup_command.name, 'agent_context_startup_sequence');
  assert.equal(affordance.result_sentinel, result.result_sentinel);
  assert.equal(affordance.mcp_approval_posture.target_locus, 'narada_proper');
  assert.equal(affordance.latest_session_readback.current_state, 'failed');
  assert.equal(affordance.resumability.depends_on_volatile_terminal_or_window_state, false);
  assert.equal(affordance.requests.resume.carrier_session_id, result.carrier_session_id);
  assert.equal(affordance.requests.interrupt.authority, 'operator_or_runtime_locus_confirms_interrupt');
  assert.equal(affordance.requests.handoff.authority, 'canonical_task_or_inbox_handoff_required');
  assert.equal(affordance.requests.close.authority, 'closeout_evidence_required');
  assert.ok(affordance.authority_non_claims.includes('volatile_terminal_window_truth'));
});
