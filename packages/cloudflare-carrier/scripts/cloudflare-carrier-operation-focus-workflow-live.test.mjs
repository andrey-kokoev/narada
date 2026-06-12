import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseOperationFocusWorkflowLiveArgs,
  runOperationFocusWorkflowLive,
} from './cloudflare-carrier-operation-focus-workflow-live.mjs';

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
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.expectedOperationId, null);
  assert.equal(parsed.expectedRouteAction, 'focus_next_operation');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'session-value',
    source: 'operator-session-cookie',
  });
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
