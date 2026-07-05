import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMcpSurfaceAffordanceProjection } from './surface-affordances.mjs';

test('surface affordance projection advertises SOP panel from live MCP tool inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-sop': {
      tools: [
        { name: 'sop_template_list' },
        { name: 'sop_run_list' },
        { name: 'sop_doctor' },
      ],
      config: { surface_id: 'test.sop' },
    },
  });

  assert.equal(projection.schema, 'narada.nars.surface_affordances.v1');
  assert.equal(projection.count, 1);
  assert.deepEqual(projection.items[0], {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'sop',
    surface_id: 'test.sop',
    server_name: 'narada-test-sop',
    source: 'live_tool_inventory',
    renderer: 'sop_catalog_and_runs',
    title: 'SOP',
    panel: {
      kind: 'catalog_and_runs',
      title: 'SOP',
      summary_method: 'session.sop.summary',
      sections: ['active_run', 'templates', 'recent_runs', 'run_steps'],
    },
    actions: {
      read: ['refresh', 'open_template', 'open_run'],
      run: [],
    },
    tools: {
      read: ['sop_template_list', 'sop_run_list'],
      doctor: 'sop_doctor',
    },
  });
});

test('surface affordance projection advertises inbox panel from inbox MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-inbox': {
      tools: [
        { name: 'inbox_list' },
        { name: 'inbox_next' },
        { name: 'inbox_show' },
        { name: 'inbox_doctor' },
        { name: 'inbox_acknowledge' },
        { name: 'inbox_dismiss' },
      ],
      config: { surface_id: 'test.inbox' },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'inbox');
  assert.equal(projection.items[0].panel.summary_method, 'session.inbox.summary');
  assert.deepEqual(projection.items[0].actions.read, ['refresh', 'open_envelope']);
  assert.deepEqual(projection.items[0].actions.candidate_write, ['acknowledge_envelope', 'dismiss_envelope']);
  assert.deepEqual(projection.items[0].tools.read, ['inbox_list', 'inbox_next', 'inbox_show']);
  assert.equal(projection.items[0].tools.doctor, 'inbox_doctor');
});

test('surface affordance projection advertises delegation panel from worker and delegated-task MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-worker-delegation': {
      tools: [
        { name: 'worker_runs_list' },
        { name: 'worker_dashboard_describe' },
        { name: 'worker_run_status' },
        { name: 'worker_run' },
      ],
      config: { surface_id: 'test.worker-delegation' },
    },
    'narada-test-delegated-task': {
      tools: [
        { name: 'delegated_tasks_list' },
        { name: 'delegated_task_status' },
        { name: 'delegated_task_run' },
      ],
      config: { surface_id: 'test.delegated-task' },
    },
  });

  const delegationPanels = projection.items.filter((item) => item.surface_kind === 'delegation');
  assert.equal(delegationPanels.length, 2);
  assert.equal(delegationPanels[0].panel.summary_method, 'session.delegation.summary');
  assert.deepEqual(delegationPanels[0].tools.read, ['worker_runs_list', 'worker_dashboard_describe', 'worker_run_status']);
  assert.deepEqual(delegationPanels[1].tools.read, ['delegated_tasks_list', 'delegated_task_status']);
});

test('surface affordance projection advertises git panel from git MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-git': {
      tools: [
        { name: 'git_status' },
        { name: 'git_changed_summary' },
        { name: 'git_log' },
        { name: 'git_policy_inspect' },
        { name: 'git_add' },
        { name: 'git_commit' },
        { name: 'git_push' },
      ],
      config: { surface_id: 'test.git' },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'git');
  assert.equal(projection.items[0].panel.summary_method, 'session.git.summary');
  assert.deepEqual(projection.items[0].panel.sections, ['repository', 'changed_files', 'recent_commits']);
  assert.deepEqual(projection.items[0].actions.read, ['refresh', 'recent_commits']);
  assert.deepEqual(projection.items[0].actions.candidate_write, ['stage_paths', 'commit_staged', 'push_branch']);
  assert.deepEqual(projection.items[0].tools.read, ['git_status', 'git_changed_summary', 'git_log', 'git_policy_inspect']);
});

test('surface affordance projection advertises surface feedback panel from feedback MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-surface-feedback': {
      tools: [
        { name: 'surface_feedback_list' },
        { name: 'surface_feedback_stats' },
        { name: 'surface_feedback_show' },
        { name: 'surface_feedback_doctor' },
        { name: 'surface_feedback_submit' },
        { name: 'surface_feedback_update_status' },
      ],
      config: { surface_id: 'test.surface-feedback' },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'surface_feedback');
  assert.equal(projection.items[0].panel.summary_method, 'session.surface_feedback.summary');
  assert.deepEqual(projection.items[0].actions.read, ['refresh', 'open_feedback']);
  assert.deepEqual(projection.items[0].actions.candidate_write, ['submit_feedback', 'update_status']);
  assert.deepEqual(projection.items[0].tools.read, ['surface_feedback_list', 'surface_feedback_stats', 'surface_feedback_show']);
  assert.equal(projection.items[0].tools.doctor, 'surface_feedback_doctor');
});

test('surface affordance projection advertises task lifecycle panel from task lifecycle MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-task-lifecycle': {
      tools: [
        { name: 'task_lifecycle_workboard_snapshot' },
        { name: 'task_lifecycle_obligations' },
        { name: 'task_lifecycle_search' },
        { name: 'task_lifecycle_claim' },
        { name: 'task_lifecycle_finish' },
      ],
      config: { surface_id: 'test.task_lifecycle' },
    },
  });

  assert.equal(projection.count, 1);
  assert.deepEqual(projection.items[0], {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'task_lifecycle',
    surface_id: 'test.task_lifecycle',
    server_name: 'narada-test-task-lifecycle',
    source: 'live_tool_inventory',
    renderer: 'task_lifecycle_workboard',
    title: 'Tasks',
    panel: {
      kind: 'task_lifecycle_workboard',
      title: 'Tasks',
      summary_method: 'session.task_lifecycle.summary',
      sections: ['recommendation', 'in_progress', 'reviews', 'obligations'],
    },
    actions: {
      read: ['refresh', 'open_task', 'search_tasks'],
      candidate_write: ['claim_task', 'finish_task'],
    },
    tools: {
      read: ['task_lifecycle_workboard_snapshot', 'task_lifecycle_obligations', 'task_lifecycle_search'],
      write: ['task_lifecycle_claim', 'task_lifecycle_finish'],
    },
  });
});

test('surface affordance projection advertises synced email panel from mailbox MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-mailbox': {
      tools: [
        { name: 'mailbox_accounts_list' },
        { name: 'mailbox_messages_list' },
        { name: 'mailbox_doctor' },
      ],
      config: { surface_id: 'test.mailbox' },
    },
  });

  assert.equal(projection.count, 1);
  assert.deepEqual(projection.items[0], {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'mailbox',
    surface_id: 'test.mailbox',
    server_name: 'narada-test-mailbox',
    source: 'live_tool_inventory',
    renderer: 'synced_email_accounts_and_messages',
    title: 'Synced Email',
    panel: {
      kind: 'synced_email_accounts_and_messages',
      title: 'Synced Email',
      summary_method: 'session.mailbox.summary',
      sections: ['sync_health', 'accounts', 'recent_messages'],
    },
    actions: {
      read: ['refresh', 'open_message', 'open_thread'],
      write: [],
    },
    tools: {
      read: ['mailbox_accounts_list', 'mailbox_messages_list'],
      doctor: 'mailbox_doctor',
    },
  });
});

test('surface affordance projection advertises scheduler panel from scheduler MCP inventory', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-scheduler': {
      tools: [
        { name: 'scheduler_task_list' },
        { name: 'scheduler_task_show' },
        { name: 'scheduler_task_history' },
        { name: 'scheduler_task_run' },
        { name: 'scheduler_task_disable' },
      ],
      config: { surface_id: 'test.scheduler' },
    },
  });

  assert.equal(projection.count, 1);
  assert.deepEqual(projection.items[0], {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'scheduler',
    surface_id: 'test.scheduler',
    server_name: 'narada-test-scheduler',
    source: 'live_tool_inventory',
    renderer: 'scheduler_tasks',
    title: 'Scheduler',
    panel: {
      kind: 'scheduler_tasks',
      title: 'Scheduler',
      summary_method: 'session.scheduler.summary',
      sections: ['posture', 'tasks', 'history'],
    },
    actions: {
      read: ['refresh', 'open_task'],
      candidate_write: ['run_now', 'disable_task'],
    },
    tools: {
      read: ['scheduler_task_list', 'scheduler_task_show', 'scheduler_task_history'],
      write: ['scheduler_task_run', 'scheduler_task_disable'],
    },
  });
});

test('surface affordance projection admits static MCP surface presentation metadata', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-inbox': {
      tools: [{ name: 'inbox_list' }],
      config: {
        surface_id: 'test.inbox',
        operator_affordances: [{
          surface_kind: 'inbox',
          title: 'Inbox',
          renderer: 'record_list',
          panel: {
            kind: 'record_list',
            title: 'Inbox',
            summary_method: 'session.inbox.summary',
            sections: ['items'],
          },
          actions: { read: ['refresh', 'open_item'], write: [] },
          tools: { read: ['inbox_list'] },
        }],
      },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'inbox');
  assert.equal(projection.items[0].surface_id, 'test.inbox');
  assert.equal(projection.items[0].server_name, 'narada-test-inbox');
  assert.equal(projection.items[0].source, 'mcp_server_config');
  assert.deepEqual(projection.items[0].panel, {
    kind: 'record_list',
    title: 'Inbox',
    summary_method: 'session.inbox.summary',
    sections: ['items'],
  });
  assert.deepEqual(projection.items[0].actions, { read: ['refresh', 'open_item'], write: [] });
  assert.deepEqual(projection.items[0].tools, { read: ['inbox_list'] });
});

test('surface affordance projection admits live MCP tool-list affordance metadata', () => {
  const projection = buildMcpSurfaceAffordanceProjection({
    'narada-test-artifacts': {
      tools: [{
        name: 'artifact_list',
        annotations: {
          operator_affordances: [{
            surface_kind: 'artifacts',
            title: 'Artifacts',
            renderer: 'artifact_list',
            panel: { kind: 'artifact_list', summary_method: 'session.artifacts.read', sections: ['items'] },
          }],
        },
      }],
      config: { surface_id: 'test.artifacts' },
    },
  });

  assert.equal(projection.count, 1);
  assert.equal(projection.items[0].surface_kind, 'artifacts');
  assert.equal(projection.items[0].source, 'mcp_tool_list');
  assert.equal(projection.items[0].panel.summary_method, 'session.artifacts.read');
});
