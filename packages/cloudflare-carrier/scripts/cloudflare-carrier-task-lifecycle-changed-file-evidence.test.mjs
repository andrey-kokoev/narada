import assert from 'node:assert/strict';
import test from 'node:test';

import {
  admitCloudflareTaskLifecycleChangedFileEvidence,
  formatTaskLifecycleChangedFileEvidenceText,
  parseTaskLifecycleChangedFileEvidenceArgs,
  summarizeTaskLifecycleChangedFileEvidence,
} from './cloudflare-carrier-task-lifecycle-changed-file-evidence.mjs';

test('parseTaskLifecycleChangedFileEvidenceArgs builds guarded evidence params', () => {
  const parsed = parseTaskLifecycleChangedFileEvidenceArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--report-id', 'report-1',
    '--file-path', 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
    '--reporter-agent', 'agent_alpha',
    '--evidence-id', 'evidence-1',
    '--admission-id', 'admission_evidence_1',
    '--request-id', 'request_evidence_1',
    '--admit-cloudflare-changed-file-evidence',
    '--file-evidence-authority-ref', 'file-evidence-authority:changed-file:v1',
    '--file-material-source-ref', 'material-source:git-diff-summary:v1',
    '--repository-authority-ref', 'repository-authority:narada:v1',
    '--cutover-point-ref', 'cutover:changed-file-evidence:v1',
    '--governed-write-contract-ref', 'contract:changed-file-evidence:v1',
    '--confirmation-evidence-ref', 'evidence:changed-file-evidence:v1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_evidence_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'admission_evidence_1',
    task_id: 'cloudflare-task-7',
    report_id: 'report-1',
    file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
    reporter_agent_id: 'agent_alpha',
    evidence_id: 'evidence-1',
    cloudflare_changed_file_evidence_cutover: true,
    file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
    file_material_source_ref: 'material-source:git-diff-summary:v1',
    repository_authority_ref: 'repository-authority:narada:v1',
    cutover_point_ref: 'cutover:changed-file-evidence:v1',
    governed_write_contract_ref: 'contract:changed-file-evidence:v1',
    confirmation_evidence_ref: 'evidence:changed-file-evidence:v1',
  });
});

test('parseTaskLifecycleChangedFileEvidenceArgs can request refusal evidence without cutover admission', () => {
  const parsed = parseTaskLifecycleChangedFileEvidenceArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--report-id', 'report-1',
    '--file-path', 'a.txt',
    '--reporter-principal', 'principal_alpha',
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'changed_file_evidence_changed_file_evidence_1234_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'changed_file_evidence_1234',
    task_id: 'cloudflare-task-7',
    report_id: 'report-1',
    file_path: 'a.txt',
    reporter_principal_id: 'principal_alpha',
  });
});

test('parseTaskLifecycleChangedFileEvidenceArgs refuses missing required inputs and incomplete evidence admission refs', () => {
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--report-id', 'report-1', '--file-path', 'a.txt', '--reporter-agent', 'agent'], {}, () => 1),
    /changed_file_evidence_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--task-id', 'task-1', '--report-id', 'report-1', '--file-path', 'a.txt', '--reporter-agent', 'agent'], {}, () => 1),
    /changed_file_evidence_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--report-id', 'report-1', '--file-path', 'a.txt', '--reporter-agent', 'agent'], {}, () => 1),
    /changed_file_evidence_requires_--task-id_or_CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_TASK_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--file-path', 'a.txt', '--reporter-agent', 'agent'], {}, () => 1),
    /changed_file_evidence_requires_--report-id_or_CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_REPORT_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--report-id', 'report-1', '--reporter-agent', 'agent'], {}, () => 1),
    /changed_file_evidence_requires_--file-path_or_CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_FILE_PATH/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--report-id', 'report-1', '--file-path', 'a.txt'], {}, () => 1),
    /changed_file_evidence_requires_--reporter-agent_or_--reporter-principal/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--report-id', 'report-1', '--file-path', 'a.txt', '--reporter-agent', 'agent', '--format', 'yaml'], {}, () => 1),
    /changed_file_evidence_format_unsupported:yaml/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--task-id', 'task-1', '--report-id', 'report-1', '--file-path', 'a.txt', '--reporter-agent', 'agent'], {}, () => 1),
    /changed_file_evidence_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseTaskLifecycleChangedFileEvidenceArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--report-id', 'report-1', '--file-path', 'a.txt', '--reporter-agent', 'agent', '--admit-cloudflare-changed-file-evidence'], {}, () => 1),
    /changed_file_evidence_admission_requires_--file-evidence-authority-ref/,
  );
});

test('admitCloudflareTaskLifecycleChangedFileEvidence posts the evidence envelope and redacts auth', async () => {
  const requests = [];
  const result = await admitCloudflareTaskLifecycleChangedFileEvidence({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_evidence_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_evidence_1',
      task_id: 'cloudflare-task-7',
      report_id: 'report-1',
      file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
      reporter_agent_id: 'agent_alpha',
      evidence_id: 'evidence-1',
      cloudflare_changed_file_evidence_cutover: true,
      file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
      file_material_source_ref: 'material-source:git-diff-summary:v1',
      repository_authority_ref: 'repository-authority:narada:v1',
      cutover_point_ref: 'cutover:changed-file-evidence:v1',
      governed_write_contract_ref: 'contract:changed-file-evidence:v1',
      confirmation_evidence_ref: 'evidence:changed-file-evidence:v1',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'changed_file_evidence_recorded',
      site_id: 'site_alpha',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'changed_file_evidence_record',
      decision: { action: 'admit', reason: 'cloudflare_changed_file_evidence_cutover_admitted' },
      evidence: {
        evidence_id: 'evidence-1',
        report_id: 'report-1',
        task_id: 'cloudflare-task-7',
        file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
        reporter_agent_id: 'agent_alpha',
        file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
        file_material_source_ref: 'material-source:git-diff-summary:v1',
        repository_authority_ref: 'repository-authority:narada:v1',
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        projection_write_admission: 'not_admitted',
        cutover_point_ref: 'cutover:changed-file-evidence:v1',
        governed_write_contract_ref: 'contract:changed-file-evidence:v1',
        confirmation_evidence_ref: 'evidence:changed-file-evidence:v1',
      },
      task: {
        site_id: 'site_alpha',
        task_id: 'cloudflare-task-7',
        task_number: 7,
        status: 'closed',
        operation_id: 'operation_alpha',
        carrier_session_id: 'session_alpha',
        changed_file_evidence_admission: 'admitted',
        changed_file_evidence_count: 1,
        reported_by_agent_id: 'agent_alpha',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'task_lifecycle.changed_file_evidence.admit',
    request_id: 'request_evidence_1',
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_evidence_1',
      task_id: 'cloudflare-task-7',
      report_id: 'report-1',
      file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
      reporter_agent_id: 'agent_alpha',
      evidence_id: 'evidence-1',
      cloudflare_changed_file_evidence_cutover: true,
      file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
      file_material_source_ref: 'material-source:git-diff-summary:v1',
      repository_authority_ref: 'repository-authority:narada:v1',
      cutover_point_ref: 'cutover:changed-file-evidence:v1',
      governed_write_contract_ref: 'contract:changed-file-evidence:v1',
      confirmation_evidence_ref: 'evidence:changed-file-evidence:v1',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.task_lifecycle_changed_file_evidence.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    admission_id: 'admission_evidence_1',
    task_id: 'cloudflare-task-7',
    task_number: 7,
    report_id: 'report-1',
    evidence_id: 'evidence-1',
    file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
    reporter_agent_id: 'agent_alpha',
    reporter_principal_id: null,
    operation_id: 'operation_alpha',
    carrier_session_id: 'session_alpha',
    reported_by_agent_id: 'agent_alpha',
    changed_file_evidence_admission: 'admitted',
    changed_file_evidence_count: 1,
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    projection_write_admission: 'not_admitted',
    decision_action: 'admit',
    decision_reason: 'cloudflare_changed_file_evidence_cutover_admitted',
    conflict_policy: null,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'changed_file_evidence_record',
    file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
    file_material_source_ref: 'material-source:git-diff-summary:v1',
    repository_authority_ref: 'repository-authority:narada:v1',
    cutoverPointRef: 'cutover:changed-file-evidence:v1',
    governed_write_contract_ref: 'contract:changed-file-evidence:v1',
    confirmation_evidence_ref: 'evidence:changed-file-evidence:v1',
    existing_report_id: null,
  });
});

test('admitCloudflareTaskLifecycleChangedFileEvidence preserves structured refusal and conflict evidence', async () => {
  await assert.rejects(async () => admitCloudflareTaskLifecycleChangedFileEvidence({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_evidence_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_evidence_refused',
      task_id: 'cloudflare-task-7',
      report_id: 'report-1',
      file_path: 'a.txt',
      reporter_agent_id: 'agent_alpha',
    },
  }, async () => responseJson(403, {
    ok: false,
    code: 'changed_file_evidence_not_admitted',
    site_id: 'site_alpha',
    decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
  })), (error) => {
    assert.equal(error.code, 'changed_file_evidence_not_admitted');
    assert.equal(error.http_status, 403);
    assert.equal(error.summary.decision_reason, 'windows_task_lifecycle_mutation_authority_retained');
    assert.equal(error.summary.task_id, 'cloudflare-task-7');
    return true;
  });

  const conflict = summarizeTaskLifecycleChangedFileEvidence({
    ok: false,
    code: 'changed_file_evidence_conflict',
    existing_report_id: 'report-1',
    conflict_policy: 'reported_task_matching_report_only',
    task: { task_id: 'cloudflare-task-7', changed_file_evidence_count: 0 },
  }, {
    site_id: 'site_alpha',
    admission_id: 'admission_evidence_conflict',
    report_id: 'wrong-report-id',
    file_path: 'a.txt',
    reporter_agent_id: 'agent_alpha',
  });
  assert.equal(conflict.code, 'changed_file_evidence_conflict');
  assert.equal(conflict.existing_report_id, 'report-1');
  assert.equal(conflict.conflict_policy, 'reported_task_matching_report_only');
});

test('formatTaskLifecycleChangedFileEvidenceText renders admitted and refused summaries without auth material', () => {
  const admitted = formatTaskLifecycleChangedFileEvidenceText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      admission_id: 'admission_evidence_1',
      task_id: 'cloudflare-task-7',
      task_number: 7,
      report_id: 'report-1',
      evidence_id: 'evidence-1',
      file_path: 'a.txt',
      reporter_agent_id: 'agent_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      decision_action: 'admit',
      decision_reason: 'cloudflare_changed_file_evidence_cutover_admitted',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'changed_file_evidence_record',
      changed_file_evidence_admission: 'admitted',
      changed_file_evidence_count: 1,
      filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      projection_write_admission: 'not_admitted',
      file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
      file_material_source_ref: 'material-source:git-diff-summary:v1',
      repository_authority_ref: 'repository-authority:narada:v1',
      cutoverPointRef: 'cutover:changed-file-evidence:v1',
      governed_write_contract_ref: 'contract:changed-file-evidence:v1',
      confirmation_evidence_ref: 'evidence:changed-file-evidence:v1',
    },
  });

  assert.match(admitted, /Task Lifecycle Changed File Evidence: ok/);
  assert.match(admitted, /Task: cloudflare-task-7 #7/);
  assert.match(admitted, /Report: report-1/);
  assert.match(admitted, /Changed File Evidence Count: 1/);
  assert.match(admitted, /Filesystem Mutation: not_admitted/);
  assert.match(admitted, /Session Evidence:/);
  assert.match(admitted, /Operation Review:/);
  assert.match(admitted, /Operation Next Workflow:/);
  assert.match(admitted, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.equal(admitted.includes('secret-token'), false);

  const refused = formatTaskLifecycleChangedFileEvidenceText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      ok: false,
      code: 'changed_file_evidence_not_admitted',
      site_id: 'site_alpha',
      admission_id: 'admission_evidence_refused',
      task_id: 'cloudflare-task-7',
      report_id: 'report-1',
      file_path: 'a.txt',
      reporter_agent_id: 'agent_alpha',
      decision_action: 'refuse',
      decision_reason: 'windows_task_lifecycle_mutation_authority_retained',
    },
  });

  assert.match(refused, /Task Lifecycle Changed File Evidence: refused/);
  assert.match(refused, /Code: changed_file_evidence_not_admitted/);
  assert.match(refused, /Decision: action=refuse reason=windows_task_lifecycle_mutation_authority_retained/);
  assert.match(refused, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --operator-session-file <operator-session-file>/);
  assert.match(refused, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.equal(refused.includes('operator-session-cookie'), false);
});

function responseJson(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
