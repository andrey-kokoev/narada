import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationReadinessLiveSmokeText,
  parseRepositoryPublicationReadinessLiveSmokeArgs,
  runRepositoryPublicationReadinessLiveSmoke,
} from './cloudflare-carrier-repository-publication-readiness-live-smoke.mjs';

test('parseRepositoryPublicationReadinessLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseRepositoryPublicationReadinessLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch', 'cloudflare-publication',
    '--require-github-app',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.requireGithubApp, true);
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatRepositoryPublicationReadinessLiveSmokeText emits provider liveness follow-on', () => {
  const text = formatRepositoryPublicationReadinessLiveSmokeText({
    status: 'ready',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
    github_credential_mode: 'github_app_installation',
    github_app_configured: true,
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
    allowed_repository_count: 1,
    allowed_branch_count: 1,
    requested_repository_allowed: true,
    requested_branch_allowed: true,
    missing_configuration: [],
  });

  assert.match(text, /Repository Publication Readiness Smoke: ready/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text/);
});

test('formatRepositoryPublicationReadinessLiveSmokeText suppresses provider liveness follow-on without site id', () => {
  const text = formatRepositoryPublicationReadinessLiveSmokeText({
    status: 'ready',
    worker_url: 'https://carrier.example.test',
    site_id: null,
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
    github_credential_mode: 'github_app_installation',
    github_app_configured: true,
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
    allowed_repository_count: 1,
    allowed_branch_count: 1,
    requested_repository_allowed: true,
    requested_branch_allowed: true,
    missing_configuration: [],
  });

  assert.doesNotMatch(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.doesNotMatch(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text/);
});

test('runRepositoryPublicationReadinessLiveSmoke returns summarized readiness state', async () => {
  const result = await runRepositoryPublicationReadinessLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    repositoryRef: 'github:andrey/site-alpha',
    branchRef: 'cloudflare-publication',
    requireGithubApp: false,
  }, async (_url, init) => {
    assert.equal(init.headers.cookie, 'narada_operator_session=operator-session-cookie');
    return responseJson(200, {
      schema: 'narada.sonar.cloudflare_github_repository_publication_readiness.v1',
      status: 'ok',
      site_id: 'site_alpha',
      repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      github_token_secret_ref: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN',
      github_credential_mode: 'github_token',
      github_app_configured: false,
      github_token_configured: true,
      cloudflare_git_push_admission: 'not_admitted',
      readiness_status: 'ready',
      missing_configuration: [],
      requested_branch_ref: 'cloudflare-publication',
      allowed_repository_count: 1,
      allowed_branch_count: 2,
      requested_repository_allowed: true,
      requested_branch_allowed: true,
      direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
      authority_partition: 'cloudflare_admits_and_executes_github_repository_publication',
    });
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.github_credential_mode, 'github_token');
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
