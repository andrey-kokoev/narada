import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationContinuityWorkflowLiveText,
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
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.expectedPreAction, 'refresh_site_continuity_loop');
});

test('parseOperationContinuityWorkflowLiveArgs accepts text format', () => {
  const parsed = parseOperationContinuityWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-continuity',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('parseOperationContinuityWorkflowLiveArgs accepts continuity review pre-actions', () => {
  const parsed = parseOperationContinuityWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--expected-pre-action', 'review_continuity_loop_report',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-continuity',
  ], {});

  assert.equal(parsed.expectedPreAction, 'review_continuity_loop_report');
});

test('formatOperationContinuityWorkflowLiveText suppresses guarded links without site id', () => {
  const text = formatOperationContinuityWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: '',
    operation_id: 'operation_live_alpha',
    read_after_continuity: {
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_focus_ref: 'focus_ref',
    },
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Review Ack:/);
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

test('runOperationContinuityWorkflowLive accepts continuity packet review as the pre-action', async () => {
  let afterContinuity = false;
  const result = await runOperationContinuityWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    operationId: 'operation_live_alpha',
    expectedPreAction: 'review_continuity_packet',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.read') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              operation_id: 'operation_live_alpha',
              workflow_next_action: afterContinuity ? 'monitor_operation' : 'review_continuity_packet',
              next_action: afterContinuity ? 'monitor_operation' : 'continuity_packet',
            },
          });
        }
        if (operation === 'site.read') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: { site_id: 'site_live_smoke', next_action: 'monitor_site' },
          });
        }
      }
      if (scriptName === 'cloudflare-site-continuity-scheduler.mjs') {
        afterContinuity = true;
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1',
          status: 'completed',
          summary: { site_count: 1, completed_site_count: 1, refused_site_count: 0 },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.pre_workflow_next_action, 'review_continuity_packet');
  assert.equal(result.read_after_continuity.workflow_next_action, 'monitor_operation');
});

test('formatOperationContinuityWorkflowLiveText surfaces direct follow-on reads', () => {
  const text = formatOperationContinuityWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    pre_workflow_next_action: 'refresh_site_continuity_loop',
    continuity_execution_status: 'completed',
    continuity_execution_summary: { completed_site_count: 1, refused_site_count: 0 },
    continuity_health: { status: 'ok' },
    read_after_continuity: {
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      workflow_focus_ref: 'site-continuity-reconciliation-execution:site_live_smoke:2026-06-14T00:17:12.374Z:completed',
    },
    site_read_after_continuity: { next_action: 'focus_next_operation' },
  });

  assert.match(text, /Operation Continuity Workflow: ok/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_live_smoke:2026-06-14T00:17:12\.374Z:completed --operator-session-file <operator-session-file>/);
});
