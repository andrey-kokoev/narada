import assert from 'node:assert/strict';
import test from 'node:test';

import {
  admitCloudflareSiteFileMaterialization,
  formatSiteFileMaterializationText,
  parseSiteFileMaterializationArgs,
  summarizeSiteFileMaterialization,
} from './cloudflare-carrier-site-file-materialization.mjs';

test('parseSiteFileMaterializationArgs builds guarded materialization payload', () => {
  const parsed = parseSiteFileMaterializationArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--materialization-id', 'materialization-1',
    '--proposal-id', 'proposal-9',
    '--proposal-ref', 'proposal:site-file-change:v1',
    '--file-path', 'docs/architecture/cloudflare-carrier/target.md',
    '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    '--content-ref', 'cloudflare-site-file-store:target-md:v1',
    '--operation-id', 'operation_alpha',
    '--task-id', 'cloudflare-task-9',
    '--generated-at', '2026-06-11T12:00:00.000Z',
    '--admit-cloudflare-site-file-materialization',
    '--materialization-authority-ref', 'cloudflare-carrier:site-file-materialization:v1',
    '--cutover-point-ref', 'cutover:cloudflare-site-file-materialization:v1',
    '--governed-write-contract-ref', 'contract:cloudflare-site-file-materialization:v1',
    '--confirmation-evidence-ref', 'evidence:cloudflare-site-file-materialization:v1',
    '--request-id', 'request_materialization_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_materialization_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    materialization_id: 'materialization-1',
    source_payload: {
      cloudflare_site_file_materialization_cutover: true,
      generated_at: '2026-06-11T12:00:00.000Z',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      proposal_id: 'proposal-9',
      proposal_ref: 'proposal:site-file-change:v1',
      file_path: 'docs/architecture/cloudflare-carrier/target.md',
      content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      content_ref: 'cloudflare-site-file-store:target-md:v1',
      materialization_authority_ref: 'cloudflare-carrier:site-file-materialization:v1',
      cutover_point_ref: 'cutover:cloudflare-site-file-materialization:v1',
      governed_write_contract_ref: 'contract:cloudflare-site-file-materialization:v1',
      confirmation_evidence_ref: 'evidence:cloudflare-site-file-materialization:v1',
      authority_locus: 'cloudflare_carrier_site',
      filesystem_executor_authority: 'cloudflare_site_file_store',
      windows_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
    },
  });
});

test('parseSiteFileMaterializationArgs supports refusal-evidence path and operator session auth', () => {
  const parsed = parseSiteFileMaterializationArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--proposal-ref', 'proposal:site-file-change:v2',
    '--file-path', 'docs/architecture/cloudflare-carrier/target.md',
    '--content-sha256', 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'site_file_materialization_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.equal(parsed.params.source_payload.cloudflare_site_file_materialization_cutover, false);
  assert.equal(parsed.params.source_payload.filesystem_executor_authority, 'cloudflare_site_file_store');
});

test('parseSiteFileMaterializationArgs refuses missing required inputs and weak evidence', () => {
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'], {}, () => 1),
    /site_file_materialization_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'], {}, () => 1),
    /site_file_materialization_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--file-path', 'a.txt', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'], {}, () => 1),
    /site_file_materialization_requires_--proposal-id_or_--proposal-ref/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'], {}, () => 1),
    /site_file_materialization_requires_--file-path_or_CLOUDFLARE_SITE_FILE_MATERIALIZATION_FILE_PATH/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--content-sha256', 'bad'], {}, () => 1),
    /site_file_materialization_requires_valid_--content-sha256/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'], {}, () => 1),
    /site_file_materialization_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', '--format', 'yaml'], {}, () => 1),
    /site_file_materialization_format_unsupported:yaml/,
  );
  assert.throws(
    () => parseSiteFileMaterializationArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--content-sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', '--admit-cloudflare-site-file-materialization'], {}, () => 1),
    /site_file_materialization_admission_requires_--materialization-authority-ref/,
  );
});

test('admitCloudflareSiteFileMaterialization posts the materialization envelope and redacts auth', async () => {
  const requests = [];
  const result = await admitCloudflareSiteFileMaterialization({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_materialization_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      materialization_id: 'materialization-1',
      source_payload: {
        cloudflare_site_file_materialization_cutover: true,
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        proposal_id: 'proposal-9',
        proposal_ref: 'proposal:site-file-change:v1',
        file_path: 'docs/architecture/cloudflare-carrier/target.md',
        content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        content_ref: 'cloudflare-site-file-store:target-md:v1',
        materialization_authority_ref: 'cloudflare-carrier:site-file-materialization:v1',
        cutover_point_ref: 'cutover:cloudflare-site-file-materialization:v1',
        governed_write_contract_ref: 'contract:cloudflare-site-file-materialization:v1',
        confirmation_evidence_ref: 'evidence:cloudflare-site-file-materialization:v1',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'cloudflare_site_file_store',
        windows_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'admitted',
      site_id: 'site_alpha',
      site_file_materialization_authority: 'cloudflare_carrier_site',
      cloudflare_site_file_materialization_admission: 'admitted',
      filesystem_executor_authority: 'cloudflare_site_file_store',
      windows_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      write_effect: 'cloudflare_site_file_materialization_record',
      materialization: {
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        proposal_id: 'proposal-9',
        proposal_ref: 'proposal:site-file-change:v1',
        file_path: 'docs/architecture/cloudflare-carrier/target.md',
        content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        content_ref: 'cloudflare-site-file-store:target-md:v1',
        materialization_authority_ref: 'cloudflare-carrier:site-file-materialization:v1',
        cutover_point_ref: 'cutover:cloudflare-site-file-materialization:v1',
        governed_write_contract_ref: 'contract:cloudflare-site-file-materialization:v1',
        confirmation_evidence_ref: 'evidence:cloudflare-site-file-materialization:v1',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'cloudflare_site_file_store',
        windows_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
      },
      record: {
        materialization_id: 'materialization-1',
        site_id: 'site_alpha',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-11T12:00:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'site_file_materialization.admit',
    request_id: 'request_materialization_1',
    params: {
      site_id: 'site_alpha',
      materialization_id: 'materialization-1',
      source_payload: {
        cloudflare_site_file_materialization_cutover: true,
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        proposal_id: 'proposal-9',
        proposal_ref: 'proposal:site-file-change:v1',
        file_path: 'docs/architecture/cloudflare-carrier/target.md',
        content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        content_ref: 'cloudflare-site-file-store:target-md:v1',
        materialization_authority_ref: 'cloudflare-carrier:site-file-materialization:v1',
        cutover_point_ref: 'cutover:cloudflare-site-file-materialization:v1',
        governed_write_contract_ref: 'contract:cloudflare-site-file-materialization:v1',
        confirmation_evidence_ref: 'evidence:cloudflare-site-file-materialization:v1',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'cloudflare_site_file_store',
        windows_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.site_file_materialization.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    materialization_id: 'materialization-1',
    generated_at: '2026-06-11T12:00:00.000Z',
    operation_id: 'operation_alpha',
    task_id: 'cloudflare-task-9',
    proposal_id: 'proposal-9',
    proposal_ref: 'proposal:site-file-change:v1',
    file_path: 'docs/architecture/cloudflare-carrier/target.md',
    content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    content_ref: 'cloudflare-site-file-store:target-md:v1',
    site_file_materialization_authority: 'cloudflare_carrier_site',
    cloudflare_site_file_materialization_admission: 'admitted',
    filesystem_executor_authority: 'cloudflare_site_file_store',
    windows_filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    write_effect: 'cloudflare_site_file_materialization_record',
    materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
    materialization_authority_ref: 'cloudflare-carrier:site-file-materialization:v1',
    cutover_point_ref: 'cutover:cloudflare-site-file-materialization:v1',
    governed_write_contract_ref: 'contract:cloudflare-site-file-materialization:v1',
    confirmation_evidence_ref: 'evidence:cloudflare-site-file-materialization:v1',
    recorded_by_principal_id: 'principal:operator',
    recorded_at: '2026-06-11T12:00:10.000Z',
  });
});

test('admitCloudflareSiteFileMaterialization preserves structured refusal evidence', async () => {
  await assert.rejects(async () => admitCloudflareSiteFileMaterialization({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_materialization_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      source_payload: {
        cloudflare_site_file_materialization_cutover: false,
        proposal_ref: 'proposal:site-file-change:v1',
        file_path: 'docs/architecture/cloudflare-carrier/target.md',
        content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'cloudflare_site_file_store',
        windows_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
      },
    },
  }, async () => responseJson(400, {
    ok: false,
    code: 'site_file_materialization_cutover_evidence_required',
    site_id: 'site_alpha',
  })), (error) => {
    assert.equal(error.code, 'site_file_materialization_cutover_evidence_required');
    assert.equal(error.http_status, 400);
    assert.equal(error.summary.proposal_ref, 'proposal:site-file-change:v1');
    return true;
  });

  const invalid = summarizeSiteFileMaterialization({
    ok: false,
    code: 'site_file_materialization_content_sha256_invalid',
    site_id: 'site_alpha',
  }, {
    site_id: 'site_alpha',
    source_payload: {
      proposal_ref: 'proposal:site-file-change:v1',
      file_path: 'docs/architecture/cloudflare-carrier/target.md',
      content_sha256: 'bad',
    },
  });
  assert.equal(invalid.code, 'site_file_materialization_content_sha256_invalid');
  assert.equal(invalid.file_path, 'docs/architecture/cloudflare-carrier/target.md');
});

test('formatSiteFileMaterializationText renders admitted and refused summaries without auth material', () => {
  const admitted = formatSiteFileMaterializationText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      materialization_id: 'materialization-1',
      proposal_id: 'proposal-9',
      proposal_ref: 'proposal:site-file-change:v1',
      file_path: 'docs/architecture/cloudflare-carrier/target.md',
      content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      content_ref: 'cloudflare-site-file-store:target-md:v1',
      operation_id: 'operation_alpha',
      site_file_materialization_authority: 'cloudflare_carrier_site',
      cloudflare_site_file_materialization_admission: 'admitted',
      filesystem_executor_authority: 'cloudflare_site_file_store',
      windows_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      write_effect: 'cloudflare_site_file_materialization_record',
      materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
    },
  });

  assert.match(admitted, /Site File Materialization: ok/);
  assert.match(admitted, /Materialization Id: materialization-1/);
  assert.match(admitted, /Windows Filesystem Mutation: not_admitted/);
  assert.match(admitted, /Materialization Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file:materialization:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --site-file-materialization-id materialization-1 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Proposal Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file-change:proposal:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref proposal-9 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.equal(admitted.includes('Task Review:'), false);
  assert.equal(admitted.includes('Task Workflow:'), false);
  assert.equal(admitted.includes('secret-token'), false);

  const refused = formatSiteFileMaterializationText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      ok: false,
      code: 'site_file_materialization_cutover_evidence_required',
      site_id: 'site_alpha',
      proposal_ref: 'proposal:site-file-change:v1',
      file_path: 'docs/architecture/cloudflare-carrier/target.md',
      content_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  });

  assert.match(refused, /Site File Materialization: refused/);
  assert.match(refused, /Code: site_file_materialization_cutover_evidence_required/);
  assert.equal(refused.includes('Materialization Review:'), false);
  assert.equal(refused.includes('Proposal Review:'), false);
  assert.equal(refused.includes('Task Review:'), false);
  assert.equal(refused.includes('Task Workflow:'), false);
  assert.equal(refused.includes('Operation Review:'), false);
  assert.equal(refused.includes('secret-token'), false);
});

test('formatSiteFileMaterializationText suppresses site-scoped handoffs without site id', () => {
  const text = formatSiteFileMaterializationText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: null,
      materialization_id: 'materialization-1',
      proposal_id: 'proposal-9',
      operation_id: 'operation_alpha',
    },
  });

  assert.equal(text.includes('Materialization Review:'), false);
  assert.equal(text.includes('Proposal Review:'), false);
  assert.equal(text.includes('Operation Review:'), false);
  assert.equal(text.includes('Operation Next Workflow:'), false);
});

test('formatSiteFileMaterializationText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatSiteFileMaterializationText({
    status: 'ok',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      materialization_id: 'materialization-1',
      proposal_id: 'proposal-9',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
    },
  });

  assert.doesNotMatch(text, /<worker-url>/);
  assert.equal(text.includes('Materialization Review:'), false);
  assert.equal(text.includes('Proposal Review:'), false);
  assert.equal(text.includes('Task Review:'), false);
  assert.equal(text.includes('Task Workflow:'), false);
  assert.equal(text.includes('Operation Review:'), false);
  assert.equal(text.includes('Operation Next Workflow:'), false);
});
function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
