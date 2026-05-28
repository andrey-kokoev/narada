import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateCarrierActionPacket } from './carrier-action-packet.mjs';
import { emitTaskReportHandoffPacket } from './task-report-handoff-family.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-task-report-handoff-'));
}

test('task-report handoff emits inert reconstructable packet and payload ref', () => {
  const siteRoot = tempSite();
  const result = emitTaskReportHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_task_report_packet',
    agentId: 'narada.builder',
    reviewer: 'builder',
    taskNumber: 1346,
    taskId: '20260516-1346-implement-task-report-handoff-family',
    reportSummary: 'Implemented task report handoff packet.',
    changedFileRefs: ['tools/narada-native-carrier/task-report-handoff-family.mjs'],
    verificationRefs: ['node --test task-report-handoff-family.test.mjs'],
    residuals: [{ kind: 'none', summary: 'No residuals.' }],
    lifecycleStateBefore: 'claimed',
    now: '2026-05-16T03:39:00.000Z',
  });
  const payload = JSON.parse(fs.readFileSync(result.payload_ref, 'utf8'));

  assert.equal(result.status, 'packet_emitted');
  assert.equal(result.packet.action_family, 'task_report');
  assert.equal(result.packet.status, 'inert_proposal');
  assert.equal(result.packet.payload_ref, result.payload_ref);
  assert.deepEqual(validateCarrierActionPacket(result.packet), []);
  assert.equal(payload.task_number, 1346);
  assert.equal(payload.task_id, '20260516-1346-implement-task-report-handoff-family');
  assert.equal(payload.changed_file_refs.length, 1);
  assert.equal(payload.verification_refs.length, 1);
  assert.equal(payload.residuals.length, 1);
  assert.match(payload.suggested_admission_command, /narada task report 1346/);
  assert.match(payload.suggested_admission_command, /--report-file/);
});

test('task-report handoff does not mutate lifecycle before canonical admission', () => {
  const siteRoot = tempSite();
  const result = emitTaskReportHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_lifecycle_unchanged',
    agentId: 'narada.builder',
    taskNumber: 1346,
    reportSummary: 'Lifecycle remains unchanged.',
    lifecycleStateBefore: 'claimed',
  });

  assert.equal(result.lifecycle_state_before, 'claimed');
  assert.equal(result.lifecycle_state_after, 'claimed');
  assert.equal(result.lifecycle_state_changed, false);
  assert.equal(result.direct_task_lifecycle_mutation, false);
  assert.equal(result.packet.direct_mutation_performed, false);
  assert.equal(result.packet.requires_canonical_admission, true);
});

test('task-report handoff omits raw task markdown provider output prompt transcript and secrets', () => {
  const siteRoot = tempSite();
  const result = emitTaskReportHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_task_report_redaction',
    agentId: 'narada.builder',
    taskNumber: 1346,
    reportSummary: 'summary with secret sk-taskreportsecret123456',
    changedFileRefs: ['file-ref'],
    verificationRefs: ['verification-ref'],
    residuals: [{
      kind: 'diagnostic',
      summary: 'residual with token sk-taskreportsecret123456',
      evidence_ref: 'evidence:bounded',
      raw_provider_output: 'provider output text',
      raw_task_markdown: 'task markdown text',
    }],
  });
  const text = fs.readFileSync(result.payload_ref, 'utf8') + JSON.stringify(result.packet);

  assert.equal(result.payload.report_summary, 'summary_omitted_sensitive_value');
  assert.equal(result.payload.raw_task_markdown_recorded, false);
  assert.equal(result.payload.raw_transcript_recorded, false);
  assert.equal(result.payload.raw_prompt_recorded, false);
  assert.equal(result.payload.raw_provider_output_recorded, false);
  assert.equal(result.payload.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /sk-taskreportsecret123456/);
  assert.doesNotMatch(text, /provider output text/);
  assert.doesNotMatch(text, /task markdown text/);
});
