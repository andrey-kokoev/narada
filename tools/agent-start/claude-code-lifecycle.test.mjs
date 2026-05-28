import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLaunchPlanFromArgs, writeClaudeCodeProcessAttempt, writeLaunchResult } from './start-agent.mjs';
import {
  LIFECYCLE_STATES,
  latestSessionReadback,
  materializeLifecycleFixture,
  reconstructSession,
} from './claude-code-lifecycle.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-claude-lifecycle-'));
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

test('claude-code lifecycle states are evidenced and reconstructable without live Claude Code', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  writePolicy(siteRoot);
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T20:01:00.000Z' });
  writeLaunchResult(result, siteRoot);
  writeClaudeCodeProcessAttempt(result, siteRoot);

  const events = materializeLifecycleFixture({
    siteRoot,
    launchResult: result,
    processAttempt: result.claude_code_process_attempt,
    now: '2026-05-15T20:01:01.000Z',
  });

  assert.deepEqual(events.map((event) => event.state), LIFECYCLE_STATES);
  for (const event of events) {
    assert.equal(fs.existsSync(event.path), true);
    assert.equal(event.effectful_narada_authority_admitted, undefined);
    assert.equal(event.authority_posture.effectful_narada_authority_admitted, false);
    assert.ok(event.authority_posture.withheld_authorities.includes('repository_publication_authority'));
  }

  const interrupted = events.find((event) => event.state === 'interrupted');
  const closed = events.find((event) => event.state === 'closed');
  assert.equal(interrupted.reconstruction_inputs.includes('lifecycle_events'), true);
  assert.deepEqual(closed.closeout_posture, { status: 'closed_with_evidence', handoff_required: false });

  const reconstruction = reconstructSession(siteRoot, result.carrier_session_id);
  assert.equal(reconstruction.event_count, LIFECYCLE_STATES.length);
  assert.equal(reconstruction.current_state, 'failed');
  assert.equal(reconstruction.startup_hydration_result.status, 'hydrated');
  assert.equal(reconstruction.effectful_narada_authority_admitted, false);
  assert.equal(reconstruction.direct_sqlite_inspection_required, false);

  const readback = latestSessionReadback(siteRoot);
  assert.equal(readback.status, 'ok');
  assert.equal(readback.current_state, 'failed');
  assert.equal(readback.carrier_session_id, result.carrier_session_id);
  assert.equal(readback.direct_sqlite_inspection_required, false);
});
