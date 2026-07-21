import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationLiveSmokeText,
  parseRepositoryPublicationLiveSmokeArgs,
  runRepositoryPublicationLiveSmoke,
} from '../workflows/cloudflare-carrier-repository-publication-live-smoke.mjs';

test('parseRepositoryPublicationLiveSmokeArgs supports operator session auth and text format', async () => {
  const parsed = await parseRepositoryPublicationLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_repo_publication',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch', 'cloudflare-publication',
    '--source-change-ref', 'git:commit:0123456789abcdef0123456789abcdef01234567',
    '--confirm-main-publication',
  ], {}, { loadEnv: false, gitHeadShaImpl: async () => 'ignored' });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatRepositoryPublicationLiveSmokeText emits downstream operator reads', () => {
  const text = formatRepositoryPublicationLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_repo_publication',
    repository_publication_request_id: 'repository-publication-request-1',
    repository_publication_execution_id: 'cloudflare-execution-1',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
    publication_status: 'completed',
    repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
    repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
    repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
  });

  assert.match(text, /Repository Publication Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Request Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text/);
  assert.match(text, /Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatRepositoryPublicationLiveSmokeText suppresses downstream reads without site id', () => {
  const text = formatRepositoryPublicationLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: '',
    operation_id: 'operation_repo_publication',
    repository_publication_request_id: 'repository-publication-request-1',
    repository_publication_execution_id: 'cloudflare-execution-1',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
    publication_status: 'completed',
  });

  assert.doesNotMatch(text, /Request Review:/);
  assert.doesNotMatch(text, /Execution Read:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('runRepositoryPublicationLiveSmoke returns blocked result when github token is missing and allowed', async () => {
  let callIndex = 0;
  const result = await runRepositoryPublicationLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_repo_publication',
    repositoryRef: 'github:andrey/site-alpha',
    branchRef: 'cloudflare-publication',
    sourceChangeRef: 'git:commit:0123456789abcdef0123456789abcdef01234567',
    allowMissingGithubToken: true,
    taskId: 'cloudflare-repository-publication-live-smoke',
    contractRef: 'contract:cloudflare-github-repository-publication-request:v1',
    evidenceContractRef: 'contract:cloudflare-github-repository-publication-execution-evidence:v1',
    rollbackRef: null,
  }, {
    fetchImpl: async (_url, init) => {
      callIndex += 1;
      const body = JSON.parse(init.body);
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-session-cookie');
      switch (callIndex) {
        case 1:
          assert.equal(body.operation, 'repository_publication.request.create');
          return responseJson(400, { code: 'repository_publication_cloudflare_git_push_admission_invalid' });
        case 2:
          return responseJson(200, {
            status: 'queued',
            repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
            repository_publication_admission: 'pending_windows_publication_admission',
            cloudflare_git_push_admission: 'not_admitted',
            direct_cloudflare_repository_mutation_admission: 'not_admitted',
          });
        case 3:
          return responseJson(200, { request: null });
        case 4:
          return responseJson(400, { code: 'cloudflare_repository_publication_execution_admission_required' });
        case 5:
          return responseJson(200, {
            repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
            repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
            cloudflare_git_push_admission: 'not_admitted',
            direct_cloudflare_repository_mutation_admission: 'not_admitted',
          });
        case 6:
          return responseJson(400, { code: 'cloudflare_repository_publication_github_token_missing' });
        default:
          throw new Error(`unexpected_call:${callIndex}`);
      }
    },
  });

  assert.equal(result.status, 'blocked_missing_cloudflare_github_token');
  assert.equal(result.missing_secret, 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
