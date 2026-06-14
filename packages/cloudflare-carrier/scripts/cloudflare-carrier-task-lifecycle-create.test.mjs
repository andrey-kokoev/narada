import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCloudflareTaskLifecycleTask,
  formatTaskLifecycleCreateText,
  parseTaskLifecycleCreateArgs,
  summarizeTaskLifecycleCreate,
} from './cloudflare-carrier-task-lifecycle-create.mjs';

test('parseTaskLifecycleCreateArgs builds guarded task lifecycle create params', () => {
  const parsed = parseTaskLifecycleCreateArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--carrier-session-id', 'session_alpha',
    '--title', 'Real product task',
    '--description', 'Operator-created task',
    '--admission-id', 'admission_alpha',
    '--admit-cloudflare-task-create',
    '--cutover-point-ref', 'cutover:task-create:alpha',
    '--governed-write-contract-ref', 'contract:task-create:alpha',
    '--confirmation-evidence-ref', 'evidence:task-create:alpha',
    '--request-id', 'request_alpha',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_alpha');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    admission_id: 'admission_alpha',
    carrier_session_id: 'session_alpha',
    title: 'Real product task',
    description: 'Operator-created task',
    cloudflare_task_create_cutover: true,
    cutover_point_ref: 'cutover:task-create:alpha',
    governed_write_contract_ref: 'contract:task-create:alpha',
    confirmation_evidence_ref: 'evidence:task-create:alpha',
  });
});

test('parseTaskLifecycleCreateArgs can request refusal evidence without cutover admission', () => {
  const parsed = parseTaskLifecycleCreateArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--title', 'Guard check task',
  ], {}, () => 123);

  assert.equal(parsed.params.cloudflare_task_create_cutover, undefined);
  assert.equal(parsed.params.cutover_point_ref, undefined);
});

test('parseTaskLifecycleCreateArgs refuses missing authority and incomplete cutover evidence', () => {
  assert.throws(
    () => parseTaskLifecycleCreateArgs(['--token', 'secret-token', '--site', 'site_alpha', '--title', 'Task'], {}),
    /task_lifecycle_create_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseTaskLifecycleCreateArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--title', 'Task'], {}),
    /task_lifecycle_create_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleCreateArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha'], {}),
    /task_lifecycle_create_requires_--title_or_CLOUDFLARE_TASK_LIFECYCLE_CREATE_TITLE/,
  );
  assert.throws(
    () => parseTaskLifecycleCreateArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--title', 'Task'], {}),
    /task_lifecycle_create_requires_bearer_token_or_operator_session/,
  );
  assert.throws(
    () => parseTaskLifecycleCreateArgs([
      '--url', 'https://carrier.example.test',
      '--token', 'secret-token',
      '--site', 'site_alpha',
      '--title', 'Task',
      '--admit-cloudflare-task-create',
    ], {}),
    /task_lifecycle_create_admission_requires_--cutover-point-ref/,
  );
});

test('createCloudflareTaskLifecycleTask posts task lifecycle create envelope and redacts auth material', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          status: 'created',
          decision: { action: 'admit', reason: 'cloudflare_task_create_cutover_admitted' },
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          cloudflare_write_admission: 'admitted',
          write_effect: 'task_lifecycle_create',
          task: {
            site_id: 'site_alpha',
          task_id: 'cloudflare-task-1',
          task_number: 1,
          operation_id: 'operation_alpha',
          carrier_session_id: 'session_alpha',
          title: 'Real product task',
            status: 'opened',
            cutover_point_ref: 'cutover:task-create:alpha',
            governed_write_contract_ref: 'contract:task-create:alpha',
            confirmation_evidence_ref: 'evidence:task-create:alpha',
          },
        });
      },
    };
  };

  const result = await createCloudflareTaskLifecycleTask({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_alpha',
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_alpha',
      carrier_session_id: 'session_alpha',
      title: 'Real product task',
      cloudflare_task_create_cutover: true,
      cutover_point_ref: 'cutover:task-create:alpha',
      governed_write_contract_ref: 'contract:task-create:alpha',
      confirmation_evidence_ref: 'evidence:task-create:alpha',
    },
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, fetchImpl);

  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.deepEqual(calls[0].init.headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-token',
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'task_lifecycle.task_create.admit',
    request_id: 'request_alpha',
    params: {
      site_id: 'site_alpha',
      admission_id: 'admission_alpha',
      carrier_session_id: 'session_alpha',
      title: 'Real product task',
      cloudflare_task_create_cutover: true,
      cutover_point_ref: 'cutover:task-create:alpha',
      governed_write_contract_ref: 'contract:task-create:alpha',
      confirmation_evidence_ref: 'evidence:task-create:alpha',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.task_lifecycle_create.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    admission_id: 'admission_alpha',
    task_id: 'cloudflare-task-1',
    task_number: 1,
    operation_id: 'operation_alpha',
    carrier_session_id: 'session_alpha',
    title: 'Real product task',
    status: 'opened',
    decision_action: 'admit',
    decision_reason: 'cloudflare_task_create_cutover_admitted',
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_create',
    cutover_point_ref: 'cutover:task-create:alpha',
    governed_write_contract_ref: 'contract:task-create:alpha',
    confirmation_evidence_ref: 'evidence:task-create:alpha',
  });
});

test('createCloudflareTaskLifecycleTask preserves structured refusal evidence', async () => {
  await assert.rejects(
    async () => createCloudflareTaskLifecycleTask({
      workerUrl: 'https://carrier.example.test',
      requestId: 'request_refused',
      params: { site_id: 'site_alpha', admission_id: 'admission_refused', title: 'Guard check task' },
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    }, async () => ({
      status: 403,
      async text() {
        return JSON.stringify({
          ok: false,
          code: 'task_lifecycle_create_not_admitted',
          decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
        });
      },
    })),
    (error) => {
      assert.match(error.message, /task_lifecycle_create_request_failed:task_lifecycle_create_not_admitted/);
      assert.equal(error.code, 'task_lifecycle_create_not_admitted');
      assert.equal(error.http_status, 403);
      assert.deepEqual(error.summary, {
        ok: false,
        code: 'task_lifecycle_create_not_admitted',
        site_id: 'site_alpha',
        admission_id: 'admission_refused',
        task_id: null,
        task_number: null,
        operation_id: null,
        carrier_session_id: null,
        title: 'Guard check task',
        status: null,
        decision_action: 'refuse',
        decision_reason: 'windows_task_lifecycle_mutation_authority_retained',
        mutation_authority: null,
        cloudflare_write_admission: null,
        write_effect: null,
        cutover_point_ref: null,
        governed_write_contract_ref: null,
        confirmation_evidence_ref: null,
      });
      return true;
    },
  );
});

test('formatTaskLifecycleCreateText renders admitted and refused summaries without auth material', () => {
  const admitted = formatTaskLifecycleCreateText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', admission_id: 'admission_alpha', carrier_session_id: 'session_alpha', title: 'Real product task' },
    summary: summarizeTaskLifecycleCreate({
      ok: true,
      decision: { action: 'admit', reason: 'cloudflare_task_create_cutover_admitted' },
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      cloudflare_write_admission: 'admitted',
      write_effect: 'task_lifecycle_create',
      task: { site_id: 'site_alpha', task_id: 'cloudflare-task-1', task_number: 1, operation_id: 'operation_alpha', carrier_session_id: 'session_alpha', title: 'Real product task', status: 'opened' },
    }, { admission_id: 'admission_alpha' }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(admitted, /Task Lifecycle Create: ok/);
  assert.match(admitted, /Task: cloudflare-task-1 #1/);
  assert.match(admitted, /Session: session_alpha/);
  assert.match(admitted, /Authority: mutation=cloudflare_task_lifecycle_d1 cloudflare_write=admitted effect=task_lifecycle_create/);
  assert.match(admitted, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-1 --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id cloudflare-task-1 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(admitted, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(admitted, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.equal(admitted.includes('secret-token'), false);

  const refused = formatTaskLifecycleCreateText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha', admission_id: 'admission_refused', title: 'Guard check task' },
    summary: summarizeTaskLifecycleCreate({
      ok: false,
      code: 'task_lifecycle_create_not_admitted',
      decision: { action: 'refuse', reason: 'windows_task_lifecycle_mutation_authority_retained' },
    }, { site_id: 'site_alpha', admission_id: 'admission_refused', title: 'Guard check task' }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(refused, /Task Lifecycle Create: refused/);
  assert.match(refused, /Code: task_lifecycle_create_not_admitted/);
  assert.match(refused, /Decision: action=refuse reason=windows_task_lifecycle_mutation_authority_retained/);
  assert.doesNotMatch(refused, /Task Review:/);
  assert.doesNotMatch(refused, /Task Workflow:/);
  assert.doesNotMatch(refused, /Session Evidence:/);
  assert.doesNotMatch(refused, /Operation Review:/);
  assert.doesNotMatch(refused, /Operation Next Workflow:/);
  assert.equal(refused.includes('secret-token'), false);
});
