export type SiteLocusType = 'client_service' | 'project' | 'project_ops' | 'pc_locus' | 'user_site' | 'unknown';

export interface SiteCapabilityEdge {
  from: string;
  to: string;
  capability: string;
  status: 'available' | 'observed' | 'planned' | 'blocked';
  basis: 'local_registry_awareness' | 'operator_pinned' | 'target_evidence' | 'probe_observed';
  evidence_refs?: string[];
}

export interface SiteCapabilityDenial {
  from: string;
  to: string;
  capability: string;
  status: 'not_granted';
  basis: 'local_site_registry_non_grant' | 'target_evidence' | 'operator_pinned';
  evidence_refs?: string[];
}

export type SiteInboxLocationKind =
  | 'local_inbox'
  | 'file_drop'
  | 'http_poll'
  | 'cloudflare_worker'
  | 'site_pubsub'
  | 'disabled';

export interface SiteInboxLocationDeclaration {
  id: string;
  kind: SiteInboxLocationKind;
  enabled: boolean;
  target_site_id: string;
  endpoint?: string;
  health_endpoint?: string;
  auth_capability_ref?: string;
  poll_path?: string;
  accepted_message_schemas?: string[];
  evidence_refs?: string[];
  authority_limits: string[];
}

export interface SiteInboxLocationCheckConfig {
  schema: 'narada.site_config.inbox_location_check.v0';
  check_remote_inbox_locations: boolean;
  inbox_locations: SiteInboxLocationDeclaration[];
}

export interface KnownSiteRegistryEntry {
  site_id: string;
  locus_type: SiteLocusType;
  roots: Record<string, string>;
  authority_boundaries: {
    user_site: string[];
    not_granted_by_awareness: string[];
    [owner: string]: string[];
  };
  capability_edges: SiteCapabilityEdge[];
  capability_denials: SiteCapabilityDenial[];
  sync_posture: string;
  capabilities: string[];
  inbox_endpoint: { status: string };
  task_lifecycle: { status: string };
  mcp_access: { status: string };
  inbox_location_check?: SiteInboxLocationCheckConfig;
  freshness: Record<string, unknown>;
  health: { status: string; note?: string };
  blockers: string[];
  evidence_refs: string[];
}

export interface SiteRegistryValidationResult {
  schema: 'narada.site_config.registry_validation.v0';
  status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  config_mutated: false;
  target_authority_granted: false;
}

export interface RegisteredSiteProbeRequest {
  schema: 'narada.site_config.registered_site_probe_request.v0';
  site_id?: string;
  root?: string;
  authority_basis?: {
    kind: 'operator_direct_instruction' | 'local_registry_entry';
    summary: string;
  };
  target_mutation_requested?: boolean;
  arbitrary_scan_requested?: boolean;
  runtime_state_import_requested?: boolean;
  credentials_requested?: boolean;
}

export interface RegisteredSiteProbeReport {
  schema: 'narada.registered_site.probe_report.v0';
  status: 'ok' | 'blocked' | 'refused';
  site_id: string;
  root: string;
  registration_status:
    | 'registered_local_site_registry'
    | 'operator_explicit_unregistered_root'
    | 'refused_unregistered_root';
  current_state: KnownSiteRegistryEntry;
  readable_surfaces: string[];
  missing_surfaces: string[];
  blockers: string[];
  recommended_next_actions: string[];
  evidence_refs: string[];
  read_only: true;
  target_mutated: false;
  arbitrary_client_files_scanned: false;
  source_state_imported: false;
}

export interface RegisteredSiteProbeDecision {
  schema: 'narada.site_config.registered_site_probe_decision.v0';
  status: 'planned_descriptor' | 'refused';
  refusals: string[];
  warnings: string[];
  descriptor_only: true;
  target_mutated: false;
  arbitrary_client_files_scanned: false;
  source_state_imported: false;
}

export interface SiteInboxLocationCheckDecision {
  schema: 'narada.site_config.inbox_location_check_decision.v0';
  status: 'enabled' | 'disabled' | 'invalid';
  check_remote_inbox_locations: boolean;
  locations_to_check: SiteInboxLocationDeclaration[];
  errors: string[];
  warnings: string[];
  target_mutated: false;
  remote_inbox_authority_granted: false;
}

export type SiteTelemetryDestinationKind =
  | 'local_file'
  | 'sqlite_table'
  | 'inbox_envelope'
  | 'operator_surface'
  | 'webhook'
  | 'cloudflare_worker'
  | 'disabled';

export type SiteTelemetryTransportKind =
  | 'local_append'
  | 'sqlite_insert'
  | 'operator_surface_projection'
  | 'bearer_https_post'
  | 'site_pubsub_signal'
  | 'none';

export interface SiteTelemetryDestination {
  id: string;
  kind: SiteTelemetryDestinationKind;
  enabled: boolean;
  scope: string;
  accepted_event_families: string[];
  redaction_bounds: string[];
  output_bounds: { max_bytes: number; raw_values_excluded: true };
  retention_posture: string;
  freshness_posture: string;
  transport: { kind: SiteTelemetryTransportKind; capability_ref?: string; url?: string; health_url?: string };
  storage_posture: string;
  authority_limits: string[];
}

export interface SiteTelemetryConfig {
  schema: 'narada.site_config.telemetry.v0';
  enable_telemetry: boolean;
  telemetry_destinations: SiteTelemetryDestination[];
}

export interface AgentIdentityTelemetry {
  schema: 'narada.telemetry.agent_identity.v0';
  agent_id: string;
  durable_identity_ref: string;
  carrier_kind: string;
  carrier_session_id: string;
  runtime_locus: string;
  heartbeat_freshness: string;
  current_governed_work_posture: string;
  last_governed_action_ref?: string;
  projected_capability_refs: string[];
  grant_refs: string[];
  health_status: string;
  raw_transcript_recorded: false;
  raw_secret_values_recorded: false;
  assigns_work: false;
  grants_capability: false;
  certifies_identity: false;
  admits_inbox_or_task_state: false;
}

export interface SiteTelemetryDecision {
  schema: 'narada.site_config.telemetry_decision.v0';
  status: 'enabled' | 'disabled' | 'invalid';
  destinations_to_project: SiteTelemetryDestination[];
  errors: string[];
  warnings: string[];
  config_mutated: false;
  telemetry_is_authority: false;
}

export type SiteRegistryProjectionStatus = 'registered' | 'observed' | 'candidate' | 'unknown' | 'refused';
export type SiteProjectionFreshness = 'fresh' | 'stale' | 'missing' | 'failing' | 'unknown';
export type SiteEventFamily =
  | 'site_health'
  | 'site_inbox'
  | 'agent_session'
  | 'task_work'
  | 'attention'
  | 'report'
  | 'site_registry';

export interface SiteEndpointPosture {
  kind: 'none' | 'local_file' | 'local_sqlite' | 'http_webhook' | 'cloudflare_worker' | 'site_pubsub';
  status: 'available' | 'disabled' | 'missing' | 'unknown';
  url?: string;
  capability_ref?: string;
  accepted_event_families?: SiteEventFamily[];
}

export interface SiteRegistryProjectionSite {
  site_id: string;
  locus_type: SiteLocusType;
  substrate: 'windows' | 'wsl' | 'linux' | 'cloudflare' | 'local_filesystem' | 'unknown';
  registry_status: SiteRegistryProjectionStatus;
  relation: string;
  freshness: SiteProjectionFreshness;
  health: { status: string; observed_at?: string; evidence_refs: string[] };
  event_endpoint: SiteEndpointPosture;
  inbox_message_endpoint: SiteEndpointPosture;
  capabilities: string[];
  authority_limits: string[];
}

export interface SiteRegistryProjectionContract {
  schema: 'narada.site_config.site_registry_projection.v0';
  projection_id: string;
  generated_at: string;
  sites: SiteRegistryProjectionSite[];
  source_evidence_refs: string[];
  projection_is_authority: false;
  registry_mutates_sites: false;
}

export interface SiteEventEnvelope {
  schema: 'narada.site_event.envelope.v0';
  event_id: string;
  idempotency_key: string;
  source_site_id: string;
  subject_site_id?: string;
  target_site_id?: string;
  family: SiteEventFamily;
  type: string;
  observed_at: string;
  sent_at: string;
  auth: {
    kind: 'bearer_capability_ref' | 'signed_envelope' | 'none';
    capability_ref?: string;
    authenticated: boolean;
  };
  payload_bounds: { max_bytes: number; raw_values_excluded: true };
  payload_summary: Record<string, unknown>;
  authority_limits: string[];
}

export type SiteTelemetryEventContractSchema =
  | 'narada.site_event.envelope.v0'
  | 'narada.site_telemetry.event.v0';

export interface SiteTelemetryEventFreshness {
  status: SiteProjectionFreshness;
  stale_after_ms?: number;
  computed_by_receiver: boolean;
}

export interface SiteTelemetryEventProvenance {
  publisher_runtime?: string;
  source_command_family?: string;
  projection_only: true;
  [key: string]: unknown;
}

export interface SiteTelemetryEventContract extends Omit<SiteEventEnvelope, 'schema'> {
  schema: SiteTelemetryEventContractSchema;
  publication_edge_id?: string;
  surface_id?: string;
  freshness?: SiteTelemetryEventFreshness;
  evidence_refs?: string[];
  provenance?: SiteTelemetryEventProvenance;
}

export interface SiteTelemetryEventValidationResult {
  schema: 'narada.site_telemetry.event_validation.v0';
  status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  compatible_site_event_envelope: boolean;
  raw_values_accepted: false;
  event?: SiteTelemetryEventContract;
}

export interface SiteTelemetryEventCompatibilityMap {
  schema: 'narada.site_telemetry.compatibility_map.v0';
  source_schema: 'narada.site_event.envelope.v0';
  target_schema: 'narada.site_telemetry.event.v0';
  runtime_status: 'specification_only';
  direct_fields: string[];
  computed_or_optional_fields: Array<{ field: string; source: string }>;
  future_fields_not_inferred: string[];
  compatibility_rules: string[];
  silent_widening_forbidden: true;
}

export type SiteTelemetryPublicationEdgeLifecycleState =
  | 'draft'
  | 'configured'
  | 'preflight_passed'
  | 'active'
  | 'blocked'
  | 'revoked'
  | 'rotating'
  | 'stale';

export interface SiteTelemetryPublicationEdge {
  schema: 'narada.site_telemetry.publication_edge.v0';
  edge_id: string;
  publisher_site_id: string;
  owning_site_id: string;
  surface_id: string;
  surface_endpoint: { kind: 'https' | 'local_file' | 'local_http'; url?: string; path?: string; health_url?: string };
  accepted_event_families: SiteEventFamily[];
  capability_refs: {
    publish?: string;
    read?: string;
    message_submit?: string;
    poll?: string;
    finalize?: string;
    admin?: string;
  };
  secret_resolver_policy: {
    resolver_ref: string;
    stores_raw_secret_values: false;
    edge_record_contains_raw_secret_values: false;
  };
  trust_posture: { status: string; basis: string };
  revocation_posture: { status: 'not_revoked' | 'revoked'; revoked_at?: string | null; revoked_by?: string | null };
  rotation_posture: {
    credential_ref_status: 'fresh' | 'stale' | 'missing' | 'revoked' | 'unknown';
    rotation_owner?: string;
    last_rotated_at?: string;
    next_review_due_at?: string;
  };
  lifecycle_state: SiteTelemetryPublicationEdgeLifecycleState;
  preflight_requirements: string[];
  authority_limits: string[];
  evidence_refs: string[];
}

export interface SiteTelemetryPublicationEdgeValidationResult {
  schema: 'narada.site_telemetry.publication_edge_validation.v0';
  status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  raw_secret_values_accepted: false;
  edge?: SiteTelemetryPublicationEdge;
}

export interface SiteTelemetryPublicationEdgePreflightCheck {
  name: string;
  status: 'pass' | 'fail';
  failure?: string;
}

export interface SiteTelemetryPublicationEdgePreflightResult {
  schema: 'narada.site_telemetry.publication_edge_preflight.v0';
  edge_id: string | null;
  status: 'pass' | 'fail';
  checked_at: string;
  checks: SiteTelemetryPublicationEdgePreflightCheck[];
  publish_allowed: boolean;
  network_publish_performed: false;
  raw_secret_values_recorded: false;
  authority_granted: false;
}

export interface SiteEventReceiverContract {
  schema: 'narada.site_event.receiver_contract.v0';
  receiver_id: string;
  accepted_event_families: SiteEventFamily[];
  known_site_ids: string[];
  max_payload_bytes: number;
  requires_authenticated_capability: boolean;
  authority_limits: string[];
}

export interface SiteEventReceiverDecision {
  schema: 'narada.site_event.receiver_decision.v0';
  status: 'accepted' | 'refused';
  event_id?: string;
  refusal_reasons: string[];
  projection_event_recorded: boolean;
  mutates_site_authority: false;
  admits_inbox_or_task_state: false;
  grants_capability: false;
}

export interface SiteProjectionReadModel {
  schema: 'narada.site_projection.read_model.v0';
  site_id: string;
  latest_health: { status: string; freshness: SiteProjectionFreshness; event_id?: string; observed_at?: string };
  inbox_availability: { status: string; freshness: SiteProjectionFreshness; event_id?: string };
  agent_session_posture: { status: string; freshness: SiteProjectionFreshness; event_id?: string };
  task_work_posture: { status: string; freshness: SiteProjectionFreshness; event_id?: string };
  attention_summary: { status: string; freshness: SiteProjectionFreshness; event_id?: string };
  report_summary: { status: string; freshness: SiteProjectionFreshness; event_id?: string };
  event_provenance: Array<{ event_id: string; source_site_id: string; family: SiteEventFamily; observed_at: string }>;
  projection_is_authority: false;
}

export interface SiteRegistryReadModelInputEvent {
  event_id: string;
  family: SiteEventFamily;
  source_site_id: string;
  subject_site_id?: string;
  target_site_id?: string;
  observed_at: string;
  payload_summary: Record<string, unknown>;
}

export interface SiteRegistryReadModelKnownSiteDescriptor {
  site_id: string;
  locus_type?: SiteLocusType;
  relation_posture?: string;
  authority_boundaries?: string[];
  capabilities_summary?: string[];
  capability_denials?: string[];
}

export interface SiteRegistryReadModelSite {
  site_id: string;
  locus_type: SiteLocusType;
  relation_posture: string;
  authority_boundaries: string[];
  advertised_surfaces: string[];
  telemetry_endpoints: string[];
  inbox_message_endpoints: string[];
  pubsub_posture: string;
  freshness: { status: SiteProjectionFreshness; latest_event_id?: string };
  health: { status: string; observed_at?: string };
  capabilities_summary: string[];
  capability_denials: string[];
  provenance: Array<{ event_id: string; family: SiteEventFamily }>;
  conflicts: Array<{ field: string; values: string[]; event_ids: string[] }>;
  read_model_authority_limits: string[];
}

export interface SiteRegistryReadModel {
  schema: 'narada.site_registry.read_model.v0';
  registry_id: string;
  owning_site_id: string;
  generated_at: string;
  sites: SiteRegistryReadModelSite[];
  source_event_refs: string[];
  authority_limits: string[];
  future_authority_substrate: {
    status: 'not_admitted';
    required_before_authority: string[];
  };
}

export type UserSiteAwarenessPosture = 'current' | 'stale' | 'conflicted' | 'unknown';

export interface UserSiteAwarenessFromRegistryEntry {
  site_id: string;
  locus_type: SiteLocusType;
  relation_posture: string;
  awareness_posture: UserSiteAwarenessPosture;
  route_candidates: {
    telemetry_endpoints: string[];
    inbox_message_endpoints: string[];
  };
  capabilities_visible: string[];
  denied_authority: string[];
  provenance: Array<{ event_id: string; family: SiteEventFamily }>;
  conflicts: Array<{ field: string; values: string[]; event_ids: string[] }>;
  advisory_authority_limits: string[];
}

export interface UserSiteAwarenessFromRegistry {
  schema: 'narada.user_site.awareness_from_registry.v0';
  user_site_id: string;
  source_registry_id: string;
  generated_at: string;
  entries: UserSiteAwarenessFromRegistryEntry[];
  source_event_refs: string[];
  advisory_only: true;
  mutates_known_sites: false;
  imports_remote_ownership: false;
  authority_limits: string[];
}

export interface HumanPeekSurfacePosture {
  schema: 'narada.site_projection.human_peek_surface.v0';
  surface_id: string;
  routes: string[];
  reads_projection_state: true;
  mutates_site: false;
  admits_inbox: false;
  mutates_task_lifecycle: false;
  certifies_identity: false;
  grants_capability: false;
  authority_limits: string[];
}

export interface StaccatoPublishedSurfacePattern {
  schema: 'narada.site_projection.staccato_pattern_map.v0';
  reusable_parts: string[];
  site_specific_parts: string[];
  source_evidence_refs: string[];
  projection_is_authority: false;
}

export function validateKnownSiteRegistryEntry(
  key: string,
  entry: KnownSiteRegistryEntry,
): SiteRegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entry.site_id !== key) errors.push('registered_site_id_mismatch');
  if (!entry.authority_boundaries?.user_site?.length) errors.push('registered_site_missing_user_site_boundary');
  if (!entry.authority_boundaries?.not_granted_by_awareness?.some((capability) => capability.includes('mutate'))) {
    errors.push('registered_site_missing_mutation_denial');
  }
  if (!entry.task_lifecycle?.status) errors.push('registered_site_missing_task_lifecycle_status');
  if (!entry.inbox_endpoint?.status) errors.push('registered_site_missing_inbox_endpoint_status');
  if (!entry.mcp_access?.status) errors.push('registered_site_missing_mcp_access_status');
  if (entry.inbox_location_check) {
    const decision = decideSiteInboxLocationChecks(entry.inbox_location_check);
    errors.push(...decision.errors);
    warnings.push(...decision.warnings);
  }
  if (!Array.isArray(entry.capability_edges)) errors.push('registered_site_missing_capability_edges');
  if (!Array.isArray(entry.capability_denials)) errors.push('registered_site_missing_capability_denials');
  for (const edge of entry.capability_edges ?? []) {
    if (!['local_registry_awareness', 'operator_pinned', 'target_evidence', 'probe_observed'].includes(edge.basis)) {
      errors.push('registered_site_bad_capability_basis');
    }
  }
  for (const denial of entry.capability_denials ?? []) {
    if (denial.status !== 'not_granted') errors.push('registered_site_bad_capability_denial_status');
  }
  if (entry.health?.status === 'root_known_not_inspected') warnings.push('registered_site_not_inspected');

  return {
    schema: 'narada.site_config.registry_validation.v0',
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
    warnings,
    config_mutated: false,
    target_authority_granted: false,
  };
}

export function buildSiteRegistryProjectionContract(input: {
  projection_id: string;
  generated_at: string;
  sites: SiteRegistryProjectionSite[];
  source_evidence_refs?: string[];
}): SiteRegistryProjectionContract {
  return {
    schema: 'narada.site_config.site_registry_projection.v0',
    projection_id: input.projection_id,
    generated_at: input.generated_at,
    sites: input.sites,
    source_evidence_refs: input.source_evidence_refs ?? [],
    projection_is_authority: false,
    registry_mutates_sites: false,
  };
}

export function siteProjectionEntryFromKnownSite(
  entry: KnownSiteRegistryEntry,
  input: {
    substrate?: SiteRegistryProjectionSite['substrate'];
    registry_status?: SiteRegistryProjectionStatus;
    relation?: string;
    event_endpoint?: SiteEndpointPosture;
    inbox_message_endpoint?: SiteEndpointPosture;
  } = {},
): SiteRegistryProjectionSite {
  return {
    site_id: entry.site_id,
    locus_type: entry.locus_type,
    substrate: input.substrate ?? 'unknown',
    registry_status: input.registry_status ?? 'registered',
    relation: input.relation ?? 'known_site',
    freshness: freshnessFromStatus(entry.health.status),
    health: {
      status: entry.health.status,
      observed_at: typeof entry.freshness.reviewed_at === 'string' ? entry.freshness.reviewed_at : undefined,
      evidence_refs: entry.evidence_refs,
    },
    event_endpoint: input.event_endpoint ?? { kind: 'none', status: 'missing' },
    inbox_message_endpoint: input.inbox_message_endpoint ?? { kind: 'none', status: 'missing' },
    capabilities: entry.capabilities,
    authority_limits: [
      'registry_projection_is_not_site_authority',
      'registry_projection_cannot_mutate_site_config',
      'registry_projection_cannot_admit_inbox_or_task_state',
      'registry_projection_cannot_grant_capability',
      ...entry.authority_boundaries.not_granted_by_awareness,
    ],
  };
}

export function decideSiteEventReceiver(
  contract: SiteEventReceiverContract,
  event: SiteEventEnvelope,
): SiteEventReceiverDecision {
  const refusalReasons: string[] = [];
  const subjectSiteId = event.subject_site_id ?? event.target_site_id ?? event.source_site_id;

  if (!event.event_id) refusalReasons.push('site_event_id_required');
  if (!event.idempotency_key) refusalReasons.push('site_event_idempotency_key_required');
  if (!contract.known_site_ids.includes(event.source_site_id)) refusalReasons.push('site_event_source_unknown');
  if (!contract.known_site_ids.includes(subjectSiteId)) refusalReasons.push('site_event_subject_unknown');
  if (!contract.accepted_event_families.includes(event.family)) refusalReasons.push('site_event_family_not_accepted');
  if (contract.requires_authenticated_capability && !event.auth.authenticated) refusalReasons.push('site_event_authenticated_capability_required');
  if (contract.requires_authenticated_capability && event.auth.kind === 'bearer_capability_ref' && !event.auth.capability_ref) {
    refusalReasons.push('site_event_capability_ref_required');
  }
  if (event.payload_bounds.max_bytes > contract.max_payload_bytes) refusalReasons.push('site_event_payload_too_large');
  if (event.payload_bounds.raw_values_excluded !== true) refusalReasons.push('site_event_raw_values_must_be_excluded');
  if (!event.authority_limits.length) refusalReasons.push('site_event_authority_limits_required');

  return {
    schema: 'narada.site_event.receiver_decision.v0',
    status: refusalReasons.length ? 'refused' : 'accepted',
    ...(refusalReasons.length ? {} : { event_id: event.event_id }),
    refusal_reasons: refusalReasons,
    projection_event_recorded: refusalReasons.length === 0,
    mutates_site_authority: false,
    admits_inbox_or_task_state: false,
    grants_capability: false,
  };
}

export function validateSiteTelemetryEventContract(input: unknown): SiteTelemetryEventValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const event = isRecord(input) ? input : null;

  if (!event) {
    return siteTelemetryValidationResult(errors.concat('site_telemetry_event_object_required'), warnings, false);
  }

  if (!isTelemetryEventSchema(event.schema)) errors.push('site_telemetry_event_schema_unsupported');
  if (!isNonEmptyString(event.event_id)) errors.push('site_telemetry_event_id_required');
  if (!isNonEmptyString(event.idempotency_key)) errors.push('site_telemetry_event_idempotency_key_required');
  if (!isNonEmptyString(event.source_site_id)) errors.push('site_telemetry_event_source_site_required');
  if (event.subject_site_id !== undefined && !isNonEmptyString(event.subject_site_id)) errors.push('site_telemetry_event_subject_site_invalid');
  if (event.target_site_id !== undefined && !isNonEmptyString(event.target_site_id)) errors.push('site_telemetry_event_target_site_invalid');
  if (event.publication_edge_id !== undefined && !isNonEmptyString(event.publication_edge_id)) errors.push('site_telemetry_event_publication_edge_invalid');
  if (event.surface_id !== undefined && !isNonEmptyString(event.surface_id)) errors.push('site_telemetry_event_surface_invalid');
  if (!isSiteEventFamily(event.family)) errors.push('site_telemetry_event_family_invalid');
  if (!isNonEmptyString(event.type)) errors.push('site_telemetry_event_type_required');
  if (!isIsoTimestamp(event.observed_at)) errors.push('site_telemetry_event_observed_at_invalid');
  if (!isIsoTimestamp(event.sent_at)) errors.push('site_telemetry_event_sent_at_invalid');
  validateTelemetryEventAuth(event.auth, errors);
  validateTelemetryEventPayloadBounds(event.payload_bounds, errors);
  if (!isRecord(event.payload_summary)) errors.push('site_telemetry_event_payload_summary_object_required');
  if (containsForbiddenRawValueMarker(event.payload_summary)) errors.push('site_telemetry_event_payload_summary_contains_raw_value_marker');
  if (!Array.isArray(event.authority_limits) || event.authority_limits.length === 0 || !event.authority_limits.every(isNonEmptyString)) {
    errors.push('site_telemetry_event_authority_limits_required');
  }
  if (event.freshness !== undefined && !isTelemetryEventFreshness(event.freshness)) {
    errors.push('site_telemetry_event_freshness_invalid');
  }
  if (event.evidence_refs !== undefined && (!Array.isArray(event.evidence_refs) || !event.evidence_refs.every(isNonEmptyString))) {
    errors.push('site_telemetry_event_evidence_refs_invalid');
  }
  if (event.provenance !== undefined && (!isRecord(event.provenance) || event.provenance.projection_only !== true)) {
    errors.push('site_telemetry_event_provenance_projection_only_required');
  }

  const compatible = event.schema === 'narada.site_event.envelope.v0' && errors.length === 0;
  if (event.schema === 'narada.site_event.envelope.v0') {
    for (const futureField of ['publication_edge_id', 'surface_id', 'freshness', 'evidence_refs', 'provenance']) {
      if (futureField in event) warnings.push(`current_envelope_contains_future_field:${futureField}`);
    }
  }

  return siteTelemetryValidationResult(
    errors,
    warnings,
    compatible,
    errors.length === 0 ? event as unknown as SiteTelemetryEventContract : undefined,
  );
}

export function parseSiteTelemetryEventFixture(input: unknown): SiteTelemetryEventValidationResult {
  return validateSiteTelemetryEventContract(input);
}

export function siteTelemetryCompatibilityMap(): SiteTelemetryEventCompatibilityMap {
  return {
    schema: 'narada.site_telemetry.compatibility_map.v0',
    source_schema: 'narada.site_event.envelope.v0',
    target_schema: 'narada.site_telemetry.event.v0',
    runtime_status: 'specification_only',
    direct_fields: [
      'schema',
      'event_id',
      'idempotency_key',
      'source_site_id',
      'subject_site_id',
      'target_site_id',
      'family',
      'type',
      'observed_at',
      'sent_at',
      'auth',
      'payload_bounds',
      'payload_summary',
      'authority_limits',
    ],
    computed_or_optional_fields: [
      {
        field: 'freshness',
        source: 'computed from observed_at, sent_at, and receiver clock until runtime supplies explicit freshness',
      },
    ],
    future_fields_not_inferred: [
      'publication_edge_id',
      'surface_id',
      'evidence_refs',
      'provenance',
    ],
    compatibility_rules: [
      'Existing envelopes remain valid current runtime artifacts.',
      'Receivers may compute freshness for read models but must not rewrite event identity.',
      'Publication edge and surface coordinates must come from explicit runtime/package fields or config, not route names or memory.',
      'Payload summaries remain bounded and raw-value-free.',
      'Authority limits remain required and non-empty.',
    ],
    silent_widening_forbidden: true,
  };
}

export function mapSiteEventEnvelopeToTelemetryEvent(
  event: SiteEventEnvelope,
  input: {
    freshness?: SiteTelemetryEventFreshness;
    publication_edge_id?: string;
    surface_id?: string;
    evidence_refs?: string[];
    provenance?: SiteTelemetryEventProvenance;
  } = {},
): SiteTelemetryEventContract {
  return {
    ...event,
    schema: 'narada.site_telemetry.event.v0',
    ...(input.publication_edge_id ? { publication_edge_id: input.publication_edge_id } : {}),
    ...(input.surface_id ? { surface_id: input.surface_id } : {}),
    ...(input.freshness ? { freshness: input.freshness } : {}),
    ...(input.evidence_refs ? { evidence_refs: input.evidence_refs } : {}),
    ...(input.provenance ? { provenance: input.provenance } : {}),
  };
}

export function validateSiteTelemetryPublicationEdge(input: unknown): SiteTelemetryPublicationEdgeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const edge = isRecord(input) ? input : null;
  if (!edge) {
    return publicationEdgeValidationResult(['publication_edge_object_required'], warnings);
  }

  if (edge.schema !== 'narada.site_telemetry.publication_edge.v0') errors.push('publication_edge_schema_required');
  if (!isNonEmptyString(edge.edge_id)) errors.push('publication_edge_id_required');
  if (!isNonEmptyString(edge.publisher_site_id)) errors.push('publication_edge_publisher_site_required');
  if (!isNonEmptyString(edge.owning_site_id)) errors.push('publication_edge_owning_site_required');
  if (!isNonEmptyString(edge.surface_id)) errors.push('publication_edge_surface_id_required');
  validatePublicationEdgeEndpoint(edge.surface_endpoint, errors);
  if (!Array.isArray(edge.accepted_event_families) || edge.accepted_event_families.length === 0) {
    errors.push('publication_edge_event_family_missing');
  } else if (!edge.accepted_event_families.every(isSiteEventFamily)) {
    errors.push('publication_edge_event_family_unsupported');
  }
  if (!isRecord(edge.capability_refs)) {
    errors.push('publication_edge_capability_refs_required');
  } else {
    if (!isNonEmptyString(edge.capability_refs.publish)) errors.push('publication_edge_publish_capability_missing');
    if (containsForbiddenRawValueMarker(edge.capability_refs)) errors.push('publication_edge_raw_secret_value_present');
  }
  validateSecretResolverPolicy(edge.secret_resolver_policy, errors);
  validatePublicationEdgePostures(edge, errors);
  if (!isPublicationEdgeLifecycleState(edge.lifecycle_state)) errors.push('publication_edge_lifecycle_state_invalid');
  if (!Array.isArray(edge.preflight_requirements) || !edge.preflight_requirements.every(isNonEmptyString)) {
    errors.push('publication_edge_preflight_requirements_required');
  }
  if (!Array.isArray(edge.authority_limits) || edge.authority_limits.length === 0 || !edge.authority_limits.every(isNonEmptyString)) {
    errors.push('publication_edge_authority_limits_missing');
  }
  if (!Array.isArray(edge.evidence_refs) || !edge.evidence_refs.every(isNonEmptyString)) {
    errors.push('publication_edge_evidence_refs_required');
  }
  if (edge.publisher_site_id === edge.owning_site_id) warnings.push('publication_edge_publisher_and_owner_same_site');

  return publicationEdgeValidationResult(
    [...new Set(errors)],
    warnings,
    errors.length === 0 ? edge as unknown as SiteTelemetryPublicationEdge : undefined,
  );
}

export function parseSiteTelemetryPublicationEdge(input: unknown): SiteTelemetryPublicationEdgeValidationResult {
  return validateSiteTelemetryPublicationEdge(input);
}

export function preflightSiteTelemetryPublicationEdge(
  input: unknown,
  options: {
    expected_surface_id?: string;
    credential_ref_status?: 'fresh' | 'stale' | 'missing' | 'revoked' | 'unknown';
    checked_at?: string;
  } = {},
): SiteTelemetryPublicationEdgePreflightResult {
  const validation = validateSiteTelemetryPublicationEdge(input);
  const edge = validation.edge;
  const candidate = edge ?? (isRecord(input) ? input : null);
  const checks: SiteTelemetryPublicationEdgePreflightCheck[] = [];
  const add = (name: string, failure: string | null) => {
    checks.push(failure ? { name, status: 'fail', failure } : { name, status: 'pass' });
  };

  add('edge_valid', validation.status === 'valid' ? null : validation.errors[0] ?? 'publication_edge_invalid');
  add('endpoint_present', candidate?.surface_endpoint ? null : 'publication_edge_endpoint_missing');
  add('surface_identity_matches', !candidate || !options.expected_surface_id || candidate.surface_id === options.expected_surface_id
    ? null
    : 'publication_edge_surface_mismatch');
  add('accepted_event_families_declared', Array.isArray(candidate?.accepted_event_families) && candidate.accepted_event_families.length
    ? null
    : 'publication_edge_event_family_missing');
  const capabilityRefs = isRecord(candidate?.capability_refs) ? candidate.capability_refs : null;
  add('publish_capability_ref_present', capabilityRefs?.publish ? null : 'publication_edge_publish_capability_missing');
  const rotationPosture = isRecord(candidate?.rotation_posture) ? candidate.rotation_posture : null;
  const credentialStatus = options.credential_ref_status ?? String(rotationPosture?.credential_ref_status ?? 'unknown');
  add('credential_ref_fresh', credentialStatus === 'fresh' ? null : credentialStatus === 'revoked'
    ? 'publication_edge_credential_ref_revoked'
    : credentialStatus === 'missing'
      ? 'publication_edge_publish_capability_missing'
      : 'publication_edge_credential_ref_stale');
  add('raw_secret_values_absent', validation.errors.includes('publication_edge_raw_secret_value_present')
    ? 'publication_edge_raw_secret_value_present'
    : null);
  add('authority_limits_present', Array.isArray(candidate?.authority_limits) && candidate.authority_limits.length
    ? null
    : 'publication_edge_authority_limits_missing');

  const pass = checks.every((check) => check.status === 'pass');
  return {
    schema: 'narada.site_telemetry.publication_edge_preflight.v0',
    edge_id: isNonEmptyString(candidate?.edge_id) ? candidate.edge_id : null,
    status: pass ? 'pass' : 'fail',
    checked_at: options.checked_at ?? new Date().toISOString(),
    checks,
    publish_allowed: pass,
    network_publish_performed: false,
    raw_secret_values_recorded: false,
    authority_granted: false,
  };
}

export function deriveSiteProjectionReadModel(input: {
  site_id: string;
  events: SiteEventEnvelope[];
  now: string;
  stale_after_ms: number;
}): SiteProjectionReadModel {
  const relevant = input.events
    .filter((event) => (event.subject_site_id ?? event.target_site_id ?? event.source_site_id) === input.site_id)
    .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at));
  const latestByFamily = (family: SiteEventFamily): SiteEventEnvelope | undefined =>
    relevant.find((event) => event.family === family);
  const stateFromEvent = (family: SiteEventFamily, defaultStatus: string) => {
    const event = latestByFamily(family);
    if (!event) return { status: defaultStatus, freshness: 'missing' as SiteProjectionFreshness };
    return {
      status: typeof event.payload_summary.status === 'string' ? event.payload_summary.status : 'observed',
      freshness: freshnessForTimestamp(event.observed_at, input.now, input.stale_after_ms),
      event_id: event.event_id,
      ...(family === 'site_health' ? { observed_at: event.observed_at } : {}),
    };
  };

  return {
    schema: 'narada.site_projection.read_model.v0',
    site_id: input.site_id,
    latest_health: stateFromEvent('site_health', 'missing'),
    inbox_availability: stateFromEvent('site_inbox', 'missing'),
    agent_session_posture: stateFromEvent('agent_session', 'missing'),
    task_work_posture: stateFromEvent('task_work', 'missing'),
    attention_summary: stateFromEvent('attention', 'missing'),
    report_summary: stateFromEvent('report', 'missing'),
    event_provenance: relevant.map((event) => ({
      event_id: event.event_id,
      source_site_id: event.source_site_id,
      family: event.family,
      observed_at: event.observed_at,
    })),
    projection_is_authority: false,
  };
}

export function deriveSiteRegistryReadModel(input: {
  registry_id: string;
  owning_site_id: string;
  generated_at: string;
  events: SiteRegistryReadModelInputEvent[];
  stale_after_ms: number;
  known_sites?: SiteRegistryReadModelKnownSiteDescriptor[];
}): SiteRegistryReadModel {
  const descriptors = new Map((input.known_sites ?? []).map((site) => [site.site_id, site]));
  const eventsBySite = new Map<string, SiteRegistryReadModelInputEvent[]>();

  for (const event of input.events) {
    const siteId = event.subject_site_id ?? event.target_site_id ?? event.source_site_id;
    eventsBySite.set(siteId, [...(eventsBySite.get(siteId) ?? []), event]);
  }
  for (const descriptor of descriptors.values()) {
    if (!eventsBySite.has(descriptor.site_id)) eventsBySite.set(descriptor.site_id, []);
  }

  const sites = Array.from(eventsBySite.entries()).map(([siteId, events]) => {
    const ordered = [...events].sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at));
    const latest = ordered[0];
    const descriptor = descriptors.get(siteId);
    const payload = latest?.payload_summary ?? {};
    const relation = stringFromPayload(payload, 'relation') ?? descriptor?.relation_posture ?? 'known_site';
    const locusType = siteLocusFromPayload(payload, 'locus_type') ?? descriptor?.locus_type ?? 'unknown';
    const advertisedSurfaces = stringsFromPayload(payload, 'telemetry_surfaces');
    const healthStatus = stringFromPayload(payload, 'status') ?? (latest ? 'observed' : 'missing');
    const freshness = latest
      ? freshnessForTimestamp(latest.observed_at, input.generated_at, input.stale_after_ms)
      : 'missing';
    const knownSites = stringsFromPayload(payload, 'known_sites');

    return {
      site_id: siteId,
      locus_type: locusType,
      relation_posture: relation,
      authority_boundaries: descriptor?.authority_boundaries ?? defaultSiteRegistryAuthorityBoundaries(siteId, relation),
      advertised_surfaces: advertisedSurfaces,
      telemetry_endpoints: telemetryEndpointsFromSurfaces(advertisedSurfaces),
      inbox_message_endpoints: stringsFromPayload(payload, 'inbox_message_endpoints'),
      pubsub_posture: pubsubPostureFromEvent(latest, knownSites),
      freshness: {
        status: freshness,
        ...(latest ? { latest_event_id: latest.event_id } : {}),
      },
      health: {
        status: healthStatus,
        ...(latest ? { observed_at: latest.observed_at } : {}),
      },
      capabilities_summary: descriptor?.capabilities_summary ?? capabilitiesFromRegistryEvent(latest, knownSites),
      capability_denials: descriptor?.capability_denials ?? defaultSiteRegistryCapabilityDenials(relation),
      provenance: ordered.map((event) => ({ event_id: event.event_id, family: event.family })),
      conflicts: siteRegistryConflicts(ordered),
      read_model_authority_limits: defaultSiteRegistryReadModelAuthorityLimits(relation),
    };
  });

  return {
    schema: 'narada.site_registry.read_model.v0',
    registry_id: input.registry_id,
    owning_site_id: input.owning_site_id,
    generated_at: input.generated_at,
    sites,
    source_event_refs: input.events.map((event) => event.event_id),
    authority_limits: [
      'site_registry_read_model_is_projection_only',
      'membership_does_not_transfer_mutation_authority',
      'future_authority_substrate_must_be_separately_admitted',
    ],
    future_authority_substrate: {
      status: 'not_admitted',
      required_before_authority: [
        'declared_owner',
        'mutation_commands',
        'membership_change_evidence',
        'conflict_resolution_rules',
        'capability_grant_revocation_rules',
        'replay_rebuild_rules',
      ],
    },
  };
}

export function deriveUserSiteAwarenessFromRegistryReadModel(input: {
  user_site_id: string;
  registry: SiteRegistryReadModel;
}): UserSiteAwarenessFromRegistry {
  return {
    schema: 'narada.user_site.awareness_from_registry.v0',
    user_site_id: input.user_site_id,
    source_registry_id: input.registry.registry_id,
    generated_at: input.registry.generated_at,
    entries: input.registry.sites.map((site) => ({
      site_id: site.site_id,
      locus_type: site.locus_type,
      relation_posture: site.relation_posture,
      awareness_posture: awarenessPostureFromRegistrySite(site),
      route_candidates: {
        telemetry_endpoints: site.telemetry_endpoints,
        inbox_message_endpoints: site.inbox_message_endpoints,
      },
      capabilities_visible: site.capabilities_summary,
      denied_authority: [
        ...site.capability_denials,
        'awareness_projection_does_not_grant_mutation',
        'remote_registry_does_not_transfer_ownership',
      ],
      provenance: site.provenance,
      conflicts: site.conflicts,
      advisory_authority_limits: [
        'user_site_awareness_is_advisory',
        'awareness_entry_cannot_mutate_target_site',
        'awareness_entry_cannot_import_remote_ownership',
        'target_site_authority_surface_required_for_mutation',
      ],
    })),
    source_event_refs: input.registry.source_event_refs,
    advisory_only: true,
    mutates_known_sites: false,
    imports_remote_ownership: false,
    authority_limits: [
      'user_site_may_know_route_propose_subscribe_and_navigate',
      'user_site_awareness_does_not_mutate_known_sites',
      'remote_registry_output_is_not_local_mutation_truth',
      'target_site_authority_surface_required_for_effects',
    ],
  };
}

export function buildHumanPeekSurfacePosture(input: {
  surface_id: string;
  routes?: string[];
}): HumanPeekSurfacePosture {
  return {
    schema: 'narada.site_projection.human_peek_surface.v0',
    surface_id: input.surface_id,
    routes: input.routes ?? ['GET /', 'GET /api/sites', 'GET /api/projections/:site_id'],
    reads_projection_state: true,
    mutates_site: false,
    admits_inbox: false,
    mutates_task_lifecycle: false,
    certifies_identity: false,
    grants_capability: false,
    authority_limits: [
      'peek_surface_reads_projection_only',
      'peek_surface_cannot_mutate_site_config',
      'peek_surface_cannot_admit_inbox',
      'peek_surface_cannot_mutate_task_lifecycle',
      'peek_surface_cannot_certify_identity',
      'peek_surface_cannot_grant_capability',
    ],
  };
}

export function staccatoPublishedSurfacePatternMap(): StaccatoPublishedSurfacePattern {
  return {
    schema: 'narada.site_projection.staccato_pattern_map.v0',
    reusable_parts: [
      'bearer_capability_guarded_post_webhook',
      'typed_event_validation_before_projection',
      'latest_projection_read_api',
      'bounded_human_peek_surface',
      'pending_message_receipt_projection',
      'local_admission_pullback_before_inbox_authority',
      'capability_audit_without_raw_token_storage',
    ],
    site_specific_parts: [
      'staccato_event_type_names',
      'staccato_dashboard_rows',
      'staccato_html_report_tabs',
      'staccato_kv_and_d1_binding_names',
      'staccato_secret_environment_variable_names',
    ],
    source_evidence_refs: [
      'D:/code/staccato-elt/runbooks/cloudflare-published-surface.md',
      'D:/code/staccato-elt/workers/staccato/src/index.mjs',
    ],
    projection_is_authority: false,
  };
}

export function buildSiteInboxLocationCheckConfig(
  input: Omit<SiteInboxLocationCheckConfig, 'schema'>,
): SiteInboxLocationCheckConfig {
  return {
    schema: 'narada.site_config.inbox_location_check.v0',
    ...input,
  };
}

export function buildSiteTelemetryConfig(input: Partial<SiteTelemetryConfig> = {}): SiteTelemetryConfig {
  return {
    schema: 'narada.site_config.telemetry.v0',
    enable_telemetry: input.enable_telemetry ?? true,
    telemetry_destinations: input.telemetry_destinations ?? [localTelemetryDestination()],
  };
}

export function buildAgentIdentityTelemetry(input: Omit<AgentIdentityTelemetry, 'schema' | 'raw_transcript_recorded' | 'raw_secret_values_recorded' | 'assigns_work' | 'grants_capability' | 'certifies_identity' | 'admits_inbox_or_task_state'>): AgentIdentityTelemetry {
  return {
    schema: 'narada.telemetry.agent_identity.v0',
    ...input,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
    assigns_work: false,
    grants_capability: false,
    certifies_identity: false,
    admits_inbox_or_task_state: false,
  };
}

export function decideSiteTelemetry(config: SiteTelemetryConfig): SiteTelemetryDecision {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const destination of config.telemetry_destinations) {
    if (!destination.id) errors.push('telemetry_destination_id_required');
    if (!destination.scope) errors.push('telemetry_destination_scope_required');
    if (!Array.isArray(destination.authority_limits) || destination.authority_limits.length === 0) errors.push('telemetry_destination_authority_limits_required');
    if (destination.output_bounds?.raw_values_excluded !== true) errors.push('telemetry_destination_raw_values_must_be_excluded');
    if ((destination.kind === 'webhook' || destination.kind === 'cloudflare_worker') && destination.enabled) {
      if (destination.transport.kind !== 'bearer_https_post') errors.push('remote_telemetry_requires_bearer_https_post_transport');
      if (!destination.transport.capability_ref) errors.push('remote_telemetry_requires_capability_ref');
      if (!destination.transport.url) errors.push('remote_telemetry_requires_url');
    }
    if ((destination.kind === 'webhook' || destination.kind === 'cloudflare_worker') && destination.enabled) {
      warnings.push('remote_telemetry_destination_explicitly_enabled');
    }
  }
  return {
    schema: 'narada.site_config.telemetry_decision.v0',
    status: errors.length ? 'invalid' : config.enable_telemetry ? 'enabled' : 'disabled',
    destinations_to_project: config.enable_telemetry
      ? config.telemetry_destinations.filter((destination) => destination.enabled && destination.kind !== 'disabled')
      : [],
    errors,
    warnings,
    config_mutated: false,
    telemetry_is_authority: false,
  };
}

function localTelemetryDestination(): SiteTelemetryDestination {
  return {
    id: 'local-bounded-telemetry',
    kind: 'local_file',
    enabled: true,
    scope: 'site_runtime_health',
    accepted_event_families: ['site_health', 'agent_identity', 'carrier_session'],
    redaction_bounds: ['no_secrets', 'no_raw_transcripts', 'no_raw_provider_outputs', 'no_raw_db_dumps'],
    output_bounds: { max_bytes: 16 * 1024, raw_values_excluded: true },
    retention_posture: 'local_bounded_retention',
    freshness_posture: 'freshness_tagged_observation',
    transport: { kind: 'local_append' },
    storage_posture: 'local_site_private_state',
    authority_limits: [
      'telemetry_cannot_assign_work',
      'telemetry_cannot_grant_capability',
      'telemetry_cannot_certify_identity',
      'telemetry_cannot_admit_inbox_or_task_state',
      'telemetry_cannot_mutate_site_config',
    ],
  };
}

export function decideSiteInboxLocationChecks(
  config: SiteInboxLocationCheckConfig,
): SiteInboxLocationCheckDecision {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.check_remote_inbox_locations && config.inbox_locations.some((location) => location.enabled)) {
    warnings.push('enabled_inbox_locations_ignored_while_remote_checks_disabled');
  }

  for (const location of config.inbox_locations) {
    if (!location.id) errors.push('inbox_location_id_required');
    if (!location.target_site_id) errors.push('inbox_location_target_site_required');
    if (!Array.isArray(location.authority_limits) || location.authority_limits.length === 0) {
      errors.push('inbox_location_authority_limits_required');
    }
    if ((location.kind === 'http_poll' || location.kind === 'cloudflare_worker') && !location.endpoint) {
      errors.push('remote_inbox_location_endpoint_required');
    }
    if ((location.kind === 'http_poll' || location.kind === 'cloudflare_worker') && !location.auth_capability_ref) {
      errors.push('remote_inbox_location_capability_ref_required');
    }
    if (location.kind === 'file_drop' && !location.poll_path) {
      errors.push('file_drop_inbox_location_poll_path_required');
    }
  }

  const locationsToCheck = config.check_remote_inbox_locations
    ? config.inbox_locations.filter((location) => location.enabled && location.kind !== 'disabled')
    : [];

  return {
    schema: 'narada.site_config.inbox_location_check_decision.v0',
    status: errors.length ? 'invalid' : config.check_remote_inbox_locations ? 'enabled' : 'disabled',
    check_remote_inbox_locations: config.check_remote_inbox_locations,
    locations_to_check: locationsToCheck,
    errors,
    warnings,
    target_mutated: false,
    remote_inbox_authority_granted: false,
  };
}

function freshnessFromStatus(status: string): SiteProjectionFreshness {
  if (!status) return 'missing';
  if (status.includes('fail') || status.includes('error') || status.includes('blocked')) return 'failing';
  if (status.includes('stale')) return 'stale';
  if (status.includes('unknown') || status.includes('not_observed') || status.includes('not_inspected')) return 'unknown';
  return 'fresh';
}

function freshnessForTimestamp(observedAt: string, now: string, staleAfterMs: number): SiteProjectionFreshness {
  const observedMs = Date.parse(observedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) return 'unknown';
  return nowMs - observedMs > staleAfterMs ? 'stale' : 'fresh';
}

function stringFromPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return isNonEmptyString(value) ? value : undefined;
}

function stringsFromPayload(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function siteLocusFromPayload(payload: Record<string, unknown>, key: string): SiteLocusType | undefined {
  const value = payload[key];
  return isSiteLocusType(value) ? value : undefined;
}

function telemetryEndpointsFromSurfaces(surfaces: string[]): string[] {
  const remote = surfaces.filter((surface) =>
    surface.includes('user-site-telemetry')
    || surface.includes('cloudflare')
    || surface.includes('webhook')
    || surface.includes('pubsub'));
  return remote.length ? remote : surfaces;
}

function pubsubPostureFromEvent(
  event: SiteRegistryReadModelInputEvent | undefined,
  knownSites: string[],
): string {
  if (!event) return 'not_declared';
  if (event.family === 'site_registry' && knownSites.length > 0) return 'awareness_subscriber_candidate';
  return 'not_declared';
}

function capabilitiesFromRegistryEvent(
  event: SiteRegistryReadModelInputEvent | undefined,
  knownSites: string[],
): string[] {
  if (event?.family === 'site_registry' && knownSites.length > 0) return ['know', 'route', 'propose', 'subscribe'];
  return [];
}

function defaultSiteRegistryAuthorityBoundaries(siteId: string, relation: string): string[] {
  if (relation === 'repo_site') {
    return [
      `registry_read_model_cannot_mutate_${siteId.replace(/-/g, '_')}`,
      `${siteId.replace(/-/g, '_')}_remains_task_lifecycle_authority`,
    ];
  }
  if (relation === 'owning_awareness_locus') return ['user_site_awareness_does_not_mutate_known_sites'];
  return ['registry_read_model_cannot_mutate_source_site'];
}

function defaultSiteRegistryCapabilityDenials(relation: string): string[] {
  if (relation === 'owning_awareness_locus') return ['target_site_mutation_not_granted'];
  return ['mutation_not_granted_by_registry_projection'];
}

function defaultSiteRegistryReadModelAuthorityLimits(relation: string): string[] {
  if (relation === 'owning_awareness_locus') {
    return [
      'awareness_registry_is_projection_not_authority',
      'read_model_cannot_transfer_site_ownership',
    ];
  }
  return [
    'read_model_is_not_site_authority',
    'read_model_cannot_grant_capability',
    'read_model_cannot_admit_inbox_or_task_state',
  ];
}

function siteRegistryConflicts(events: SiteRegistryReadModelInputEvent[]): Array<{ field: string; values: string[]; event_ids: string[] }> {
  const conflicts: Array<{ field: string; values: string[]; event_ids: string[] }> = [];
  for (const field of ['locus_type', 'relation']) {
    const observed = new Map<string, string[]>();
    for (const event of events) {
      const value = stringFromPayload(event.payload_summary, field);
      if (!value) continue;
      observed.set(value, [...(observed.get(value) ?? []), event.event_id]);
    }
    if (observed.size > 1) {
      conflicts.push({
        field,
        values: Array.from(observed.keys()).sort(),
        event_ids: Array.from(new Set(Array.from(observed.values()).flat())).sort(),
      });
    }
  }
  return conflicts;
}

function awarenessPostureFromRegistrySite(site: SiteRegistryReadModelSite): UserSiteAwarenessPosture {
  if (site.conflicts.length > 0) return 'conflicted';
  if (site.freshness.status === 'fresh') return 'current';
  if (site.freshness.status === 'stale') return 'stale';
  return 'unknown';
}

function siteTelemetryValidationResult(
  errors: string[],
  warnings: string[],
  compatibleSiteEventEnvelope: boolean,
  event?: SiteTelemetryEventContract,
): SiteTelemetryEventValidationResult {
  return {
    schema: 'narada.site_telemetry.event_validation.v0',
    status: errors.length ? 'invalid' : 'valid',
    errors,
    warnings,
    compatible_site_event_envelope: compatibleSiteEventEnvelope,
    raw_values_accepted: false,
    ...(event ? { event } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isSiteLocusType(value: unknown): value is SiteLocusType {
  return value === 'client_service'
    || value === 'project'
    || value === 'project_ops'
    || value === 'pc_locus'
    || value === 'user_site'
    || value === 'unknown';
}

function isTelemetryEventSchema(value: unknown): value is SiteTelemetryEventContractSchema {
  return value === 'narada.site_event.envelope.v0' || value === 'narada.site_telemetry.event.v0';
}

function isSiteEventFamily(value: unknown): value is SiteEventFamily {
  return value === 'site_health'
    || value === 'site_inbox'
    || value === 'agent_session'
    || value === 'task_work'
    || value === 'attention'
    || value === 'report'
    || value === 'site_registry';
}

function validateTelemetryEventAuth(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('site_telemetry_event_auth_required');
    return;
  }
  if (value.kind !== 'bearer_capability_ref' && value.kind !== 'signed_envelope' && value.kind !== 'none') {
    errors.push('site_telemetry_event_auth_kind_invalid');
  }
  if (value.capability_ref !== undefined && !isNonEmptyString(value.capability_ref)) {
    errors.push('site_telemetry_event_capability_ref_invalid');
  }
  if (typeof value.authenticated !== 'boolean') {
    errors.push('site_telemetry_event_authenticated_boolean_required');
  }
}

function validateTelemetryEventPayloadBounds(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('site_telemetry_event_payload_bounds_required');
    return;
  }
  if (typeof value.max_bytes !== 'number' || !Number.isFinite(value.max_bytes) || value.max_bytes <= 0) {
    errors.push('site_telemetry_event_payload_max_bytes_invalid');
  }
  if (value.raw_values_excluded !== true) {
    errors.push('site_telemetry_event_raw_values_must_be_excluded');
  }
}

function publicationEdgeValidationResult(
  errors: string[],
  warnings: string[],
  edge?: SiteTelemetryPublicationEdge,
): SiteTelemetryPublicationEdgeValidationResult {
  return {
    schema: 'narada.site_telemetry.publication_edge_validation.v0',
    status: errors.length ? 'invalid' : 'valid',
    errors,
    warnings,
    raw_secret_values_accepted: false,
    ...(edge ? { edge } : {}),
  };
}

function validatePublicationEdgeEndpoint(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('publication_edge_endpoint_missing');
    return;
  }
  if (value.kind !== 'https' && value.kind !== 'local_file' && value.kind !== 'local_http') {
    errors.push('publication_edge_endpoint_invalid');
  }
  if (value.kind === 'https' || value.kind === 'local_http') {
    if (!isNonEmptyString(value.url)) {
      errors.push('publication_edge_endpoint_missing');
      return;
    }
    try {
      const parsed = new URL(value.url);
      if (value.kind === 'https' && parsed.protocol !== 'https:') errors.push('publication_edge_endpoint_invalid');
    } catch {
      errors.push('publication_edge_endpoint_invalid');
    }
  }
  if (value.kind === 'local_file' && !isNonEmptyString(value.path)) {
    errors.push('publication_edge_endpoint_missing');
  }
}

function validateSecretResolverPolicy(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('publication_edge_secret_resolver_policy_required');
    return;
  }
  if (!isNonEmptyString(value.resolver_ref)) errors.push('publication_edge_secret_resolver_ref_required');
  if (value.stores_raw_secret_values !== false || value.edge_record_contains_raw_secret_values !== false) {
    errors.push('publication_edge_raw_secret_value_present');
  }
}

function validatePublicationEdgePostures(edge: Record<string, unknown>, errors: string[]): void {
  if (!isRecord(edge.trust_posture) || !isNonEmptyString(edge.trust_posture.status) || !isNonEmptyString(edge.trust_posture.basis)) {
    errors.push('publication_edge_trust_posture_required');
  }
  if (!isRecord(edge.revocation_posture) || (edge.revocation_posture.status !== 'not_revoked' && edge.revocation_posture.status !== 'revoked')) {
    errors.push('publication_edge_revocation_posture_required');
  }
  if (!isRecord(edge.rotation_posture) || !['fresh', 'stale', 'missing', 'revoked', 'unknown'].includes(String(edge.rotation_posture.credential_ref_status))) {
    errors.push('publication_edge_rotation_posture_required');
  }
}

function isPublicationEdgeLifecycleState(value: unknown): value is SiteTelemetryPublicationEdgeLifecycleState {
  return value === 'draft'
    || value === 'configured'
    || value === 'preflight_passed'
    || value === 'active'
    || value === 'blocked'
    || value === 'revoked'
    || value === 'rotating'
    || value === 'stale';
}

function isTelemetryEventFreshness(value: unknown): value is SiteTelemetryEventFreshness {
  if (!isRecord(value)) return false;
  if (typeof value.computed_by_receiver !== 'boolean') return false;
  if (!['fresh', 'stale', 'missing', 'failing', 'unknown'].includes(String(value.status))) return false;
  if (value.stale_after_ms !== undefined) {
    return typeof value.stale_after_ms === 'number' && Number.isFinite(value.stale_after_ms) && value.stale_after_ms > 0;
  }
  return true;
}

function containsForbiddenRawValueMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenRawValueMarker);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase();
    return normalized.includes('secret')
      || normalized.includes('password')
      || normalized.includes('token')
      || normalized.includes('api_key')
      || normalized.includes('raw_log')
      || normalized.includes('raw_db')
      || normalized.includes('db_row')
      || normalized.includes('mail_body')
      || normalized.includes('transcript')
      || containsForbiddenRawValueMarker(child);
  });
}

export function decideRegisteredSiteProbe(request: RegisteredSiteProbeRequest): RegisteredSiteProbeDecision {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (!request.site_id && !request.root) refusals.push('site_probe_requires_site_id_or_root');
  if (request.root && !request.site_id) {
    if (request.authority_basis?.kind !== 'operator_direct_instruction' || !request.authority_basis.summary) {
      refusals.push('site_probe_unregistered_root_requires_operator_authority_basis');
    } else {
      warnings.push('operator_explicit_unregistered_root_requires_registry_decision_before_reuse');
    }
  }
  if (request.target_mutation_requested) refusals.push('target_site_mutation_refused');
  if (request.arbitrary_scan_requested) refusals.push('arbitrary_client_file_scan_refused');
  if (request.runtime_state_import_requested) refusals.push('runtime_state_import_refused');
  if (request.credentials_requested) refusals.push('credential_import_refused');

  return {
    schema: 'narada.site_config.registered_site_probe_decision.v0',
    status: refusals.length === 0 ? 'planned_descriptor' : 'refused',
    refusals,
    warnings,
    descriptor_only: true,
    target_mutated: false,
    arbitrary_client_files_scanned: false,
    source_state_imported: false,
  };
}

export function buildRegisteredSiteProbeReport(input: {
  site_id: string;
  root: string;
  registration_status: RegisteredSiteProbeReport['registration_status'];
  current_state: KnownSiteRegistryEntry;
  readable_surfaces?: string[];
  missing_surfaces?: string[];
  blockers?: string[];
  recommended_next_actions?: string[];
  evidence_refs?: string[];
}): RegisteredSiteProbeReport {
  return {
    schema: 'narada.registered_site.probe_report.v0',
    status: input.blockers?.length ? 'blocked' : 'ok',
    site_id: input.site_id,
    root: input.root,
    registration_status: input.registration_status,
    current_state: input.current_state,
    readable_surfaces: input.readable_surfaces ?? [],
    missing_surfaces: input.missing_surfaces ?? [],
    blockers: input.blockers ?? [],
    recommended_next_actions: input.recommended_next_actions ?? [],
    evidence_refs: input.evidence_refs ?? [],
    read_only: true,
    target_mutated: false,
    arbitrary_client_files_scanned: false,
    source_state_imported: false,
  };
}

export function buildRegisteredSiteProbeRequest(
  input: Omit<RegisteredSiteProbeRequest, 'schema'>,
): RegisteredSiteProbeRequest {
  return {
    schema: 'narada.site_config.registered_site_probe_request.v0',
    ...input,
  };
}
