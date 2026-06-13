import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatLocalIngressRequestReadText,
  parseLocalIngressRequestReadArgs,
  readLocalIngressRequest,
  summarizeLocalIngressRequest,
} from './cloudflare-carrier-local-ingress-request-read.mjs';

test('parseLocalIngressRequestReadArgs reuses direct local ingress request list parsing', () => {
  const parsed = parseLocalIngressRequestReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'local_ingress.request.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('summarizeLocalIngressRequest lifts latest local ingress request posture', () => {
  const summary = summarizeLocalIngressRequest({
    site_id: 'site_alpha',
    local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
    local_executor_authority: 'windows_local_ingress_executor',
    local_execution_admission: 'pending_windows_admission',
    direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
    requests: [{
      local_ingress_request_id: 'local_ingress_request_alpha',
      operation_id: 'operation_site_read',
      requested_action_ref: 'site_file_materialization.admit',
      request_authority: 'cloudflare_local_ingress_request_queue',
      target_authority_locus: 'local-windows-site-authority',
      local_executor_authority: 'windows_local_ingress_executor',
      local_execution_admission: 'pending_windows_admission',
      recorded_at: '2026-06-13T04:30:00.000Z',
    }],
  });

  assert.equal(summary.request_count, 1);
  assert.equal(summary.latest_request_id, 'local_ingress_request_alpha');
  assert.equal(summary.latest_requested_action_ref, 'site_file_materialization.admit');
});

test('readLocalIngressRequest returns summarized local ingress request state', async () => {
  const result = await readLocalIngressRequest({
    workerUrl: 'https://carrier.example.test',
    operation: 'local_ingress.request.list',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
      local_executor_authority: 'windows_local_ingress_executor',
      local_execution_admission: 'pending_windows_admission',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
      requests: [{ local_ingress_request_id: 'local_ingress_request_alpha', requested_action_ref: 'site_file_materialization.admit' }],
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.local_ingress_request_read.v1');
  assert.equal(result.summary.request_count, 1);
  assert.equal(result.summary.latest_request_id, 'local_ingress_request_alpha');
});

test('formatLocalIngressRequestReadText prints local ingress request summary', () => {
  const text = formatLocalIngressRequestReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      request_count: 1,
      latest_request_id: 'local_ingress_request_alpha',
      latest_requested_action_ref: 'site_file_materialization.admit',
      local_execution_admission: 'pending_windows_admission',
      local_executor_authority: 'windows_local_ingress_executor',
      latest_target_authority_locus: 'local-windows-site-authority',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
      authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
      latest_operation_id: 'operation_site_read',
      latest_recorded_at: '2026-06-13T04:30:00.000Z',
    },
  });

  assert.match(text, /Local Ingress Request Review: ok/);
  assert.match(text, /Requests: count=1 latest=local_ingress_request_alpha action=site_file_materialization\.admit/);
  assert.match(text, /Execution: admission=pending_windows_admission executor=windows_local_ingress_executor target=local-windows-site-authority/);
});
