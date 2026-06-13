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
  assert.equal(summary.claimed_by_agent_id, 'agent.alpha');
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
    },
  });

  assert.match(text, /Task Lifecycle Review: ok/);
  assert.match(text, /Tasks: count=3 open=2/);
  assert.match(text, /Task: task_9 #9/);
  assert.match(text, /Title: focus task/);
});
