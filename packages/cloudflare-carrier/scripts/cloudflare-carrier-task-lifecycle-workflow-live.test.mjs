import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseTaskLifecycleWorkflowLiveArgs,
  runTaskLifecycleWorkflowLive,
} from './cloudflare-carrier-task-lifecycle-workflow-live.mjs';

test('parseTaskLifecycleWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseTaskLifecycleWorkflowLiveArgs(['--url', 'https://carrier.example', '--site', 'site_alpha', '--agent-id', 'agent.alpha', '--operator-session-cookie', 'session-cookie']),
    /task_lifecycle_workflow_live_requires_--execute-task-lifecycle-workflow_or_CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_EXECUTE_LIVE=1/,
  );
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
          summary: { task_id: 'task_alpha', task_status: 'closed' },
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
