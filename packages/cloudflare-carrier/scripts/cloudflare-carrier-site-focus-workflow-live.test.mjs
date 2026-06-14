import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteFocusWorkflowLiveText,
  parseSiteFocusWorkflowLiveArgs,
  runSiteFocusWorkflowLive,
} from './cloudflare-carrier-site-focus-workflow-live.mjs';

test('parseSiteFocusWorkflowLiveArgs requires explicit live acknowledgement', () => {
  assert.throws(
    () => parseSiteFocusWorkflowLiveArgs([
      '--url', 'https://carrier.example.test',
      '--token', 'secret-token',
    ], {}),
    /site_focus_workflow_live_requires_--execute-site-focus/,
  );
});

test('parseSiteFocusWorkflowLiveArgs accepts operator session auth', () => {
  const parsed = parseSiteFocusWorkflowLiveArgs([
    '--url', 'https://carrier.example.test',
    '--focused-site-id', 'site_alpha',
    '--operator-session-cookie', 'narada_operator_session=session-value',
    '--execute-site-focus',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.expectedSiteId, 'site_alpha');
  assert.equal(parsed.expectedRouteAction, 'focus_next_site');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'session-value',
    source: 'operator-session-cookie',
  });
});

test('parseSiteFocusWorkflowLiveArgs supports text format', () => {
  const parsed = parseSiteFocusWorkflowLiveArgs([
    '--url', 'https://carrier.example.test',
    '--focused-site-id', 'site_alpha',
    '--operator-session-cookie', 'narada_operator_session=session-value',
    '--format', 'text',
    '--execute-site-focus',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('formatSiteFocusWorkflowLiveText renders direct reads', () => {
  const text = formatSiteFocusWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    selected_site_id: 'site_alpha',
    expected_route_action: 'focus_next_site',
    selected_site_action: 'focus_next_operation',
    selected_operation_id: 'operation_alpha',
    selected_operation_action: 'refresh_site_continuity_loop',
    selected_operation_reason: 'operation_lifecycle_continuity_loop_stale',
    selected_operation_focus_kind: 'site_continuity_reconciliation_execution',
    selected_operation_focus_ref: 'focus-ref',
  });

  assert.match(text, /^Site Focus Workflow: ok/m);
  assert.match(text, /Selected Site: site_alpha/);
  assert.match(text, /Operation Focus: kind=site_continuity_reconciliation_execution ref=focus-ref/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Action Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:action:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runSiteFocusWorkflowLive selects next site from posture and reads it', async () => {
  const calls = [];
  const result = await runSiteFocusWorkflowLive({
    workerUrl: 'https://carrier.example.test',
    expectedSiteId: 'site_alpha',
    expectedRouteAction: 'focus_next_site',
    auth: { kind: 'operator_session', value: 'session-value', source: 'operator-session-cookie' },
  }, {
    async runNodeScript(args) {
      calls.push(args);
      if (args.includes('site.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation: 'site.list',
            site_count: 2,
            next_site_id: 'site_alpha',
            next_health: 'attention',
            next_action: 'focus_next_operation',
            next_reason: 'operation_posture',
            next_operation_id: 'operation_alpha',
            next_operation_next_action: 'refresh_site_continuity_loop',
            next_operation_reason: 'operation_lifecycle_continuity_loop_stale',
            next_operation_focus_kind: 'site_continuity_reconciliation_execution',
            next_operation_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:49:01.463Z:completed',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
            route_status: 'needs_attention',
            route_reason: 'operation_posture',
          },
        });
      }
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          operation: 'site.read',
          site_id: 'site_alpha',
          health: 'attention',
          next_action: 'focus_next_operation',
        },
      });
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.site_focus_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.selected_site_id, 'site_alpha');
  assert.equal(result.selected_site_action, 'focus_next_operation');
  assert.equal(result.selected_operation_id, 'operation_alpha');
  assert.equal(result.selected_operation_action, 'refresh_site_continuity_loop');
  assert.equal(result.selected_operation_reason, 'operation_lifecycle_continuity_loop_stale');
  assert.equal(result.selected_operation_focus_kind, 'site_continuity_reconciliation_execution');
  assert.equal(result.selected_operation_focus_ref, 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:49:01.463Z:completed');
  assert.equal(result.list_before_focus.route_next_action, 'focus_next_site');
  assert.equal(result.read_focused.site_id, 'site_alpha');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('site.list'));
  assert.ok(calls[1].includes('site.read'));
  assert.ok(calls[1].includes('site_alpha'));
  assert.ok(calls[1].includes('--operator-session-cookie'));
});

test('runSiteFocusWorkflowLive rejects unexpected route action', async () => {
  await assert.rejects(
    async () => {
      await runSiteFocusWorkflowLive({
        workerUrl: 'https://carrier.example.test',
        expectedSiteId: null,
        expectedRouteAction: 'focus_next_site',
        auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      }, {
        async runNodeScript(args) {
          if (args.includes('site.list')) {
            return JSON.stringify({
              schema: 'narada.cloudflare_carrier.product_read.v1',
              summary: {
                next_site_id: null,
                route_target: 'none',
                route_next_action: 'monitor_sites',
              },
            });
          }
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              site_id: 'site_ready',
              health: 'ready',
            },
          });
        },
      });
    },
    /site_focus_workflow_live_requires_next_site|site_focus_workflow_live_expected_route_action_mismatch:focus_next_site:monitor_sites/,
  );
});
