import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCloudflareRepositoryPublicationAdmission,
  formatRepositoryPublicationAdmissionText,
  parseRepositoryPublicationAdmissionArgs,
  summarizeRepositoryPublicationAdmission,
} from './cloudflare-carrier-repository-publication-admission.mjs';

test('parseRepositoryPublicationAdmissionArgs builds governed admission payload', () => {
  const parsed = parseRepositoryPublicationAdmissionArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--repository-publication-admission-id', 'repository-publication-admission-1',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--generated-at', '2026-06-12T02:10:00.000Z',
    '--admission-action', 'admit',
    '--admission-reason', 'cloudflare_repository_publication_request_admitted_for_windows_publish',
    '--request-id', 'request_repository_publication_admission_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_repository_publication_admission_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    repository_publication_admission_id: 'repository-publication-admission-1',
    source_payload: {
      generated_at: '2026-06-12T02:10:00.000Z',
      repository_publication_request_id: 'repository-publication-request-1',
      admission_action: 'admit',
      admission_reason: 'cloudflare_repository_publication_request_admitted_for_windows_publish',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });
});

test('parseRepositoryPublicationAdmissionArgs supports refuse action', () => {
  const parsed = parseRepositoryPublicationAdmissionArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--repository-publication-request-id', 'repository-publication-request-1',
    '--admission-action', 'refuse',
  ], {}, () => 99);

  assert.equal(parsed.requestId, 'repository_publication_admission_repository-publication-request-1');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.equal(parsed.params.source_payload.repository_publication_admission, 'refused_by_cloudflare_repository_publication');
});

test('parseRepositoryPublicationAdmissionArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseRepositoryPublicationAdmissionArgs(['--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1'], {}, () => 1),
    /repository_publication_admission_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseRepositoryPublicationAdmissionArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--repository-publication-request-id', 'repository-publication-request-1'], {}, () => 1),
    /repository_publication_admission_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationAdmissionArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha'], {}, () => 1),
    /repository_publication_admission_requires_--repository-publication-request-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_REQUEST_ID/,
  );
  assert.throws(
    () => parseRepositoryPublicationAdmissionArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--repository-publication-request-id', 'repository-publication-request-1', '--admission-action', 'hold'], {}, () => 1),
    /repository_publication_admission_action_unsupported:hold/,
  );
});

test('classifyCloudflareRepositoryPublicationAdmission posts the admission envelope', async () => {
  const requests = [];
  const result = await classifyCloudflareRepositoryPublicationAdmission({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_repository_publication_admission_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      repository_publication_admission_id: 'repository-publication-admission-1',
      source_payload: {
        generated_at: '2026-06-12T02:10:00.000Z',
        repository_publication_request_id: 'repository-publication-request-1',
        admission_action: 'admit',
        admission_reason: 'cloudflare_repository_publication_request_admitted_for_windows_publish',
        repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'admission_recorded',
      site_id: 'site_alpha',
      repository_publication_admission_authority: 'cloudflare_repository_publication_admission_controller',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
      authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
      admission: {
        generated_at: '2026-06-12T02:10:00.000Z',
        repository_publication_request_id: 'repository-publication-request-1',
        admission_action: 'admit',
        admission_reason: 'cloudflare_repository_publication_request_admitted_for_windows_publish',
        authority_locus: 'cloudflare_repository_publication_admission_controller',
        repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        repository_publication_executor_authority: 'windows_repository_publication_executor',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        admission_posture: 'cloudflare_admits_repository_publication_request_windows_executes_after_admission',
      },
      record: {
        repository_publication_admission_id: 'repository-publication-admission-1',
        site_id: 'site_alpha',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-12T02:10:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'repository_publication.admission.classify',
    request_id: 'request_repository_publication_admission_1',
    params: {
      site_id: 'site_alpha',
      repository_publication_admission_id: 'repository-publication-admission-1',
      source_payload: {
        generated_at: '2026-06-12T02:10:00.000Z',
        repository_publication_request_id: 'repository-publication-request-1',
        admission_action: 'admit',
        admission_reason: 'cloudflare_repository_publication_request_admitted_for_windows_publish',
        repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_admission.v1');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
});

test('summaries and text output preserve refusal evidence', () => {
  const summary = summarizeRepositoryPublicationAdmission({
    ok: false,
    code: 'repository_publication_admission_request_not_found',
  }, {
    site_id: 'site_alpha',
    source_payload: {
      repository_publication_request_id: 'repository-publication-request-missing',
      admission_action: 'admit',
      repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });

  assert.equal(summary.code, 'repository_publication_admission_request_not_found');
  const text = formatRepositoryPublicationAdmissionText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary,
  });
  assert.match(text, /Repository Publication Admission: refused/);
  assert.match(text, /Request: repository-publication-request-missing/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
});

test('formatRepositoryPublicationAdmissionText suppresses site continuation without a real worker url', () => {
  const text = formatRepositoryPublicationAdmissionText({
    status: 'refused',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha' },
    summary: {
      ok: false,
      code: 'repository_publication_admission_request_not_found',
      site_id: 'site_alpha',
      repository_publication_request_id: 'repository-publication-request-missing',
    },
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /<worker-url>/);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
