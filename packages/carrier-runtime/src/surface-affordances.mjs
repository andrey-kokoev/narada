const SOP_TEMPLATE_TOOL = 'sop_template_list';
const SOP_RUN_TOOL = 'sop_run_list';
const SOP_DOCTOR_TOOL = 'sop_doctor';

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
