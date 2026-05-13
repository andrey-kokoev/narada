import {
  findDeniedSourceImports,
} from './import-refusal.js';
import type {
  CrewStartupShortcutPlan,
  CrewStartupShortcutRefusal,
  CrewStartupShortcutRequest,
  CrewStartupLaunchIntentSequence,
} from './types.js';

export function buildCrewStartupPlan(request: CrewStartupShortcutRequest): CrewStartupShortcutPlan | CrewStartupShortcutRefusal {
  const sourceImportFindings = findDeniedSourceImports(request.sourcePaths ?? []);
  const missingMcpSurfaces = request.requiredMcpSurfaces
    .filter((surface) => surface.required && surface.tools.length === 0)
    .map((surface) => surface.surfaceId);
  const reasons = [
    ...sourceImportFindings.map((finding) => `denied_source_import:${finding.reason}`),
    ...missingMcpSurfaces.map((surfaceId) => `missing_mcp_surface:${surfaceId}`),
    ...(request.directNativeShortcutRequested ? ['native_shortcut_fallback_refused'] : []),
  ];

  if (reasons.length > 0) {
    return buildCrewStartupRefusal(request, reasons, missingMcpSurfaces);
  }

  return {
    schema: 'narada.crew_startup_shortcut.plan.v0',
    requestId: request.requestId,
    status: 'planned',
    exposureClass: 'descriptor_only',
    targetLocus: request.targetLocus,
    targetSiteId: request.targetSiteId,
    mcpOnly: true,
    startupSteps: [
      { step: 'verify_site_agent_execution_policy', posture: 'descriptor_only' },
      { step: 'verify_required_mcp_surfaces', posture: 'descriptor_only' },
      { step: 'hydrate_workboard_context', posture: 'requires_local_admission' },
      { step: 'prepare_role_startup_handoff', posture: 'requires_local_admission' },
    ],
    requiredMcpSurfaces: request.requiredMcpSurfaces,
    requiredLocalAdmissions: [
      'workboard_hydration_read',
      'operator_surface_launch_focus_bind',
      'role_session_start',
    ],
    evidenceRefs: [
      ...request.workboardEvidenceRefs,
      ...request.hydrationEvidenceRefs,
      ...(request.sourceRefs ?? []),
    ],
    sourceImportFindings: [],
    packageExecutedLaunch: false,
    packageMutatedPcState: false,
    nativeShellFallbackAllowed: false,
  };
}

export function buildCrewStartupRefusal(
  request: CrewStartupShortcutRequest,
  reasons?: string[],
  missingMcpSurfaces?: string[],
): CrewStartupShortcutRefusal {
  const sourceImportFindings = findDeniedSourceImports(request.sourcePaths ?? []);
  return {
    schema: 'narada.crew_startup_shortcut.refusal.v0',
    requestId: request.requestId,
    status: 'refused',
    reasons: reasons ?? [
      ...sourceImportFindings.map((finding) => `denied_source_import:${finding.reason}`),
      ...(request.directNativeShortcutRequested ? ['native_shortcut_fallback_refused'] : []),
    ],
    sourceImportFindings,
    missingMcpSurfaces: missingMcpSurfaces ?? [],
    requiredBehavior: 'stop_and_report_missing_mcp_capability',
    packageExecutedLaunch: false,
    nativeShellFallbackAllowed: false,
  };
}

export function buildCrewStartupLaunchIntentSequence(
  request: CrewStartupShortcutRequest,
): CrewStartupLaunchIntentSequence | CrewStartupShortcutRefusal {
  const plan = buildCrewStartupPlan(request);
  if (plan.status === 'refused') return plan;

  return {
    schema: 'narada.crew_startup_shortcut.launch_intent_sequence.v0',
    requestId: request.requestId,
    status: 'ready_for_admitted_carrier',
    exposureClass: 'request_response',
    targetLocus: request.targetLocus,
    targetSiteId: request.targetSiteId,
    mcpOnly: true,
    sequenceSteps: [
      { step: 'read_task_lifecycle_context', posture: 'read_only', requiredTool: 'site_task_lifecycle.read_task' },
      { step: 'plan_agent_context_hydration', posture: 'descriptor_only', requiredTool: 'agent_context_memory.plan_hydration' },
      { step: 'read_checkpoint_summary_if_available', posture: 'read_only', requiredTool: 'agent_context_memory.read_checkpoint_summary' },
      { step: 'prepare_operator_surface_launch_handoff', posture: 'handoff_intent' },
    ],
    requiredMcpSurfaces: request.requiredMcpSurfaces,
    launchHandoff: {
      schema: 'narada.crew_startup_shortcut.launch_handoff.v0',
      targetSiteId: request.targetSiteId,
      roleNames: [...request.roleNames],
      namedAgentIds: [...request.namedAgentIds],
      requestedBy: request.requestedBy,
      carrierRequired: 'operator_surface_launch_focus_bind',
      executionAdmitted: false,
    },
    evidenceRefs: [
      ...plan.evidenceRefs,
      `crew_startup_request:${request.requestId}`,
    ],
    sourceImportFindings: [],
    packageExecutedLaunch: false,
    packageMutatedPcState: false,
    operatorSurfaceRuntimeMutated: false,
    nativeShellFallbackAllowed: false,
  };
}
