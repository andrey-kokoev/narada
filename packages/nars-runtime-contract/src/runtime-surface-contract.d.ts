import {
  NARS_AUTHORITY_RUNTIME_HOST_KINDS,
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';

export const NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA: 'narada.nars.runtime_surface_contract.v1';
export const NARS_RUNTIME_ORIGINS: readonly ['local', 'cloudflare'];
export const NARS_SURFACE_ORIGINS: readonly ['local', 'cloudflare'];
export const NARS_RUNTIME_SURFACE_QUADRANT_IDS: readonly ['local/local', 'local/cloudflare', 'cloudflare/local', 'cloudflare/cloudflare'];
export const NARS_RUNTIME_EVIDENCE_CLASSES: readonly ['genuine', 'projected', 'synthetic'];
export const NARS_AUTHORITY_CANONICITY: readonly ['canonical', 'synthetic_canonical'];
export const NARS_PROJECTION_POSTURES: readonly ['non_canonical_projection', 'synthetic_authority'];
export const NARS_PROJECTION_ROUTE_KINDS: readonly ['projection_edge', 'intent_route'];
export const NARS_CAPABILITY_STATES: readonly ['absent', 'declared', 'present'];
export const NARS_CLOUDFLARE_NATIVE_MCP_STATES: readonly ['absent', 'fabric_summary'];
export const NARS_CLOUDFLARE_HARD_ABSENT_CAPABILITIES: readonly ['local_tool_execution', 'local_mcp', 'local_filesystem_authority', 'local_artifact_authority'];
export const NARS_CLOUDFLARE_GRADUABLE_CAPABILITIES: readonly ['provider_execution'];
export const NARS_CROSSING_AUTHORITY_OWNERS: readonly ['local', 'cloudflare-host'];

export {
  NARS_AUTHORITY_RUNTIME_HOST_KINDS,
  NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES,
  NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS,
} from '@narada2/carrier-protocol';

export type NarsRuntimeOrigin = 'local' | 'cloudflare';
export type NarsSurfaceOrigin = 'local' | 'cloudflare';
export type NarsRuntimeSurfaceQuadrantId = 'local/local' | 'local/cloudflare' | 'cloudflare/local' | 'cloudflare/cloudflare';
export type NarsRuntimeEvidenceClass = 'genuine' | 'projected' | 'synthetic';
export type NarsAuthorityCanonicity = 'canonical' | 'synthetic_canonical';
export type NarsProjectionPosture = 'non_canonical_projection' | 'synthetic_authority';
export type NarsProjectionRouteKind = 'projection_edge' | 'intent_route';
export type NarsCapabilityState = 'absent' | 'declared' | 'present';

export interface NarsCapabilityEvidenceEntry {
  state: NarsCapabilityState;
  evidence_ref: string;
  graduated_at: string | null;
}

export type NarsCapabilityEvidence = Record<string, NarsCapabilityEvidenceEntry>;

export interface NarsCapabilityProfile {
  provider_execution: NarsCapabilityState;
  local_tool_execution: NarsCapabilityState;
  local_mcp: NarsCapabilityState;
  local_filesystem_authority: NarsCapabilityState;
  local_artifact_authority: NarsCapabilityState;
  cloudflare_native_mcp: 'absent' | 'fabric_summary';
  replay: 'present';
  input_admission: 'present';
  revocation: 'present';
}

export interface NarsRuntimeSurfaceCrossing {
  source_zone: string;
  destination_zone: string;
  authority_owner: 'local' | 'cloudflare-host';
  admissibility_regime: string;
  crossing_artifact: string;
  confirmation_rule: string;
  anti_collapse_invariant: string;
}

export const NARS_RUNTIME_SURFACE_CROSSINGS: Readonly<Record<NarsRuntimeSurfaceQuadrantId, NarsRuntimeSurfaceCrossing>>;

export interface NarsRuntimeSurfaceQuadrantExpectation {
  quadrant: NarsRuntimeSurfaceQuadrantId;
  runtime_origin: NarsRuntimeOrigin;
  surface_origin: NarsSurfaceOrigin;
  authority_runtime_host: 'local' | 'cloudflare-host';
  canonicity: NarsAuthorityCanonicity;
  projection_posture: NarsProjectionPosture | null;
  evidence_class: NarsRuntimeEvidenceClass;
}

export const NARS_RUNTIME_SURFACE_QUADRANTS: Readonly<Record<NarsRuntimeSurfaceQuadrantId, NarsRuntimeSurfaceQuadrantExpectation>>;

export interface NarsRuntimeSurfaceAuthority {
  authority_runtime_host: 'local' | 'cloudflare-host' | null;
  authority_epoch: number | null;
  authority_runtime_id: string | null;
  canonicity: NarsAuthorityCanonicity | null;
  authority_transition_state: string | null;
  source_write_admission: string | null;
}

export interface NarsRuntimeSurfaceProjection {
  projection_id: string | null;
  authority_session_id: string | null;
  route_kind: NarsProjectionRouteKind | null;
  posture: NarsProjectionPosture | null;
}

export interface NarsRuntimeSurfaceContract {
  schema: typeof NARS_RUNTIME_SURFACE_CONTRACT_SCHEMA;
  runtime_origin: NarsRuntimeOrigin | null;
  surface_origin: NarsSurfaceOrigin | null;
  quadrant: NarsRuntimeSurfaceQuadrantId | null;
  evidence_class: NarsRuntimeEvidenceClass | null;
  authority: NarsRuntimeSurfaceAuthority;
  projection: NarsRuntimeSurfaceProjection | null;
  crossing: NarsRuntimeSurfaceCrossing | null;
  capability_profile: NarsCapabilityProfile;
  capability_evidence: NarsCapabilityEvidence | null;
  generated_at: string;
}

export interface NarsRuntimeSurfaceContractViolation {
  path: string;
  code: string;
  detail: string;
}

export interface NarsRuntimeSurfaceContractValidation {
  ok: boolean;
  violations: NarsRuntimeSurfaceContractViolation[];
}

export function runtimeOriginFromAuthorityHost(authorityRuntimeHost: unknown): NarsRuntimeOrigin | null;
export function deriveNarsRuntimeQuadrant(runtimeOrigin: unknown, surfaceOrigin: unknown): NarsRuntimeSurfaceQuadrantId | null;
export function buildNarsCapabilityProfile(runtimeOrigin: NarsRuntimeOrigin, overrides?: Partial<NarsCapabilityProfile>): NarsCapabilityProfile;
export function buildNarsRuntimeSurfaceContract(input?: {
  runtime_origin?: NarsRuntimeOrigin;
  surface_origin?: NarsSurfaceOrigin;
  authority?: Partial<NarsRuntimeSurfaceAuthority>;
  projection?: Partial<NarsRuntimeSurfaceProjection> | null;
  capability_profile?: NarsCapabilityProfile | null;
  capability_evidence?: NarsCapabilityEvidence | null;
  crossing?: NarsRuntimeSurfaceCrossing | null;
  generated_at?: string | null;
}): NarsRuntimeSurfaceContract;
export function validateNarsRuntimeSurfaceContract(candidate: unknown): NarsRuntimeSurfaceContractValidation;
