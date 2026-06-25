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

function runtimeDisplayName(runtimeName) {
  return runtimeName === 'agent-cli' ? 'NARS' : runtimeName;
}

export function formatAgentStartWaitPrompt(agentId, runtimeName) {
  return `Press Enter to start ${runtimeDisplayName(runtimeName)} for ${agentId}...`;
}
