import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatLocalIngressRequestLiveSmokeText,
  parseLocalIngressRequestLiveSmokeArgs,
  runLocalIngressRequestLiveSmoke,
} from './cloudflare-carrier-local-ingress-request-live-smoke.mjs';

test('parseLocalIngressRequestLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseLocalIngressRequestLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatLocalIngressRequestLiveSmokeText emits downstream reads', () => {
  const text = formatLocalIngressRequestLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    local_ingress_request_id: 'local_ingress_request_live_1',
  });

  assert.match(text, /Local Ingress Request Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Request Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:request:review:text/);
  assert.match(text, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:evidence:review:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatLocalIngressRequestLiveSmokeText suppresses focused handoffs without concrete worker and site targets', () => {
  const text = formatLocalIngressRequestLiveSmokeText({
    status: 'ok',
    worker_url: null,
    site_id: null,
    operation_id: 'operation_alpha',
    local_ingress_request_id: 'local_ingress_request_live_1',
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Request Review:/);
  assert.doesNotMatch(text, /Evidence Read:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('runLocalIngressRequestLiveSmoke returns summarized local-ingress state', async () => {
  let createdRequestId = null;
  const result = await runLocalIngressRequestLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    taskId: 'task_alpha',
    actionRef: null,
    summary: null,
    contractRef: 'contract:cloudflare-to-windows-local-ingress-request:v1',
    evidenceContractRef: 'contract:windows-local-ingress-evidence-return:v1',
    rollbackRef: null,
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'local_ingress.request.create' && body.request_id.includes('refused_direct_mutation')) {
        return responseJson(400, {
          code: 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid',
        });
      }
      if (body.operation === 'local_ingress.request.create') {
        createdRequestId = body.params.local_ingress_request_id;
        return responseJson(200, {
          status: 'queued',
          local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
          target_authority_locus: 'local-windows-site-authority',
          local_executor_authority: 'windows_local_ingress_executor',
          local_execution_admission: 'pending_windows_admission',
          direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
        });
      }
      if (body.operation === 'local_ingress.request.list') {
        return responseJson(200, {
          requests: [{ local_ingress_request_id: createdRequestId }, { local_ingress_request_id: 'ignore' }],
          local_ingress_request_authority: 'cloudflare_local_ingress_request_queue',
          local_executor_authority: 'windows_local_ingress_executor',
          local_execution_admission: 'pending_windows_admission',
          direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
          authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.match(result.local_ingress_request_id, /^local_ingress_request_live_/);
  assert.equal(result.local_execution_admission, 'pending_windows_admission');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
