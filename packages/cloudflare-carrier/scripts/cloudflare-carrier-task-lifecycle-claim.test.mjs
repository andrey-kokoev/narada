import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claimCloudflareTaskLifecycleTask,
  formatTaskLifecycleClaimText,
  parseTaskLifecycleClaimArgs,
  summarizeTaskLifecycleClaim,
} from './cloudflare-carrier-task-lifecycle-claim.mjs';

test('parseTaskLifecycleClaimArgs builds guarded task claim params', () => {
  const parsed = parseTaskLifecycleClaimArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--claimant-agent', 'agent_alpha',
    '--admission-id', 'admission_claim_1',
    '--request-id', 'request_claim_1',
    '--admit-cloudflare-task-claim',
    '--assignment-authority-ref', 'assignment-authority:claim:v1',
    '--cutover-point-ref', 'cutover:claim:v1',
    '--governed-write-contract-ref', 'contract:claim:v1',
    '--confirmation-evidence-ref', 'evidence:claim:v1',
    '--format', 'text',
  ], {}, () => 1234);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_claim_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'admission_claim_1',
    task_id: 'cloudflare-task-7',
    claimant_agent_id: 'agent_alpha',
    cloudflare_task_claim_cutover: true,
    assignment_authority_ref: 'assignment-authority:claim:v1',
    cutover_point_ref: 'cutover:claim:v1',
    governed_write_contract_ref: 'contract:claim:v1',
    confirmation_evidence_ref: 'evidence:claim:v1',
  });
});

test('parseTaskLifecycleClaimArgs can request refusal evidence without claim cutover admission', () => {
  const parsed = parseTaskLifecycleClaimArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'operator-session-cookie',
    '--site', 'site_alpha',
    '--task-id', 'cloudflare-task-7',
    '--claimant-agent', 'agent_alpha',
  ], {}, () => 1234);

  assert.equal(parsed.requestId, 'task_lifecycle_claim_task_lifecycle_claim_1234_1234');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'task_lifecycle_claim_1234',
    task_id: 'cloudflare-task-7',
    claimant_agent_id: 'agent_alpha',
  });
});

test('parseTaskLifecycleClaimArgs refuses missing required inputs and incomplete cutover evidence', () => {
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--claimant-agent', 'agent'], {}, () => 1),
    /task_lifecycle_claim_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--task-id', 'task-1', '--claimant-agent', 'agent'], {}, () => 1),
    /task_lifecycle_claim_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--claimant-agent', 'agent'], {}, () => 1),
    /task_lifecycle_claim_requires_--task-id_or_CLOUDFLARE_TASK_LIFECYCLE_CLAIM_TASK_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1'], {}, () => 1),
    /task_lifecycle_claim_requires_--claimant-agent_or_CLOUDFLARE_TASK_LIFECYCLE_CLAIM_AGENT_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--claimant-agent', 'agent', '--format', 'yaml'], {}, () => 1),
    /task_lifecycle_claim_format_unsupported:yaml/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--task-id', 'task-1', '--claimant-agent', 'agent'], {}, () => 1),
    /task_lifecycle_claim_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--claimant-agent', 'agent', '--admit-cloudflare-task-claim'], {}, () => 1),
    /task_lifecycle_claim_admission_requires_--assignment-authority-ref/,
  );
  assert.throws(
    () => parseTaskLifecycleClaimArgs(['--url', 'https://carrier.example.test', '--token', 'token', '--site', 'site_alpha', '--task-id', 'task-1', '--claimant-agent', 'agent', '--admit-cloudflare-task-claim', '--assignment-authority-ref', 'assignment'], {}, () => 1),
    /task_lifecycle_claim_admission_requires_--cutover-point-ref/,
  );
});

test('claimCloudflareTaskLifecycleTask posts the task claim envelope and redacts auth', async () => {
  const requests = [];
  const result = await claimCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_claim_1',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_claim_1',
      task_id: 'cloudflare-task-7',
      claimant_agent_id: 'agent_alpha',
      cloudflare_task_claim_cutover: true,
      assignment_authority_ref: 'assignment-authority:claim:v1',
      cutover_point_ref: 'cutover:claim:v1',
      governed_write_contract_ref: 'contract:claim:v1',
      confirmation_evidence_ref: 'evidence:claim:v1',
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return responseJson(200, {
      ok: true,
      status: 'claimed',
      admission_id: 'admission_claim_1',
      previous_status: 'opened',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_claim',
      decision: { action: 'admit', reason: 'cloudflare_task_claim_cutover_admitted', conflict_policy: 'opened_only_no_overwrite' },
      task: {
        site_id: 'site_alpha',
        task_id: 'cloudflare-task-7',
        task_number: 7,
        status: 'claimed',
        claimed_by_agent_id: 'agent_alpha',
        assignment_authority_ref: 'assignment-authority:claim:v1',
      },
    });
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    operation: 'task_lifecycle.task_claim.admit',
    request_id: 'request_claim_1',
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_claim_1',
      task_id: 'cloudflare-task-7',
      claimant_agent_id: 'agent_alpha',
      cloudflare_task_claim_cutover: true,
      assignment_authority_ref: 'assignment-authority:claim:v1',
      cutover_point_ref: 'cutover:claim:v1',
      governed_write_contract_ref: 'contract:claim:v1',
      confirmation_evidence_ref: 'evidence:claim:v1',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.task_lifecycle_claim.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    admission_id: 'admission_claim_1',
    task_id: 'cloudflare-task-7',
    task_number: 7,
    previous_status: 'opened',
    status: 'claimed',
    claimant_agent_id: 'agent_alpha',
    assignment_authority_ref: 'assignment-authority:claim:v1',
    decision_action: 'admit',
    decision_reason: 'cloudflare_task_claim_cutover_admitted',
    conflict_policy: 'opened_only_no_overwrite',
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_claim',
    cutover_point_ref: 'cutover:claim:v1',
    governed_write_contract_ref: 'contract:claim:v1',
    confirmation_evidence_ref: 'evidence:claim:v1',
  });
});

test('claimCloudflareTaskLifecycleTask preserves structured refusal and conflict evidence', async () => {
  await assert.rejects(async () => claimCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_claim_refused',
    format: 'text',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_claim_refused',
      task_id: 'cloudflare-task-7',
      claimant_agent_id: 'agent_alpha',
    },
  }, async () => responseJson(403, {
    ok: false,
    code: 'task_lifecycle_claim_not_admitted',
    site_id: 'site_alpha',
    admission_id: 'admission_claim_refused',
    task_id: 'cloudflare-task-7',
    decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
  })), (error) => {
    assert.equal(error.code, 'task_lifecycle_claim_not_admitted');
    assert.equal(error.http_status, 403);
    assert.equal(error.summary.decision_reason, 'windows_task_lifecycle_mutation_authority_retained');
    assert.equal(error.summary.task_id, 'cloudflare-task-7');
    return true;
  });

  const conflict = summarizeTaskLifecycleClaim({
    ok: false,
    code: 'task_lifecycle_claim_conflict',
    previous_status: 'claimed',
    conflict_policy: 'opened_only_no_overwrite',
    task: { task_id: 'cloudflare-task-7', status: 'claimed', claimed_by_agent_id: 'agent_beta' },
  }, { site_id: 'site_alpha', admission_id: 'admission_claim_conflict', claimant_agent_id: 'agent_alpha' });
  assert.equal(conflict.code, 'task_lifecycle_claim_conflict');
  assert.equal(conflict.conflict_policy, 'opened_only_no_overwrite');
  assert.equal(conflict.claimant_agent_id, 'agent_beta');
});

test('summarizeTaskLifecycleClaim prefers claim refs over inherited task create refs', () => {
  const summary = summarizeTaskLifecycleClaim({
    ok: true,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_claim',
    task: {
      task_id: 'cloudflare-task-7',
      status: 'claimed',
      cutover_point_ref: 'cutover:create:v1',
      governed_write_contract_ref: 'contract:create:v1',
      confirmation_evidence_ref: 'evidence:create:v1',
    },
  }, {
    site_id: 'site_alpha',
    admission_id: 'admission_claim_1',
    claimant_agent_id: 'agent_alpha',
    cutover_point_ref: 'cutover:claim:v1',
    governed_write_contract_ref: 'contract:claim:v1',
    confirmation_evidence_ref: 'evidence:claim:v1',
  });

  assert.equal(summary.cutover_point_ref, 'cutover:claim:v1');
  assert.equal(summary.governed_write_contract_ref, 'contract:claim:v1');
  assert.equal(summary.confirmation_evidence_ref, 'evidence:claim:v1');
});

test('formatTaskLifecycleClaimText renders admitted and refused summaries without auth material', () => {
  const admitted = formatTaskLifecycleClaimText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      admission_id: 'admission_claim_1',
      task_id: 'cloudflare-task-7',
      task_number: 7,
      claimant_agent_id: 'agent_alpha',
      previous_status: 'opened',
      status: 'claimed',
      decision_action: 'admit',
      decision_reason: 'cloudflare_task_claim_cutover_admitted',
      conflict_policy: 'opened_only_no_overwrite',
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_claim',
      assignment_authority_ref: 'assignment-authority:claim:v1',
      cutover_point_ref: 'cutover:claim:v1',
      governed_write_contract_ref: 'contract:claim:v1',
      confirmation_evidence_ref: 'evidence:claim:v1',
    },
  });

  assert.match(admitted, /Task Lifecycle Claim: ok/);
  assert.match(admitted, /Task: cloudflare-task-7 #7/);
  assert.match(admitted, /Claimant: agent_alpha/);
  assert.match(admitted, /Decision: action=admit reason=cloudflare_task_claim_cutover_admitted conflict_policy=opened_only_no_overwrite/);
  assert.match(admitted, /Assignment Authority: assignment-authority:claim:v1/);
  assert.match(admitted, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-7 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.equal(admitted.includes('secret-token'), false);

  const refused = formatTaskLifecycleClaimText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator_session_file',
    summary: {
      ok: false,
      code: 'task_lifecycle_claim_not_admitted',
      site_id: 'site_alpha',
      admission_id: 'admission_claim_refused',
      task_id: 'cloudflare-task-7',
      claimant_agent_id: 'agent_alpha',
      decision_action: 'refuse',
      decision_reason: 'windows_task_lifecycle_mutation_authority_retained',
    },
  });

  assert.match(refused, /Task Lifecycle Claim: refused/);
  assert.match(refused, /Code: task_lifecycle_claim_not_admitted/);
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
