import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteFileChangeProposalText,
  parseSiteFileChangeProposalArgs,
  recordCloudflareSiteFileChangeProposal,
  summarizeSiteFileChangeProposal,
} from '../commands/cloudflare-carrier-site-file-change-proposal.mjs';

test('parseSiteFileChangeProposalArgs builds guarded proposal payload', () => {
  const parsed = parseSiteFileChangeProposalArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--proposal-id', 'proposal-1',
    '--proposal-ref', 'proposal:site-file-change:v1',
    '--summary', 'Update target cloudflare carrier doc',
    '--operation-id', 'operation_alpha',
    '--task-id', 'cloudflare-task-9',
    '--generated-at', '2026-06-11T12:00:00.000Z',
    '--file-path', 'docs/architecture/cloudflare-carrier/target.md',
    '--change-kind', 'update',
    '--material-source-ref', 'material-source:task-report:v1',
    '--request-id', 'request_proposal_1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_proposal_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    proposal_id: 'proposal-1',
    source_payload: {
      schema: 'narada.sonar.site_file_change_proposal.v1',
      generated_at: '2026-06-11T12:00:00.000Z',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      proposal_ref: 'proposal:site-file-change:v1',
      proposal_summary: 'Update target cloudflare carrier doc',
      authority_locus: 'cloudflare_carrier_site',
      filesystem_executor_authority: 'windows_filesystem_executor',
      filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      proposal_posture: 'proposal_only_no_filesystem_write',
      files: [{
        file_path: 'docs/architecture/cloudflare-carrier/target.md',
        change_kind: 'update',
        material_source_ref: 'material-source:task-report:v1',
      }],
    },
  });
});

test('parseSiteFileChangeProposalArgs accepts explicit files-json and operator session auth', () => {
  const parsed = parseSiteFileChangeProposalArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--proposal-ref', 'proposal:site-file-change:v2',
    '--summary', 'Multi-file proposal',
    '--files-json', JSON.stringify([
      { file_path: 'a.txt', change_kind: 'create', material_source_ref: 'material:a' },
      { path: 'b.txt', kind: 'update', material_source_ref: 'material:b' },
    ]),
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'site_file_change_proposal_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params.source_payload.files, [
    { file_path: 'a.txt', change_kind: 'create', material_source_ref: 'material:a' },
    { file_path: 'b.txt', change_kind: 'update', material_source_ref: 'material:b' },
  ]);
});

test('parseSiteFileChangeProposalArgs refuses missing required inputs and weak file provenance', () => {
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--file-path', 'a.txt', '--change-kind', 'update', '--material-source-ref', 'material:a'], {}, () => 1),
    /site_file_change_proposal_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--file-path', 'a.txt', '--change-kind', 'update', '--material-source-ref', 'material:a'], {}, () => 1),
    /site_file_change_proposal_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--summary', 'summary', '--file-path', 'a.txt', '--change-kind', 'update', '--material-source-ref', 'material:a'], {}, () => 1),
    /site_file_change_proposal_requires_--proposal-ref_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_REF/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--file-path', 'a.txt', '--change-kind', 'update', '--material-source-ref', 'material:a'], {}, () => 1),
    /site_file_change_proposal_requires_--summary_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SUMMARY/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary'], {}, () => 1),
    /site_file_change_proposal_requires_--file-path_or_--files-json/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--file-path', 'a.txt', '--material-source-ref', 'material:a'], {}, () => 1),
    /site_file_change_proposal_requires_--change-kind_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_CHANGE_KIND/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--file-path', 'a.txt', '--change-kind', 'update'], {}, () => 1),
    /site_file_change_proposal_requires_--material-source-ref_or_CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_MATERIAL_SOURCE_REF/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--files-json', '{bad'], {}, () => 1),
    /site_file_change_proposal_files_json_invalid/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--files-json', '[{"file_path":"a.txt","change_kind":"update"}]'], {}, () => 1),
    /site_file_change_proposal_material_source_ref_required:0/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--file-path', 'a.txt', '--change-kind', 'update', '--material-source-ref', 'material:a'], {}, () => 1),
    /site_file_change_proposal_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseSiteFileChangeProposalArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--proposal-ref', 'proposal:x', '--summary', 'summary', '--file-path', 'a.txt', '--change-kind', 'update', '--material-source-ref', 'material:a', '--format', 'yaml'], {}, () => 1),
    /site_file_change_proposal_format_unsupported:yaml/,
  );
});

test('recordCloudflareSiteFileChangeProposal posts the proposal envelope and redacts auth', async () => {
  const requests = [];
  const result = await recordCloudflareSiteFileChangeProposal({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_proposal_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      proposal_id: 'proposal-1',
      source_payload: {
        schema: 'narada.sonar.site_file_change_proposal.v1',
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        proposal_ref: 'proposal:site-file-change:v1',
        proposal_summary: 'Update target cloudflare carrier doc',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'windows_filesystem_executor',
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        proposal_posture: 'proposal_only_no_filesystem_write',
        files: [{
          file_path: 'docs/architecture/cloudflare-carrier/target.md',
          change_kind: 'update',
          material_source_ref: 'material-source:task-report:v1',
        }],
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'recorded',
      site_id: 'site_alpha',
      proposal_authority: 'cloudflare_carrier_site',
      filesystem_executor_authority: 'windows_filesystem_executor',
      filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      proposal: {
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        proposal_ref: 'proposal:site-file-change:v1',
        proposal_summary: 'Update target cloudflare carrier doc',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'windows_filesystem_executor',
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        proposal_posture: 'proposal_only_no_filesystem_write',
        files: [{
          file_path: 'docs/architecture/cloudflare-carrier/target.md',
          change_kind: 'update',
          material_source_ref: 'material-source:task-report:v1',
        }],
      },
      record: {
        proposal_id: 'proposal-1',
        site_id: 'site_alpha',
        file_count: 1,
        proposal_posture: 'proposal_only_no_filesystem_write',
        recorded_by_principal_id: 'principal:operator',
        recorded_at: '2026-06-11T12:00:10.000Z',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'site_file_change_proposal.record',
    request_id: 'request_proposal_1',
    params: {
      site_id: 'site_alpha',
      proposal_id: 'proposal-1',
      source_payload: {
        schema: 'narada.sonar.site_file_change_proposal.v1',
        generated_at: '2026-06-11T12:00:00.000Z',
        operation_id: 'operation_alpha',
        task_id: 'cloudflare-task-9',
        proposal_ref: 'proposal:site-file-change:v1',
        proposal_summary: 'Update target cloudflare carrier doc',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'windows_filesystem_executor',
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        proposal_posture: 'proposal_only_no_filesystem_write',
        files: [{
          file_path: 'docs/architecture/cloudflare-carrier/target.md',
          change_kind: 'update',
          material_source_ref: 'material-source:task-report:v1',
        }],
      },
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.site_file_change_proposal.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    proposal_id: 'proposal-1',
    generated_at: '2026-06-11T12:00:00.000Z',
    operation_id: 'operation_alpha',
    task_id: 'cloudflare-task-9',
    proposal_ref: 'proposal:site-file-change:v1',
    proposal_summary: 'Update target cloudflare carrier doc',
    proposal_authority: 'cloudflare_carrier_site',
    filesystem_executor_authority: 'windows_filesystem_executor',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    proposal_posture: 'proposal_only_no_filesystem_write',
    file_count: 1,
    files: [{
      file_path: 'docs/architecture/cloudflare-carrier/target.md',
      change_kind: 'update',
      material_source_ref: 'material-source:task-report:v1',
    }],
    recorded_by_principal_id: 'principal:operator',
    recorded_at: '2026-06-11T12:00:10.000Z',
  });
});

test('recordCloudflareSiteFileChangeProposal preserves structured refusal evidence', async () => {
  await assert.rejects(async () => recordCloudflareSiteFileChangeProposal({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_proposal_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      source_payload: {
        schema: 'narada.sonar.site_file_change_proposal.v1',
        generated_at: '2026-06-11T12:00:00.000Z',
        proposal_ref: 'proposal:site-file-change:v1',
        proposal_summary: 'Update target cloudflare carrier doc',
        authority_locus: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'windows_filesystem_executor',
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        proposal_posture: 'proposal_only_no_filesystem_write',
        files: [{
          file_path: 'docs/architecture/cloudflare-carrier/target.md',
          change_kind: 'update',
          material_source_ref: 'material-source:task-report:v1',
        }],
      },
    },
  }, async () => responseJson(403, {
    ok: false,
    code: 'site_authority_denied',
    site_id: 'site_alpha',
  })), (error) => {
    assert.equal(error.code, 'site_authority_denied');
    assert.equal(error.http_status, 403);
    assert.equal(error.summary.proposal_ref, 'proposal:site-file-change:v1');
    return true;
  });

  const invalid = summarizeSiteFileChangeProposal({
    ok: false,
    code: 'site_file_change_proposal_requires_files',
    site_id: 'site_alpha',
  }, {
    site_id: 'site_alpha',
    source_payload: {
      proposal_ref: 'proposal:site-file-change:v1',
      proposal_summary: 'Update target cloudflare carrier doc',
      files: [],
    },
  });
  assert.equal(invalid.code, 'site_file_change_proposal_requires_files');
  assert.equal(invalid.file_count, 0);
});

test('formatSiteFileChangeProposalText renders admitted and refused summaries without auth material', () => {
  const admitted = formatSiteFileChangeProposalText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      proposal_id: 'proposal-1',
      proposal_ref: 'proposal:site-file-change:v1',
      proposal_summary: 'Update target cloudflare carrier doc',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      proposal_authority: 'cloudflare_carrier_site',
      filesystem_executor_authority: 'windows_filesystem_executor',
      filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      proposal_posture: 'proposal_only_no_filesystem_write',
      file_count: 1,
      files: [{
        file_path: 'docs/architecture/cloudflare-carrier/target.md',
        change_kind: 'update',
        material_source_ref: 'material-source:task-report:v1',
      }],
    },
  });

  assert.match(admitted, /Site File Change Proposal: ok/);
  assert.match(admitted, /Proposal Id: proposal-1/);
  assert.match(admitted, /Filesystem Mutation: not_admitted/);
  assert.match(admitted, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(admitted, /Posture Coherence Review:/);
  assert.match(admitted, /Durability Coherence Review:/);
  assert.match(admitted, /Proposal Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file-change:proposal:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref proposal-1 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-9 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-9 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(admitted, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.equal(admitted.includes('secret-token'), false);

  const refused = formatSiteFileChangeProposalText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      ok: false,
      code: 'site_authority_denied',
      site_id: 'site_alpha',
      proposal_ref: 'proposal:site-file-change:v1',
      proposal_summary: 'Update target cloudflare carrier doc',
      file_count: 0,
      files: [],
    },
  });

  assert.match(refused, /Site File Change Proposal: refused/);
  assert.match(refused, /Code: site_authority_denied/);
  assert.equal(refused.includes('Proposal Review:'), false);
  assert.equal(refused.includes('Task Review:'), false);
  assert.equal(refused.includes('Task Workflow:'), false);
  assert.equal(refused.includes('Operation Review:'), false);
  assert.equal(refused.includes('secret-token'), false);
});

test('formatSiteFileChangeProposalText suppresses site-scoped handoffs without site id', () => {
  const text = formatSiteFileChangeProposalText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: null,
      proposal_id: 'proposal-1',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      files: [],
    },
  });

  assert.equal(text.includes('Proposal Review:'), false);
  assert.equal(text.includes('Site Read:'), false);
  assert.equal(text.includes('Site Next Workflow:'), false);
  assert.equal(text.includes('Posture Coherence Review:'), false);
  assert.equal(text.includes('Durability Coherence Review:'), false);
  assert.equal(text.includes('Task Review:'), false);
  assert.equal(text.includes('Task Workflow:'), false);
  assert.equal(text.includes('Operation Review:'), false);
  assert.equal(text.includes('Operation Next Workflow:'), false);
});
test('formatSiteFileChangeProposalText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatSiteFileChangeProposalText({
    status: 'ok',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      proposal_id: 'proposal-1',
      operation_id: 'operation_alpha',
      task_id: 'cloudflare-task-9',
      files: [],
    },
  });

  assert.doesNotMatch(text, /<worker-url>/);
  assert.equal(text.includes('Site Read:'), false);
  assert.equal(text.includes('Site Next Workflow:'), false);
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
