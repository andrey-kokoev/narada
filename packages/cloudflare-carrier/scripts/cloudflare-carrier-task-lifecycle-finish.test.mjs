import assert from 'node:assert/strict';
import test from 'node:test';

import {
  finishCloudflareTaskLifecycleTask,
  formatTaskLifecycleFinishText,
  parseTaskLifecycleFinishArgs,
  summarizeTaskLifecycleFinish,
} from './cloudflare-carrier-task-lifecycle-finish.mjs';

test('parseTaskLifecycleFinishArgs builds guarded task finish params', () => {
  const parsed = parseTaskLifecycleFinishArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--finalizer-agent', 'agent_alpha',
    '--admission-id', 'admission_finish_1',
    '--request-id', 'request_finish_1',
    '--admit-cloudflare-task-finish',
    '--finish-authority-ref', 'finish-authority:finish:v1',
    '--finish-schema-ref', 'schema:finish:v1',
    '--cutover-point-ref', 'cutover:finish:v1',
    '--governed-write-contract-ref', 'contract:finish:v1',
    '--confirmation-evidence-ref', 'evidence:finish:v1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_finish_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'admission_finish_1',
    task_id: 'cloudflare-task-7',
    finalizer_agent_id: 'agent_alpha',
    finish_verdict: 'accepted',
    cloudflare_task_finish_cutover: true,
    finish_authority_ref: 'finish-authority:finish:v1',
    finish_schema_ref: 'schema:finish:v1',
    cutover_point_ref: 'cutover:finish:v1',
    governed_write_contract_ref: 'contract:finish:v1',
    confirmation_evidence_ref: 'evidence:finish:v1',
  });
});

test('parseTaskLifecycleFinishArgs can request refusal evidence without finish cutover admission', () => {
  const parsed = parseTaskLifecycleFinishArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--finalizer-principal', 'principal_alpha',
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'task_lifecycle_finish_task_lifecycle_finish_1234_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'task_lifecycle_finish_1234',
    task_id: 'cloudflare-task-7',
    finalizer_principal_id: 'principal_alpha',
    finish_verdict: 'accepted',
  });
});

test('parseTaskLifecycleFinishArgs refuses missing required inputs and incomplete cutover evidence', () => {
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--finalizer-agent', 'agent'], {}, () => 1),
    /task_lifecycle_finish_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--task-id', 'task-1', '--finalizer-agent', 'agent'], {}, () => 1),
    /task_lifecycle_finish_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--finalizer-agent', 'agent'], {}, () => 1),
    /task_lifecycle_finish_requires_--task-id_or_CLOUDFLARE_TASK_LIFECYCLE_FINISH_TASK_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1'], {}, () => 1),
    /task_lifecycle_finish_requires_--finalizer-agent_or_--finalizer-principal/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--finalizer-agent', 'agent', '--finish-verdict', 'rejected'], {}, () => 1),
    /task_lifecycle_finish_verdict_unsupported:rejected/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--finalizer-agent', 'agent', '--format', 'yaml'], {}, () => 1),
    /task_lifecycle_finish_format_unsupported:yaml/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--task-id', 'task-1', '--finalizer-agent', 'agent'], {}, () => 1),
    /task_lifecycle_finish_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--finalizer-agent', 'agent', '--admit-cloudflare-task-finish'], {}, () => 1),
    /task_lifecycle_finish_admission_requires_--finish-authority-ref/,
  );
  assert.throws(
    () => parseTaskLifecycleFinishArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--finalizer-agent', 'agent', '--admit-cloudflare-task-finish', '--finish-authority-ref', 'finish-authority'], {}, () => 1),
    /task_lifecycle_finish_admission_requires_--finish-schema-ref/,
  );
});

test('finishCloudflareTaskLifecycleTask posts the task finish envelope and redacts auth', async () => {
  const requests = [];
  const result = await finishCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_finish_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_finish_1',
      task_id: 'cloudflare-task-7',
      finalizer_agent_id: 'agent_alpha',
      finish_verdict: 'accepted',
      cloudflare_task_finish_cutover: true,
      finish_authority_ref: 'finish-authority:finish:v1',
      finish_schema_ref: 'schema:finish:v1',
      cutover_point_ref: 'cutover:finish:v1',
      governed_write_contract_ref: 'contract:finish:v1',
      confirmation_evidence_ref: 'evidence:finish:v1',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'finished',
      previous_status: 'closed',
      new_status: 'finished',
      admission_id: 'admission_finish_1',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_finish',
      decision: { action: 'admit', reason: 'cloudflare_task_finish_cutover_admitted', conflict_policy: 'closed_report_only_finish_no_overwrite' },
      task: {
        site_id: 'site_alpha',
        task_id: 'cloudflare-task-7',
        task_number: 7,
        status: 'finished',
        operation_id: 'operation_alpha',
        carrier_session_id: 'session_alpha',
        finish_verdict: 'accepted',
        finished_by_agent_id: 'agent_alpha',
        changed_file_evidence_count: 1,
        claimed_by_agent_id: 'agent_beta',
        finish: {
          finish_authority_ref: 'finish-authority:finish:v1',
          finish_schema_ref: 'schema:finish:v1',
        },
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'task_lifecycle.task_finish.admit',
    request_id: 'request_finish_1',
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_finish_1',
      task_id: 'cloudflare-task-7',
      finalizer_agent_id: 'agent_alpha',
      finish_verdict: 'accepted',
      cloudflare_task_finish_cutover: true,
      finish_authority_ref: 'finish-authority:finish:v1',
      finish_schema_ref: 'schema:finish:v1',
      cutover_point_ref: 'cutover:finish:v1',
      governed_write_contract_ref: 'contract:finish:v1',
      confirmation_evidence_ref: 'evidence:finish:v1',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.task_lifecycle_finish.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    admission_id: 'admission_finish_1',
    task_id: 'cloudflare-task-7',
    task_number: 7,
    previous_status: 'closed',
    new_status: 'finished',
    status: 'finished',
    finish_verdict: 'accepted',
    finalizer_agent_id: 'agent_alpha',
    finalizer_principal_id: null,
    operation_id: 'operation_alpha',
    carrier_session_id: 'session_alpha',
    claimed_by_agent_id: 'agent_beta',
    changed_file_evidence_count: 1,
    decision_action: 'admit',
    decision_reason: 'cloudflare_task_finish_cutover_admitted',
    conflict_policy: 'closed_report_only_finish_no_overwrite',
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_finish',
    finish_authority_ref: 'finish-authority:finish:v1',
    finish_schema_ref: 'schema:finish:v1',
    cutover_point_ref: 'cutover:finish:v1',
    governed_write_contract_ref: 'contract:finish:v1',
    confirmation_evidence_ref: 'evidence:finish:v1',
  });
});

test('finishCloudflareTaskLifecycleTask preserves structured refusal and principal finalizer evidence', async () => {
  await assert.rejects(async () => finishCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_finish_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_finish_refused',
      task_id: 'cloudflare-task-7',
      finalizer_principal_id: 'principal_alpha',
      finish_verdict: 'accepted',
    },
  }, async () => responseJson(403, {
    ok: false,
    code: 'task_lifecycle_finish_not_admitted',
    site_id: 'site_alpha',
    admission_id: 'admission_finish_refused',
    task_id: 'cloudflare-task-7',
    decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
  })), (error) => {
    assert.equal(error.code, 'task_lifecycle_finish_not_admitted');
    assert.equal(error.http_status, 403);
    assert.equal(error.summary.decision_reason, 'windows_task_lifecycle_mutation_authority_retained');
    assert.equal(error.summary.finalizer_principal_id, 'principal_alpha');
    return true;
  });

  const principalFinish = summarizeTaskLifecycleFinish({
    ok: true,
    previous_status: 'closed',
    new_status: 'finished',
    task: {
      task_id: 'cloudflare-task-7',
      status: 'finished',
      finish_verdict: 'accepted',
      finished_by_principal_id: 'principal_alpha',
    },
  }, { site_id: 'site_alpha', admission_id: 'admission_finish_principal', finish_verdict: 'accepted' });
  assert.equal(principalFinish.finalizer_principal_id, 'principal_alpha');
  assert.equal(principalFinish.finish_verdict, 'accepted');
});

test('formatTaskLifecycleFinishText renders admitted and refused summaries without auth material', () => {
  const admitted = formatTaskLifecycleFinishText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      admission_id: 'admission_finish_1',
      task_id: 'cloudflare-task-7',
      task_number: 7,
      finalizer_agent_id: 'agent_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      previous_status: 'closed',
      new_status: 'finished',
      finish_verdict: 'accepted',
      decision_action: 'admit',
      decision_reason: 'cloudflare_task_finish_cutover_admitted',
      conflict_policy: 'closed_report_only_finish_no_overwrite',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_finish',
      changed_file_evidence_count: 1,
      finish_authority_ref: 'finish-authority:finish:v1',
      finish_schema_ref: 'schema:finish:v1',
      cutover_point_ref: 'cutover:finish:v1',
      governed_write_contract_ref: 'contract:finish:v1',
      confirmation_evidence_ref: 'evidence:finish:v1',
    },
  });

  assert.match(admitted, /Task Lifecycle Finish: ok/);
  assert.match(admitted, /Task: cloudflare-task-7 #7/);
  assert.match(admitted, /Finalizer: agent_alpha/);
  assert.match(admitted, /Status: finished previous=closed verdict=accepted/);
  assert.match(admitted, /Decision: action=admit reason=cloudflare_task_finish_cutover_admitted conflict_policy=closed_report_only_finish_no_overwrite/);
  assert.match(admitted, /Finish Authority: finish-authority:finish:v1/);
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

  const noWorker = formatTaskLifecycleFinishText({
    status: 'ok',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      admission_id: 'admission_finish_1',
      task_id: 'cloudflare-task-7',
      task_number: 7,
      finalizer_agent_id: 'agent_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      previous_status: 'closed',
      new_status: 'finished',
      finish_verdict: 'accepted',
      decision_action: 'admit',
      decision_reason: 'cloudflare_task_finish_cutover_admitted',
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

  const refused = formatTaskLifecycleFinishText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator_session_file',
    summary: {
      ok: false,
      code: 'task_lifecycle_finish_not_admitted',
      site_id: 'site_alpha',
      admission_id: 'admission_finish_refused',
      task_id: 'cloudflare-task-7',
      finalizer_principal_id: 'principal_alpha',
      finish_verdict: 'accepted',
      decision_action: 'refuse',
      decision_reason: 'windows_task_lifecycle_mutation_authority_retained',
    },
  });

  assert.match(refused, /Task Lifecycle Finish: refused/);
  assert.match(refused, /Code: task_lifecycle_finish_not_admitted/);
  assert.match(refused, /Finalizer: principal_alpha/);
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
