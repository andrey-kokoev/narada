import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleReadText,
  parseTaskLifecycleReadArgs,
  readCloudflareTaskLifecycle,
  summarizeTaskLifecycleRead,
} from './cloudflare-carrier-task-lifecycle-read.mjs';

test('parseTaskLifecycleReadArgs requires url, site, and auth', () => {
  assert.throws(() => parseTaskLifecycleReadArgs([], {}), /task_lifecycle_read_requires_--url_or_CLOUDFLARE_CARRIER_URL/);
  assert.throws(
    () => parseTaskLifecycleReadArgs(['--url', 'https://carrier.example'], {}),
    /task_lifecycle_read_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseTaskLifecycleReadArgs(['--url', 'https://carrier.example', '--site', 'site_alpha'], {}),
    /task_lifecycle_read_requires_bearer_token_or_operator_session/,
  );
});

test('parseTaskLifecycleReadArgs accepts task filter and operator session auth', () => {
  const parsed = parseTaskLifecycleReadArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_alpha',
    '--task-id', 'task_123',
    '--limit', '7',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.task_lifecycle_task_id, 'task_123');
  assert.equal(parsed.params.limit, 7);
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('parseTaskLifecycleReadArgs accepts carrier session focus', () => {
  const parsed = parseTaskLifecycleReadArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_alpha',
    '--carrier-session-id', 'session_alpha',
    '--token', 'secret-token',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.carrier_session_id, 'session_alpha');
  assert.equal(parsed.params.limit, 100);
  assert.equal(parsed.carrierSessionId, 'session_alpha');
});

test('parseTaskLifecycleReadArgs accepts operation focus', () => {
  const parsed = parseTaskLifecycleReadArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--token', 'secret-token',
  ], {});

  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.operation_id, 'operation_alpha');
  assert.equal(parsed.params.limit, 100);
});

test('summarizeTaskLifecycleRead prefers requested task and counts open tasks', () => {
  const summary = summarizeTaskLifecycleRead({
    ok: true,
    site_id: 'site_alpha',
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    mutation_class: 'task_create',
    cloudflare_write_admission: 'admitted',
    tasks: [
      { task_id: 'task_1', task_number: 1, status: 'closed', title: 'closed task' },
      { task_id: 'task_2', task_number: 2, status: 'claimed', title: 'focused task', claimed_by_agent_id: 'agent.alpha' },
    ],
  }, { site_id: 'site_alpha', task_lifecycle_task_id: 'task_2' });

  assert.equal(summary.task_count, 2);
  assert.equal(summary.open_task_count, 1);
  assert.equal(summary.task_id, 'task_2');
  assert.equal(summary.task_status, 'claimed');
  assert.equal(summary.report_id, null);
  assert.equal(summary.finish_id, null);
  assert.equal(summary.claimed_by_agent_id, 'agent.alpha');
});

test('summarizeTaskLifecycleRead can focus the first task for a carrier session', () => {
  const summary = summarizeTaskLifecycleRead({
    ok: true,
    site_id: 'site_alpha',
    tasks: [
      { task_id: 'task_1', status: 'closed', carrier_session_id: 'session_beta' },
      { task_id: 'task_2', status: 'open', carrier_session_id: 'session_alpha', title: 'session task' },
    ],
  }, { site_id: 'site_alpha', carrier_session_id: 'session_alpha' });

  assert.equal(summary.task_id, 'task_2');
  assert.equal(summary.carrier_session_id, 'session_alpha');
  assert.equal(summary.task_title, 'session task');
});

test('summarizeTaskLifecycleRead prefers the latest matching task for a carrier session', () => {
  const summary = summarizeTaskLifecycleRead({
    ok: true,
    site_id: 'site_alpha',
    tasks: [
      { task_id: 'task_2', task_number: 2, status: 'open', carrier_session_id: 'session_alpha', title: 'older session task' },
      { task_id: 'task_9', task_number: 9, status: 'claimed', carrier_session_id: 'session_alpha', title: 'latest session task' },
    ],
  }, { site_id: 'site_alpha', carrier_session_id: 'session_alpha' });

  assert.equal(summary.task_id, 'task_9');
  assert.equal(summary.task_title, 'latest session task');
  assert.equal(summary.task_status, 'claimed');
});

test('readCloudflareTaskLifecycle posts task_lifecycle.task.list', async () => {
  const result = await readCloudflareTaskLifecycle({
    workerUrl: 'https://carrier.example',
    auth: { kind: 'operator_session', value: 'cookie', source: 'operator-session-cookie' },
    params: { site_id: 'site_alpha', task_lifecycle_task_id: 'task_9', limit: 5 },
  }, async (url, init) => {
    assert.equal(String(url), 'https://carrier.example/api/carrier');
    const body = JSON.parse(init.body);
    assert.equal(body.operation, 'task_lifecycle.task.list');
    assert.equal(body.params.site_id, 'site_alpha');
    assert.equal(body.params.task_lifecycle_task_id, 'task_9');
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          site_id: 'site_alpha',
          mutation_authority: 'cloudflare_task_lifecycle_d1',
          mutation_class: 'task_create',
          cloudflare_write_admission: 'admitted',
          tasks: [{ task_id: 'task_9', task_number: 9, status: 'open', title: 'focus task' }],
        });
      },
    };
  });

  assert.equal(result.summary.task_id, 'task_9');
  assert.equal(result.summary.task_status, 'open');
});

test('readCloudflareTaskLifecycle posts operation.read for operation focus', async () => {
  const result = await readCloudflareTaskLifecycle({
    workerUrl: 'https://carrier.example',
    auth: { kind: 'operator_session', value: 'cookie', source: 'operator-session-cookie' },
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', limit: 12 },
  }, async (url, init) => {
    assert.equal(String(url), 'https://carrier.example/api/carrier');
    const body = JSON.parse(init.body);
    assert.equal(body.operation, 'operation.read');
    assert.equal(body.params.site_id, 'site_alpha');
    assert.equal(body.params.operation_id, 'operation_alpha');
    assert.equal(body.params.task_lifecycle_task_limit, 12);
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          operation: { operation_id: 'operation_alpha', site_id: 'site_alpha' },
          task_lifecycle_tasks: [
            { task_id: 'task_old', task_number: 1, status: 'closed', title: 'old task' },
            { task_id: 'task_new', task_number: 2, status: 'opened', title: 'new open task' },
          ],
        });
      },
    };
  });

  assert.equal(result.summary.operation_id, 'operation_alpha');
  assert.equal(result.summary.task_id, 'task_new');
  assert.equal(result.summary.task_status, 'opened');
});

test('summarizeTaskLifecycleRead falls back to focused task authority fields for operation focus', () => {
  const summary = summarizeTaskLifecycleRead({
    operation: { operation_id: 'operation_alpha', site_id: 'site_alpha' },
    task_lifecycle_tasks: [
      {
        task_id: 'task_old',
        task_number: 1,
        status: 'closed',
        title: 'old task',
      },
      {
        task_id: 'task_new',
        task_number: 2,
        status: 'opened',
        title: 'new open task',
        mutation_authority: 'cloudflare_task_lifecycle_d1',
        mutation_class: 'task_create',
        cloudflare_write_admission: 'admitted',
      },
    ],
  }, { site_id: 'site_alpha', operation_id: 'operation_alpha' });

  assert.equal(summary.task_id, 'task_new');
  assert.equal(summary.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(summary.mutation_class, 'task_create');
  assert.equal(summary.cloudflare_write_admission, 'admitted');
});

test('formatTaskLifecycleReadText renders focused task summary', () => {
  const text = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 3,
      open_task_count: 2,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_create',
    cloudflare_write_admission: 'admitted',
    task_id: 'task_9',
    task_number: 9,
    task_status: 'open',
    task_title: 'focus task',
    operation_id: 'operation_alpha',
    carrier_session_id: 'session_alpha',
  },
  });

  assert.match(text, /Task Lifecycle Review: ok/);
  assert.match(text, /Tasks: count=3 open=2/);
  assert.match(text, /Task: task_9 #9/);
  assert.match(text, /Title: focus task/);
  assert.match(text, /Session: session_alpha/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_alpha --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_9 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Claim Command: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:claim:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_9 --claimant-agent <agent-id> --operator-session-file <operator-session-file>/);
});

test('formatTaskLifecycleReadText renders report and finish commands from focused task state', () => {
  const claimedText = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 1,
      open_task_count: 1,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_claim',
      cloudflare_write_admission: 'admitted',
      task_id: 'task_claimed',
      task_status: 'claimed',
      report_id: null,
      finish_id: null,
    },
  });
  assert.match(claimedText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_claimed --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.doesNotMatch(claimedText, /Report Command:/);

  const reportedText = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 1,
      open_task_count: 0,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_report',
      cloudflare_write_admission: 'admitted',
      task_id: 'task_reported',
      task_status: 'claimed',
      report_id: 'report_alpha',
      finish_id: null,
    },
  });
  assert.match(reportedText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_reported --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.doesNotMatch(reportedText, /Finish Command:/);
});

test('formatTaskLifecycleReadText reuses recorded agents for claimed and reported tasks', () => {
  const claimedText = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 1,
      open_task_count: 1,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_claim',
      cloudflare_write_admission: 'admitted',
      task_id: 'task_claimed',
      task_status: 'claimed',
      claimed_by_agent_id: 'agent.claimed',
      report_id: null,
      finish_id: null,
    },
  });
  assert.match(claimedText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_claimed --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.doesNotMatch(claimedText, /--agent-id <agent-id>/);
  assert.match(claimedText, /Report Command: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:report:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_claimed --reporter-agent agent\.claimed --summary <summary> --operator-session-file <operator-session-file>/);

  const reportedText = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 1,
      open_task_count: 0,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_report',
      cloudflare_write_admission: 'admitted',
      task_id: 'task_reported',
      task_status: 'claimed',
      claimed_by_agent_id: 'agent.claimed',
      reported_by_agent_id: 'agent.reported',
      report_id: 'report_alpha',
      finish_id: null,
    },
  });
  assert.match(reportedText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_reported --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.doesNotMatch(reportedText, /--agent-id <agent-id>/);
  assert.match(reportedText, /Finish Command: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:finish:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_reported --finalizer-agent agent\.reported --finish-verdict accepted --operator-session-file <operator-session-file>/);
});

test('formatTaskLifecycleReadText preserves Site handoffs while suppressing task commands without a concrete task id', () => {
  const text = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 0,
      open_task_count: 0,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_list',
      cloudflare_write_admission: 'admitted',
      task_id: null,
      task_status: 'open',
    },
    params: {
      site_id: 'site_alpha',
      task_lifecycle_task_id: null,
    },
  });

  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Claim Command:/);
  assert.doesNotMatch(text, /Report Command:/);
  assert.doesNotMatch(text, /Finish Command:/);
  assert.match(text, /Site Read:.*--site site_alpha/);
  assert.match(text, /Site Next Workflow:.*--site site_alpha/);
});

test('formatTaskLifecycleReadText suppresses task commands when no concrete site id exists', () => {
  const text = formatTaskLifecycleReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: null,
      task_count: 1,
      open_task_count: 1,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_create',
      cloudflare_write_admission: 'admitted',
      task_id: 'task_9',
      task_status: 'open',
    },
    params: {
      site_id: null,
      task_lifecycle_task_id: 'task_9',
    },
  });

  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Claim Command:/);
  assert.doesNotMatch(text, /Report Command:/);
  assert.doesNotMatch(text, /Finish Command:/);
});

test('formatTaskLifecycleReadText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatTaskLifecycleReadText({
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      task_count: 1,
      open_task_count: 1,
      mutation_authority: 'cloudflare_task_lifecycle_d1',
      mutation_class: 'task_create',
      cloudflare_write_admission: 'admitted',
      task_id: 'task_9',
      task_status: 'open',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
    },
    params: {
      site_id: 'site_alpha',
      task_lifecycle_task_id: 'task_9',
    },
  });

  assert.doesNotMatch(text, /<worker-url>/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Session Evidence:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Claim Command:/);
});
