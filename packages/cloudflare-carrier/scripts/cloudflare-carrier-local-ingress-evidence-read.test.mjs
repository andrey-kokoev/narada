import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatLocalIngressEvidenceReadText,
  parseLocalIngressEvidenceReadArgs,
  readLocalIngressEvidence,
  summarizeLocalIngressEvidence,
} from './cloudflare-carrier-local-ingress-evidence-read.mjs';

test('parseLocalIngressEvidenceReadArgs reuses direct local ingress evidence list parsing', () => {
  const parsed = parseLocalIngressEvidenceReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--local-ingress-request-id', 'local_ingress_request_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'local_ingress.evidence.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.local_ingress_request_id, 'local_ingress_request_alpha');
  assert.equal(parsed.format, 'text');
});

test('summarizeLocalIngressEvidence lifts latest local ingress execution evidence', () => {
  const summary = summarizeLocalIngressEvidence({
    site_id: 'site_alpha',
    local_ingress_evidence_authority: 'windows_local_ingress_executor',
    cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
    local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
    direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
    evidence: [{
      local_ingress_evidence_id: 'local_ingress_evidence_alpha',
      local_ingress_request_id: 'local_ingress_request_alpha',
      local_execution_id: 'windows_execution_alpha',
      local_execution_status: 'completed',
      local_executor_authority: 'windows_local_ingress_executor',
      windows_admission_action: 'admit',
      windows_admission_reason: 'local_ingress_execution_completed',
      changed_file_count: 2,
      rollback_evidence_ref: 'rollback_alpha',
      evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
      recorded_at: '2026-06-13T04:31:00.000Z',
    }],
  });

  assert.equal(summary.evidence_count, 1);
  assert.equal(summary.latest_evidence_id, 'local_ingress_evidence_alpha');
  assert.equal(summary.latest_local_execution_id, 'windows_execution_alpha');
});

test('readLocalIngressEvidence returns summarized local ingress evidence', async () => {
  const result = await readLocalIngressEvidence({
    workerUrl: 'https://carrier.example.test',
    operation: 'local_ingress.evidence.list',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      local_ingress_evidence_authority: 'windows_local_ingress_executor',
      cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
      local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
      evidence: [{ local_ingress_evidence_id: 'local_ingress_evidence_alpha', local_execution_status: 'completed' }],
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.local_ingress_evidence_read.v1');
  assert.equal(result.summary.evidence_count, 1);
  assert.equal(result.summary.latest_evidence_id, 'local_ingress_evidence_alpha');
});

test('formatLocalIngressEvidenceReadText prints local ingress evidence summary', () => {
  const text = formatLocalIngressEvidenceReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      evidence_count: 1,
      latest_evidence_id: 'local_ingress_evidence_alpha',
      latest_status: 'completed',
      latest_request_id: 'local_ingress_request_alpha',
      latest_local_execution_id: 'windows_execution_alpha',
      latest_executor_authority: 'windows_local_ingress_executor',
      latest_windows_admission_action: 'admit',
      latest_windows_admission_reason: 'local_ingress_execution_completed',
      local_filesystem_mutation_admission: 'admitted_by_windows_local_ingress',
      latest_changed_file_count: 2,
      latest_rollback_evidence_ref: 'rollback_alpha',
      cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      local_ingress_evidence_authority: 'windows_local_ingress_executor',
      latest_evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
      authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
      latest_recorded_at: '2026-06-13T04:31:00.000Z',
    },
  });

  assert.match(text, /Local Ingress Evidence Review: ok/);
  assert.match(text, /Evidence: count=1 latest=local_ingress_evidence_alpha status=completed/);
  assert.match(text, /Admissions: windows=admit \/ local_ingress_execution_completed local_filesystem_mutation=admitted_by_windows_local_ingress/);
});
