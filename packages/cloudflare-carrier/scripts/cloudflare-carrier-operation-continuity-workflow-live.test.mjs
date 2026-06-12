import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseOperationContinuityWorkflowLiveArgs,
  runOperationContinuityWorkflowLive,
} from './cloudflare-carrier-operation-continuity-workflow-live.mjs';

test('parseOperationContinuityWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseOperationContinuityWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_live_smoke',
      '--operation-id', 'operation_live_alpha',
      '--token', 'token-value',
    ], {}),
    /operation_continuity_workflow_live_requires_--execute-operation-continuity/,
  );
});

test('parseOperationContinuityWorkflowLiveArgs supports operator session auth', () => {
  const parsed = parseOperationContinuityWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-continuity',
  ], {});

  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
  assert.equal(parsed.expectedPreAction, 'refresh_site_continuity_loop');
});

test('runOperationContinuityWorkflowLive orchestrates continuity refresh through existing live surfaces', async () => {
  const invocations = [];
  const result = await runOperationContinuityWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    operationId: 'operation_live_alpha',
    expectedPreAction: 'refresh_site_continuity_loop',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.read' && readCount === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              operation_id: 'operation_live_alpha',
              workflow_next_action: 'refresh_site_continuity_loop',
              next_action: 'refresh_site_continuity_loop',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              operation_id: 'operation_live_alpha',
              workflow_next_action: 'monitor_operation',
              next_action: 'monitor_operation',
            },
          });
        }
        if (operation === 'site.read') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              next_action: 'monitor_site',
            },
          });
        }
      }
      if (scriptName === 'cloudflare-site-continuity-scheduler.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1',
          status: 'completed',
          summary: {
            site_count: 1,
            completed_site_count: 1,
            refused_site_count: 0,
          },
          continuity_health: {
            status: 'ok',
            attention_reasons: [],
          },
          scheduled_health_snapshot: {
            cloudflare_product_posture: { summary: { next_action: 'monitor_sites' } },
            cloudflare_operation_posture: { summary: { next_action: 'monitor_operation' } },
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.pre_workflow_next_action, 'refresh_site_continuity_loop');
  assert.equal(result.read_after_continuity.workflow_next_action, 'monitor_operation');
  assert.equal(result.site_read_after_continuity.next_action, 'monitor_site');
  assert.equal(result.continuity_execution_status, 'completed');
  assert.equal(invocations.length, 4);
  assert.equal(invocations[0][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-site-continuity-scheduler.mjs');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[3][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.ok(invocations[0].includes('--operator-session-cookie'));
  assert.ok(invocations[1].includes('--refresh-site-registry-projection'));
  assert.ok(invocations[1].includes('--live'));
});
