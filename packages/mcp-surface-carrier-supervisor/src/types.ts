export type McpSurfaceCarrierLifecycleState =
  | 'stale'
  | 'restart_requested'
  | 'carrier_restarted'
  | 'live_verified';

export type McpSupervisorExposureClass = 'read_only';

export type CapabilityLifecycleState =
  | 'observed'
  | 'named'
  | 'designed'
  | 'implemented'
  | 'cataloged'
  | 'mcp_exposed'
  | 'admitted'
  | 'trialed'
  | 'in_use'
  | 'blocked';

export type DeniedSupervisorAction =
  | 'process_kill'
  | 'stdio_self_restart'
  | 'direct_native_shell_path_refused'
  | 'live_carrier_restart'
  | 'live_rebind'
  | 'runtime_registry_mutation';

export interface SiteAuthorityRef {
  siteId: string;
  authorityRoot?: string;
  authorityEvidenceRefs: string[];
}

export interface McpProcessDescriptor {
  surfaceId: string;
  transport: 'stdio' | 'http' | 'other';
  processIdentity?: string;
  sourceVersionRef?: string;
  baselineVersionRef?: string;
}

export interface CarrierSessionDescriptor {
  carrierId: string;
  sessionId?: string;
  status: 'unknown' | 'bound' | 'restarted' | 'stale';
  evidenceRefs: string[];
}

export interface RuntimeRegistryObservation {
  registryId: string;
  surfaceRegistered: boolean;
  mcpExposed: boolean;
  evidenceRefs: string[];
}

export interface RestartRequestDescriptor {
  requestId: string;
  reason: string;
  requestedAt?: string;
  evidenceRefs: string[];
  executed: false;
}

export interface VerificationDescriptor {
  kind: 'smoke_call' | 'registry_probe' | 'descriptor_check';
  live: boolean;
  checkedAt?: string;
  evidenceRefs: string[];
}

export interface CapabilityLifecycleProjection {
  capabilityId: string;
  state: CapabilityLifecycleState;
  exposureClass: McpSupervisorExposureClass;
  previousState?: CapabilityLifecycleState;
}

export interface McpSurfaceCarrierStatusInput {
  siteAuthority: SiteAuthorityRef;
  mcpProcess: McpProcessDescriptor;
  carrierSession: CarrierSessionDescriptor;
  runtimeRegistry: RuntimeRegistryObservation;
  capability: CapabilityLifecycleProjection;
  previousLifecycleState?: McpSurfaceCarrierLifecycleState;
  restartRequest?: RestartRequestDescriptor;
  verification?: VerificationDescriptor;
  sourceNewerThanBaseline?: boolean;
  deniedActionsRequested?: DeniedSupervisorAction[];
  sourcePaths?: string[];
}

export interface DeniedSupervisorInputFinding {
  path: string;
  reason:
    | 'legacy user-site runtime registry import'
    | 'PC-locus state import'
    | 'operator-surface runtime copying'
    | 'source Site MCP runtime import'
    | 'secret or credential material';
}

export interface McpSurfaceCarrierStatusResult {
  schema: 'narada.mcp_surface_carrier_supervisor.status.v0';
  surfaceId: string;
  lifecycleState: McpSurfaceCarrierLifecycleState;
  previousLifecycleState?: McpSurfaceCarrierLifecycleState;
  lifecycleTransition?: {
    from: McpSurfaceCarrierLifecycleState;
    to: McpSurfaceCarrierLifecycleState;
  };
  exposureClass: McpSupervisorExposureClass;
  siteAuthority: SiteAuthorityRef;
  mcpProcess: McpProcessDescriptor;
  carrierSession: CarrierSessionDescriptor;
  runtimeRegistry: RuntimeRegistryObservation;
  capability: CapabilityLifecycleProjection;
  capabilityTransition?: {
    from: CapabilityLifecycleState;
    to: CapabilityLifecycleState;
  };
  restartRequest?: RestartRequestDescriptor;
  verification?: VerificationDescriptor;
  reasons: string[];
  deniedInputFindings: DeniedSupervisorInputFinding[];
  deniedActionsRequested: DeniedSupervisorAction[];
  packageKilledProcess: false;
  packageRestartedCarrier: false;
  packageReboundSurface: false;
  packageMutatedRuntimeRegistry: false;
  stdioSelfRestartAllowed: false;
  nativeShellFallbackAllowed: false;
}
