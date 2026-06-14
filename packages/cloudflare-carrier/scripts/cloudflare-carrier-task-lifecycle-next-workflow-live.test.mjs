import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTaskLifecycleNextWorkflowLiveText,
  parseTaskLifecycleNextWorkflowLiveArgs,
  runTaskLifecycleNextWorkflowLive,
} from './cloudflare-carrier-task-lifecycle-next-workflow-live.mjs';

test('parseTaskLifecycleNextWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseTaskLifecycleNextWorkflowLiveArgs(['--url', 'https://carrier.example', '--site', 'site_alpha', '--task-id', 'task_alpha', '--agent-id', 'agent.alpha', '--operator-session-cookie', 'session-cookie']),
    /task_lifecycle_next_workflow_live_requires_--execute-task-lifecycle-next_or_CLOUDFLARE_TASK_LIFECYCLE_NEXT_EXECUTE_LIVE=1/,
  );
});

test('parseTaskLifecycleNextWorkflowLiveArgs accepts carrier session focus without task id', () => {
  const parsed = parseTaskLifecycleNextWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--carrier-session-id', 'session_alpha',
    '--agent-id', 'agent.alpha',
    '--execute-task-lifecycle-next',
    '--operator-session-cookie', 'session-cookie',
  ]);

  assert.equal(parsed.taskId, null);
  assert.equal(parsed.carrierSessionId, 'session_alpha');
});

test('parseTaskLifecycleNextWorkflowLiveArgs accepts operation focus without task id', () => {
  const parsed = parseTaskLifecycleNextWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--agent-id', 'agent.alpha',
    '--execute-task-lifecycle-next',
    '--operator-session-cookie', 'session-cookie',
  ]);

  assert.equal(parsed.taskId, null);
  assert.equal(parsed.operationId, 'operation_alpha');
});

test('parseTaskLifecycleNextWorkflowLiveArgs supports text format', () => {
  const parsed = parseTaskLifecycleNextWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--task-id', 'task_alpha',
    '--operator-session-cookie', 'session-cookie',
    '--format', 'text',
    '--execute-task-lifecycle-next',
  ]);

  assert.equal(parsed.format, 'text');
});

test('formatTaskLifecycleNextWorkflowLiveText renders direct follow-on reads', () => {
  const text = formatTaskLifecycleNextWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_alpha',
    task_id: 'task_alpha',
    selected_step: 'report',
    read_before_next: {
      task_status: 'claimed',
      report_id: null,
      finish_id: null,
    },
    read_after_next: {
      task_status: 'closed',
      report_id: 'report_alpha',
      finish_id: null,
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
    },
  });

  assert.match(text, /^Task Lifecycle Next Workflow: ok/m);
  assert.match(text, /Selected Step: report/);
  assert.match(text, /After: status=closed report=report_alpha finish=none/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --task-id task_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text/);
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

test('runTaskLifecycleNextWorkflowLive resolves task id from carrier session focus before claiming', async () => {
  const invocations = [];
  const result = await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: null,
    carrierSessionId: 'session_alpha',
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
            summary: {
              site_id: 'site_alpha',
              task_id: 'task_alpha',
              carrier_session_id: 'session_alpha',
              task_status: 'opened',
              report_id: null,
              finish_id: null,
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: {
            site_id: 'site_alpha',
            task_id: 'task_alpha',
            carrier_session_id: 'session_alpha',
            task_status: 'claimed',
            report_id: null,
            finish_id: null,
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-claim.mjs') {
        assert.equal(args[args.indexOf('--task-id') + 1], 'task_alpha');
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_claim.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'claimed' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.selected_step, 'claim');
  assert.equal(invocations[0][invocations[0].indexOf('--carrier-session-id') + 1], 'session_alpha');
});

test('runTaskLifecycleNextWorkflowLive resolves task id from operation focus before claiming', async () => {
  const invocations = [];
  const result = await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    taskId: null,
    carrierSessionId: null,
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
            summary: {
              site_id: 'site_alpha',
              operation_id: 'operation_alpha',
              task_id: 'task_alpha',
              task_status: 'opened',
              report_id: null,
              finish_id: null,
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: {
            site_id: 'site_alpha',
            operation_id: 'operation_alpha',
            task_id: 'task_alpha',
            task_status: 'claimed',
            report_id: null,
            finish_id: null,
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-claim.mjs') {
        assert.equal(args[args.indexOf('--task-id') + 1], 'task_alpha');
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_claim.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'claimed' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.task_id, 'task_alpha');
  assert.equal(result.selected_step, 'claim');
  assert.equal(invocations[0][invocations[0].indexOf('--operation-id') + 1], 'operation_alpha');
});

test('runTaskLifecycleNextWorkflowLive reuses claimed agent for report when agent id is omitted', async () => {
  const invocations = [];
  await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: 'task_alpha',
    agentId: null,
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-task-lifecycle-read.mjs') {
        if (invocations.length === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
            summary: {
              task_id: 'task_alpha',
              task_status: 'claimed',
              claimed_by_agent_id: 'agent.claimed',
              report_id: null,
              finish_id: null,
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: { task_id: 'task_alpha', task_status: 'closed', report_id: 'report_alpha', finish_id: null },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-report.mjs') {
        assert.equal(args[args.indexOf('--reporter-agent') + 1], 'agent.claimed');
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_report.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'closed', report_id: 'report_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });
});

test('runTaskLifecycleNextWorkflowLive reuses reported agent for finish when agent id is omitted', async () => {
  const invocations = [];
  await runTaskLifecycleNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    taskId: 'task_alpha',
    agentId: null,
    reportSummary: 'report summary',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-task-lifecycle-read.mjs') {
        if (invocations.length === 1) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
            summary: {
              task_id: 'task_alpha',
              task_status: 'closed',
              claimed_by_agent_id: 'agent.claimed',
              reported_by_agent_id: 'agent.reported',
              report_id: 'report_alpha',
              finish_id: null,
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
          summary: { task_id: 'task_alpha', task_status: 'finished', report_id: 'report_alpha', finish_id: 'finish_alpha' },
        });
      }
      if (scriptName === 'cloudflare-carrier-task-lifecycle-finish.mjs') {
        assert.equal(args[args.indexOf('--finalizer-agent') + 1], 'agent.reported');
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.task_lifecycle_finish.v1',
          status: 'ok',
          summary: { task_id: 'task_alpha', status: 'finished', finish_id: 'finish_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });
});
