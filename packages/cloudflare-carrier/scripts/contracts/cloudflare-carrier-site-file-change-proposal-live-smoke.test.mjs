import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteFileChangeProposalLiveSmokeText,
  parseSiteFileChangeProposalLiveSmokeArgs,
  runSiteFileChangeProposalLiveSmoke,
} from '../workflows/cloudflare-carrier-site-file-change-proposal-live-smoke.mjs';

test('parseSiteFileChangeProposalLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseSiteFileChangeProposalLiveSmokeArgs([
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

test('formatSiteFileChangeProposalLiveSmokeText emits downstream reads', () => {
  const text = formatSiteFileChangeProposalLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    proposal_id: 'proposal_alpha',
  });

  assert.match(text, /Site File Change Proposal Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Proposal Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file-change:proposal:review:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runSiteFileChangeProposalLiveSmoke returns summarized proposal state', async () => {
  let createdProposalId = null;
  const result = await runSiteFileChangeProposalLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    taskId: 'task_alpha',
    summary: null,
    filePath: 'docs/architecture/cloudflare-carrier/target.md',
    changeKind: 'update',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'site_file_change_proposal.record' && body.request_id.includes('refused_mutation')) {
        return responseJson(400, {
          code: 'site_file_change_proposal_filesystem_mutation_admission_invalid',
        });
      }
      if (body.operation === 'site_file_change_proposal.record') {
        createdProposalId = body.params.proposal_id;
        return responseJson(200, {
          status: 'recorded',
          proposal_authority: 'cloudflare_carrier_site',
          filesystem_executor_authority: 'windows_filesystem_executor',
          filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
        });
      }
      if (body.operation === 'site_file_change_proposal.list') {
        return responseJson(200, {
          proposals: [{ proposal_id: createdProposalId }, { proposal_id: 'ignore' }],
          filesystem_executor_authority: 'windows_filesystem_executor',
          filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
          authority_partition: 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned',
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          site_file_change_proposals: [{ proposal_id: createdProposalId }],
          operation_product_surface: {
            site_file_change_proposal_count: 1,
            site_file_change_proposal_authority: 'cloudflare_carrier_site',
            filesystem_executor_authority: 'windows_filesystem_executor',
            filesystem_mutation_admission: 'not_admitted',
            repository_publication_admission: 'not_admitted',
            site_file_change_authority_partition: 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.match(result.proposal_id, /^site_file_change_proposal_live_/);
  assert.equal(result.filesystem_mutation_admission, 'not_admitted');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
