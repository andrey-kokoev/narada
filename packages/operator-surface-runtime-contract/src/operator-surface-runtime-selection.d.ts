export const AGENT_CLI_OPERATOR_SURFACE_KIND: 'agent-cli';
export const NARADA_AGENT_RUNTIME_SERVER_KIND: 'narada-agent-runtime-server';
export const NARADA_AGENT_RUNTIME_SERVER_ALIAS: 'nars';
export const OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA: 'narada.carrier_launch_matrix.v3';
export const ADMITTED_LAUNCH_SELECTION_KINDS: readonly string[];
export const ADMITTED_RUNTIME_SUBSTRATE_KINDS: readonly string[];
export const ADMITTED_OPERATOR_SURFACE_KINDS: readonly string[];
export const ADMITTED_RUNTIME_IMPLEMENTATION_KINDS: readonly string[];
export const ADMITTED_TOOL_FABRIC_ADAPTER_KINDS: readonly string[];
export const OPERATOR_SURFACE_RUNTIME_SELECTION_SCHEMA: 'narada.operator_surface_runtime_selection.v1';
export const LEGACY_CARRIER_RUNTIME_SELECTION_SCHEMA: 'narada.carrier_runtime_selection.v1';
export const OPERATOR_SURFACE_RUNTIME_COMPATIBILITY_SCHEMA: 'narada.operator_surface_runtime_compatibility.v1';
export const CARRIER_COMPATIBILITY_POLICY: {
  readonly schema: 'narada.operator_surface_runtime_compatibility.v1';
  readonly status: 'transitional';
  readonly canonical_selection_field: 'operator_surface';
  readonly canonical_runtime_field: 'runtime';
  readonly legacy_selection_field: 'carrier';
  readonly retirement: string;
};

export interface CarrierConformanceProfile {
  evidence_level: 'code_enforced' | 'config_enforced' | 'startup_enforced' | 'documented_advisory' | 'unverified';
  default_intelligence_auth_path: string;
  mcp_fabric_source: string;
  native_shell_posture: string;
  mutating_call_handling: string;
  startup_sequence_availability: string;
  known_gaps: readonly string[];
}

export interface CarrierLaunchMatrixRow {
  launch_selection_kind: string;
  operator_surface_kind: string;
  carrier_implementation_kind: string;
  runtime_host_kind: string;
  runtime_substrate_kind: string;
  tool_fabric_adapter_kind: string;
  tool_fabric_source: string;
  adapter_entrypoint: string | null;
  projection_capabilities: readonly string[];
  conformance: CarrierConformanceProfile;
  expected_tools: readonly string[];
  expected_tools_scope: 'sentinel' | 'none';
  states: readonly string[];
  admission_basis?: string;
}

export interface RuntimeSelectionOptions {
  carrierValue?: string | null;
  operatorSurfaceValue?: string | null;
  runtimeValue?: string | null;
  admittedRuntimeSubstrateKinds?: readonly string[];
  runtimeContractSchema?: string;
  admittedCarrierKinds?: readonly string[];
  admittedOperatorSurfaceKinds?: readonly string[];
}

export interface AcceptedCarrierRuntimeSelection {
  schema: 'narada.operator_surface_runtime_selection.v1';
  legacy_schema: 'narada.carrier_runtime_selection.v1';
  status: 'accepted';
  operator_surface_kind: string;
  runtime_host_kind: string;
  launch_operator_surface_kind: string;
  launch_selection_kind: string;
  carrier_kind: string;
  carrier_implementation_kind: string;
  runtime_substrate_kind: string;
  runtime_contract_schema?: string;
  compatibility: typeof CARRIER_COMPATIBILITY_POLICY;
  operator_surface_source_field: 'operator_surface' | 'carrier' | 'derived';
  carrier_source_field: 'carrier' | 'operator_surface' | 'derived';
  runtime_source_field: 'runtime' | 'derived';
}

export interface RefusedCarrierRuntimeSelection {
  schema?: string;
  status: 'refused';
  reason_code: string;
  candidate_runtime_substrate_kind?: string;
  candidate_carrier_kind?: string;
  candidate_launch_selection_kind?: string;
  candidate_operator_surface_kind?: string;
  admitted_runtime_substrate_kinds?: string[];
  admitted_carrier_kinds?: string[];
  admitted_operator_surface_kinds?: string[];
  reason: string;
  required_next_step: string;
}

export type CarrierRuntimeSelection = AcceptedCarrierRuntimeSelection | RefusedCarrierRuntimeSelection;

export function operatorSurfaceLaunchMatrixRow(launchSelectionKind: string): CarrierLaunchMatrixRow | null;
export function operatorSurfaceKindsForRuntimeHost(runtimeHostKind: string): readonly string[];
export function operatorSurfaceKindsForProjectionCapability(capability: string): readonly string[];
export function defaultRuntimeForOperatorSurface(launchSelectionKind: string): string;
export function normalizeRuntimeAlias(value: unknown): string;
export function carrierRefusal(candidate: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function operatorSurfaceRefusal(candidate: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function runtimeRefusal(candidate: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function normalizeRuntimeSubstrateKind(value: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function resolveOperatorSurfaceRuntimeSelection(options?: RuntimeSelectionOptions): CarrierRuntimeSelection;
