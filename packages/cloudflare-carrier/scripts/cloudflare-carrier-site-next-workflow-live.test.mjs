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
  assert.equal(result.selected_site_id, null);
  assert.equal(invocations.length, 1);
});

test('runSiteNextWorkflowLive delegates focus_next_site to site focus workflow', async () => {
  const invocations = [];
  const result = await runSiteNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    expectedRouteAction: 'focus_next_site',
    expectedSiteId: 'site_alpha',
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
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'focus_site');
  assert.equal(result.delegated_route_action, 'focus_next_site');
  assert.equal(result.selected_site_id, 'site_alpha');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.site_focus_workflow_live.v1');
  assert.equal(invocations.length, 2);
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-site-focus-workflow-live.mjs');
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
