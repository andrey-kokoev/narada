import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteFileMaterializationLiveSmokeText,
  parseSiteFileMaterializationLiveSmokeArgs,
  runSiteFileMaterializationLiveSmoke,
} from './cloudflare-carrier-site-file-materialization-live-smoke.mjs';

test('parseSiteFileMaterializationLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseSiteFileMaterializationLiveSmokeArgs([
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

test('formatSiteFileMaterializationLiveSmokeText emits downstream reads', () => {
  const text = formatSiteFileMaterializationLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    materialization_id: 'materialization_alpha',
  });

  assert.match(text, /Site File Materialization Smoke: ok/);
  assert.match(text, /Materialization Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file:materialization:review:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
});

test('runSiteFileMaterializationLiveSmoke returns summarized materialization state', async () => {
  let createdMaterializationId = null;
  const result = await runSiteFileMaterializationLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    taskId: 'task_alpha',
    proposalId: null,
    proposalRef: null,
    filePath: 'docs/architecture/cloudflare-carrier/target.md',
    contentSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    contentRef: null,
    authorityRef: 'cloudflare-carrier:site-file-materialization:v1',
    cutoverRef: null,
    contractRef: 'contract:cloudflare-site-file-materialization:v1',
    evidenceRef: null,
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'site_file_materialization.admit' && body.request_id.includes('refused_cutover')) {
        return responseJson(400, {
          code: 'site_file_materialization_cutover_evidence_required',
        });
      }
      if (body.operation === 'site_file_materialization.admit' && body.request_id.includes('refused_windows_mutation')) {
        return responseJson(400, {
          code: 'site_file_materialization_windows_filesystem_mutation_admission_invalid',
        });
      }
      if (body.operation === 'site_file_materialization.admit') {
        createdMaterializationId = body.params.materialization_id;
        return responseJson(200, {
          status: 'admitted',
          site_file_materialization_authority: 'cloudflare_carrier_site',
          cloudflare_site_file_materialization_admission: 'admitted',
          filesystem_executor_authority: 'cloudflare_site_file_store',
          windows_filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
          write_effect: 'cloudflare_site_file_materialization_record',
        });
      }
      if (body.operation === 'site_file_materialization.list') {
        return responseJson(200, {
          materializations: [{ materialization_id: createdMaterializationId }, { materialization_id: 'ignore' }],
          cloudflare_site_file_materialization_admission: 'admitted',
          windows_filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
          authority_partition: 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted',
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          site_file_materializations: [{ materialization_id: createdMaterializationId }],
          operation_product_surface: {
            site_file_materialization_count: 1,
            site_file_materialization_authority: 'cloudflare_carrier_site',
            cloudflare_site_file_materialization_admission: 'admitted',
            cloudflare_site_file_materialization_executor_authority: 'cloudflare_site_file_store',
            windows_filesystem_mutation_admission: 'not_admitted',
            site_file_materialization_repository_publication_admission: 'not_admitted',
            site_file_materialization_authority_partition: 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.match(result.materialization_id, /^site_file_materialization_live_/);
  assert.equal(result.windows_filesystem_mutation_admission, 'not_admitted');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
