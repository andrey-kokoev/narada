import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HANDOFF_NO_MUTATION_FLAGS,
  emitCanonicalHandoffDraft,
} from './handoff-emission-stage.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-handoff-stage-'));
}

test('handoff emission writes inert task report draft with canonical admission command', () => {
  const siteRoot = tempSite();
  const result = emitCanonicalHandoffDraft({
    siteRoot,
    carrierSessionId: 'session-1330',
    agentId: 'narada.builder',
    reviewer: 'narada.architect',
    taskNumber: 1330,
    taskId: '20260516-1330-implement-canonical-handoff-emission-stage',
    orchestrationResult: {
      mode: 'success',
      status: 'completed_no_effect',
      stage_statuses: { to_data: 'completed', to_intelligence: 'completed', handoff_emission: 'pending' },
      evidence_refs: { to_data_bundle: 'evidence:data', intelligence_invocation: 'evidence:intel' },
    },
    lifecycleStateBefore: { status: 'claimed', assignment: 'narada.builder' },
    now: '2026-05-16T01:30:00.000Z',
  });
  const disk = JSON.parse(fs.readFileSync(result.draft_path, 'utf8'));

  assert.equal(result.status, 'draft_emitted');
  assert.equal(disk.status, 'inert_draft_requires_canonical_admission');
  assert.equal(disk.report_file_path, result.draft_path);
  assert.equal(disk.suggested_admission_command.includes('narada task report 1330'), true);
  assert.equal(disk.suggested_admission_command.includes('--report-file'), true);
  assert.deepEqual(disk.mutation_flags, HANDOFF_NO_MUTATION_FLAGS);
  assert.equal(disk.lifecycle_state_changed, false);
  assert.deepEqual(disk.lifecycle_state_after, disk.lifecycle_state_before);
});

test('handoff emission records no authority-bearing command execution flags', () => {
  const siteRoot = tempSite();
  const result = emitCanonicalHandoffDraft({
    siteRoot,
    carrierSessionId: 'session-1330',
    agentId: 'narada.builder',
    taskNumber: 1330,
    orchestrationResult: { mode: 'refusal', status: 'refused_missing_data_packet' },
    lifecycleStateBefore: { status: 'claimed' },
  });

  for (const value of Object.values(result.mutation_flags)) assert.equal(value, false);
  for (const value of Object.values(result.draft.mutation_flags)) assert.equal(value, false);
  assert.equal(result.draft.raw_prompt_recorded, false);
  assert.equal(result.draft.raw_provider_output_recorded, false);
  assert.equal(result.draft.raw_transcript_recorded, false);
  assert.equal(result.draft.raw_secret_values_recorded, false);
  assert.equal(JSON.stringify(result.draft).includes('task close'), false);
  assert.equal(JSON.stringify(result.draft).includes('git push'), false);
});
