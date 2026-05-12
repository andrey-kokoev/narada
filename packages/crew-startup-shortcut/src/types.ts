export type JsonObject = Record<string, unknown>;

export type CrewStartupTriggerKind =
  | 'operator_requested_startup'
  | 'resume_continuity'
  | 'workboard_hydration';

export type CrewStartupTargetLocus =
  | 'narada_proper'
  | 'user_site'
  | 'project_site'
  | 'client_site'
  | 'pc_site';

export interface DeniedImportFinding {
  path: string;
  reason: string;
}

export interface CrewStartupMcpSurfaceRequirement {
  surfaceId: string;
  tools: string[];
  required: true;
}

export interface CrewStartupShortcutRequest {
  schema: 'narada.crew_startup_shortcut.request.v0';
  requestId: string;
  trigger: CrewStartupTriggerKind;
  targetLocus: CrewStartupTargetLocus;
  targetSiteId: string;
  requestedBy: string;
  roleNames: string[];
  namedAgentIds: string[];
  mcpOnly: true;
  directNativeShortcutRequested?: boolean;
  sourceRefs?: string[];
  sourcePaths?: string[];
  requiredMcpSurfaces: CrewStartupMcpSurfaceRequirement[];
  workboardEvidenceRefs: string[];
  hydrationEvidenceRefs: string[];
}

export interface CrewStartupShortcutPlan {
  schema: 'narada.crew_startup_shortcut.plan.v0';
  requestId: string;
  status: 'planned';
  exposureClass: 'descriptor_only';
  targetLocus: CrewStartupTargetLocus;
  targetSiteId: string;
  mcpOnly: true;
  startupSteps: Array<{
    step: string;
    posture: 'descriptor_only' | 'requires_local_admission';
  }>;
  requiredMcpSurfaces: CrewStartupMcpSurfaceRequirement[];
  requiredLocalAdmissions: string[];
  evidenceRefs: string[];
  sourceImportFindings: DeniedImportFinding[];
  packageExecutedLaunch: false;
  packageMutatedPcState: false;
  nativeShellFallbackAllowed: false;
}

export interface CrewStartupShortcutRefusal {
  schema: 'narada.crew_startup_shortcut.refusal.v0';
  requestId: string;
  status: 'refused';
  reasons: string[];
  sourceImportFindings: DeniedImportFinding[];
  missingMcpSurfaces: string[];
  requiredBehavior: 'stop_and_report_missing_mcp_capability';
  packageExecutedLaunch: false;
  nativeShellFallbackAllowed: false;
}
