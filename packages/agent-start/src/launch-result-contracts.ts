import { join } from 'node:path';

export function startupCommandFromSequence(startupSequence = []) {
  const firstStep = startupSequence[0];
  if (!firstStep?.tool) return null;
  return {
    name: firstStep.tool,
    arguments: firstStep.arguments ?? {},
    display: `${firstStep.tool}(${JSON.stringify(firstStep.arguments ?? {})})`,
  };
}

function buildLaunchResultArtifact(result) {
  const sessionId = result.carrier_session?.carrier_session_id
    ?? result.carrier_actions?.carrier_session_registration?.carrier_session_id
    ?? null;
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
    runtime_session_id: sessionId,
    nars_session_id: result.nars_launch?.nars_session_id ?? null,
    carrier_session_id: sessionId,
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
    failure_reference: result.status && result.status !== 'success'
      ? {
          status: result.status,
          reason_code: result.reason_code ?? null,
          reason: result.reason ?? null,
        }
      : null,
  };
}

export function buildRuntimeHealthPosture(result) {
  const health = result.nars_health ?? null;
  const events = result.nars_events ?? null;
  if (!health && !events) return null;

  const summarizeEndpointStatus = (endpoint, availableAtLaunch) => {
    if (endpoint) return 'materialized';
    if (availableAtLaunch) return 'pending';
    return 'projected';
  };

  return {
    schema: 'narada.runtime_health_posture.v0',
    operator_surface_kind: result.operator_surface_kind ?? result.carrier_kind ?? null,
    runtime_host_kind: result.runtime_host_kind ?? result.runtime_substrate_kind ?? null,
    launch_selection_kind: result.launch_selection_kind ?? result.carrier_kind ?? null,
    carrier_kind: result.carrier_kind ?? null,
    carrier_implementation_kind: result.carrier_implementation_kind ?? null,
    runtime_substrate_kind: result.runtime_substrate_kind ?? null,
    status: result.exec && !result.dry_run ? 'projected_for_runtime' : 'projected_for_launch',
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
      authority: result.runtime_authority_selection ? {
        status: result.runtime_authority_selection.effective === 'write' ? 'write_delegated' : 'read_only',
        requested: result.runtime_authority_selection.requested ?? null,
        effective: result.runtime_authority_selection.effective ?? null,
        source: result.runtime_authority_selection.source ?? null,
      } : null,
    },
    projection: {
      operator_surface_kind: result.operator_surface_kind ?? result.carrier_kind ?? null,
      chat_spam_reduction: true,
      summary: 'compact_health_projection',
    },
  };
}

export function buildLauncherContracts(result) {
  const runtimeHostKind = result.runtime_host_kind ?? result.runtime_substrate_kind ?? null;
  const operatorSurfaceKind = result.operator_surface_kind ?? result.nars_launch?.operator_surface_kind ?? result.carrier_kind ?? null;
  const launchSelectionKind = result.launch_selection_kind ?? result.carrier_kind ?? null;
  const carrierImplementationKind = result.carrier_implementation_kind ?? null;
  const launchResultArtifact = buildLaunchResultArtifact(result);
  const runtimeHealthPosture = buildRuntimeHealthPosture(result);
  const intelligenceProviderPreflight = result.intelligence_provider_resolution?.credential?.preflight ?? result.intelligence_provider_resolution?.preflight ?? null;
  const intelligenceProviderPreflightStatus = intelligenceProviderPreflight?.status ?? null;
  const intelligenceProviderReadinessStatus = result.intelligence_provider_resolution ? (
    result.intelligence_provider_resolution.status === 'refused' || result.intelligence_provider_resolution.credential_present === false
      ? 'blocked'
      : intelligenceProviderPreflightStatus === 'passed_cached'
        ? 'ready_cached'
        : 'ready_fresh'
  ) : null;
  return {
    schema: 'narada.launcher_contract_bundle.v0',
    authority_runtime_host_selection: {
      schema: 'narada.authority_runtime_host_selection.v0',
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      launch_selection_kind: launchSelectionKind,
      carrier_kind: result.carrier_kind ?? null,
      carrier_implementation_kind: carrierImplementationKind,
      runtime_substrate_kind: result.runtime_substrate_kind ?? null,
      runtime_contract_schema: result.runtime_contract_schema ?? null,
      selection_source: result.runtime_resolution ?? null,
    },
    operator_surface_attachment: {
      schema: 'narada.operator_surface_attachment.v0',
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      launch_selection_kind: launchSelectionKind,
      carrier_kind: result.carrier_kind ?? null,
      carrier_implementation_kind: carrierImplementationKind,
      tool_fabric_adapter_kind: result.tool_fabric_adapter_kind ?? null,
      tool_fabric_source: result.tool_fabric_adapter?.tool_fabric_source ?? null,
      launch_operator_surface_kind: result.nars_launch?.launch_operator_surface_kind ?? null,
      attachment_commands: result.nars_launch?.attach_commands ?? null,
    },
    runtime_health_posture: runtimeHealthPosture,
    mcp_fabric_injection_plan: result.mcp_scope ? {
      schema: 'narada.mcp_fabric_injection_plan.v0',
      requested_scope: result.mcp_scope.requested ?? null,
      requested_loci: result.mcp_scope.requested_loci ?? [],
      admitted_loci: result.mcp_scope.resolution?.loaded_loci ?? [],
      missing_loci: result.mcp_scope.missing_loci ?? [],
      injected_server_names: result.mcp_fabric?.server_names ?? [],
      injected_locus_fabrics: result.mcp_fabric?.locus_fabrics ?? [],
      isolation: result.mcp_scope.enforcement ? {
        status: result.mcp_scope.enforcement.status ?? 'planned',
        codex_home: result.mcp_scope.enforcement.codex_home ?? null,
        config_path: result.mcp_scope.enforcement.config_path ?? null,
        inherited_codex_home_allowed: result.mcp_scope.enforcement.inherited_codex_home_allowed ?? null,
      } : null,
    } : null,
    launch_selection_session: {
      schema: 'narada.launch_selection_session.v0',
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      launch_selection_kind: launchSelectionKind,
      carrier_kind: result.carrier_kind ?? null,
      carrier_implementation_kind: carrierImplementationKind,
      runtime: result.runtime ?? null,
      runtime_substrate_kind: result.runtime_substrate_kind ?? null,
      runtime_authority_selection: result.runtime_authority_selection ?? null,
      intelligence_provider: result.intelligence_provider ?? null,
      mcp_scope: result.mcp_scope?.requested ?? null,
      target_site_root: result.target_site_root ?? null,
      session_site_root: result.session_site_root ?? null,
      exec: Boolean(result.exec),
      dry_run: result.exec === false,
      wait: Boolean(result.wait),
      visible_runtime_terminal: Boolean(result.visible_runtime_terminal),
      agent_start_execution_mode: result.agent_start_execution_mode ?? null,
      detach_decision: result.detach_decision ?? null,
      detach_refusal_reasons: result.detach_refusal_reasons ?? [],
      hidden_runtime_output_files: result.hidden_runtime_output_files ?? null,
      open_request: result.operator_projection_open_request ?? null,
      launch_result_artifact_path: launchResultArtifact.artifact_path,
    },
    intelligence_provider_readiness_check: result.intelligence_provider_resolution ? {
      schema: 'narada.intelligence_provider_readiness_check.v0',
      intelligence_provider: result.intelligence_provider ?? null,
      status: intelligenceProviderReadinessStatus,
      check_kind: intelligenceProviderPreflightStatus === 'passed_cached' ? 'cached' : intelligenceProviderPreflightStatus ? 'fresh' : null,
      preflight_status: intelligenceProviderPreflightStatus,
      request_adapter: result.intelligence_provider_resolution.request_adapter ?? null,
      credential_requirement_kind: result.intelligence_provider_resolution.credential_requirement_kind ?? null,
      credential_requirement: result.intelligence_provider_resolution.credential_requirement ?? null,
      credential_present: result.intelligence_provider_resolution.credential_present ?? null,
      credential_source: result.intelligence_provider_resolution.credential_source ?? null,
      required_next_step: result.intelligence_provider_resolution.required_next_step ?? null,
    } : null,
    operator_terminal_projection_plan: result.nars_launch ? {
      schema: 'narada.operator_terminal_projection_plan.v0',
      terminal_kind: result.nars_launch.launch_operator_surface_kind ?? result.carrier_kind ?? null,
      operator_surface_kind: operatorSurfaceKind,
      runtime_host_kind: runtimeHostKind,
      command: result.exec_command ?? null,
      raw_runtime_args: result.runtime_args ?? null,
      session_dir: result.nars_launch.session_dir ?? null,
      control_path: result.nars_launch.control_path ?? null,
      session_path: result.nars_launch.session_path ?? null,
      wait_for_enter: Boolean(result.wait),
      agent_start_execution_mode: result.agent_start_execution_mode ?? null,
      detach_decision: result.detach_decision ?? null,
      detach_refusal_reasons: result.detach_refusal_reasons ?? [],
      hidden_runtime_output_files: result.hidden_runtime_output_files ?? null,
      hide_shell: result.agent_start_execution_mode === 'hidden_detached',
    } : null,
    launch_result_artifact: launchResultArtifact,
    operator_projection_open_request: result.operator_projection_open_request ?? null,
    launch_failure_rendering: result.status && result.status !== 'success' ? {
      schema: 'narada.launch_failure_rendering.v0',
      status: result.status,
      reason_code: result.reason_code ?? result.status,
      summary: result.reason ?? result.error ?? 'launcher_failure',
      retryable: Boolean(result.retryable ?? false),
      mutation_performed: Boolean(result.mutation_performed ?? false),
      result_path: result.launch_result_path ?? null,
      repair_command: result.recovery_primary_command ?? result.required_next_step_command ?? null,
      diagnostics: result.native_shell_exception ?? result.mcp_tool_approval ?? null,
    } : null,
  };
}
