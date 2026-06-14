import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationSessionWorkflowLiveText,
  parseOperationSessionWorkflowLiveArgs,
  runOperationSessionWorkflowLive,
} from './cloudflare-carrier-operation-session-workflow-live.mjs';

test('parseOperationSessionWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseOperationSessionWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_live_smoke',
      '--operation-id', 'operation_live_alpha',
      '--token', 'token-value',
    ], {}),
    /operation_session_workflow_live_requires_--execute-operation-session/,
  );
});

test('parseOperationSessionWorkflowLiveArgs supports operator session auth and defaults', () => {
  const parsed = parseOperationSessionWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-session',
  ], {});

  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.agentId, 'narada.cloudflare.operation.session.live');
  assert.equal(parsed.siteRef, 'cloudflare://site_live_smoke');
  assert.equal(parsed.expectedPreAction, 'start_or_select_session');
});

test('parseOperationSessionWorkflowLiveArgs accepts text format', () => {
  const parsed = parseOperationSessionWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-session',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('runOperationSessionWorkflowLive bridges operation.read into resident dispatch and rereads the operation', async () => {
  const invocations = [];
  const result = await runOperationSessionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    operationId: 'operation_live_alpha',
    agentId: 'narada.cloudflare.operation.session.live',
    siteRef: 'cloudflare://site_live_smoke',
    windowsFallbackRef: 'windows_local_site_resident_loop',
    carrierSessionId: 'carrier_session_alpha',
    dispatchDecisionId: 'dispatch_alpha',
    expectedPreAction: 'start_or_select_session',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (readCount === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              operation_id: 'operation_live_alpha',
              workflow_next_action: 'start_or_select_session',
              next_action: 'session',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          status: 'ok',
          summary: {
            site_id: 'site_live_smoke',
            operation_id: 'operation_live_alpha',
            workflow_next_action: 'monitor_operation',
            next_action: 'monitor_operation',
            session_count: 1,
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-live-smoke.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.resident_dispatch_live_smoke.v1',
          status: 'ok',
          site_id: 'site_live_smoke',
          operation_id: 'operation_live_alpha',
          carrier_session_id: 'carrier_session_alpha',
          dispatch_decision_id: 'dispatch_alpha',
          dispatch_state: 'cloudflare_primary_started',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_session_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.pre_workflow_next_action, 'start_or_select_session');
  assert.equal(result.resident_dispatch.dispatch_state, 'cloudflare_primary_started');
  assert.equal(result.read_after_session.workflow_next_action, 'monitor_operation');
  assert.equal(invocations.length, 3);
  assert.equal(invocations[0][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-resident-dispatch-live-smoke.mjs');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.ok(invocations[1].includes('--session'));
  assert.ok(invocations[1].includes('carrier_session_alpha'));
  assert.ok(invocations[1].includes('--dispatch-decision-id'));
  assert.ok(invocations[1].includes('dispatch_alpha'));
  assert.ok(invocations[1].includes('--operator-session-cookie'));
  assert.equal(result.post_action_advanced, true);
});

test('runOperationSessionWorkflowLive surfaces fallback posture without failing when session is still missing', async () => {
  const result = await runOperationSessionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    operationId: 'operation_live_alpha',
    agentId: 'narada.cloudflare.operation.session.live',
    siteRef: 'cloudflare://site_live_smoke',
    windowsFallbackRef: 'windows_local_site_resident_loop',
    carrierSessionId: 'carrier_session_alpha',
    dispatchDecisionId: 'dispatch_alpha',
    expectedPreAction: 'start_or_select_session',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          status: 'ok',
          summary: {
            site_id: 'site_live_smoke',
            operation_id: 'operation_live_alpha',
            workflow_next_action: 'start_or_select_session',
            next_action: 'session',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-live-smoke.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.resident_dispatch_live_smoke.v1',
          status: 'ok',
          site_id: 'site_live_smoke',
          operation_id: 'operation_live_alpha',
          carrier_session_id: 'carrier_session_alpha',
          dispatch_decision_id: 'dispatch_alpha',
          dispatch_state: 'cloudflare_primary_failed_windows_fallback_available',
          fallback_status: 'available',
          workflow_next_action: 'start_or_select_session',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.resident_dispatch.dispatch_state, 'cloudflare_primary_failed_windows_fallback_available');
  assert.equal(result.read_after_session.workflow_next_action, 'start_or_select_session');
  assert.equal(result.post_action_advanced, false);
});

test('formatOperationSessionWorkflowLiveText surfaces direct follow-on workflows and reads', () => {
  const text = formatOperationSessionWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    pre_workflow_next_action: 'start_or_select_session',
    resident_dispatch: {
      dispatch_state: 'cloudflare_primary_started',
      carrier_session_id: 'carrier_session_alpha',
      dispatch_decision_id: 'dispatch_alpha',
    },
    read_after_session: {
      workflow_next_action: 'refresh_site_continuity_loop',
    },
    post_action_advanced: true,
  });

  assert.match(text, /Operation Session Workflow: ok/);
  assert.match(text, /Post Action Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --carrier-session-id carrier_session_alpha --operator-session-file <operator-session-file>/);
});
