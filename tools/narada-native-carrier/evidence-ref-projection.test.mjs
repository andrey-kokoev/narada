import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectEvidenceRefs } from './evidence-ref-projection.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-evidence-ref-'));
}

function writeEvidence(siteRoot, carrierSessionId, name, record) {
  const dir = path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

test('evidence ref projection lists family status path and recency only', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_evidence_refs';
  writeEvidence(siteRoot, carrierSessionId, 'supervisor-heartbeat', {
    status: 'running',
    recorded_at: '2026-05-16T03:49:30.000Z',
  });
  writeEvidence(siteRoot, carrierSessionId, 'task-report-handoff-payload', {
    status: 'inert_task_report_draft',
    recorded_at: '2026-05-16T03:20:00.000Z',
  });

  const projection = projectEvidenceRefs(siteRoot, carrierSessionId, { now: '2026-05-16T03:50:00.000Z' });

  assert.equal(projection.refs.length, 2);
  assert.deepEqual(Object.keys(projection.refs[0]).sort(), [
    'family',
    'path',
    'raw_prompt_recorded',
    'raw_provider_output_recorded',
    'raw_secret_values_recorded',
    'raw_transcript_recorded',
    'recency',
    'recorded_at',
    'status',
    'values_omitted',
  ]);
  assert.ok(projection.refs.some((ref) => ref.family === 'supervisor' && ref.status === 'running' && ref.recency === 'fresh'));
  assert.ok(projection.refs.some((ref) => ref.family === 'handoff' && ref.status === 'inert_task_report_draft' && ref.recency === 'recent'));
});

test('evidence ref projection omits raw transcript prompt provider output credential and secret-like values', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_evidence_redaction';
  writeEvidence(siteRoot, carrierSessionId, 'provider-adapter-invocation', {
    status: 'completed',
    recorded_at: '2026-05-16T03:49:00.000Z',
    prompt: 'raw prompt sk-evidencesecret123456',
    raw_provider_output: 'model output text',
    credential_ref_value: 'sk-evidencesecret123456',
    transcript: 'conversation transcript',
  });

  const projection = projectEvidenceRefs(siteRoot, carrierSessionId, { now: '2026-05-16T03:50:00.000Z' });
  const text = JSON.stringify(projection);

  assert.equal(projection.raw_transcript_recorded, false);
  assert.equal(projection.raw_prompt_recorded, false);
  assert.equal(projection.raw_provider_output_recorded, false);
  assert.equal(projection.raw_secret_values_recorded, false);
  assert.equal(projection.refs[0].family, 'adapter');
  assert.doesNotMatch(text, /sk-evidencesecret123456/);
  assert.doesNotMatch(text, /raw prompt/);
  assert.doesNotMatch(text, /model output text/);
  assert.doesNotMatch(text, /conversation transcript/);
});

test('evidence ref projection redacts secret-like path and status values', () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_evidence_path_redaction';
  writeEvidence(siteRoot, carrierSessionId, 'supervisor-heartbeat-sk-evidencepathsecret123456', {
    status: 'running sk-evidencestatussecret123456',
    recorded_at: '2026-05-16T03:49:00.000Z',
  });

  const projection = projectEvidenceRefs(siteRoot, carrierSessionId, { now: '2026-05-16T03:50:00.000Z' });
  const text = JSON.stringify(projection);

  assert.equal(projection.refs[0].path, 'omitted_sensitive_path');
  assert.equal(projection.refs[0].status, 'omitted_sensitive_value');
  assert.doesNotMatch(text, /sk-evidencepathsecret123456/);
  assert.doesNotMatch(text, /sk-evidencestatussecret123456/);
});
