import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationLifecycleWorkflowLiveText,
  parseOperationLifecycleWorkflowLiveArgs,
  runOperationLifecycleWorkflowLive,
} from './cloudflare-carrier-operation-lifecycle-workflow-live.mjs';

test('parseOperationLifecycleWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseOperationLifecycleWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--token', 'token-value',
      '--site', 'site_live_smoke',
      '--operation-id', 'operation_live_alpha',
      '--agent-id', 'agent.operator.lifecycle',
    ], {}),
    /operation_lifecycle_workflow_live_requires_--execute-operation-lifecycle/,
  );
});

test('parseOperationLifecycleWorkflowLiveArgs supports operator session auth', () => {
  const parsed = parseOperationLifecycleWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--agent-id', 'agent.operator.lifecycle',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-lifecycle',
  ], {});

  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.continuationReason, 'operation_needs_operator_continuation');
  assert.equal(parsed.closeReason, 'operation_closed_after_live_workflow');
});

test('parseOperationLifecycleWorkflowLiveArgs accepts text format', () => {
  const parsed = parseOperationLifecycleWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--agent-id', 'agent.operator.lifecycle',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-lifecycle',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('runOperationLifecycleWorkflowLive orchestrates lifecycle create, continuation, resume, and close', async () => {
  const invocations = [];
  const result = await runOperationLifecycleWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    operationId: 'operation_live_alpha',
    displayName: 'Operation lifecycle live workflow',
    operationKind: 'operator',
    agentId: 'agent.operator.lifecycle',
    siteRoot: 'cloudflare://site_live_smoke',
    continuationReason: 'operation_needs_operator_continuation',
    closeReason: 'operation_closed_after_live_workflow',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-operation-create.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_create.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_live_alpha',
            site_id: 'site_live_smoke',
            display_name: 'Operation lifecycle live workflow',
            operation_kind: 'operator',
            status: 'active',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-status-put.mjs') {
        const status = args[args.indexOf('--status') + 1];
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_status_put.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_live_alpha',
            site_id: 'site_live_smoke',
            status,
            requested_status: status,
            transition: status === 'needs_continuation' ? 'active_to_needs_continuation' : 'active_to_closed',
            reason: args.includes('--reason') ? args[args.indexOf('--reason') + 1] : null,
            updated_at: '2026-06-12T00:00:00.000Z',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-continuation-resume.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.continuation_resume.v1',
          status: 'ok',
          summary: {
            site_id: 'site_live_smoke',
            operation_id: 'operation_live_alpha',
            carrier_session_id: 'carrier_session_operation_live_alpha_1',
            agent_id: 'agent.operator.lifecycle',
            activation_status: 'active',
            activation_transition: 'needs_continuation_to_active',
            activation_reason: 'operation_needs_operator_continuation',
            route_next_action: 'resume_operation_continuation',
            route_reason: 'operation_lifecycle_needs_continuation',
            session_event_kind: 'carrier_session_started',
            session_event_sequence: 1,
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const readsSoFar = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (readsSoFar === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              operation_id: 'operation_live_alpha',
              current_status: 'active',
              next_action: 'monitor_operation',
              workflow_next_action: 'monitor_operation',
            },
          });
        }
        if (readsSoFar === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              operation_id: 'operation_live_alpha',
              current_status: 'needs_continuation',
              next_action: 'resume_operation_continuation',
              workflow_next_action: 'resume_operation_continuation',
            },
          });
        }
        if (readsSoFar === 3) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              operation_id: 'operation_live_alpha',
              current_status: 'active',
              next_action: 'monitor_operation',
              workflow_next_action: 'monitor_operation',
              session_count: 1,
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_live_alpha',
            current_status: 'closed',
            next_action: 'monitor_operation',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_lifecycle_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.read_after_needs_continuation.workflow_next_action, 'resume_operation_continuation');
  assert.equal(result.continuation_resume_summary.carrier_session_id, 'carrier_session_operation_live_alpha_1');
  assert.equal(result.read_after_close.current_status, 'closed');
  assert.equal(invocations.length, 8);
  assert.equal(invocations[0][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-create.mjs');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-status-put.mjs');
  assert.equal(invocations[3][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[4][0].split(/[\\/]/).pop(), 'cloudflare-carrier-continuation-resume.mjs');
  assert.equal(invocations[5][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[6][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-status-put.mjs');
  assert.equal(invocations[7][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.ok(invocations[0].includes('--operator-session-cookie'));
  assert.ok(invocations[4].includes('--site-root'));
});

test('formatOperationLifecycleWorkflowLiveText surfaces direct follow-on workflows and reads', () => {
  const text = formatOperationLifecycleWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_live_smoke',
    operation_id: 'operation_live_alpha',
    agent_id: 'agent.operator.lifecycle',
    carrier_session_id: 'carrier_session_operation_live_alpha_1',
    create_summary: { status: 'active', operation_kind: 'operator' },
    read_after_create: { current_status: 'active', workflow_next_action: 'start_or_select_session' },
    needs_continuation_summary: { requested_status: 'needs_continuation' },
    read_after_needs_continuation: { workflow_next_action: 'resume_operation_continuation' },
    read_after_resume: { workflow_next_action: 'refresh_site_continuity_loop' },
    close_summary: { requested_status: 'closed' },
    read_after_close: { current_status: 'closed' },
  });

  assert.match(text, /Operation Lifecycle Workflow: ok/);
  assert.match(text, /Create Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:session:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-session/);
  assert.match(text, /Continuation Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuation:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-continuation-resume/);
  assert.match(text, /Resume Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --carrier-session-id carrier_session_operation_live_alpha_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_operation_live_alpha_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_operation_live_alpha_1 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
});
