import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_COMMAND = 'claude';
const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1', ''];

function pathKey(env = process.env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
}

function commandNames(command, platform = process.platform) {
  if (platform !== 'win32') return [command];
  if (/\.[A-Za-z0-9]+$/.test(command)) return [command];
  return WINDOWS_EXTENSIONS.map((extension) => `${command}${extension}`);
}

function unique(values) {
  return [...new Set(values)];
}

function discoverClaudeCodeRuntime({
  env = process.env,
  platform = process.platform,
  fileExists = existsSync,
  pathDelimiter = delimiter,
} = {}) {
  const configuredCommand = env.NARADA_CLAUDE_CODE_RUNTIME_COMMAND ?? null;
  const command = configuredCommand || DEFAULT_COMMAND;
  const configured = configuredCommand !== null;

  if (configured && isAbsolute(command)) {
    return fileExists(command)
      ? {
          schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
          status: 'available',
          source: 'configured_absolute_runtime_reference',
          command,
          resolved_path: command,
          candidates: [command],
          diagnostic: null,
        }
      : {
          schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
          status: 'unavailable',
          source: 'configured_absolute_runtime_reference',
          command,
          resolved_path: null,
          candidates: [],
          diagnostic: `Configured Claude Code runtime command does not exist: ${command}`,
        };
  }

  const envPath = env[pathKey(env)] ?? '';
  const names = commandNames(command, platform);
  const candidates = unique(envPath
    .split(pathDelimiter)
    .filter(Boolean)
    .flatMap((dir) => names.map((name) => join(dir, name)))
    .filter((candidate) => fileExists(candidate)));

  if (candidates.length === 0) {
    return {
      schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
      status: 'unavailable',
      source: configured ? 'configured_path_runtime_reference' : 'path_runtime_resolution',
      command,
      resolved_path: null,
      candidates,
      diagnostic: configured
        ? `Configured Claude Code runtime command was not found on PATH: ${command}`
        : `Claude Code runtime command was not found on PATH: ${command}`,
    };
  }
  if (candidates.length > 1) {
    return {
      schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
      status: 'ambiguous',
      source: configured ? 'configured_path_runtime_reference' : 'path_runtime_resolution',
      command,
      resolved_path: null,
      candidates,
      diagnostic: `Claude Code runtime command resolved to multiple candidates: ${candidates.join(', ')}`,
    };
  }
  return {
    schema: 'narada.agent_start.claude_code_runtime_discovery.v0',
    status: 'available',
    source: configured ? 'configured_path_runtime_reference' : 'path_runtime_resolution',
    command,
    resolved_path: candidates[0],
    candidates,
    diagnostic: null,
  };
}

function readinessFromDiscovery(discovery) {
  return {
    schema: 'narada.agent_start.claude_code_live_runtime_readiness.v0',
    readiness_state: discovery.status === 'available' ? 'available' : `refused_${discovery.status}`,
    runtime_discovery: discovery,
    launch_admitted: discovery.status === 'available',
    refusal_diagnostic: discovery.status === 'available' ? null : discovery.diagnostic,
    direct_sqlite_inspection_required: false,
    raw_secret_values_recorded: false,
    unbounded_transcript_recorded: false,
  };
}

function launchEvidencePath(siteRoot, launchPacket) {
  return join(
    siteRoot,
    '.narada',
    'crew',
    'claude-code-live-launches',
    `${launchPacket.agent_start_event}.live-launch.json`,
  );
}

function sanitizeLaunchPacket(launchPacket) {
  return {
    agent_start_event: launchPacket.agent_start_event,
    carrier_session_id: launchPacket.carrier_session_id,
    identity: launchPacket.identity,
    runtime: launchPacket.runtime,
    runtime_kind: launchPacket.runtime_kind,
    startup_command: launchPacket.startup_command,
    mcp_approval_posture: launchPacket.mcp_tool_approval,
    withheld_authorities: launchPacket.claude_code_launch?.execution_policy?.effectful_narada_authority?.withheld_authorities ?? [],
    launch_result_path: launchPacket.launch_result_path ?? null,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function carrierEnvironment(launchPacket) {
  return Object.fromEntries(
    Object.entries(launchPacket.required_environment ?? {})
      .filter(([key, value]) => key.startsWith('NARADA_') && typeof value === 'string'),
  );
}

function launchBridgeEvidence({ launchPacket, discovery, phase, runtimeHandle = null, closeout = null, now = new Date().toISOString() }) {
  const allowedEnvironment = carrierEnvironment(launchPacket);
  return {
    schema: 'narada.agent_start.claude_code_live_launch_bridge.v0',
    phase,
    status: discovery.status === 'available' ? 'launch_admitted' : 'refused',
    recorded_at: now,
    runtime_discovery: discovery,
    launch_packet: sanitizeLaunchPacket(launchPacket),
    runtime_handle: runtimeHandle,
    startup_command_posture: {
      startup_command: launchPacket.startup_command,
      hydrated_by_bridge: false,
      hydration_affordance_preserved: true,
    },
    mcp_approval_posture: launchPacket.mcp_tool_approval,
    withheld_authorities: launchPacket.claude_code_launch?.execution_policy?.effectful_narada_authority?.withheld_authorities ?? [],
    closeout_readback: closeout,
    environment_projection: {
      recorded_keys: Object.keys(allowedEnvironment),
      values: allowedEnvironment,
      parent_environment_inherited: false,
      allowlist_source: 'launch_packet_required_environment_narada_keys',
      raw_secret_values_recorded: false,
    },
    direct_task_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    credential_access: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function writeLiveLaunchEvidence(siteRoot, launchPacket, evidence) {
  const path = launchEvidencePath(siteRoot, launchPacket);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return path;
}

function bridgeClaudeCodeLiveLaunch({
  siteRoot,
  launchPacket,
  discovery = discoverClaudeCodeRuntime(),
  spawnRuntime = spawn,
  now = new Date().toISOString(),
}) {
  const before = launchBridgeEvidence({ launchPacket, discovery, phase: 'before_process_start', now });
  let evidence = before;

  if (discovery.status !== 'available') {
    evidence = {
      ...before,
      refusal_diagnostic: discovery.diagnostic,
      closeout_readback: {
        status: 'not_started',
        reason: discovery.status,
      },
    };
    const evidencePath = writeLiveLaunchEvidence(siteRoot, launchPacket, evidence);
    return { status: 'refused', evidence, evidence_path: evidencePath, child: null };
  }

  const child = spawnRuntime(discovery.resolved_path, launchPacket.runtime_args ?? [], {
    cwd: siteRoot,
    stdio: 'ignore',
    shell: false,
    env: carrierEnvironment(launchPacket),
  });
  evidence = launchBridgeEvidence({
    launchPacket,
    discovery,
    phase: 'after_process_start',
    now,
    runtimeHandle: {
      kind: 'process_pid',
      pid: child.pid ?? null,
      command_path: discovery.resolved_path,
      process_handle_recorded: true,
    },
    closeout: {
      status: 'running_or_external_closeout_required',
      readback_required: true,
      transcript_recorded: false,
    },
  });
  const evidencePath = writeLiveLaunchEvidence(siteRoot, launchPacket, evidence);
  return { status: 'started', evidence, evidence_path: evidencePath, child };
}

export {
  bridgeClaudeCodeLiveLaunch,
  commandNames,
  carrierEnvironment,
  discoverClaudeCodeRuntime,
  launchBridgeEvidence,
  readinessFromDiscovery,
  writeLiveLaunchEvidence,
};
