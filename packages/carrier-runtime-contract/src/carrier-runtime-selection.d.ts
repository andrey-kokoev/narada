export const AGENT_CLI_CARRIER_KIND: 'agent-cli';
export const NARADA_AGENT_RUNTIME_SERVER_KIND: 'narada-agent-runtime-server';
export const NARADA_AGENT_RUNTIME_SERVER_ALIAS: 'nars';
export const ADMITTED_CARRIER_KINDS: readonly string[];
export const ADMITTED_OPERATOR_SURFACE_KINDS: readonly string[];

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
  schema: 'narada.carrier_runtime_selection.v1';
  status: 'accepted';
  operator_surface_kind: string;
  runtime_host_kind: string;
  carrier_kind: string;
  runtime_substrate_kind: string;
  runtime_contract_schema?: string;
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
  candidate_operator_surface_kind?: string;
  admitted_runtime_substrate_kinds?: string[];
  admitted_carrier_kinds?: string[];
  admitted_operator_surface_kinds?: string[];
  reason: string;
  required_next_step: string;
}

export type CarrierRuntimeSelection = AcceptedCarrierRuntimeSelection | RefusedCarrierRuntimeSelection;

export function defaultRuntimeForCarrier(carrierKind: string): string;
export function normalizeRuntimeAlias(value: unknown): string;
export function carrierRefusal(candidate: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function operatorSurfaceRefusal(candidate: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function runtimeRefusal(candidate: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function normalizeRuntimeSubstrateKind(value: unknown, options?: Record<string, unknown>): Record<string, unknown>;
export function resolveCarrierRuntimeSelection(options?: RuntimeSelectionOptions): CarrierRuntimeSelection;
