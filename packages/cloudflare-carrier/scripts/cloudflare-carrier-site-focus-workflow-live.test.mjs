import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
            next_action: 'bind_cloudflare_product_next_site_locally',
            next_reason: 'continuity_direction',
            route_next_action: 'focus_next_site',
            route_target: 'site_alpha',
            route_status: 'ready',
            route_reason: 'continuity_direction',
          },
        });
      }
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          operation: 'site.read',
          site_id: 'site_alpha',
          health: 'attention',
          next_action: 'bind_cloudflare_product_next_site_locally',
        },
      });
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.site_focus_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.selected_site_id, 'site_alpha');
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
