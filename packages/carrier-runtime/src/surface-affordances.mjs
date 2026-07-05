const SOP_TEMPLATE_TOOL = 'sop_template_list';
const SOP_RUN_TOOL = 'sop_run_list';
const SOP_DOCTOR_TOOL = 'sop_doctor';
const MAILBOX_ACCOUNTS_TOOL = 'mailbox_accounts_list';
const MAILBOX_MESSAGES_TOOL = 'mailbox_messages_list';
const MAILBOX_DOCTOR_TOOL = 'mailbox_doctor';
const SCHEDULER_TASK_LIST_TOOL = 'scheduler_task_list';
const SCHEDULER_TASK_SHOW_TOOL = 'scheduler_task_show';
const SCHEDULER_TASK_HISTORY_TOOL = 'scheduler_task_history';

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
  const seen = new Set();
  for (const [serverName, server] of Object.entries(mcpServers ?? {})) {
    for (const { affordance, source } of configuredAffordances(serverName, server)) {
      const normalized = normalizeAffordance(serverName, server, affordance, source);
      if (!normalized) continue;
      const key = affordanceKey(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(normalized);
    }
    const sop = sopAffordanceFromTools(serverName, server);
    if (sop) {
      const key = affordanceKey(sop);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(sop);
      }
    }
    const mailbox = mailboxAffordanceFromTools(serverName, server);
    if (mailbox) {
      const key = affordanceKey(mailbox);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(mailbox);
      }
    }
    const scheduler = schedulerAffordanceFromTools(serverName, server);
    if (scheduler) {
      const key = affordanceKey(scheduler);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(scheduler);
      }
    }
  }
  return {
    schema: 'narada.nars.surface_affordances.v1',
    source: 'nars_runtime_mcp_inventory',
    count: items.length,
    items,
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

function normalizeAffordance(serverName, server, affordance, source) {
  if (!affordance || typeof affordance !== 'object') return null;
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

function arrayField(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [];
}
