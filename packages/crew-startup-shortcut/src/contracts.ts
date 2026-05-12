import {
  findDeniedSourceImports,
} from './import-refusal.js';
import type {
  CrewStartupShortcutPlan,
  CrewStartupShortcutRefusal,
  CrewStartupShortcutRequest,
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
