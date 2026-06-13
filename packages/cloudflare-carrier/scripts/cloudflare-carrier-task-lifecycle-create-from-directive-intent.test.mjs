import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTaskFromDirectiveIntent,
  directiveIntentTaskPredicate,
  directiveIntentTaskTitle,
  formatTaskLifecycleCreateFromDirectiveIntentText,
  parseTaskLifecycleCreateFromDirectiveIntentArgs,
  selectDirectiveIntentWithoutTask,
} from './cloudflare-carrier-task-lifecycle-create-from-directive-intent.mjs';

test('parseTaskLifecycleCreateFromDirectiveIntentArgs requires site and operation', () => {
  const parsed = parseTaskLifecycleCreateFromDirectiveIntentArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--operator-session-cookie', 'cookie-value',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.operationId, 'operation_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('directiveIntentTaskTitle matches Worker title derivation', () => {
  assert.equal(
    directiveIntentTaskTitle({
      directive_record_id: 'directive_alpha',
      classification_state: 'delayed',
      latest_delay_minutes: 15,
    }),
    'directive directive_alpha delayed webhook_delay 15',
  );
});

test('selectDirectiveIntentWithoutTask picks the first unmapped directive record', () => {
  const directive = selectDirectiveIntentWithoutTask({
    webhook_delay_directive_records: [
      { directive_record_id: 'directive_done', directive_intent: { directive_id: 'directive_done' } },
      { directive_record_id: 'directive_open', directive_intent: { directive_id: 'directive_open' } },
    ],
    tasks: [
      { task_id: 'task_done', note: 'directive_done' },
    ],
  });

  assert.equal(directive.directive_record_id, 'directive_open');
  assert.equal(directiveIntentTaskPredicate(directive)({ note: 'directive_open' }), true);
});

test('createTaskFromDirectiveIntent creates task when directive has no mapped task', async () => {
  const calls = [];
  const result = await createTaskFromDirectiveIntent({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    requestId: 'request_alpha',
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async (url, init) => {
    calls.push(JSON.parse(init.body));
    const body = calls.length === 1
      ? {
          site_id: 'site_alpha',
          operation_id: 'operation_alpha',
          tasks: [],
          webhook_delay_directive_records: [
            {
              directive_record_id: 'directive_alpha',
              classification_state: 'delayed',
              latest_delay_minutes: 15,
              directive_intent: { directive_id: 'directive_alpha', input_event_id: 'input_alpha' },
            },
          ],
        }
      : {
          task: { task_id: 'task_alpha', site_id: 'site_alpha', title: 'directive directive_alpha delayed webhook_delay 15' },
          decision: { action: 'admit' },
        };
    return {
      status: 200,
      ok: true,
      text: async () => JSON.stringify(body),
    };
  }, () => 1700000000000);

  assert.equal(result.mode, 'task_created');
  assert.equal(result.created_task_id, 'task_alpha');
  assert.equal(calls[0].operation, 'operation.read');
  assert.equal(calls[1].operation, 'task_lifecycle.task_create.admit');
  assert.equal(calls[1].params.title, 'directive directive_alpha delayed webhook_delay 15');
});

test('createTaskFromDirectiveIntent returns existing task when directive is already mapped', async () => {
  const result = await createTaskFromDirectiveIntent({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    requestId: 'request_alpha',
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      tasks: [{ task_id: 'task_existing', note: 'directive_alpha' }],
      webhook_delay_directive_records: [
        {
          directive_record_id: 'directive_alpha',
          classification_state: 'delayed',
          latest_delay_minutes: 15,
          directive_intent: { directive_id: 'directive_alpha', input_event_id: 'input_alpha' },
        },
      ],
    }),
  }));

  assert.equal(result.mode, 'existing_task');
  assert.equal(result.existing_task_id, 'task_existing');
});

test('formatTaskLifecycleCreateFromDirectiveIntentText prints directive task create summary', () => {
  const text = formatTaskLifecycleCreateFromDirectiveIntentText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    mode: 'task_created',
    directive_record_id: 'directive_alpha',
    title: 'directive directive_alpha delayed webhook_delay 15',
    created_task_id: 'task_alpha',
  });

  assert.match(text, /Task Lifecycle Create From Directive Intent: ok/);
  assert.match(text, /Created Task: task_alpha/);
});
