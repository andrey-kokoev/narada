import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseTaskLifecycleNextWorkflowLiveArgs,
  runTaskLifecycleNextWorkflowLive,
} from './cloudflare-carrier-task-lifecycle-next-workflow-live.mjs';

test('parseTaskLifecycleNextWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseTaskLifecycleNextWorkflowLiveArgs(['--url', 'https://carrier.example', '--site', 'site_alpha', '--task-id', 'task_alpha', '--agent-id', 'agent.alpha', '--operator-session-cookie', 'session-cookie']),
    /task_lifecycle_next_workflow_live_requires_--execute-task-lifecycle-next_or_CLOUDFLARE_TASK_LIFECYCLE_NEXT_EXECUTE_LIVE=1/,
  );
});

test('runTaskLifecycleNextWorkflowLive claims an open task', async () => {
  const invocations = [];
  const result = await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: 'task_alpha',
    agentId: 'agent.alpha',
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-task-lifecycle-read.mjs') {
        if (invocations.length === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
            summary: { task_id: 'task_alpha', task_status: 'opened', report_id: null, finish_id: null },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: { task_id: 'task_alpha', task_status: 'claimed', report_id: null, finish_id: null },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-claim.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_claim.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'claimed' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_step, 'claim');
  assert.equal(result.read_after_next.task_status, 'claimed');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-claim.mjs');
});

test('runTaskLifecycleNextWorkflowLive reports a claimed task', async () => {
  const invocations = [];
  const result = await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: 'task_alpha',
    agentId: 'agent.alpha',
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-task-lifecycle-read.mjs') {
        if (invocations.length === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
            summary: { task_id: 'task_alpha', task_status: 'claimed', report_id: null, finish_id: null },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: { task_id: 'task_alpha', task_status: 'closed', report_id: 'report_alpha', finish_id: null },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-report.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_report.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'closed', report_id: 'report_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_step, 'report');
  assert.equal(result.read_after_next.report_id, 'report_alpha');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-report.mjs');
});

test('runTaskLifecycleNextWorkflowLive finishes a reported task', async () => {
  const invocations = [];
  const result = await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: 'task_alpha',
    agentId: 'agent.alpha',
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-task-lifecycle-read.mjs') {
        if (invocations.length === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
            summary: { task_id: 'task_alpha', task_status: 'closed', report_id: 'report_alpha', finish_id: null },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: { task_id: 'task_alpha', task_status: 'finished', report_id: 'report_alpha', finish_id: 'finish_alpha' },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-finish.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_finish.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'finished', finish_id: 'finish_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_step, 'finish');
  assert.equal(result.read_after_next.finish_id, 'finish_alpha');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-task-lifecycle-finish.mjs');
});

test('runTaskLifecycleNextWorkflowLive no-ops once task is already finished', async () => {
  const result = await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: 'task_alpha',
    agentId: 'agent.alpha',
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async () => JSON.stringify({
      schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
      summary: { task_id: 'task_alpha', task_status: 'finished', report_id: 'report_alpha', finish_id: 'finish_alpha' },
    }),
  });

  assert.equal(result.selected_step, 'monitor_task_lifecycle');
  assert.equal(result.delegated_result, null);
});
