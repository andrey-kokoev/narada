import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationFocusWorkflowLiveText,
  parseOperationFocusWorkflowLiveArgs,
  runOperationFocusWorkflowLive,
} from '../workflows/cloudflare-carrier-operation-focus-workflow-live.mjs';

test('parseOperationFocusWorkflowLiveArgs requires explicit live acknowledgement', () => {
  assert.throws(
    () => parseOperationFocusWorkflowLiveArgs([
      '--url', 'https://carrier.example.test',
      '--site', 'site_alpha',
      '--token', 'secret-token',
    ], {}),
    /operation_focus_workflow_live_requires_--execute-operation-focus/,
  );
});

test('parseOperationFocusWorkflowLiveArgs accepts operator session auth', () => {
  const parsed = parseOperationFocusWorkflowLiveArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'narada_operator_session=session-value',
    '--execute-operation-focus',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.expectedOperationId, null);
  assert.equal(parsed.expectedRouteAction, 'focus_next_operation');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'session-value',
    source: 'operator-session-cookie',
  });
});

test('parseOperationFocusWorkflowLiveArgs accepts text format', () => {
  const parsed = parseOperationFocusWorkflowLiveArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'narada_operator_session=session-value',
    '--execute-operation-focus',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('formatOperationFocusWorkflowLiveText suppresses guarded links without site id', () => {
  const text = formatOperationFocusWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: '',
    selected_operation_id: 'operation_attention',
    read_focused: { workflow_next_action: 'start_or_select_session' },
  });

  assert.doesNotMatch(text, /Operation List:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Focused Workflow:/);
});

test('formatOperationFocusWorkflowLiveText suppresses guarded links without worker url', () => {
  const text = formatOperationFocusWorkflowLiveText({
    status: 'ok',
    worker_url: '',
    site_id: 'site_alpha',
    selected_operation_id: 'operation_attention',
    read_focused: { workflow_next_action: 'start_or_select_session' },
  });

  assert.doesNotMatch(text, /Operation List:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Focused Workflow:/);
});

test('runOperationFocusWorkflowLive selects next operation from posture and reads it', async () => {
  const calls = [];
  const result = await runOperationFocusWorkflowLive({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    expectedOperationId: 'operation_attention',
    expectedRouteAction: 'focus_next_operation',
    auth: { kind: 'operator_session', value: 'session-value', source: 'operator-session-cookie' },
  }, {
    async runNodeScript(args) {
      calls.push(args);
      if (args.includes('--operation') && args.includes('operation.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation: 'operation.list',
            site_id: 'site_alpha',
            operation_count: 2,
            active_operation_id: 'operation_active',
            next_operation_id: 'operation_attention',
            next_operation_status: 'inactive',
            next_status: 'needs_attention',
            next_action: 'review_operation',
            next_reason: 'operation_needs_review',
            route_next_action: 'focus_next_operation',
            route_target: 'operation_attention',
            route_status: 'needs_attention',
            route_reason: 'operation_needs_review',
          },
        });
      }
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          operation: 'operation.read',
          site_id: 'site_alpha',
          operation_id: 'operation_attention',
          current_status: 'inactive',
          workflow_next_action: 'start_or_select_session',
        },
      });
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_focus_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.selected_operation_id, 'operation_attention');
  assert.equal(result.list_before_focus.route_next_action, 'focus_next_operation');
  assert.equal(result.read_focused.operation_id, 'operation_attention');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('operation.list'));
  assert.ok(calls[1].includes('operation.read'));
  assert.ok(calls[1].includes('operation_attention'));
  assert.ok(calls[1].includes('--operator-session-cookie'));
});

test('runOperationFocusWorkflowLive rejects unexpected route action', async () => {
  await assert.rejects(
    async () => {
      await runOperationFocusWorkflowLive({
        workerUrl: 'https://carrier.example.test',
        siteId: 'site_alpha',
        expectedOperationId: null,
        expectedRouteAction: 'focus_next_operation',
        auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      }, {
        async runNodeScript(args) {
          if (args.includes('operation.list')) {
            return JSON.stringify({
              schema: 'narada.cloudflare_carrier.product_read.v1',
              summary: {
                next_operation_id: 'operation_ready',
                next_operation_status: 'active',
                route_next_action: 'monitor_operations',
              },
            });
          }
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_ready',
              current_status: 'active',
            },
          });
        },
      });
    },
    /operation_focus_workflow_live_expected_route_action_mismatch:focus_next_operation:monitor_operations/,
  );
});

test('formatOperationFocusWorkflowLiveText surfaces direct follow-on workflows and reads', () => {
  const text = formatOperationFocusWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    selected_operation_id: 'operation_attention',
    expected_route_action: 'focus_next_operation',
    list_before_focus: {
      route_next_action: 'focus_next_operation',
      route_target: 'operation_attention',
      route_reason: 'operation_needs_review',
    },
    read_focused: {
      current_status: 'inactive',
      workflow_next_action: 'start_or_select_session',
    },
  });

  assert.match(text, /Operation Focus Workflow: ok/);
  assert.match(text, /Focused Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:session:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_attention --operator-session-file <operator-session-file> --execute-operation-session/);
  assert.match(text, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_attention --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_attention --operator-session-file <operator-session-file> --execute-operation-next/);
});
