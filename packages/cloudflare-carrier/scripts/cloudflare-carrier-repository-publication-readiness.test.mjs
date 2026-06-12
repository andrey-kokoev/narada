import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationReadinessText,
  parseRepositoryPublicationReadinessArgs,
  readCloudflareRepositoryPublicationReadiness,
  summarizeRepositoryPublicationReadiness,
} from './cloudflare-carrier-repository-publication-readiness.mjs';

test('parseRepositoryPublicationReadinessArgs builds readiness request payload', () => {
  const parsed = parseRepositoryPublicationReadinessArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-ref', 'github:andrey/site-alpha',
    '--branch-ref', 'cloudflare-publication',
    '--request-id', 'request_repository_publication_readiness_1',
    '--format', 'text',
  ]);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_repository_publication_readiness_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
  });
});

test('parseRepositoryPublicationReadinessArgs supports operator session auth and optional repo selectors', () => {
  const parsed = parseRepositoryPublicationReadinessArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
  ]);

  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal('repository_ref' in parsed.params, false);
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
});

test('parseRepositoryPublicationReadinessArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseRepositoryPublicationReadinessArgs(['--token', 'token', '--site', 'site_alpha']),
    /repository_publication_readiness_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadinessArgs(['--url', 'https://carrier.example.test', '--token', 'token']),
    /repository_publication_readiness_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationReadinessArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha']),
    /repository_publication_readiness_requires_bearer_token_or_operator_session/,
  );
});

test('readCloudflareRepositoryPublicationReadiness posts the readiness envelope and redacts auth', async () => {
  const requests = [];
  const result = await readCloudflareRepositoryPublicationReadiness({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_repository_publication_readiness_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'cloudflare-publication',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      schema: 'narada.sonar.cloudflare_github_repository_publication_readiness.v1',
      status: 'ok',
      site_id: 'site_alpha',
      readiness_status: 'ready',
      repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      github_credential_mode: 'github_app_installation',
      github_token_configured: false,
      github_token_secret_ref: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN',
      github_app_configured: true,
      github_app_id_configured: true,
      github_app_installation_id_configured: true,
      github_app_private_key_configured: true,
      github_app_secret_refs: [
        'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID',
        'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID',
        'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY',
      ],
      allowed_repository_count: 1,
      allowed_branch_count: 1,
      allowed_repositories: ['github:andrey/site-alpha'],
      allowed_branches: ['cloudflare-publication'],
      requested_repository_ref: 'github:andrey/site-alpha',
      requested_branch_ref: 'cloudflare-publication',
      requested_repository_allowed: true,
      requested_branch_allowed: true,
      missing_configuration: [],
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication_ready',
      authority_partition: 'cloudflare_repository_publication_executor_configured',
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.cloudflare_execution.readiness',
    request_id: 'request_repository_publication_readiness_1',
    params: {
      site_id: 'site_alpha',
      repository_ref: 'github:andrey/site-alpha',
      branch_ref: 'cloudflare-publication',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_readiness.v1');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.readiness_status, 'ready');
  assert.equal(result.summary.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
});

test('summaries and text output preserve readiness refusal evidence', () => {
  const summary = summarizeRepositoryPublicationReadiness({
    ok: false,
    code: 'site_authority_denied',
  }, {
    site_id: 'site_alpha',
    repository_ref: 'github:andrey/site-alpha',
    branch_ref: 'cloudflare-publication',
  });

  assert.equal(summary.code, 'site_authority_denied');
  const text = formatRepositoryPublicationReadinessText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary,
  });
  assert.match(text, /Repository Publication Readiness: refused/);
  assert.match(text, /Requested Repository: github:andrey\/site-alpha/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
