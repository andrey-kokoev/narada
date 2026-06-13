import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseSiteNextWorkflowLiveArgs,
  runSiteNextWorkflowLive,
} from './cloudflare-carrier-site-next-workflow-live.mjs';

test('parseSiteNextWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseSiteNextWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--token', 'token-value',
    ], {}),
    /site_next_workflow_live_requires_--execute-site-next/,
  );
});

test('parseSiteNextWorkflowLiveArgs supports operator session auth', () => {
  const parsed = parseSiteNextWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--focused-site-id', 'site_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-site-next',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.expectedSiteId, 'site_alpha');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('runSiteNextWorkflowLive returns monitor_sites when no site needs focus', async () => {
  const invocations = [];
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'monitor_sites',
    expectedSiteId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          site_count: 2,
          next_site_id: null,
          next_action: 'monitor_sites',
          route_next_action: 'monitor_sites',
          route_target: 'none',
        },
      });
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.site_next_workflow_live.v1');
  assert.equal(result.delegated_workflow, 'monitor_sites');
  assert.equal(result.delegated_route_action, 'monitor_sites');
  assert.equal(result.delegated_site_action, 'monitor_sites');
  assert.equal(result.delegated_operation_id, null);
  assert.equal(result.delegated_operation_action, null);
  assert.equal(result.delegated_operation_reason, null);
  assert.equal(result.delegated_operation_focus_kind, null);
  assert.equal(result.delegated_operation_focus_ref, null);
  assert.equal(result.selected_site_id, null);
  assert.equal(invocations.length, 1);
});

test('runSiteNextWorkflowLive delegates current site action when route monitors but overview candidate is actionable', async () => {
  const invocations = [];
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'monitor_sites',
    expectedSiteId: 'site_alpha',
    expectedSiteAction: 'refresh_site_continuity_loop',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'refresh_site_continuity_loop',
            route_next_action: 'monitor_sites',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-site-action-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'refresh_site_continuity_loop',
          delegated_action: 'refresh_site_continuity_loop',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'refresh_site_continuity_loop');
  assert.equal(result.delegated_route_action, 'monitor_sites');
  assert.equal(result.delegated_site_action, 'refresh_site_continuity_loop');
  assert.equal(result.delegated_operation_id, null);
  assert.equal(result.delegated_operation_action, null);
  assert.equal(result.delegated_operation_reason, null);
  assert.equal(result.delegated_operation_focus_kind, null);
  assert.equal(result.delegated_operation_focus_ref, null);
  assert.equal(result.selected_site_id, 'site_alpha');
  assert.equal(result.focus_result, null);
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.site_action_workflow_live.v1');
  assert.equal(invocations.length, 2);
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-site-action-workflow-live.mjs');
});

test('runSiteNextWorkflowLive delegates focus_next_site to site focus workflow', async () => {
  const invocations = [];
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'focus_next_site',
    expectedSiteId: 'site_alpha',
    expectedSiteAction: 'bind_cloudflare_product_next_site_locally',
    localSiteRef: 'file:///D:/code/narada',
    cloudflareSiteRef: 'cloudflare://site-alpha',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'bind_cloudflare_product_next_site_locally',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-site-focus-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_focus_workflow_live.v1',
          status: 'ok',
          selected_site_id: 'site_alpha',
        });
      }
      if (scriptName === 'cloudflare-carrier-site-action-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'prepare_next_site_binding',
          delegated_action: 'bind_cloudflare_product_next_site_locally',
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 4) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: null,
            next_action: 'monitor_sites',
            route_next_action: 'monitor_sites',
            route_target: 'none',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'prepare_next_site_binding');
  assert.equal(result.delegated_route_action, 'focus_next_site');
  assert.equal(result.delegated_site_action, 'bind_cloudflare_product_next_site_locally');
  assert.equal(result.delegated_operation_id, null);
  assert.equal(result.delegated_operation_action, null);
  assert.equal(result.delegated_operation_reason, null);
  assert.equal(result.selected_site_id, 'site_alpha');
  assert.equal(result.focus_result.schema, 'narada.cloudflare_carrier.site_focus_workflow_live.v1');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.site_action_workflow_live.v1');
  assert.equal(result.list_after_next.next_action, 'bind_cloudflare_product_next_site_locally');
  assert.equal(result.list_after_next_followup, null);
  assert.equal(invocations.length, 4);
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-site-focus-workflow-live.mjs');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-site-action-workflow-live.mjs');
});

test('runSiteNextWorkflowLive retries site list once when top-level readback stays on the just-cleared site', async () => {
  const invocations = [];
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'focus_next_site',
    expectedSiteId: 'site_alpha',
    expectedSiteAction: 'focus_next_operation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'focus_next_operation',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-site-focus-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_focus_workflow_live.v1',
          status: 'ok',
          selected_site_id: 'site_alpha',
        });
      }
      if (scriptName === 'cloudflare-carrier-site-action-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'focus_next_operation',
          delegated_action: 'focus_next_operation',
          read_after_action: {
            next_action: 'monitor_site',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 4) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'focus_next_operation',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 5) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: null,
            next_action: 'monitor_sites',
            route_next_action: 'monitor_sites',
            route_target: 'none',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}:${invocations.length}`);
    },
  });

  assert.equal(result.list_after_next.next_action, 'monitor_sites');
  assert.equal(result.list_after_next_followup.next_action, 'monitor_sites');
  assert.equal(result.list_after_next_delayed_followup, null);
  assert.equal(result.delegated_site_action, 'focus_next_operation');
  assert.equal(result.delegated_operation_id, null);
  assert.equal(result.delegated_operation_action, null);
  assert.equal(result.delegated_operation_reason, null);
  assert.equal(invocations.length, 5);
});

test('runSiteNextWorkflowLive performs one delayed re-read when the immediate follow-up is still stale', async () => {
  const invocations = [];
  const waits = [];
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'focus_next_site',
    expectedSiteId: 'site_alpha',
    expectedSiteAction: 'focus_next_operation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    wait: async (ms) => {
      waits.push(ms);
    },
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'focus_next_operation',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-site-focus-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_focus_workflow_live.v1',
          status: 'ok',
          selected_site_id: 'site_alpha',
        });
      }
      if (scriptName === 'cloudflare-carrier-site-action-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'focus_next_operation',
          delegated_action: 'focus_next_operation',
          read_after_action: {
            next_action: 'monitor_site',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 4) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'focus_next_operation',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 5) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'focus_next_operation',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 6) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: null,
            next_action: 'monitor_sites',
            route_next_action: 'monitor_sites',
            route_target: 'none',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}:${invocations.length}`);
    },
  });

  assert.deepEqual(waits, [20_000]);
  assert.equal(result.delegated_site_action, 'focus_next_operation');
  assert.equal(result.delegated_operation_id, null);
  assert.equal(result.delegated_operation_action, null);
  assert.equal(result.delegated_operation_reason, null);
  assert.equal(result.list_after_next.next_action, 'monitor_sites');
  assert.equal(result.list_after_next_followup.next_action, 'focus_next_operation');
  assert.equal(result.list_after_next_delayed_followup.next_action, 'monitor_sites');
  assert.equal(invocations.length, 6);
});

test('runSiteNextWorkflowLive carries selected operation lane from site-list overview', async () => {
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'focus_next_site',
    expectedSiteId: 'site_alpha',
    expectedSiteAction: 'focus_next_operation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'focus_next_operation',
            next_operation_id: 'operation_alpha',
            next_operation_next_action: 'review_site_continuity_reconciliation_execution',
            next_operation_reason: 'operation_operator_focus_needs_review',
            next_operation_focus_kind: 'site_continuity_reconciliation_execution',
            next_operation_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:39:01.453Z:completed',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-site-focus-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_focus_workflow_live.v1',
          status: 'ok',
          selected_site_id: 'site_alpha',
        });
      }
      if (scriptName === 'cloudflare-carrier-site-action-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'focus_next_operation',
          delegated_action: 'focus_next_operation',
          read_after_action: {
            next_action: 'monitor_site',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_route_action, 'focus_next_site');
  assert.equal(result.delegated_site_action, 'focus_next_operation');
  assert.equal(result.delegated_operation_id, 'operation_alpha');
  assert.equal(result.delegated_operation_action, 'review_site_continuity_reconciliation_execution');
  assert.equal(result.delegated_operation_reason, 'operation_operator_focus_needs_review');
  assert.equal(result.delegated_operation_focus_kind, 'site_continuity_reconciliation_execution');
  assert.equal(result.delegated_operation_focus_ref, 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:39:01.453Z:completed');
});

test('runSiteNextWorkflowLive rejects unsupported site route actions', async () => {
  await assert.rejects(
    async () => {
      await runSiteNextWorkflowLive({
        workerUrl: 'https://carrier.example',
        expectedRouteAction: null,
        expectedSiteId: null,
        auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
        executeAcknowledged: true,
      }, {
        runNodeScript: async () => JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_count: 2,
            next_site_id: 'site_alpha',
            next_action: 'bind_cloudflare_product_next_site_locally',
            route_next_action: 'unsupported_route',
            route_target: 'site_alpha',
          },
        }),
      });
    },
    /site_next_workflow_live_route_unsupported:unsupported_route/,
  );
});
