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
    '--focus-ref', 'local_ingress_request_alpha',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'local_ingress.request.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
  assert.equal(parsed.focusRequestId, 'local_ingress_request_alpha');
});

test('summarizeLocalIngressRequest lifts latest local ingress request posture and current evidence state', () => {
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
  }, {
    evidence: [{
      local_ingress_evidence_id: 'local_ingress_evidence_alpha',
      local_ingress_request_id: 'local_ingress_request_alpha',
      local_execution_id: 'windows_local_ingress_execution_alpha',
      local_execution_status: 'completed',
      evidence_posture: 'local_repository_filesystem_mutation_completed',
    }],
  });

  assert.equal(summary.request_count, 1);
  assert.equal(summary.focused_request_id, 'local_ingress_request_alpha');
  assert.equal(summary.focused_requested_action_ref, 'site_file_materialization.admit');
  assert.equal(summary.authority_partition, 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence');
  assert.equal(summary.requested_posture, 'request_only_pending_windows_execution');
  assert.equal(summary.current_posture, 'local_repository_filesystem_mutation_completed');
  assert.equal(summary.latest_evidence_id, 'local_ingress_evidence_alpha');
});

test('readLocalIngressRequest returns summarized local ingress request state and matching evidence posture', async () => {
  const result = await readLocalIngressRequest({
    workerUrl: 'https://carrier.example.test',
    operation: 'local_ingress.request.list',
    requestId: 'request_local_ingress_review_1',
    params: { site_id: 'site_alpha' },
    focusRequestId: 'local_ingress_request_alpha',
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'local_ingress.request.list') {
      return {
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
      };
    }
    if (body.operation === 'local_ingress.evidence.list') {
      assert.equal(body.params.local_ingress_request_id, 'local_ingress_request_alpha');
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          site_id: 'site_alpha',
          evidence: [{
            local_ingress_evidence_id: 'local_ingress_evidence_alpha',
            local_ingress_request_id: 'local_ingress_request_alpha',
            local_execution_id: 'windows_local_ingress_execution_alpha',
            local_execution_status: 'completed',
            evidence_posture: 'local_repository_filesystem_mutation_completed',
          }],
        }),
      };
    }
    throw new Error(`unexpected operation:${body.operation}`);
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.local_ingress_request_read.v1');
  assert.equal(result.summary.request_count, 1);
  assert.equal(result.summary.focused_request_id, 'local_ingress_request_alpha');
  assert.equal(result.summary.requested_posture, 'request_only_pending_windows_execution');
  assert.equal(result.summary.current_posture, 'local_repository_filesystem_mutation_completed');
});

test('readLocalIngressRequest fails explicitly when a focused request is missing', async () => {
  await assert.rejects(
    () => readLocalIngressRequest({
      workerUrl: 'https://carrier.example.test',
      operation: 'local_ingress.request.list',
      requestId: 'request_local_ingress_review_2',
      params: { site_id: 'site_alpha' },
      focusRequestId: 'local_ingress_request_missing',
      auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
    }, async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.operation === 'local_ingress.request.list') {
        return {
          status: 200,
          ok: true,
          text: async () => JSON.stringify({
            site_id: 'site_alpha',
            requests: [{ local_ingress_request_id: 'local_ingress_request_alpha' }],
          }),
        };
      }
      throw new Error(`unexpected operation:${body.operation}`);
    }),
    /local_ingress_request_review_focus_not_found:local_ingress_request_missing/,
  );
});

test('formatLocalIngressRequestReadText prints local ingress request summary', () => {
  const text = formatLocalIngressRequestReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      request_count: 1,
      focused_request_id: 'local_ingress_request_alpha',
      focused_requested_action_ref: 'site_file_materialization.admit',
      local_execution_admission: 'pending_windows_admission',
      local_executor_authority: 'windows_local_ingress_executor',
      focused_target_authority_locus: 'local-windows-site-authority',
      direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      requested_posture: 'request_only_pending_windows_execution',
      current_posture: 'local_repository_filesystem_mutation_completed',
      local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
      authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
      focused_operation_id: 'operation_site_read',
      focused_recorded_at: '2026-06-13T04:30:00.000Z',
      latest_evidence_id: 'local_ingress_evidence_alpha',
      latest_local_execution_id: 'windows_local_ingress_execution_alpha',
      latest_execution_status: 'completed',
    },
  });

  assert.match(text, /Local Ingress Request Review: ok/);
  assert.match(text, /Requests: count=1 focused=local_ingress_request_alpha action=site_file_materialization\.admit/);
  assert.match(text, /Requested Execution: admission=pending_windows_admission executor=windows_local_ingress_executor target=local-windows-site-authority/);
  assert.match(text, /Current Posture: local_repository_filesystem_mutation_completed/);
  assert.match(text, /Requested Posture: request_only_pending_windows_execution/);
  assert.match(text, /Current Execution: evidence=local_ingress_evidence_alpha local_execution=windows_local_ingress_execution_alpha status=completed/);
  assert.match(text, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:evidence:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --local-ingress-evidence-id local_ingress_evidence_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Focused Request: operation=operation_site_read recorded=2026-06-13T04:30:00.000Z/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_site_read --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_site_read --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatLocalIngressRequestReadText suppresses site-scoped handoff without a real site id', () => {
  const text = formatLocalIngressRequestReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      request_count: 1,
      focused_request_id: 'local_ingress_request_alpha',
      latest_evidence_id: 'local_ingress_evidence_alpha',
      latest_local_execution_id: 'windows_local_ingress_execution_alpha',
      latest_execution_status: 'completed',
      focused_operation_id: 'operation_site_read',
    },
  });

  assert.doesNotMatch(text, /Evidence Read:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /<site-id>/);
});
