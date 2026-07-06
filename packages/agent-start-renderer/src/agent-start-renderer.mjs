import { agentIdentityDisplay, renderOperatorObjectSummary, renderOperatorValue } from '@narada2/agent-identity';

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

function section(title, bodyLines, colorEnabled) {
  if (!Array.isArray(bodyLines)) return [];
  return [header(`${title}:`, colorEnabled), ...bodyLines.map((bodyLine) => `  ${bodyLine}`)];
}

function formatList(values = [], colorEnabled) {
  return values.length > 0 ? values.map((item) => value(item, colorEnabled)).join(', ') : value('[]', colorEnabled);
}

function formatSkippedMcpFabricEntry(entry) {
  if (!entry || typeof entry !== 'object') return renderOperatorValue(entry);
  return [
    entry.locus ? `locus=${entry.locus}` : null,
    entry.server_name ? `server=${entry.server_name}` : null,
    entry.file ? `file=${entry.file}` : null,
    entry.reason ? `reason=${entry.reason}` : null,
  ].filter(Boolean).join('; ') || renderOperatorObjectSummary(entry) || renderOperatorValue(entry, { mode: 'block' });
}

function parseSiteConfig(result) {
  const raw = result.required_environment?.NARADA_SITE_CONFIG;
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function formatMcpScopePolicy(result, mcpFabric) {
  const siteConfig = parseSiteConfig(result);
  const scope = siteConfig?.mcp_scope ?? (typeof mcpFabric.source === 'string' && mcpFabric.source.startsWith('mcp-scope:')
    ? mcpFabric.source.slice('mcp-scope:'.length)
    : null);
  const loci = Array.isArray(siteConfig?.mcp_loci) ? siteConfig.mcp_loci : [];
  if (!scope && loci.length === 0) return null;
  return [scope ? `scope=${scope}` : null, loci.length > 0 ? `loci=${loci.join(', ')}` : null].filter(Boolean).join('; ');
}

function formatLaunchFailureRendering(failure) {
  if (!failure || typeof failure !== 'object') return 'n/a';
  const status = failure.status ?? null;
  const reason = failure.reason_code ?? null;
  if (status && reason && status !== reason) return `${status}; reason=${reason}`;
  if (status) return String(status);
  if (reason) return `reason=${reason}`;
  return renderOperatorObjectSummary(failure) || 'n/a';
}

function summarizeContractObject(contract, colorEnabled) {
  if (!contract || typeof contract !== 'object') return value('n/a', colorEnabled);
  return value(renderOperatorObjectSummary(contract) || 'empty', colorEnabled);
}

export function formatAgentStartResult(result, options = {}) {
  const colorEnabled = options.colorEnabled ?? false;
  const runtime = options.runtime ?? result.runtime;
  const dryRun = options.dryRun ?? false;
  const lines = [];
  const identityRef = result.agent_identity_ref && typeof result.agent_identity_ref === 'object' ? result.agent_identity_ref : null;
  const displayIdentity = agentIdentityDisplay(identityRef, result.identity) ?? result.identity;

  const launchSummaryLines = [
    line('agent_start_event', result.agent_start_event ?? '<dry-run>', colorEnabled),
    line('identity', displayIdentity, colorEnabled),
  ];
  if (identityRef) {
    if (identityRef.local_agent_id && identityRef.local_agent_id !== displayIdentity) {
      launchSummaryLines.push(line('local_agent_id', identityRef.local_agent_id, colorEnabled));
    }
    if (identityRef.site_id) {
      launchSummaryLines.push(line('site_id', identityRef.site_id, colorEnabled));
    }
  }
  launchSummaryLines.push(line('role', result.role, colorEnabled));
  launchSummaryLines.push(line('runtime', result.runtime, colorEnabled));
  launchSummaryLines.push(line('runtime_substrate_kind', result.runtime_substrate_kind ?? result.runtime, colorEnabled));
  if (result.tool_fabric_adapter_kind) {
    launchSummaryLines.push(line('tool_fabric_adapter_kind', result.tool_fabric_adapter_kind, colorEnabled));
  }
  launchSummaryLines.push(line('resume_command', result.resume_command ?? runtime, colorEnabled));
  const canonicalSessionId = result.required_environment?.NARADA_NARS_SESSION_ID ?? result.required_environment?.NARADA_RUNTIME_SESSION_ID ?? null;
  if (canonicalSessionId) {
    launchSummaryLines.push(line('nars_session_id', canonicalSessionId, colorEnabled));
  }
  lines.push(...section('launch_summary', launchSummaryLines, colorEnabled));

  if (result.capability_policy) {
    lines.push(...section('capability_policy', [
      `${key('direct_substrate_script_execution=', colorEnabled)}${policyValue(result.capability_policy.direct_substrate_script_execution ?? '<unspecified>', colorEnabled)}`,
      `${key('script_execution_surface=', colorEnabled)}${policyValue(result.capability_policy.script_execution_surface ?? '<unspecified>', colorEnabled)}`,
      `${key('shell_access=', colorEnabled)}${policyValue(result.capability_policy.shell_access ?? '<unspecified>', colorEnabled)}`,
      `${key('lifecycle_mutations=', colorEnabled)}${policyValue(result.capability_policy.lifecycle_mutations ?? '<unspecified>', colorEnabled)}`,
    ], colorEnabled));
  }

  if (result.mcp_fabric) {
    const mcpFabric = result.mcp_fabric;
    const serverNames = Array.isArray(mcpFabric.server_names) ? mcpFabric.server_names : [];
    const files = Array.isArray(mcpFabric.files) ? mcpFabric.files : [];
    const skipped = Array.isArray(mcpFabric.skipped) ? mcpFabric.skipped : [];
    const mcpFabricLines = [];
    mcpFabricLines.push(`${key('source=', colorEnabled)}${value(mcpFabric.source ?? '<unspecified>', colorEnabled)}`);
    const scopePolicy = formatMcpScopePolicy(result, mcpFabric);
    if (scopePolicy) {
      mcpFabricLines.push(`${key('scope_policy=', colorEnabled)}${value(scopePolicy, colorEnabled)}`);
    }
    mcpFabricLines.push(`${key('site_root=', colorEnabled)}${value(mcpFabric.site_root ?? '<unspecified>', colorEnabled)}`);
    mcpFabricLines.push(`${key('files=', colorEnabled)}${formatList(files, colorEnabled)}`);
    mcpFabricLines.push(`${key('server_count=', colorEnabled)}${value(String(serverNames.length), colorEnabled)}`);
    for (const serverName of serverNames) {
      mcpFabricLines.push(`  ${value(serverName, colorEnabled)}`);
    }
    if (skipped.length > 0) {
      mcpFabricLines.push(`${key('skipped_count=', colorEnabled)}${value(String(skipped.length), colorEnabled)}`);
      for (const skippedEntry of skipped) {
        mcpFabricLines.push(`  ${value(formatSkippedMcpFabricEntry(skippedEntry), colorEnabled)}`);
      }
    }
    lines.push(...section('mcp_fabric', mcpFabricLines, colorEnabled));
  }

  const requiredEnvironmentLines = [];
  for (const [envKey, envValue] of Object.entries(result.required_environment ?? {})) {
    if (envKey === 'NARADA_CARRIER_SESSION_ID') continue;
    const displayValue = envKey.endsWith('_API_KEY') && envValue ? '<set>' : envValue;
    requiredEnvironmentLines.push(`${key(`${envKey}=`, colorEnabled)}${value(displayValue, colorEnabled)}`);
  }
  lines.push(...section('required_environment', requiredEnvironmentLines, colorEnabled));
  if (result.required_environment?.NARADA_CARRIER_SESSION_ID) {
    lines.push(...section('legacy_compatibility_environment', [
      `${key('NARADA_CARRIER_SESSION_ID=', colorEnabled)}${value(result.required_environment.NARADA_CARRIER_SESSION_ID, colorEnabled)}`,
    ], colorEnabled));
  }

  if (result.startup_command) {
    const startupArgs = result.startup_command.arguments ?? {};
    const startupDisplay = result.startup_command.display ?? `${result.startup_command.name}(${renderOperatorValue(startupArgs, { mode: 'inline' })})`;
    lines.push(...section('startup_command', [line('command', startupDisplay, colorEnabled)], colorEnabled));
  }

  if (result.launcher_contracts) {
    const contracts = result.launcher_contracts;
    const launcherContractLines = [];
    if (contracts.launch_result_artifact) {
      const artifact = contracts.launch_result_artifact;
      launcherContractLines.push(`${key('launch_result_artifact=', colorEnabled)}${value(`${artifact.status ?? 'unknown'} ${artifact.artifact_path ?? '<missing>'}`, colorEnabled)}`);
    }
    if (contracts.operator_projection_open_request) {
      const openRequest = contracts.operator_projection_open_request;
      launcherContractLines.push(`${key('operator_projection_open_request=', colorEnabled)}${value(`${openRequest.status ?? 'unknown'} ${openRequest.projection_kind ?? 'unknown'} ${openRequest.target_ref ?? '<pending>'}`, colorEnabled)}`);
    }
    if (contracts.authority_runtime_host_selection) {
      const selection = contracts.authority_runtime_host_selection;
      launcherContractLines.push(`${key('authority_runtime_host_selection=', colorEnabled)}${value(`${selection.operator_surface_kind ?? 'unknown'} -> ${selection.runtime_host_kind ?? 'unknown'}`, colorEnabled)}`);
    }
    if (contracts.operator_surface_attachment) {
      const attachment = contracts.operator_surface_attachment;
      launcherContractLines.push(`${key('operator_surface_attachment=', colorEnabled)}${value(`${attachment.operator_surface_kind ?? 'unknown'} / ${attachment.tool_fabric_adapter_kind ?? 'unknown'}`, colorEnabled)}`);
    }
    if (contracts.mcp_fabric_injection_plan) {
      const injection = contracts.mcp_fabric_injection_plan;
      launcherContractLines.push(`${key('mcp_fabric_injection_plan=', colorEnabled)}${value(`${injection.requested_scope ?? 'unknown'}; ${summarizeContractObject(injection.isolation, colorEnabled)}`, colorEnabled)}`);
    }
    if (contracts.launch_selection_session) {
      const selection = contracts.launch_selection_session;
      launcherContractLines.push(`${key('launch_selection_session=', colorEnabled)}${value(`${selection.carrier_kind ?? 'unknown'} / ${selection.runtime ?? 'unknown'} / ${selection.intelligence_provider ?? 'none'}`, colorEnabled)}`);
    }
    if (contracts.intelligence_provider_readiness_check) {
      const provider = contracts.intelligence_provider_readiness_check;
      launcherContractLines.push(`${key('intelligence_provider_readiness_check=', colorEnabled)}${value(`${provider.intelligence_provider ?? 'unknown'} ${provider.status ?? 'unknown'}`, colorEnabled)}`);
    }
    if (contracts.operator_terminal_projection_plan) {
      const terminal = contracts.operator_terminal_projection_plan;
      launcherContractLines.push(`${key('operator_terminal_projection_plan=', colorEnabled)}${value(`${terminal.terminal_kind ?? 'unknown'} / wait=${String(Boolean(terminal.wait_for_enter))}`, colorEnabled)}`);
    }
    if (contracts.launch_failure_rendering) {
      const failure = contracts.launch_failure_rendering;
      launcherContractLines.push(`${key('launch_failure_rendering=', colorEnabled)}${value(formatLaunchFailureRendering(failure), colorEnabled)}`);
    }
    lines.push(...section('launcher_contracts', launcherContractLines, colorEnabled));
  }

  if (result.runtime_health_posture) {
    const posture = result.runtime_health_posture;
    const health = posture.dimensions?.health;
    const events = posture.dimensions?.events;
    lines.push(...section('runtime_health_posture', [
      `${key('status=', colorEnabled)}${value(posture.status ?? 'unknown', colorEnabled)}`,
      `${key('health=', colorEnabled)}${value(health ? `${health.status ?? 'unknown'} ${health.http_path ?? ''}`.trim() : 'n/a', colorEnabled)}`,
      `${key('events=', colorEnabled)}${value(events ? `${events.status ?? 'unknown'} ${events.websocket_path ?? ''}`.trim() : 'n/a', colorEnabled)}`,
    ], colorEnabled));
  }

  lines.push(...section('startup_sequence', (result.startup_sequence ?? []).map((step) => `${value(step.tool, colorEnabled)} ${color(ansi.dim, renderOperatorValue(step.arguments, { mode: 'block' }), colorEnabled)}`), colorEnabled));

  if (result.exec && !dryRun && result.agent_start_event) {
    lines.push(line('launch_result_path', result.launch_result_path, colorEnabled));
    lines.push(line('agent_start_result_end', result.agent_start_event, colorEnabled));
  }

  return `${lines.join('\n')}\n`;
}

export function formatAgentStartWaitPrompt(agentId, runtimeName, options = {}) {
  const displayIdentity = agentIdentityDisplay(options.agentIdentityRef, agentId) ?? agentId;
  return `Press Enter to start ${runtimeName} for ${displayIdentity}...`;
}
