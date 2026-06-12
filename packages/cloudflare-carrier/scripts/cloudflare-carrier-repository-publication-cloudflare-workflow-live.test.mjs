import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseRepositoryPublicationCloudflareWorkflowLiveArgs,
  runRepositoryPublicationCloudflareWorkflowLive,
} from './cloudflare-carrier-repository-publication-cloudflare-workflow-live.mjs';

test('parseRepositoryPublicationCloudflareWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseRepositoryPublicationCloudflareWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--token', 'token-value',
      '--repository-ref', 'github:andrey-kokoev/narada',
      '--branch', 'refs/heads/cloudflare-live',
      '--commit', '0123456789abcdef0123456789abcdef01234567',
    ], {}),
    /repository_publication_cloudflare_workflow_live_requires_--execute-cloudflare-github/,
  );
});

test('runRepositoryPublicationCloudflareWorkflowLive runs execution then readback with shared ids', async () => {
  const invocations = [];
  const result = await runRepositoryPublicationCloudflareWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    operationId: 'operation_repo_publication',
    repositoryRef: 'github:andrey-kokoev/narada',
    branchRef: 'refs/heads/cloudflare-live',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    token: 'token-value',
    tokenFile: null,
    taskId: null,
    contractRef: null,
    evidenceContractRef: null,
    rollbackRef: null,
    readbackLimit: 75,
    allowMissingGithubToken: false,
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-repository-publication-cloudflare-github-live-smoke.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.repository_publication_cloudflare_github_live_smoke.v1',
          status: 'ok',
          worker_url: 'https://carrier.example',
          site_id: 'site_narada_cloudflare',
          operation_id: 'operation_repo_publication',
          repository_publication_request_id: 'repository_publication_request_live_1',
          repository_publication_admission_id: 'repository_publication_admission_live_1',
          repository_publication_execution_id: 'repository_publication_execution_live_1',
          repository_ref: 'github:andrey-kokoev/narada',
          branch_ref: 'refs/heads/cloudflare-live',
          source_change_ref: 'git:commit:0123456789abcdef0123456789abcdef01234567',
          publication_status: 'completed',
          repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
          repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
          repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
          direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
        });
      }
      if (scriptName === 'cloudflare-carrier-repository-publication-readback-live-smoke.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.repository_publication_readback_live_smoke.v1',
          status: 'ok',
          site_id: 'site_narada_cloudflare',
          operation_id: 'operation_repo_publication',
          repository_publication_request_id: 'repository_publication_request_live_1',
          repository_publication_admission_id: 'repository_publication_admission_live_1',
          repository_publication_execution_id: 'repository_publication_execution_live_1',
          lane: 'cloudflare',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_cloudflare_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.readback_verified, true);
  assert.equal(result.repository_publication_execution_id, 'repository_publication_execution_live_1');
  assert.equal(invocations.length, 2);
  assert.equal(invocations[0][0].split(/[\\/]/).pop(), 'cloudflare-carrier-repository-publication-cloudflare-github-live-smoke.mjs');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-repository-publication-readback-live-smoke.mjs');
  assert.ok(invocations[0].includes('--execute-cloudflare-github'));
  assert.ok(invocations[1].includes('--repository-publication-request-id'));
  assert.ok(invocations[1].includes('repository_publication_request_live_1'));
  assert.ok(invocations[1].includes('--repository-publication-execution-id'));
  assert.ok(invocations[1].includes('repository_publication_execution_live_1'));
  assert.ok(invocations[1].includes('--limit'));
  assert.ok(invocations[1].includes('75'));
});
