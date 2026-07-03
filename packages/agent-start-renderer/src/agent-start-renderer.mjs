const ansi = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function color(code, value, colorEnabled) {
  return colorEnabled && code ? `${code}${value}${ansi.reset}` : String(value);
}

function header(label, colorEnabled) {
  return color(`${ansi.bold}${ansi.blue}`, label, colorEnabled);
}

function key(label, colorEnabled) {
  return color(ansi.dim, label, colorEnabled);
}

function value(text, colorEnabled) {
  return color(ansi.cyan, text ?? '', colorEnabled);
}

function policyValue(text, colorEnabled) {
  if (text === 'forbidden') return color(ansi.red, text, colorEnabled);
  if (text === 'mcp_only') return color(ansi.yellow, text, colorEnabled);
  return value(text ?? '<unspecified>', colorEnabled);
}

function line(field, text, colorEnabled) {
  return `${key(`${field}:`, colorEnabled)} ${value(text, colorEnabled)}`;
}

function formatList(values = [], colorEnabled) {
  return values.length > 0 ? values.map((item) => value(item, colorEnabled)).join(', ') : value('[]', colorEnabled);
}

function summarizeContractObject(contract, colorEnabled) {
  if (!contract || typeof contract !== 'object') return value('n/a', colorEnabled);
  const entries = [];
  for (const [keyName, rawValue] of Object.entries(contract)) {
    if (rawValue === null || rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      entries.push(`${keyName}=[${rawValue.length}]`);
      continue;
    }
    if (typeof rawValue === 'object') {
      const status = rawValue.status ?? rawValue.schema ?? rawValue.reason_code ?? null;
      entries.push(status ? `${keyName}=${status}` : keyName);
      continue;
    }
    entries.push(`${keyName}=${String(rawValue)}`);
  }
  return entries.length > 0 ? entries.join(', ') : 'empty';
}

export function formatAgentStartResult(result, options = {}) {
  const colorEnabled = options.colorEnabled ?? false;
  const runtime = options.runtime ?? result.runtime;
  const dryRun = options.dryRun ?? false;
  const lines = [];

  lines.push(line('agent_start_event', result.agent_start_event ?? '<dry-run>', colorEnabled));
  lines.push(line('identity', result.identity, colorEnabled));
  lines.push(line('role', result.role, colorEnabled));
  lines.push(line('runtime', result.runtime, colorEnabled));
  lines.push(line('runtime_substrate_kind', result.runtime_substrate_kind ?? result.runtime, colorEnabled));
  if (result.tool_fabric_adapter_kind) {
    lines.push(line('tool_fabric_adapter_kind', result.tool_fabric_adapter_kind, colorEnabled));
  }
  lines.push(line('resume_command', result.resume_command ?? runtime, colorEnabled));

  if (result.capability_policy) {
    lines.push(header('capability_policy:', colorEnabled));
    lines.push(`  ${key('direct_substrate_script_execution=', colorEnabled)}${policyValue(result.capability_policy.direct_substrate_script_execution ?? '<unspecified>', colorEnabled)}`);
    lines.push(`  ${key('script_execution_surface=', colorEnabled)}${policyValue(result.capability_policy.script_execution_surface ?? '<unspecified>', colorEnabled)}`);
    lines.push(`  ${key('shell_access=', colorEnabled)}${policyValue(result.capability_policy.shell_access ?? '<unspecified>', colorEnabled)}`);
    lines.push(`  ${key('lifecycle_mutations=', colorEnabled)}${policyValue(result.capability_policy.lifecycle_mutations ?? '<unspecified>', colorEnabled)}`);
  }

  if (result.mcp_fabric) {
    const mcpFabric = result.mcp_fabric;
    const serverNames = Array.isArray(mcpFabric.server_names) ? mcpFabric.server_names : [];
    const files = Array.isArray(mcpFabric.files) ? mcpFabric.files : [];
    const skipped = Array.isArray(mcpFabric.skipped) ? mcpFabric.skipped : [];
    lines.push(header('mcp_fabric:', colorEnabled));
    lines.push(`  ${key('source=', colorEnabled)}${value(mcpFabric.source ?? '<unspecified>', colorEnabled)}`);
    lines.push(`  ${key('site_root=', colorEnabled)}${value(mcpFabric.site_root ?? '<unspecified>', colorEnabled)}`);
    lines.push(`  ${key('files=', colorEnabled)}${formatList(files, colorEnabled)}`);
    lines.push(`  ${key('server_count=', colorEnabled)}${value(String(serverNames.length), colorEnabled)}`);
    for (const serverName of serverNames) {
      lines.push(`    ${value(serverName, colorEnabled)}`);
    }
    if (skipped.length > 0) {
      lines.push(`  ${key('skipped=', colorEnabled)}${formatList(skipped, colorEnabled)}`);
    }
  }

  lines.push(header('required_environment:', colorEnabled));
  for (const [envKey, envValue] of Object.entries(result.required_environment ?? {})) {
    const displayValue = envKey.endsWith('_API_KEY') && envValue ? '<set>' : envValue;
    lines.push(`  ${key(`${envKey}=`, colorEnabled)}${value(displayValue, colorEnabled)}`);
  }

  if (result.startup_command) {
    const startupArgs = result.startup_command.arguments ?? {};
    const startupDisplay = result.startup_command.display ?? `${result.startup_command.name}(${JSON.stringify(startupArgs)})`;
    lines.push(line('startup_command', startupDisplay, colorEnabled));
  }

  if (result.launcher_contracts) {
    const contracts = result.launcher_contracts;
    lines.push(header('launcher_contracts:', colorEnabled));
    if (contracts.launch_result_artifact) {
      const artifact = contracts.launch_result_artifact;
      lines.push(`  ${key('launch_result_artifact=', colorEnabled)}${value(`${artifact.status ?? 'unknown'} ${artifact.artifact_path ?? '<missing>'}`, colorEnabled)}`);
    }
    if (contracts.operator_projection_open_request) {
      const openRequest = contracts.operator_projection_open_request;
      lines.push(`  ${key('operator_projection_open_request=', colorEnabled)}${value(`${openRequest.status ?? 'unknown'} ${openRequest.projection_kind ?? 'unknown'} ${openRequest.target_ref ?? '<pending>'}`, colorEnabled)}`);
    }
    if (contracts.authority_runtime_host_selection) {
      const selection = contracts.authority_runtime_host_selection;
      lines.push(`  ${key('authority_runtime_host_selection=', colorEnabled)}${value(`${selection.operator_surface_kind ?? 'unknown'} -> ${selection.runtime_host_kind ?? 'unknown'}`, colorEnabled)}`);
    }
    if (contracts.operator_surface_attachment) {
      const attachment = contracts.operator_surface_attachment;
      lines.push(`  ${key('operator_surface_attachment=', colorEnabled)}${value(`${attachment.operator_surface_kind ?? 'unknown'} / ${attachment.tool_fabric_adapter_kind ?? 'unknown'}`, colorEnabled)}`);
    }
    if (contracts.mcp_fabric_injection_plan) {
      const injection = contracts.mcp_fabric_injection_plan;
      lines.push(`  ${key('mcp_fabric_injection_plan=', colorEnabled)}${value(`${injection.requested_scope ?? 'unknown'}; ${summarizeContractObject(injection.isolation, colorEnabled)}`, colorEnabled)}`);
    }
    if (contracts.launch_selection_session) {
      const selection = contracts.launch_selection_session;
      lines.push(`  ${key('launch_selection_session=', colorEnabled)}${value(`${selection.carrier_kind ?? 'unknown'} / ${selection.runtime ?? 'unknown'} / ${selection.intelligence_provider ?? 'none'}`, colorEnabled)}`);
    }
    if (contracts.intelligence_provider_readiness_check) {
      const provider = contracts.intelligence_provider_readiness_check;
      lines.push(`  ${key('intelligence_provider_readiness_check=', colorEnabled)}${value(`${provider.intelligence_provider ?? 'unknown'} ${provider.status ?? 'unknown'}`, colorEnabled)}`);
    }
    if (contracts.operator_terminal_projection_plan) {
      const terminal = contracts.operator_terminal_projection_plan;
      lines.push(`  ${key('operator_terminal_projection_plan=', colorEnabled)}${value(`${terminal.terminal_kind ?? 'unknown'} / wait=${String(Boolean(terminal.wait_for_enter))}`, colorEnabled)}`);
    }
    if (contracts.launch_failure_rendering) {
      const failure = contracts.launch_failure_rendering;
      lines.push(`  ${key('launch_failure_rendering=', colorEnabled)}${value(`${failure.status ?? 'unknown'} ${failure.reason_code ?? ''}`.trim(), colorEnabled)}`);
    }
  }

  if (result.runtime_health_posture) {
    const posture = result.runtime_health_posture;
    const health = posture.dimensions?.health;
    const events = posture.dimensions?.events;
    lines.push(header('runtime_health_posture:', colorEnabled));
    lines.push(`  ${key('status=', colorEnabled)}${value(posture.status ?? 'unknown', colorEnabled)}`);
    lines.push(`  ${key('health=', colorEnabled)}${value(health ? `${health.status ?? 'unknown'} ${health.http_path ?? ''}`.trim() : 'n/a', colorEnabled)}`);
    lines.push(`  ${key('events=', colorEnabled)}${value(events ? `${events.status ?? 'unknown'} ${events.websocket_path ?? ''}`.trim() : 'n/a', colorEnabled)}`);
  }

  lines.push(header('startup_sequence:', colorEnabled));
  for (const step of result.startup_sequence ?? []) {
    lines.push(`  ${value(step.tool, colorEnabled)} ${color(ansi.dim, JSON.stringify(step.arguments), colorEnabled)}`);
  }

  if (result.exec && !dryRun && result.agent_start_event) {
    lines.push(line('launch_result_path', result.launch_result_path, colorEnabled));
    lines.push(line('agent_start_result_end', result.agent_start_event, colorEnabled));
  }

  return `${lines.join('\n')}\n`;
}

export function formatAgentStartWaitPrompt(agentId, runtimeName) {
  return `Press Enter to start ${runtimeName} for ${agentId}...`;
}
