export const SITE_CONTINUITY_BINDING_SCHEMA: 'narada.site_continuity_binding.v1';
export const SITE_CONTINUITY_DECISION_SCHEMA: 'narada.site_continuity_decision.v1';
export const SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA: 'narada.site_continuity_exchange_packet.v1';
export const SITE_CONTINUITY_CLASSIFIER_VERSION: 'site_continuity.v1';

export const SITE_CONTINUITY_EMBODIMENT_KINDS: Readonly<{
  CLOUDFLARE_CARRIER: 'cloudflare_carrier';
  LOCAL_WINDOWS: 'local_windows';
  AGENT_CLI: 'agent_cli';
  AGENT_TUI: 'agent_tui';
  OPERATOR_DASHBOARD: 'operator_dashboard';
}>;

export const SITE_CONTINUITY_RELATION_KINDS: Readonly<{
  SAME_SITE_EMBODIMENT: 'same_site_embodiment';
}>;

export const SITE_CONTINUITY_EXCHANGE_CLASSES: Readonly<{
  SITE_IDENTITY_BINDING: 'site_identity_binding';
  AUTHORITY_MAP_PROJECTION: 'authority_map_projection';
  READ_MODEL_PROJECTION: 'read_model_projection';
  MUTATION_EVIDENCE_REFERENCE: 'mutation_evidence_reference';
  CROSS_EMBODIMENT_MUTATION_EXECUTION: 'cross_embodiment_mutation_execution';
}>;

export const SITE_CONTINUITY_ACTIONS: Readonly<{
  ADMIT: 'admit';
  REFUSE: 'refuse';
  PROJECTION_ONLY: 'projection_only';
  EVIDENCE_ONLY: 'evidence_only';
}>;

export type SiteContinuityEmbodimentKind = typeof SITE_CONTINUITY_EMBODIMENT_KINDS[keyof typeof SITE_CONTINUITY_EMBODIMENT_KINDS];
export type SiteContinuityRelationKind = typeof SITE_CONTINUITY_RELATION_KINDS[keyof typeof SITE_CONTINUITY_RELATION_KINDS];
export type SiteContinuityExchangeClass = typeof SITE_CONTINUITY_EXCHANGE_CLASSES[keyof typeof SITE_CONTINUITY_EXCHANGE_CLASSES];
export type SiteContinuityAction = typeof SITE_CONTINUITY_ACTIONS[keyof typeof SITE_CONTINUITY_ACTIONS];

export interface SiteContinuityEmbodiment {
  embodiment_kind: SiteContinuityEmbodimentKind;
  site_ref: string;
  authority_locus: string;
}

export interface SiteContinuityProjectionRef {
  projection_class: string;
  source_cursor: string;
  freshness?: string;
  ref?: string;
  summary?: string;
}

export interface SiteContinuityEvidenceRef {
  evidence_ref: string;
  authority_locus: string;
  mutation_class?: string;
  summary?: string;
}

export interface SiteContinuityExecutableMutationRequest {
  mutation_class: string;
  requested_authority_locus?: string;
  summary?: string;
}

export interface SiteContinuityExchangePacket {
  schema: typeof SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA;
  classifier_version: typeof SITE_CONTINUITY_CLASSIFIER_VERSION;
  packet_id: string;
  site_id: string | null;
  relation_id: string | null;
  relation_kind: string | null;
  source_embodiment_kind: string;
  target_embodiment_kind: string;
  binding: SiteContinuityBinding;
  decisions: SiteContinuityDecision[];
  projections: SiteContinuityProjectionRef[];
  evidence_refs: SiteContinuityEvidenceRef[];
  executable_mutation_requests: SiteContinuityExecutableMutationRequest[];
  generated_at: string | null;
}

export interface CreateSiteContinuityExchangePacketInput {
  binding: SiteContinuityBinding;
  source_embodiment_kind: SiteContinuityEmbodimentKind | string;
  target_embodiment_kind: SiteContinuityEmbodimentKind | string;
  decisions?: SiteContinuityDecision[];
  projections?: SiteContinuityProjectionRef[];
  evidence_refs?: SiteContinuityEvidenceRef[];
  executable_mutation_requests?: SiteContinuityExecutableMutationRequest[];
  generated_at?: string | null;
}

export interface SiteContinuityBinding {
  schema: typeof SITE_CONTINUITY_BINDING_SCHEMA;
  classifier_version: typeof SITE_CONTINUITY_CLASSIFIER_VERSION;
  site_id: string;
  relation_kind: SiteContinuityRelationKind;
  relation_id: string;
  authority_map_ref: string | null;
  generated_at: string | null;
  embodiments: SiteContinuityEmbodiment[];
}

export interface CreateSiteContinuityBindingInput {
  site_id?: string;
  relation_id?: string | null;
  local_windows_site_ref?: string;
  cloudflare_site_ref?: string;
  local_windows_authority_locus?: string;
  cloudflare_authority_locus?: string;
  authority_map_ref?: string | null;
  generated_at?: string | null;
}

export interface SiteContinuityExchangeRequest {
  site_id?: string;
  exchange_class?: SiteContinuityExchangeClass | string;
  source_embodiment_kind?: SiteContinuityEmbodimentKind | string;
  target_embodiment_kind?: SiteContinuityEmbodimentKind | string;
}

export interface SiteContinuityDecision {
  schema: typeof SITE_CONTINUITY_DECISION_SCHEMA;
  classifier_version: typeof SITE_CONTINUITY_CLASSIFIER_VERSION;
  action: SiteContinuityAction;
  reason: string;
  exchange_class: string;
  source_embodiment_kind: string;
  target_embodiment_kind: string;
  site_id: string | null;
  relation_id: string | null;
  relation_kind: string | null;
  source_authority_locus: string | null;
  target_authority_locus: string | null;
  evidence_required: string[];
  confirmation_required: string[];
  validation_errors: string[];
}

export interface SiteContinuityValidationResult {
  ok: boolean;
  errors: string[];
}

export function createSiteContinuityBinding(input?: CreateSiteContinuityBindingInput): SiteContinuityBinding;
export function validateSiteContinuityBinding(binding: unknown): SiteContinuityValidationResult;
export function classifySiteContinuityExchange(binding: SiteContinuityBinding, request?: SiteContinuityExchangeRequest): SiteContinuityDecision;
export function createSiteContinuityExchangePacket(input: CreateSiteContinuityExchangePacketInput): SiteContinuityExchangePacket;
export function createSiteContinuityPacketId(packet: Partial<SiteContinuityExchangePacket>): string;
export function validateSiteContinuityExchangePacket(packet: unknown): SiteContinuityValidationResult;
export function classifySiteContinuityExchangePacket(packet: SiteContinuityExchangePacket): SiteContinuityDecision;
