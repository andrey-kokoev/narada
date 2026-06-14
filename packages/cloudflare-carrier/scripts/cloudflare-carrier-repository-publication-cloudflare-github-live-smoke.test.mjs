import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationCloudflareGithubLiveSmokeText,
  parseRepositoryPublicationCloudflareGithubLiveSmokeArgs,
  runRepositoryPublicationCloudflareGithubLiveSmoke,
} from './cloudflare-carrier-repository-publication-cloudflare-github-live-smoke.mjs';

test('parseRepositoryPublicationCloudflareGithubLiveSmokeArgs supports operator session auth', () => {
  const parsed = parseRepositoryPublicationCloudflareGithubLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch', 'refs/heads/cloudflare-publication-live',
    '--commit', '0123456789abcdef0123456789abcdef01234567',
    '--execute-cloudflare-github',
  ], {}, { loadLocalEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatRepositoryPublicationCloudflareGithubLiveSmokeText emits downstream operator reads', () => {
  const text = formatRepositoryPublicationCloudflareGithubLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_repo_publication',
    repository_publication_request_id: 'repository-publication-request-1',
    repository_publication_admission_id: 'repository-publication-admission-1',
    repository_publication_execution_id: 'cloudflare-execution-1',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication-live',
    publication_status: 'completed',
    repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
    repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
    repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
    direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
  });

  assert.match(text, /Repository Publication Cloudflare GitHub Smoke: ok/);
  assert.match(text, /Request Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text/);
  assert.match(text, /Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runRepositoryPublicationCloudflareGithubLiveSmoke posts operator session cookie when provided', async () => {
  const requests = [];
  let callIndex = 0;
  const result = await runRepositoryPublicationCloudflareGithubLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_repo_publication',
    repositoryRef: 'github:andrey/site-alpha',
    branchRef: 'refs/heads/cloudflare-publication-live',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    taskId: 'cloudflare-repository-publication-cloudflare-github-live-smoke',
    contractRef: 'contract:cloudflare-github-repository-publication-request:v1',
    evidenceContractRef: 'contract:cloudflare-github-repository-publication-execution-record:v1',
    rollbackRef: null,
  }, async (url, init) => {
    requests.push({ url: String(url), init: { ...init, headers: { ...init.headers } } });
    callIndex += 1;
    switch (callIndex) {
      case 1:
        return responseJson(200, {
          status: 'queued',
          repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
          repository_publication_executor_authority: 'windows_repository_publication_executor',
          repository_publication_admission: 'pending_windows_publication_admission',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'not_admitted',
        });
      case 2:
        return responseJson(400, { code: 'cloudflare_repository_publication_execution_admission_required' });
      case 3:
        return responseJson(200, {
          repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
          repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'not_admitted',
        });
      case 4:
        return responseJson(200, {
          schema: 'narada.sonar.cloudflare_github_repository_publication_execution.v1',
          status: 'execution_recorded',
          repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
          repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
          repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
          authority_partition: 'cloudflare_admits_and_executes_github_repository_publication',
          publication_status: 'completed',
          execution: {
            repository_publication_execution_id: requests[1] ? JSON.parse(requests[3].init.body).params.repository_publication_execution_id : '',
            repository_publication_request_id: JSON.parse(requests[3].init.body).params.repository_publication_request_id,
            repository_ref: 'github:andrey/site-alpha',
            branch_ref: 'cloudflare-publication-live',
            source_change_ref: 'git:commit:0123456789abcdef0123456789abcdef01234567',
            cloudflare_repository_publication_admission_id: JSON.parse(requests[2].init.body).params.repository_publication_admission_id,
            cloudflare_repository_publication_admission_action: 'admit',
            published_commit_ref: 'git:commit:0123456789abcdef0123456789abcdef01234567',
            github_http_status: 200,
          },
        });
      case 5:
        return responseJson(200, {
          repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
          repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
          direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
          executions: [{
            repository_publication_execution_id: JSON.parse(requests[3].init.body).params.repository_publication_execution_id,
            repository_publication_request_id: JSON.parse(requests[3].init.body).params.repository_publication_request_id,
            repository_ref: 'github:andrey/site-alpha',
            branch_ref: 'cloudflare-publication-live',
            source_change_ref: 'git:commit:0123456789abcdef0123456789abcdef01234567',
          }],
        });
      case 6:
        return responseJson(200, { request: null });
      case 7:
        return responseJson(200, {
          repository_publication_operation_posture: {
            executor_authority: 'cloudflare_github_repository_publication_executor',
            direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
            authority_partition: 'cloudflare_admits_and_executes_github_repository_publication',
          },
          repository_publication_executions: [{
            repository_publication_execution_id: JSON.parse(requests[3].init.body).params.repository_publication_execution_id,
          }],
        });
      default:
        throw new Error(`unexpected_call:${callIndex}`);
    }
  });

  assert.equal(requests[0].init.headers.cookie, 'narada_operator_session=operator-session-cookie');
  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
