import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleReportText,
  parseTaskLifecycleReportArgs,
  reportCloudflareTaskLifecycleTask,
  summarizeTaskLifecycleReport,
} from './cloudflare-carrier-task-lifecycle-report.mjs';

test('parseTaskLifecycleReportArgs builds guarded task report params', () => {
  const parsed = parseTaskLifecycleReportArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--reporter-agent', 'agent_alpha',
    '--summary', 'Work completed.',
    '--changed-file', 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
    '--verification', '{"command":"pnpm --filter @narada2/cloudflare-carrier test","result":"passed"}',
    '--admission-id', 'admission_report_1',
    '--request-id', 'request_report_1',
    '--admit-cloudflare-task-report',
    '--report-authority-ref', 'report-authority:report:v1',
    '--report-schema-ref', 'schema:work-result-report:v1',
    '--changed-file-evidence-boundary-ref', 'boundary:changed-file-evidence:not-admitted',
    '--cutover-point-ref', 'cutover:report:v1',
    '--governed-write-contract-ref', 'contract:report:v1',
    '--confirmation-evidence-ref', 'evidence:report:v1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_report_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'admission_report_1',
    task_id: 'cloudflare-task-7',
    reporter_agent_id: 'agent_alpha',
    summary: 'Work completed.',
    changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
    verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }],
    cloudflare_task_report_cutover: true,
    report_authority_ref: 'report-authority:report:v1',
    report_schema_ref: 'schema:work-result-report:v1',
    changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
    cutover_point_ref: 'cutover:report:v1',
    governed_write_contract_ref: 'contract:report:v1',
    confirmation_evidence_ref: 'evidence:report:v1',
  });
});

test('parseTaskLifecycleReportArgs can request refusal evidence without report cutover admission', () => {
  const parsed = parseTaskLifecycleReportArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--reporter-agent', 'agent_alpha',
    '--summary', 'Request refusal evidence.',
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'task_lifecycle_report_task_lifecycle_report_1234_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'task_lifecycle_report_1234',
    task_id: 'cloudflare-task-7',
    reporter_agent_id: 'agent_alpha',
    summary: 'Request refusal evidence.',
  });
});

test('parseTaskLifecycleReportArgs supports blocked reports and principal reporters', () => {
  const parsed = parseTaskLifecycleReportArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--reporter-principal', 'principal:operator',
    '--summary', 'Blocked on external approval.',
    '--report-status', 'blocked',
    '--resulting-status', 'needs_continuation',
    '--changed-files', '["a.txt","b.txt"]',
    '--verification-json', '[{"name":"manual-review","result":"blocked"}]',
  ], {}, () => 1234);

  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'task_lifecycle_report_1234',
    task_id: 'cloudflare-task-7',
    reporter_principal_id: 'principal:operator',
    summary: 'Blocked on external approval.',
    report_status: 'blocked',
    resulting_status: 'needs_continuation',
    changed_files: ['a.txt', 'b.txt'],
    verification: [{ name: 'manual-review', result: 'blocked' }],
  });
});

test('parseTaskLifecycleReportArgs refuses missing required inputs and incomplete report evidence', () => {
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--reporter-agent', 'agent', '--summary', 'done'], {}, () => 1),
    /task_lifecycle_report_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--task-id', 'task-1', '--reporter-agent', 'agent', '--summary', 'done'], {}, () => 1),
    /task_lifecycle_report_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--reporter-agent', 'agent', '--summary', 'done'], {}, () => 1),
    /task_lifecycle_report_requires_--task-id_or_CLOUDFLARE_TASK_LIFECYCLE_REPORT_TASK_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--summary', 'done'], {}, () => 1),
    /task_lifecycle_report_requires_--reporter-agent_or_--reporter-principal/,
  );
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--reporter-agent', 'agent'], {}, () => 1),
    /task_lifecycle_report_requires_--summary_or_CLOUDFLARE_TASK_LIFECYCLE_REPORT_SUMMARY/,
  );
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--reporter-agent', 'agent', '--summary', 'done', '--report-status', 'done'], {}, () => 1),
    /task_lifecycle_report_status_unsupported:done/,
  );
  assert.throws(
    () => parseTaskLifecycleReportArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--reporter-agent', 'agent', '--summary', 'done', '--admit-cloudflare-task-report'], {}, () => 1),
    /task_lifecycle_report_admission_requires_--report-authority-ref/,
  );
});

test('reportCloudflareTaskLifecycleTask posts the task report envelope and redacts auth', async () => {
  const requests = [];
  const result = await reportCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_report_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_report_1',
      task_id: 'cloudflare-task-7',
      reporter_agent_id: 'agent_alpha',
      summary: 'Work completed.',
      changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
      verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }],
      cloudflare_task_report_cutover: true,
      report_authority_ref: 'report-authority:report:v1',
      report_schema_ref: 'schema:work-result-report:v1',
      changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
      cutover_point_ref: 'cutover:report:v1',
      governed_write_contract_ref: 'contract:report:v1',
      confirmation_evidence_ref: 'evidence:report:v1',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'reported',
      site_id: 'site_alpha',
      previous_status: 'claimed',
      new_status: 'closed',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_report',
      decision: { action: 'admit', reason: 'cloudflare_task_report_cutover_admitted' },
      report: {
        report_id: 'report-1',
        task_id: 'cloudflare-task-7',
        task_number: 7,
        reporter_agent_id: 'agent_alpha',
        report_authority_ref: 'report-authority:report:v1',
        report_schema_ref: 'schema:work-result-report:v1',
        summary: 'Work completed.',
        changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
        changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
        changed_file_evidence_admission: 'not_admitted',
        verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }],
        report_status: 'submitted',
        previous_status: 'claimed',
        resulting_status: 'closed',
        cutover_point_ref: 'cutover:report:v1',
        governed_write_contract_ref: 'contract:report:v1',
        confirmation_evidence_ref: 'evidence:report:v1',
      },
      task: { site_id: 'site_alpha', task_id: 'cloudflare-task-7', task_number: 7, status: 'closed', operation_id: 'operation_alpha', carrier_session_id: 'session_alpha' },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'task_lifecycle.task_report.admit',
    request_id: 'request_report_1',
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_report_1',
      task_id: 'cloudflare-task-7',
      reporter_agent_id: 'agent_alpha',
      summary: 'Work completed.',
      changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
      verification: [{ command: 'pnpm --filter @narada2/cloudflare-carrier test', result: 'passed' }],
      cloudflare_task_report_cutover: true,
      report_authority_ref: 'report-authority:report:v1',
      report_schema_ref: 'schema:work-result-report:v1',
      changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
      cutover_point_ref: 'cutover:report:v1',
      governed_write_contract_ref: 'contract:report:v1',
      confirmation_evidence_ref: 'evidence:report:v1',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.task_lifecycle_report.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.equal(result.summary.report_id, 'report-1');
  assert.equal(result.summary.new_status, 'closed');
  assert.equal(result.summary.changed_file_count, 1);
  assert.equal(result.summary.verification_count, 1);
  assert.equal(result.summary.changed_file_evidence_admission, 'not_admitted');
  assert.equal(result.summary.operation_id, 'operation_alpha');
  assert.equal(result.summary.carrier_session_id, 'session_alpha');
});

test('reportCloudflareTaskLifecycleTask preserves structured refusal and conflict evidence', async () => {
  await assert.rejects(async () => reportCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_report_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_report_refused',
      task_id: 'cloudflare-task-7',
      reporter_agent_id: 'agent_alpha',
      summary: 'Request refusal evidence.',
    },
  }, async () => responseJson(403, {
    ok: false,
    code: 'task_lifecycle_report_not_admitted',
    site_id: 'site_alpha',
    decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
  })), (error) => {
    assert.equal(error.code, 'task_lifecycle_report_not_admitted');
    assert.equal(error.http_status, 403);
    assert.equal(error.summary.decision_reason, 'windows_task_lifecycle_mutation_authority_retained');
    assert.equal(error.summary.task_id, 'cloudflare-task-7');
    return true;
  });

  const conflict = summarizeTaskLifecycleReport({
    ok: false,
    code: 'task_lifecycle_report_reporter_mismatch',
    claimed_by_agent_id: 'agent_beta',
    reporter_agent_id: 'agent_alpha',
    task: { task_id: 'cloudflare-task-7', status: 'claimed', claimed_by_agent_id: 'agent_beta' },
  }, { site_id: 'site_alpha', admission_id: 'admission_report_conflict', reporter_agent_id: 'agent_alpha', summary: 'done' });
  assert.equal(conflict.code, 'task_lifecycle_report_reporter_mismatch');
  assert.equal(conflict.claimed_by_agent_id, 'agent_beta');
  assert.equal(conflict.reporter_agent_id, 'agent_alpha');
});

test('formatTaskLifecycleReportText renders admitted and refused summaries without auth material', () => {
  const admitted = formatTaskLifecycleReportText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      admission_id: 'admission_report_1',
      task_id: 'cloudflare-task-7',
      task_number: 7,
      report_id: 'report-1',
      reporter_agent_id: 'agent_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      previous_status: 'claimed',
      new_status: 'closed',
      report_status: 'submitted',
      decision_action: 'admit',
      decision_reason: 'cloudflare_task_report_cutover_admitted',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_report',
      changed_file_count: 1,
      verification_count: 1,
      changed_file_evidence_admission: 'not_admitted',
      report_authority_ref: 'report-authority:report:v1',
      report_schema_ref: 'schema:work-result-report:v1',
      changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
      cutover_point_ref: 'cutover:report:v1',
      governed_write_contract_ref: 'contract:report:v1',
      confirmation_evidence_ref: 'evidence:report:v1',
    },
  });

  assert.match(admitted, /Task Lifecycle Report: ok/);
  assert.match(admitted, /Task: cloudflare-task-7 #7/);
  assert.match(admitted, /Report: report-1/);
  assert.match(admitted, /Reporter: agent_alpha/);
  assert.match(admitted, /Changed File Evidence: not_admitted/);
  assert.match(admitted, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(admitted, /Posture Coherence Review:/);
  assert.match(admitted, /Durability Coherence Review:/);
  assert.match(admitted, /Session Evidence:/);
  assert.match(admitted, /Operation Review:/);
  assert.match(admitted, /Operation Next Workflow:/);
  assert.match(admitted, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.equal(admitted.includes('secret-token'), false);

  const noWorker = formatTaskLifecycleReportText({
    status: 'ok',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      admission_id: 'admission_report_1',
      task_id: 'cloudflare-task-7',
      task_number: 7,
      report_id: 'report-1',
      reporter_agent_id: 'agent_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      previous_status: 'claimed',
      new_status: 'closed',
      report_status: 'submitted',
      decision_action: 'admit',
      decision_reason: 'cloudflare_task_report_cutover_admitted',
    },
  });

  assert.doesNotMatch(noWorker, /Site Read:/);
  assert.doesNotMatch(noWorker, /Site Next Workflow:/);
  assert.doesNotMatch(noWorker, /Posture Coherence Review:/);
  assert.doesNotMatch(noWorker, /Durability Coherence Review:/);
  assert.doesNotMatch(noWorker, /Session Evidence:/);
  assert.doesNotMatch(noWorker, /Operation Review:/);
  assert.doesNotMatch(noWorker, /Operation Next Workflow:/);
  assert.doesNotMatch(noWorker, /Task Review:/);
  assert.doesNotMatch(noWorker, /Task Workflow:/);

  const refused = formatTaskLifecycleReportText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      ok: false,
      code: 'task_lifecycle_report_not_admitted',
      site_id: 'site_alpha',
      admission_id: 'admission_report_refused',
      task_id: 'cloudflare-task-7',
      reporter_agent_id: 'agent_alpha',
      decision_action: 'refuse',
      decision_reason: 'windows_task_lifecycle_mutation_authority_retained',
    },
  });

  assert.match(refused, /Task Lifecycle Report: refused/);
  assert.match(refused, /Code: task_lifecycle_report_not_admitted/);
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
