const SOP_TEMPLATE_TOOL = 'sop_template_list';
import { ADMITTED_INTELLIGENCE_PROVIDERS, resolveIntelligenceProviderChoices } from './intelligence-provider-policy.mjs';

const SOP_RUN_TOOL = 'sop_run_list';
const SOP_DOCTOR_TOOL = 'sop_doctor';
const MAILBOX_ACCOUNTS_TOOL = 'mailbox_accounts_list';
const MAILBOX_MESSAGES_TOOL = 'mailbox_messages_list';
const MAILBOX_DOCTOR_TOOL = 'mailbox_doctor';
const INBOX_LIST_TOOL = 'inbox_list';
const INBOX_NEXT_TOOL = 'inbox_next';
const INBOX_SHOW_TOOL = 'inbox_show';
const INBOX_DOCTOR_TOOL = 'inbox_doctor';
const WORKER_RUNS_LIST_TOOL = 'worker_runs_list';
const WORKER_DASHBOARD_TOOL = 'worker_dashboard_describe';
const WORKER_RUN_STATUS_TOOL = 'worker_run_status';
const DELEGATED_TASKS_LIST_TOOL = 'delegated_tasks_list';
const DELEGATED_TASK_STATUS_TOOL = 'delegated_task_status';
const DELEGATED_TASK_SUMMARY_TOOL = 'delegated_task_summary';
const GIT_STATUS_TOOL = 'git_status';
const GIT_CHANGED_SUMMARY_TOOL = 'git_changed_summary';
const GIT_LOG_TOOL = 'git_log';
const GIT_POLICY_TOOL = 'git_policy_inspect';
const SURFACE_FEEDBACK_LIST_TOOL = 'surface_feedback_list';
const SURFACE_FEEDBACK_STATS_TOOL = 'surface_feedback_stats';
const SURFACE_FEEDBACK_DOCTOR_TOOL = 'surface_feedback_doctor';
const SURFACE_FEEDBACK_SHOW_TOOL = 'surface_feedback_show';
const SCHEDULER_TASK_LIST_TOOL = 'scheduler_task_list';
const SCHEDULER_TASK_SHOW_TOOL = 'scheduler_task_show';
const SCHEDULER_TASK_HISTORY_TOOL = 'scheduler_task_history';
const TASK_LIFECYCLE_WORKBOARD_TOOL = 'task_lifecycle_workboard_snapshot';
const TASK_LIFECYCLE_OBLIGATIONS_TOOL = 'task_lifecycle_obligations';
const TASK_LIFECYCLE_SEARCH_TOOL = 'task_lifecycle_search';
const MCP_AFFORDANCES_SCHEMA = 'narada.mcp_affordances.v1';
const THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh'];

export function buildRuntimeIntelligenceOperatorAffordance({ intelligence = {}, source = 'nars_runtime' } = {}) {
  const availableModels = stringArrayField(intelligence, 'available_models');
  const availableProviders = stringArrayField(intelligence, 'available_providers');
  const currentModel = stringField(intelligence, 'model');
  const currentProvider = stringField(intelligence, 'provider');
  const modelChoices = uniqueStrings([currentModel, ...availableModels].filter(Boolean));
  const providerChoices = resolveIntelligenceProviderChoices({
    currentProvider,
    availableProviders: availableProviders.length ? availableProviders : ADMITTED_INTELLIGENCE_PROVIDERS,
  });
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'intelligence',
    surface_id: 'nars.runtime.intelligence',
    server_name: null,
    source,
    renderer: 'runtime_intelligence_controls',
    title: 'Intelligence',
    panel: {
      kind: 'runtime_intelligence_controls',
      title: 'Intelligence',
      summary_method: 'session.health',
      sections: ['provider', 'model', 'thinking'],
    },
    actions: {
      read: ['refresh'],
      configure: ['set_provider', 'set_model', 'set_thinking'],
    },
    controls: {
      provider: {
        kind: providerChoices.length ? 'select' : 'text',
        value: currentProvider,
        placeholder: 'Provider name',
        choices: providerChoices.map((value) => ({ value, label: value })),
      },
      model: {
        kind: modelChoices.length ? 'select' : 'text',
        value: currentModel,
        placeholder: 'Model name',
        choices: modelChoices.map((value) => ({ value, label: value })),
      },
      thinking: { kind: 'select', value: stringField(intelligence, 'thinking') ?? 'medium', choices: THINKING_LEVELS.map((value) => ({ value, label: value })) },
    },
    affordance_document: {
      schema: MCP_AFFORDANCES_SCHEMA,
      surface_id: 'nars.runtime.intelligence',
      title: 'Intelligence',
      panels: [
        { id: 'runtime_intelligence_controls', title: 'Intelligence', priority: 10 },
      ],
      actions: [
        {
          id: 'set_provider',
          label: 'Set provider',
          intent: 'configure',
          idempotent: true,
          target: { kind: 'runtime', operation: 'set_provider' },
          args: { provider: { kind: providerChoices.length ? 'enum' : 'string', required: true, choices: providerChoices } },
        },
        {
          id: 'set_model',
          label: 'Set model',
          intent: 'configure',
          idempotent: true,
          target: { kind: 'runtime', operation: 'set_model' },
          args: { model: { kind: modelChoices.length ? 'enum' : 'string', required: true, choices: modelChoices } },
        },
        {
          id: 'set_thinking',
          label: 'Set thinking',
          intent: 'configure',
          idempotent: true,
          target: { kind: 'runtime', operation: 'set_thinking' },
          args: { thinking: { kind: 'enum', required: true, choices: THINKING_LEVELS } },
        },
      ],
    },
  };
}

export function buildNarsSurfaceAffordanceProjection({ mcpServers = {}, intelligence = {}, runtimeAuthorityPosture = null } = {}) {
  const mcpProjection = buildMcpSurfaceAffordanceProjection(mcpServers);
  const intelligenceAffordance = buildRuntimeIntelligenceOperatorAffordance({ intelligence });
  const items = mcpProjection.items.map((item) => projectRuntimeAuthorityPosture(item, runtimeAuthorityPosture));
  return {
    ...mcpProjection,
    count: mcpProjection.items.length + 1,
    runtime_authority_posture: runtimeAuthorityPosture,
    items: [intelligenceAffordance, ...items],
  };
}

function projectRuntimeAuthorityPosture(item, runtimeAuthorityPosture) {
  const writeLikeActions = uniqueStrings([
    ...stringArrayField(item.actions, 'candidate_write'),
    ...stringArrayField(item.actions, 'run'),
    ...stringArrayField(item.actions, 'write'),
  ]);
  if (!writeLikeActions.length) return item;
  const writeAdmitted = ['write_delegated', 'write_partial'].includes(runtimeAuthorityPosture?.mode);
  return {
    ...item,
    authority_posture: runtimeAuthorityPosture ? {
      mode: runtimeAuthorityPosture.mode,
      reason: runtimeAuthorityPosture.reason,
      authority_ref: runtimeAuthorityPosture.authority_ref,
    } : null,
    actions: {
      ...item.actions,
      candidate_write: writeLikeActions,
      admitted_write: writeAdmitted ? writeLikeActions : [],
      withheld_write: writeAdmitted ? [] : writeLikeActions,
    },
  };
}

export function buildSopOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'sop',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:sop`,
    server_name: serverName,
    source,
    renderer: 'sop_catalog_and_runs',
    title: 'SOP',
    panel: {
      kind: 'catalog_and_runs',
      title: 'SOP',
      summary_method: 'session.sop.summary',
      sections: ['active_run', 'templates', 'recent_runs', 'run_steps'],
    },
    actions: sopOperatorActions(toolNames),
    tools: {
      read: [SOP_TEMPLATE_TOOL, SOP_RUN_TOOL].filter((tool) => toolNames.has(tool)),
      doctor: toolNames.has(SOP_DOCTOR_TOOL) ? SOP_DOCTOR_TOOL : null,
    },
  };
}

function delegationAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  const workerSurface = toolNames.has(WORKER_RUNS_LIST_TOOL) || toolNames.has(WORKER_DASHBOARD_TOOL) || toolNames.has(WORKER_RUN_STATUS_TOOL);
  const taskSurface = toolNames.has(DELEGATED_TASKS_LIST_TOOL) || toolNames.has(DELEGATED_TASK_STATUS_TOOL);
  if (!workerSurface && !taskSurface) return null;
  return buildDelegationOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildDelegationOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'delegation',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:delegation`,
    server_name: serverName,
    source,
    renderer: 'delegation_work',
    title: 'Delegation',
    panel: {
      kind: 'delegation_work',
      title: 'Delegation',
      summary_method: 'session.delegation.summary',
      sections: ['posture', 'worker_runs', 'delegated_tasks'],
    },
    actions: {
      read: ['refresh', toolNames.has(WORKER_RUN_STATUS_TOOL) ? 'open_worker_run' : null, toolNames.has(DELEGATED_TASK_STATUS_TOOL) ? 'open_delegated_task' : null].filter(Boolean),
      candidate_write: [
        toolNames.has('worker_run') ? 'start_worker_run' : null,
        toolNames.has('worker_run_reap') ? 'reap_worker_run' : null,
        toolNames.has('delegated_task_run') ? 'start_delegated_task' : null,
        toolNames.has('delegated_task_cancel') ? 'cancel_delegated_task' : null,
      ].filter(Boolean),
    },
    tools: {
      read: [WORKER_RUNS_LIST_TOOL, WORKER_DASHBOARD_TOOL, WORKER_RUN_STATUS_TOOL, DELEGATED_TASKS_LIST_TOOL, DELEGATED_TASK_STATUS_TOOL, DELEGATED_TASK_SUMMARY_TOOL].filter((tool) => toolNames.has(tool)),
      write: ['worker_run', 'worker_run_reap', 'delegated_task_run', 'delegated_task_cancel'].filter((tool) => toolNames.has(tool)),
    },
  };
}

function gitAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(GIT_STATUS_TOOL) && !toolNames.has(GIT_CHANGED_SUMMARY_TOOL)) return null;
  return buildGitOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildGitOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'git',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:git`,
    server_name: serverName,
    source,
    renderer: 'git_worktree_posture',
    title: 'Git',
    panel: {
      kind: 'git_worktree_posture',
      title: 'Git',
      summary_method: 'session.git.summary',
      sections: ['repository', 'changed_files', 'recent_commits'],
    },
    actions: {
      read: ['refresh', toolNames.has(GIT_LOG_TOOL) ? 'recent_commits' : null].filter(Boolean),
      candidate_write: [
        toolNames.has('git_add') ? 'stage_paths' : null,
        toolNames.has('git_commit') ? 'commit_staged' : null,
        toolNames.has('git_push') ? 'push_branch' : null,
      ].filter(Boolean),
    },
    tools: {
      read: [GIT_STATUS_TOOL, GIT_CHANGED_SUMMARY_TOOL, GIT_LOG_TOOL, GIT_POLICY_TOOL].filter((tool) => toolNames.has(tool)),
      write: ['git_add', 'git_unstage', 'git_commit', 'git_push'].filter((tool) => toolNames.has(tool)),
    },
  };
}

function surfaceFeedbackAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(SURFACE_FEEDBACK_LIST_TOOL) && !toolNames.has(SURFACE_FEEDBACK_STATS_TOOL)) return null;
  return buildSurfaceFeedbackOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildSurfaceFeedbackOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'surface_feedback',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:surface_feedback`,
    server_name: serverName,
    source,
    renderer: 'surface_feedback_backlog',
    title: 'Feedback',
    panel: {
      kind: 'surface_feedback_backlog',
      title: 'Feedback',
      summary_method: 'session.surface_feedback.summary',
      sections: ['posture', 'counts', 'recent_feedback'],
    },
    actions: {
      read: ['refresh', toolNames.has(SURFACE_FEEDBACK_SHOW_TOOL) ? 'open_feedback' : null].filter(Boolean),
      candidate_write: [
        toolNames.has('surface_feedback_submit') ? 'submit_feedback' : null,
        toolNames.has('surface_feedback_update_status') ? 'update_status' : null,
      ].filter(Boolean),
    },
    tools: {
      read: [SURFACE_FEEDBACK_LIST_TOOL, SURFACE_FEEDBACK_STATS_TOOL, SURFACE_FEEDBACK_SHOW_TOOL].filter((tool) => toolNames.has(tool)),
      doctor: toolNames.has(SURFACE_FEEDBACK_DOCTOR_TOOL) ? SURFACE_FEEDBACK_DOCTOR_TOOL : null,
      write: ['surface_feedback_submit', 'surface_feedback_update_status', 'surface_feedback_update_status_batch'].filter((tool) => toolNames.has(tool)),
    },
  };
}

function inboxAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(INBOX_LIST_TOOL) && !toolNames.has(INBOX_NEXT_TOOL)) return null;
  return buildInboxOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildInboxOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'inbox',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:inbox`,
    server_name: serverName,
    source,
    renderer: 'inbox_envelopes',
    title: 'Inbox',
    panel: {
      kind: 'inbox_envelopes',
      title: 'Inbox',
      summary_method: 'session.inbox.summary',
      sections: ['next', 'envelopes', 'doctor'],
    },
    actions: {
      read: ['refresh', toolNames.has(INBOX_SHOW_TOOL) ? 'open_envelope' : null].filter(Boolean),
      candidate_write: [
        toolNames.has('inbox_acknowledge') ? 'acknowledge_envelope' : null,
        toolNames.has('inbox_dismiss') ? 'dismiss_envelope' : null,
        toolNames.has('inbox_promote_capa') ? 'promote_capa' : null,
        toolNames.has('inbox_submit') ? 'submit_envelope' : null,
      ].filter(Boolean),
    },
    tools: {
      read: [INBOX_LIST_TOOL, INBOX_NEXT_TOOL, INBOX_SHOW_TOOL].filter((tool) => toolNames.has(tool)),
      doctor: toolNames.has(INBOX_DOCTOR_TOOL) ? INBOX_DOCTOR_TOOL : null,
      write: ['inbox_acknowledge', 'inbox_dismiss', 'inbox_promote_capa', 'inbox_submit'].filter((tool) => toolNames.has(tool)),
    },
  };
}

function taskLifecycleAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(TASK_LIFECYCLE_WORKBOARD_TOOL) && !toolNames.has(TASK_LIFECYCLE_OBLIGATIONS_TOOL)) return null;
  return buildTaskLifecycleOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildTaskLifecycleOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'task_lifecycle',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:task_lifecycle`,
    server_name: serverName,
    source,
    renderer: 'task_lifecycle_workboard',
    title: 'Tasks',
    panel: {
      kind: 'task_lifecycle_workboard',
      title: 'Tasks',
      summary_method: 'session.task_lifecycle.summary',
      sections: ['recommendation', 'in_progress', 'reviews', 'obligations'],
    },
    actions: {
      read: ['refresh', 'open_task', toolNames.has(TASK_LIFECYCLE_SEARCH_TOOL) ? 'search_tasks' : null].filter(Boolean),
      candidate_write: [
        toolNames.has('task_lifecycle_claim') ? 'claim_task' : null,
        toolNames.has('task_lifecycle_finish') ? 'finish_task' : null,
        toolNames.has('task_lifecycle_close') ? 'close_task' : null,
        toolNames.has('task_lifecycle_defer') ? 'defer_task' : null,
      ].filter(Boolean),
    },
    tools: {
      read: [TASK_LIFECYCLE_WORKBOARD_TOOL, TASK_LIFECYCLE_OBLIGATIONS_TOOL, TASK_LIFECYCLE_SEARCH_TOOL, 'task_lifecycle_inspect'].filter((tool) => toolNames.has(tool)),
      write: ['task_lifecycle_claim', 'task_lifecycle_finish', 'task_lifecycle_close', 'task_lifecycle_defer'].filter((tool) => toolNames.has(tool)),
    },
  };
}

function schedulerAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(SCHEDULER_TASK_LIST_TOOL) && !toolNames.has(SCHEDULER_TASK_SHOW_TOOL)) return null;
  return buildSchedulerOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildSchedulerOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'scheduler',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:scheduler`,
    server_name: serverName,
    source,
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
      candidate_write: [
        toolNames.has('scheduler_task_run') ? 'run_now' : null,
        toolNames.has('scheduler_task_enable') ? 'enable_task' : null,
        toolNames.has('scheduler_task_disable') ? 'disable_task' : null,
        toolNames.has('scheduler_task_delete') ? 'delete_task' : null,
      ].filter(Boolean),
    },
    tools: {
      read: [SCHEDULER_TASK_LIST_TOOL, SCHEDULER_TASK_SHOW_TOOL, SCHEDULER_TASK_HISTORY_TOOL].filter((tool) => toolNames.has(tool)),
      write: ['scheduler_task_run', 'scheduler_task_enable', 'scheduler_task_disable', 'scheduler_task_delete'].filter((tool) => toolNames.has(tool)),
    },
  };
}

function mailboxAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(MAILBOX_ACCOUNTS_TOOL) && !toolNames.has(MAILBOX_MESSAGES_TOOL)) return null;
  return buildMailboxOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

export function buildMailboxOperatorAffordance({ serverName, server = {}, source = 'live_tool_inventory' } = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: 'mailbox',
    surface_id: stringField(server?.config, 'surface_id') ?? `${serverName}:mailbox`,
    server_name: serverName,
    source,
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
      read: [MAILBOX_ACCOUNTS_TOOL, MAILBOX_MESSAGES_TOOL].filter((tool) => toolNames.has(tool)),
      doctor: toolNames.has(MAILBOX_DOCTOR_TOOL) ? MAILBOX_DOCTOR_TOOL : null,
    },
  };
}

export function buildMcpSurfaceAffordanceProjection(mcpServers = {}) {
  const items = [];
  const validationErrors = [];
  const seen = new Set();
  const seenSurfaceKinds = new Set();
  for (const [serverName, server] of Object.entries(mcpServers ?? {})) {
    for (const { affordance, source } of configuredAffordances(serverName, server)) {
      const normalized = normalizeAffordance(serverName, server, affordance, source, validationErrors);
      if (!normalized) continue;
      const key = affordanceKey(normalized);
      const surfaceKindKey = affordanceSurfaceKindKey(normalized);
      if (seen.has(key) || seenSurfaceKinds.has(surfaceKindKey)) continue;
      seen.add(key);
      seenSurfaceKinds.add(surfaceKindKey);
      items.push(normalized);
    }
    const delegation = delegationAffordanceFromTools(serverName, server);
    if (delegation) {
      const key = affordanceKey(delegation);
      const surfaceKindKey = affordanceSurfaceKindKey(delegation);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(delegation);
      }
    }
    const git = gitAffordanceFromTools(serverName, server);
    if (git) {
      const key = affordanceKey(git);
      const surfaceKindKey = affordanceSurfaceKindKey(git);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(git);
      }
    }
    const surfaceFeedback = surfaceFeedbackAffordanceFromTools(serverName, server);
    if (surfaceFeedback) {
      const key = affordanceKey(surfaceFeedback);
      const surfaceKindKey = affordanceSurfaceKindKey(surfaceFeedback);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(surfaceFeedback);
      }
    }
    const sop = sopAffordanceFromTools(serverName, server);
    if (sop) {
      const key = affordanceKey(sop);
      const surfaceKindKey = affordanceSurfaceKindKey(sop);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(sop);
      }
    }
    const mailbox = mailboxAffordanceFromTools(serverName, server);
    if (mailbox) {
      const key = affordanceKey(mailbox);
      const surfaceKindKey = affordanceSurfaceKindKey(mailbox);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(mailbox);
      }
    }
    const inbox = inboxAffordanceFromTools(serverName, server);
    if (inbox) {
      const key = affordanceKey(inbox);
      const surfaceKindKey = affordanceSurfaceKindKey(inbox);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(inbox);
      }
    }
    const scheduler = schedulerAffordanceFromTools(serverName, server);
    if (scheduler) {
      const key = affordanceKey(scheduler);
      const surfaceKindKey = affordanceSurfaceKindKey(scheduler);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(scheduler);
      }
    }
    const taskLifecycle = taskLifecycleAffordanceFromTools(serverName, server);
    if (taskLifecycle) {
      const key = affordanceKey(taskLifecycle);
      const surfaceKindKey = affordanceSurfaceKindKey(taskLifecycle);
      if (!seen.has(key) && !seenSurfaceKinds.has(surfaceKindKey)) {
        seen.add(key);
        seenSurfaceKinds.add(surfaceKindKey);
        items.push(taskLifecycle);
      }
    }
  }
  return {
    schema: 'narada.nars.surface_affordances.v1',
    source: 'nars_runtime_mcp_inventory',
    count: items.length,
    items,
    validation_error_count: validationErrors.length,
    validation_errors: validationErrors,
  };
}

function configuredAffordances(serverName, server = {}) {
  const config = server?.config ?? {};
  const configValues = [
    ...arrayField(config.operator_affordances),
    ...arrayField(config.surface_affordances),
    ...arrayField(config.presentation?.operator_affordances),
  ];
  if (config.operator_affordance && typeof config.operator_affordance === 'object') configValues.push(config.operator_affordance);
  return [
    ...configValues.map((value) => ({ affordance: { ...value, server_name: value.server_name ?? serverName }, source: 'mcp_server_config' })),
    ...toolAdvertisedAffordances(server).map((value) => ({ affordance: { ...value, server_name: value.server_name ?? serverName }, source: 'mcp_tool_list' })),
  ];
}

function toolAdvertisedAffordances(server = {}) {
  const values = [];
  for (const tool of server?.tools ?? []) {
    values.push(...arrayField(tool?.operator_affordances));
    values.push(...arrayField(tool?.surface_affordances));
    values.push(...arrayField(tool?.annotations?.operator_affordances));
    values.push(...arrayField(tool?.annotations?.surface_affordances));
    if (tool?.operator_affordance && typeof tool.operator_affordance === 'object') values.push(tool.operator_affordance);
  }
  return values;
}

function normalizeAffordance(serverName, server, affordance, source, validationErrors = []) {
  if (!affordance || typeof affordance !== 'object') return null;
  if (affordance.schema === MCP_AFFORDANCES_SCHEMA) return normalizeMcpAffordanceDocument(serverName, server, affordance, source, validationErrors);
  const surfaceKind = stringField(affordance, 'surface_kind') ?? stringField(affordance, 'kind');
  if (!surfaceKind) return null;
  const panel = objectField(affordance, 'panel') ?? {};
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: surfaceKind,
    surface_id: stringField(affordance, 'surface_id') ?? stringField(server?.config, 'surface_id') ?? `${serverName}:${surfaceKind}`,
    server_name: serverName,
    source,
    renderer: stringField(affordance, 'renderer') ?? stringField(panel, 'kind') ?? surfaceKind,
    title: stringField(affordance, 'title') ?? stringField(panel, 'title') ?? surfaceKind.toUpperCase(),
    panel: {
      kind: stringField(panel, 'kind') ?? stringField(affordance, 'renderer') ?? surfaceKind,
      title: stringField(panel, 'title') ?? stringField(affordance, 'title') ?? surfaceKind.toUpperCase(),
      summary_method: stringField(panel, 'summary_method') ?? stringField(affordance, 'summary_method') ?? null,
      sections: stringArray(panel.sections),
    },
    ...(objectField(affordance, 'actions') ? { actions: objectField(affordance, 'actions') } : {}),
    ...(objectField(affordance, 'tools') ? { tools: objectField(affordance, 'tools') } : {}),
  };
}

function normalizeMcpAffordanceDocument(serverName, server, affordance, source, validationErrors = []) {
  const validation = validateMcpAffordanceDocument(affordance);
  if (validation.errors.length > 0) {
    validationErrors.push({
      schema: 'narada.nars.surface_affordance_validation_error.v1',
      code: 'invalid_mcp_affordance_document',
      server_name: serverName,
      source,
      surface_id: stringField(affordance, 'surface_id') ?? stringField(server?.config, 'surface_id') ?? null,
      errors: validation.errors,
    });
    return null;
  }
  const surfaceId = stringField(affordance, 'surface_id') ?? stringField(server?.config, 'surface_id');
  if (!surfaceId) return null;
  const panels = arrayField(affordance.panels);
  const primaryPanel = panels
    .slice()
    .sort((left, right) => numericField(left, 'priority') - numericField(right, 'priority'))[0] ?? {};
  const surfaceKind = surfaceKindFromAffordanceDocument(surfaceId, serverName);
  const title = stringField(affordance, 'title') ?? stringField(primaryPanel, 'title') ?? surfaceKind.toUpperCase();
  const actions = arrayField(affordance.actions);
  const sortedPanels = panels.slice().sort((left, right) => numericField(left, 'priority') - numericField(right, 'priority'));
  return {
    schema: 'narada.mcp_surface.operator_affordance.v1',
    surface_kind: surfaceKind,
    surface_id: surfaceId,
    server_name: serverName,
    source,
    renderer: 'generic_mcp_affordance',
    title,
    panel: {
      kind: 'generic_mcp_affordance',
      title,
      summary_method: null,
      sections: sortedPanels.map((panel) => stringField(panel, 'id')).filter(Boolean),
    },
    actions: {
      read: actionLabels(actions, (action) => action.read_only === true || action.intent === 'inspect' || action.intent === 'refresh' || action.intent === 'open'),
      candidate_write: actionLabels(actions, (action) => action.read_only !== true && action.destructive !== true),
      destructive: actionLabels(actions, (action) => action.destructive === true || action.danger_level === 'high'),
    },
    tools: {
      read: toolTargets(actions, (action) => action.read_only === true),
      write: toolTargets(actions, (action) => action.read_only !== true),
    },
    affordance_document: affordance,
  };
}

function validateMcpAffordanceDocument(affordance) {
  const errors = [];
  if (!affordance || typeof affordance !== 'object' || Array.isArray(affordance)) {
    return { ok: false, errors: [{ path: '$', code: 'document_object_required', message: 'Affordance document must be an object.' }] };
  }
  if (affordance.schema !== MCP_AFFORDANCES_SCHEMA) {
    errors.push({ path: 'schema', code: 'schema_unsupported', message: `Expected ${MCP_AFFORDANCES_SCHEMA}.` });
  }
  if (!stringField(affordance, 'surface_id')) {
    errors.push({ path: 'surface_id', code: 'string_required', message: 'surface_id must be a non-empty string.' });
  }
  if (!Array.isArray(affordance.panels)) {
    errors.push({ path: 'panels', code: 'array_required', message: 'panels must be an array.' });
  }
  if (affordance.actions !== undefined && !Array.isArray(affordance.actions)) {
    errors.push({ path: 'actions', code: 'array_required', message: 'actions must be an array when present.' });
  }

  const actionIds = new Set();
  const duplicateActionIds = new Set();
  for (const [index, action] of (Array.isArray(affordance.actions) ? affordance.actions : []).entries()) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      errors.push({ path: `actions[${index}]`, code: 'object_required', message: 'Each action must be an object.' });
      continue;
    }
    const actionId = stringField(action, 'id');
    if (!actionId) {
      errors.push({ path: `actions[${index}].id`, code: 'string_required', message: 'Action id must be a non-empty string.' });
    } else if (actionIds.has(actionId)) {
      duplicateActionIds.add(actionId);
    } else {
      actionIds.add(actionId);
    }
    const target = objectField(action, 'target');
    if (action.target !== undefined && !target) {
      errors.push({ path: `actions[${index}].target`, code: 'object_required', message: 'Action target must be an object when present.' });
    }
    if (target && !stringField(target, 'kind')) {
      errors.push({ path: `actions[${index}].target.kind`, code: 'string_required', message: 'Action target kind must be a non-empty string.' });
    }
    if (target?.kind === 'tool' && !stringField(target, 'tool')) {
      errors.push({ path: `actions[${index}].target.tool`, code: 'string_required', message: 'Tool targets must declare target.tool.' });
    }
    for (const booleanField of ['read_only', 'idempotent', 'destructive', 'confirmation_required', 'requires_confirmation']) {
      if (action[booleanField] !== undefined && typeof action[booleanField] !== 'boolean') {
        errors.push({ path: `actions[${index}].${booleanField}`, code: 'boolean_required', message: `${booleanField} must be boolean when present.` });
      }
    }
    if (action.danger_level !== undefined && !['low', 'medium', 'high'].includes(action.danger_level)) {
      errors.push({ path: `actions[${index}].danger_level`, code: 'enum_invalid', message: 'danger_level must be low, medium, or high when present.' });
    }
  }
  for (const actionId of duplicateActionIds) {
    errors.push({ path: 'actions', code: 'duplicate_action_id', message: `Duplicate action id: ${actionId}.` });
  }

  for (const [index, panel] of (Array.isArray(affordance.panels) ? affordance.panels : []).entries()) {
    if (!panel || typeof panel !== 'object' || Array.isArray(panel)) {
      errors.push({ path: `panels[${index}]`, code: 'object_required', message: 'Each panel must be an object.' });
      continue;
    }
    if (!stringField(panel, 'id')) {
      errors.push({ path: `panels[${index}].id`, code: 'string_required', message: 'Panel id must be a non-empty string.' });
    }
    if (panel.actions !== undefined && !Array.isArray(panel.actions)) {
      errors.push({ path: `panels[${index}].actions`, code: 'array_required', message: 'Panel actions must be an array of action ids when present.' });
      continue;
    }
    for (const [actionIndex, actionRef] of (Array.isArray(panel.actions) ? panel.actions : []).entries()) {
      if (typeof actionRef !== 'string' || !actionRef) {
        errors.push({ path: `panels[${index}].actions[${actionIndex}]`, code: 'string_required', message: 'Panel action references must be non-empty strings.' });
      } else if (Array.isArray(affordance.actions) && !actionIds.has(actionRef)) {
        errors.push({ path: `panels[${index}].actions[${actionIndex}]`, code: 'unknown_action_reference', message: `Panel references unknown action id: ${actionRef}.` });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function surfaceKindFromAffordanceDocument(surfaceId, serverName) {
  const value = String(surfaceId || serverName || 'surface')
    .split(/[.:/\\]/)
    .filter(Boolean)
    .at(-1) ?? 'surface';
  return value.replace(/-mcp$/i, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'surface';
}

function actionLabels(actions, predicate) {
  return actions.filter(predicate).map((action) => stringField(action, 'label') ?? stringField(action, 'id')).filter(Boolean);
}

function toolTargets(actions, predicate) {
  return actions
    .filter(predicate)
    .map((action) => objectField(action, 'target'))
    .filter((target) => target?.kind === 'tool')
    .map((target) => stringField(target, 'tool'))
    .filter(Boolean);
}

function sopAffordanceFromTools(serverName, server = {}) {
  const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
  if (!toolNames.has(SOP_TEMPLATE_TOOL) && !toolNames.has(SOP_RUN_TOOL)) return null;
  return buildSopOperatorAffordance({ serverName, server, source: 'live_tool_inventory' });
}

function sopOperatorActions(toolNames) {
  return {
    read: ['refresh', 'open_template', 'open_run'],
    run: [
      toolNames.has('sop_run_start') ? 'start_run' : null,
      toolNames.has('sop_run_advance') ? 'advance_run' : null,
      toolNames.has('sop_run_advance') ? 'confirm_operator_step' : null,
      toolNames.has('sop_run_cancel') ? 'cancel_run' : null,
    ].filter(Boolean),
  };
}

function affordanceKey(affordance) {
  return `${affordance.server_name}:${affordance.surface_kind}:${affordance.renderer}`;
}

function affordanceSurfaceKindKey(affordance) {
  return `${affordance.server_name}:${affordance.surface_kind}`;
}

function objectField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function stringField(record, field) {
  if (!record || typeof record !== 'object') return null;
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}

function numericField(record, field) {
  if (!record || typeof record !== 'object') return Number.MAX_SAFE_INTEGER;
  const value = record[field];
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function arrayField(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [];
}

function stringArrayField(record, field) {
  if (!record || typeof record !== 'object') return [];
  return stringArray(record[field]);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))];
}
