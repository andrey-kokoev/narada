import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFixtureWorkLoop } from './work-loop.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-loop-'));
}

test('native work loop runs in no-effect mode and emits governed handoff evidence', () => {
  const siteRoot = tempSite();
  const prompt = 'propose next action with token sk-testsecretvalue123456';
  const result = runFixtureWorkLoop({
    siteRoot,
    carrierSessionId: 'carrier_session_loop',
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1292, prompt },
    now: '2026-05-15T20:33:00.000Z',
  });

  assert.equal(result.mode, 'fixture_no_effect');
  assert.equal(result.direct_mutation_performed, false);
  for (const evidencePath of [result.adapter_invocation_path, result.handoff_path, result.interrupt_path, result.closeout_path]) {
    assert.equal(fs.existsSync(evidencePath), true);
  }
  const handoff = JSON.parse(fs.readFileSync(result.handoff_path, 'utf8'));
  const closeout = JSON.parse(fs.readFileSync(result.closeout_path, 'utf8'));
  const adapterEvidence = fs.readFileSync(result.adapter_invocation_path, 'utf8');
  const handoffEvidence = fs.readFileSync(result.handoff_path, 'utf8');

  assert.equal(handoff.status, 'inert_handoff_artifact');
  assert.equal(handoff.canonical_admission_required, true);
  assert.equal(handoff.direct_mutation_performed, false);
  assert.equal('payload' in handoff.proposed_action_packet, false);
  assert.deepEqual(handoff.proposed_action_packet.payload_summary, {
    shape: 'object',
    keys: ['summary'],
    values_omitted: true,
  });
  assert.equal(closeout.status, 'closed_no_effect');
  assert.equal(closeout.direct_task_mutation, false);
  assert.equal(closeout.direct_inbox_mutation, false);
  assert.equal(closeout.direct_outbox_mutation, false);
  assert.equal(closeout.direct_publication_mutation, false);
  assert.equal(closeout.direct_command_execution, false);
  assert.equal(closeout.mocked_authority_surfaces_invoked, false);
  assert.deepEqual(closeout.authority_refusals.map((refusal) => refusal.surface), [
    'task_report',
    'task_close',
    'task_review',
    'inbox',
    'command_execution',
    'outbox_approve',
    'outbox_confirm',
    'repository_publication_prepare',
    'repository_publication_confirm',
  ]);
  assert.equal(closeout.authority_refusals.every((refusal) => refusal.mutation_performed === false), true);
  assert.equal(closeout.authority_refusals.every((refusal) => refusal.canonical_admission_required === true), true);
  assert.equal(closeout.authority_refusals.every((refusal) => typeof refusal.refusal_reason === 'string' && refusal.refusal_reason.length > 0), true);
  assert.doesNotMatch(adapterEvidence, /sk-testsecretvalue123456/);
  assert.doesNotMatch(handoffEvidence, /sk-testsecretvalue123456/);
  assert.doesNotMatch(adapterEvidence, /propose next action with token/);
  assert.doesNotMatch(handoffEvidence, /propose next action with token/);
});
