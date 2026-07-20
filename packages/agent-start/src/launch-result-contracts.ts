import { join } from 'node:path';
import {
  assertAgentStartResultV0,
  resolveAgentStartSessionProjection,
} from './launch-result-v0-contract.mjs';
import type { AgentStartResultV0 } from './launch-result-v0-contract.mts';

type OptionalRecord = Record<string, unknown> | null | undefined;
type McpScopeInput = {
  requested?: unknown;
  requested_loci?: unknown[];
  resolution?: { loaded_loci?: unknown[] } | null;
  missing_loci?: unknown[];
  enforcement?: {
    status?: unknown;
    codex_home?: unknown;
    config_path?: unknown;
    inherited_codex_home_allowed?: unknown;
  } | null;
} | null | undefined;
type LauncherContractInput = AgentStartResultV0 & {
  launch_result_path?: unknown;
  exec?: unknown;
  dry_run?: unknown;
  nars_health?: OptionalRecord;
  nars_events?: OptionalRecord;
  runtime_host_kind?: unknown;
  runtime_substrate_kind?: unknown;
  operator_surface_kind?: unknown;
  launch_selection_kind?: unknown;
  carrier_kind?: unknown;
  carrier_implementation_kind?: unknown;
  runtime_contract_schema?: unknown;
  runtime_resolution?: unknown;
  tool_fabric_adapter_kind?: unknown;
  tool_fabric_adapter?: OptionalRecord;
  mcp_scope?: McpScopeInput;
  mcp_fabric?: OptionalRecord;
  runtime?: unknown;
  runtime_authority_selection?: OptionalRecord;
  intelligence_selection_authority?: OptionalRecord;
  visible_runtime_terminal?: unknown;
  agent_start_execution_mode?: unknown;
  detach_decision?: unknown;
  detach_refusal_reasons?: unknown[];
  hidden_runtime_output_files?: unknown;
  operator_projection_open_request?: unknown;
  exec_command?: unknown;
  runtime_args?: unknown;
  wait?: unknown;
  reason_code?: unknown;
  reason?: unknown;
  error?: unknown;
  retryable?: unknown;
  mutation_performed?: unknown;
  recovery_primary_command?: unknown;
  required_next_step_command?: unknown;
  native_shell_exception?: unknown;
  mcp_tool_approval?: unknown;
};

function launcherContractInput(result: AgentStartResultV0): LauncherContractInput {
  return result as LauncherContractInput;
}

function isLaunchFailureStatus(status: unknown): boolean {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return normalized === 'failed'
    || normalized === 'refused'
    || normalized === 'not_available'
    || normalized === 'error'
    || normalized.startsWith('failed_')
    || normalized.startsWith('refused_');
}

export function buildLauncherContractsFromAgentStartResult(result: AgentStartResultV0) {
  const canonicalResult = assertAgentStartResultV0(result);
  const sessionProjection = resolveAgentStartSessionProjection(canonicalResult);
  if (canonicalResult.status === 'materialized' && !sessionProjection?.session_ref) {
    throw new Error('agent_start_result_handoff_invalid: canonical session projection is not coherent');
  }
  return buildLauncherContracts(canonicalResult);
}

export function startupCommandFromSequence(startupSequence = []) {
  const firstStep = startupSequence[0];
  if (!firstStep?.tool) return null;
  return {
    name: firstStep.tool,
    arguments: firstStep.arguments ?? {},
    display: `${firstStep.tool}(${JSON.stringify(firstStep.arguments ?? {})})`,
  };
}

function buildLaunchResultArtifact(result: LauncherContractInput) {
  const sessionProjection = resolveAgentStartSessionProjection(result);
  const sessionId = sessionProjection?.session_id ?? null;
  const artifactPath = result.launch_result_path
    ?? (result.session_site_root && result.agent_start_event
      ? join(result.session_site_root, '.ai', 'runtime', 'agent-start-results', `${result.agent_start_event}.result.json`)
      : null);
  return {
    schema: 'narada.launch_result_artifact.v0',
    status: result.exec && result.agent_start_event ? 'materialized' : 'planned',
    artifact_path: artifactPath,
    schema_ref: result.schema ?? 'narada.agent_start.result.v0',
    owner_site_root: result.session_site_root ?? result.target_site_root ?? null,
    session_ref: sessionProjection?.session_ref ?? null,
    runtime_session_id: sessionProjection?.runtime_session_id ?? null,
    nars_session_id: sessionProjection?.nars_session_id ?? null,
    carrier_session_id: sessionProjection?.carrier_session_id ?? null,
    agent_start_event_id: result.agent_start_event ?? null,
    lifecycle: {
      retention: 'site_owned',
      replayable: Boolean(result.agent_start_event),
      result_file_only: Boolean(result.launch_result_path),
    },
    inspector_commands: sessionId ? {
      session_read: `narada-agent-cli --identity ${result.identity} --session ${sessionId} --session-read`,
      session_operations: `narada-agent-cli --identity ${result.identity} --session ${sessionId} --session-operations`,
      session_events: `narada-agent-cli --identity ${result.identity} --session ${sessionId} --session-events --session-events-filter all --session-events-count 20`,
    } : null,
    failure_reference: isLaunchFailureStatus(result.status)
      ? {
          status: result.status,
          reason_code: result.reason_code ?? null,
          reason: result.reason ?? null,
        }
      : null,
  };
}

export function buildRuntimeHealthPosture(result: AgentStartResultV0) {
  const input = launcherContractInput(result);
  const health = input.nars_health ?? null;
  const events = input.nars_events ?? null;
  if (!health && !events) return null;

  const summarizeEndpointStatus = (endpoint, availableAtLaunch) => {
    if (endpoint) return 'materialized';
    if (availableAtLaunch) return 'pending';
    return 'projected';
  };

  return {
    schema: 'narada.runtime_health_posture.v0',
    operator_surface_kind: input.operator_surface_kind ?? input.carrier_kind ?? null,
    runtime_host_kind: input.runtime_host_kind ?? input.runtime_substrate_kind ?? null,
    launch_selection_kind: input.launch_selection_kind ?? input.carrier_kind ?? null,
    carrier_kind: input.carrier_kind ?? null,
    carrier_implementation_kind: input.carrier_implementation_kind ?? null,
    runtime_substrate_kind: input.runtime_substrate_kind ?? null,
    status: input.exec && !input.dry_run ? 'projected_for_runtime' : 'projected_for_launch',
    dimensions: {
      health: health ? {
        status: summarizeEndpointStatus(health.endpoint ?? null, health.endpoint_available_at_launch_materialization),
        method: health.method ?? null,
        http_path: health.http_path ?? null,
        discovery_field: health.discovery_field ?? null,
        endpoint: health.endpoint ?? null,
      } : null,
      events: events ? {
        status: summarizeEndpointStatus(events.endpoint ?? null, events.endpoint_available_at_launch_materialization),
        method: events.method ?? null,
        transport_kind: events.transport_kind ?? null,
        websocket_path: events.websocket_path ?? null,
        discovery_field: events.discovery_field ?? null,
        endpoint: events.endpoint ?? null,
        supports_replay: Boolean(events.supports_replay),
        locality: events.locality ?? null,
      } : null,
      authority: input.runtime_authority_selection ? {
        status: input.runtime_authority_selection.effective === 'write' ? 'write_delegated' : 'read_only',
        requested: input.runtime_authority_selection.requested ?? null,
        effective: input.runtime_authority_selection.effective ?? null,
        source: input.runtime_authority_selection.source ?? null,
      } : null,
    },
    projection: {
      operator_surface_kind: input.operator_surface_kind ?? input.carrier_kind ?? null,
      chat_spam_reduction: true,
      summary: 'compact_health_projection',
    },
  };
}

function buildLauncherContracts(result: AgentStartResultV0) {
  const input = launcherContractInput(result);
  const runtimeHostKind = input.runtime_host_kind ?? input.runtime_substrate_kind ?? null;
  const operatorSurfaceKind = input.operator_surface_kind ?? input.nars_launch?.operator_surface_kind ?? input.carrier_kind ?? null;
  const launchSelectionKind = input.launch_selection_kind ?? input.carrier_kind ?? null;
  const carrierImplementationKind = input.carrier_implementation_kind ?? null;
  const launchResultArtifact = buildLaunchResultArtifact(input);
  const runtimeHealthPosture = buildRuntimeHealthPosture(result);
  return {
    schema: 'narada.launcher_contract_bundle.v0',
    authority_runtime_host_selection: {
      schema: 'narada.authority_runtime_host_selection.v0',
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      launch_selection_kind: launchSelectionKind,
      carrier_kind: input.carrier_kind ?? null,
      carrier_implementation_kind: carrierImplementationKind,
      runtime_substrate_kind: input.runtime_substrate_kind ?? null,
      runtime_contract_schema: input.runtime_contract_schema ?? null,
      selection_source: input.runtime_resolution ?? null,
    },
    operator_surface_attachment: {
      schema: 'narada.operator_surface_attachment.v0',
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      launch_selection_kind: launchSelectionKind,
      carrier_kind: input.carrier_kind ?? null,
      carrier_implementation_kind: carrierImplementationKind,
      tool_fabric_adapter_kind: input.tool_fabric_adapter_kind ?? null,
      tool_fabric_source: input.tool_fabric_adapter?.tool_fabric_source ?? null,
      launch_operator_surface_kind: input.nars_launch?.launch_operator_surface_kind ?? null,
      attachment_commands: input.nars_launch?.attach_commands ?? null,
    },
    runtime_health_posture: runtimeHealthPosture,
    mcp_fabric_injection_plan: input.mcp_scope ? {
      schema: 'narada.mcp_fabric_injection_plan.v0',
      requested_scope: input.mcp_scope.requested ?? null,
      requested_loci: input.mcp_scope.requested_loci ?? [],
      admitted_loci: input.mcp_scope.resolution?.loaded_loci ?? [],
      missing_loci: input.mcp_scope.missing_loci ?? [],
      injected_server_names: input.mcp_fabric?.server_names ?? [],
      injected_locus_fabrics: input.mcp_fabric?.locus_fabrics ?? [],
      isolation: input.mcp_scope.enforcement ? {
        status: input.mcp_scope.enforcement.status ?? 'planned',
        codex_home: input.mcp_scope.enforcement.codex_home ?? null,
        config_path: input.mcp_scope.enforcement.config_path ?? null,
        inherited_codex_home_allowed: input.mcp_scope.enforcement.inherited_codex_home_allowed ?? null,
      } : null,
    } : null,
    launch_selection_session: {
      schema: 'narada.launch_selection_session.v0',
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      launch_selection_kind: launchSelectionKind,
      carrier_kind: input.carrier_kind ?? null,
      carrier_implementation_kind: carrierImplementationKind,
      runtime: input.runtime ?? null,
      runtime_substrate_kind: input.runtime_substrate_kind ?? null,
      runtime_authority_selection: input.runtime_authority_selection ?? null,
      intelligence_selection_authority: input.intelligence_selection_authority ?? null,
      mcp_scope: input.mcp_scope?.requested ?? null,
      target_site_root: input.target_site_root ?? null,
      session_site_root: input.session_site_root ?? null,
      exec: Boolean(input.exec),
      dry_run: input.exec === false,
      wait: Boolean(input.wait),
      visible_runtime_terminal: Boolean(input.visible_runtime_terminal),
      agent_start_execution_mode: input.agent_start_execution_mode ?? null,
      detach_decision: input.detach_decision ?? null,
      detach_refusal_reasons: input.detach_refusal_reasons ?? [],
      hidden_runtime_output_files: input.hidden_runtime_output_files ?? null,
      open_request: input.operator_projection_open_request ?? null,
      launch_result_artifact_path: launchResultArtifact.artifact_path,
    },
    operator_terminal_projection_plan: input.nars_launch ? {
      schema: 'narada.operator_terminal_projection_plan.v0',
      terminal_kind: input.nars_launch.launch_operator_surface_kind ?? input.carrier_kind ?? null,
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      command: input.exec_command ?? null,
      raw_runtime_args: input.runtime_args ?? null,
      session_dir: input.nars_launch.session_dir ?? null,
      control_path: input.nars_launch.control_path ?? null,
      session_path: input.nars_launch.session_path ?? null,
      wait_for_enter: Boolean(input.wait),
      agent_start_execution_mode: input.agent_start_execution_mode ?? null,
      detach_decision: input.detach_decision ?? null,
      detach_refusal_reasons: input.detach_refusal_reasons ?? [],
      hidden_runtime_output_files: input.hidden_runtime_output_files ?? null,
      hide_shell: input.agent_start_execution_mode === 'hidden_detached',
    } : null,
    launch_result_artifact: launchResultArtifact,
    operator_projection_open_request: input.operator_projection_open_request ?? null,
    launch_failure_rendering: isLaunchFailureStatus(input.status) ? {
      schema: 'narada.launch_failure_rendering.v0',
      status: input.status,
      reason_code: input.reason_code ?? input.status,
      summary: input.reason ?? input.error ?? 'launcher_failure',
      retryable: Boolean(input.retryable ?? false),
      mutation_performed: Boolean(input.mutation_performed ?? false),
      result_path: input.launch_result_path ?? null,
      repair_command: input.recovery_primary_command ?? input.required_next_step_command ?? null,
      diagnostics: input.native_shell_exception ?? input.mcp_tool_approval ?? null,
    } : null,
  };
}
