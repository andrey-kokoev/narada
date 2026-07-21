import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationContinuationWorkflowLiveText,
  parseOperationContinuationWorkflowLiveArgs,
  runOperationContinuationWorkflowLive,
} from '../workflows/cloudflare-carrier-operation-continuation-workflow-live.mjs';

test('parseOperationContinuationWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseOperationContinuationWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_live_smoke',
      '--agent-id', 'agent.operator',
      '--token', 'token-value',
    ], {}),
    /operation_continuation_workflow_live_requires_--execute-operation-continuation-resume/,
  );
});

test('parseOperationContinuationWorkflowLiveArgs supports operator session auth and expected operation id', () => {
  const parsed = parseOperationContinuationWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--agent-id', 'agent.operator',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-continuation-resume',
  ], {});

  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.expectedOperationId, 'operation_live_alpha');
  assert.equal(parsed.expectedPreAction, 'resume_operation_continuation');
});

test('parseOperationContinuationWorkflowLiveArgs accepts text format', () => {
  const parsed = parseOperationContinuationWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operation-id', 'operation_live_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-continuation-resume',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('parseOperationContinuationWorkflowLiveArgs defaults the agent id when omitted', () => {
  const parsed = parseOperationContinuationWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-continuation-resume',
  ], {});

  assert.equal(parsed.agentId, 'narada.cloudflare.operation.continuation.live');
});

test('formatOperationContinuationWorkflowLiveText suppresses guarded links without site id', () => {
  const text = formatOperationContinuationWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: '',
    selected_operation_id: 'operation_live_alpha',
    continuation_resume_summary: { carrier_session_id: 'carrier_session_alpha' },
    read_after_resume: { workflow_next_action: 'start_or_select_session' },
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Session Evidence:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
});

test('formatOperationContinuationWorkflowLiveText suppresses guarded links without worker url', () => {
  const text = formatOperationContinuationWorkflowLiveText({
    status: 'ok',
    worker_url: '',
    site_id: 'site_live_smoke',
    selected_operation_id: 'operation_live_alpha',
    continuation_resume_summary: { carrier_session_id: 'carrier_session_alpha' },
    read_after_resume: { workflow_next_action: 'start_or_select_session' },
  });

  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Resume Workflow:/);
  assert.doesNotMatch(text, /Session Evidence:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
});

test('runOperationContinuationWorkflowLive selects continuation from operation.list then resumes it', async () => {
  const invocations = [];
  const result = await runOperationContinuationWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedOperationId: 'operation_live_alpha',
    agentId: 'agent.operator',
    continuationReason: 'operator_resuming_continuation',
    expectedPreAction: 'resume_operation_continuation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list' && invocations.length === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              operation: 'operation.list',
              site_id: 'site_live_smoke',
              needs_continuation_count: 1,
              next_continuation_operation_id: 'operation_live_alpha',
            },
          });
        }
        if (operation === 'operation.read' && invocations.length === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              operation_id: 'operation_live_alpha',
              workflow_next_action: 'resume_operation_continuation',
              next_action: 'resume_operation_continuation',
            },
          });
        }
        if (operation === 'operation.read' && invocations.length === 4) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              site_id: 'site_live_smoke',
              operation_id: 'operation_live_alpha',
              workflow_next_action: 'start_resident_dispatch',
              next_action: 'start_resident_dispatch',
            },
          });
        }
        if (operation === 'operation.list' && invocations.length === 5) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            status: 'ok',
            summary: {
              operation: 'operation.list',
              site_id: 'site_live_smoke',
              needs_continuation_count: 0,
              next_continuation_operation_id: null,
            },
          });
        }
      }
      if (scriptName === 'cloudflare-carrier-continuation-resume.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.continuation_resume.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_live_alpha',
            route_next_action: 'resume_operation_continuation',
            session_event_kind: 'carrier_session_started',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_continuation_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.selected_operation_id, 'operation_live_alpha');
  assert.equal(result.pre_workflow_next_action, 'resume_operation_continuation');
  assert.equal(result.read_after_resume.workflow_next_action, 'start_resident_dispatch');
  assert.equal(result.list_after_resume.next_continuation_operation_id, null);
  assert.equal(invocations.length, 5);
  assert.equal(invocations[0][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-continuation-resume.mjs');
  assert.equal(invocations[3][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[4][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.ok(invocations[0].includes('--continuation'));
  assert.ok(invocations[2].includes('--operator-session-cookie'));
});

test('formatOperationContinuationWorkflowLiveText surfaces direct follow-on workflows and reads', () => {
  const text = formatOperationContinuationWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_live_smoke',
    selected_operation_id: 'operation_live_alpha',
    pre_workflow_next_action: 'resume_operation_continuation',
    list_before_resume: {
      needs_continuation_count: 1,
      next_continuation_operation_id: 'operation_live_alpha',
    },
    continuation_resume_summary: {
      carrier_session_id: 'carrier_session_operation_live_alpha_1',
    },
    read_after_resume: {
      workflow_next_action: 'start_or_select_session',
    },
    list_after_resume: {
      needs_continuation_count: 0,
      next_continuation_operation_id: null,
    },
  });

  assert.match(text, /Operation Continuation Workflow: ok/);
  assert.match(text, /Resume Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:session:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-session/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example --site site_live_smoke --operation-id operation_live_alpha --carrier-session-id carrier_session_operation_live_alpha_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_operation_live_alpha_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_live_smoke --carrier-session-id carrier_session_operation_live_alpha_1 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
});
