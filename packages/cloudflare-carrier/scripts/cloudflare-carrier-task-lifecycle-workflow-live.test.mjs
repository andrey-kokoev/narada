import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleWorkflowLiveText,
  parseTaskLifecycleWorkflowLiveArgs,
  runTaskLifecycleWorkflowLive,
} from './cloudflare-carrier-task-lifecycle-workflow-live.mjs';

test('parseTaskLifecycleWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseTaskLifecycleWorkflowLiveArgs(['--url', 'https://carrier.example', '--site', 'site_alpha', '--agent-id', 'agent.alpha', '--operator-session-cookie', 'session-cookie']),
    /task_lifecycle_workflow_live_requires_--execute-task-lifecycle-workflow_or_CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_EXECUTE_LIVE=1/,
  );
});

test('parseTaskLifecycleWorkflowLiveArgs supports text format', () => {
  const parsed = parseTaskLifecycleWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--agent-id', 'agent.alpha',
    '--operator-session-cookie', 'session-cookie',
    '--format', 'text',
    '--execute-task-lifecycle-workflow',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('formatTaskLifecycleWorkflowLiveText renders direct task read', () => {
  const text = formatTaskLifecycleWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_alpha',
    agent_id: 'agent.alpha',
    task_id: 'task_alpha',
    create_summary: { status: 'opened' },
    claim_summary: { status: 'claimed' },
    report_summary: { status: 'closed', report_id: 'report_alpha' },
    finish_summary: { status: 'finished', finish_id: 'finish_alpha' },
    read_after_finish: { task_status: 'finished', operation_id: 'operation_alpha' },
  });

  assert.match(text, /^Task Lifecycle Workflow: ok/m);
  assert.match(text, /Task: task_alpha/);
  assert.match(text, /Report: report_id=report_alpha status=closed/);
  assert.match(text, /Finish: finish_id=finish_alpha status=finished/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('runTaskLifecycleWorkflowLive drives create claim report finish and read', async () => {
  const invocations = [];
  const result = await runTaskLifecycleWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    agentId: 'agent.alpha',
    title: 'task title',
    description: 'task description',
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-task-lifecycle-create.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_create.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'opened' },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-claim.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_claim.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'claimed' },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-report.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_report.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'claimed', report_id: 'report_alpha' },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-finish.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_finish.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'closed', finish_id: 'finish_alpha' },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', task_status: 'closed', operation_id: 'operation_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.create_summary.status, 'opened');
  assert.equal(result.claim_summary.status, 'claimed');
  assert.equal(result.report_summary.report_id, 'report_alpha');
  assert.equal(result.finish_summary.finish_id, 'finish_alpha');
  assert.equal(result.read_after_finish.task_status, 'closed');
  assert.equal(result.read_after_finish.operation_id, 'operation_alpha');

  assert.equal(invocations[0][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-create.mjs');
  assert.ok(invocations[0].includes('--admit-cloudflare-task-create'));
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-claim.mjs');
  assert.ok(invocations[1].includes('--admit-cloudflare-task-claim'));
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-report.mjs');
  assert.ok(invocations[2].includes('--admit-cloudflare-task-report'));
  assert.equal(invocations[3][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-finish.mjs');
  assert.ok(invocations[3].includes('--admit-cloudflare-task-finish'));
  assert.equal(invocations[4][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-read.mjs');
});
