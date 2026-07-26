export const SITE_AUTHORITY_MAP_SCHEMA = 'narada.site_authority_map.v1' as const;
export const SITE_AUTHORITY_DECISION_SCHEMA = 'narada.site_authority_decision.v1' as const;
export const SITE_AUTHORITY_CLASSIFIER_VERSION = 'site_authority_map.v1' as const;

export const SITE_EMBODIMENT_KINDS = Object.freeze({
  CLOUDFLARE_CARRIER: 'cloudflare_carrier',
  LOCAL_WINDOWS: 'local_windows',
  AGENT_CLI: 'agent_cli',
  AGENT_TUI: 'agent_tui',
  OPERATOR_DASHBOARD: 'operator_dashboard',
} as const);

export const SITE_MUTATION_CLASSES = Object.freeze({
  HOSTED_CARRIER_SESSION_EVENTS: 'hosted_carrier_session_events',
  HOSTED_SITE_MEMBERSHIP: 'hosted_site_membership',
  TASK_ARTIFACT_MUTATION: 'task_artifact_mutation',
  LOCAL_REPOSITORY_FILESYSTEM_MUTATION: 'local_repository_filesystem_mutation',
  READ_MODEL_PROJECTION: 'read_model_projection',
} as const);

export const SITE_AUTHORITY_ACTIONS = Object.freeze({
  ADMIT: 'admit',
  REFUSE: 'refuse',
  PROJECTION_ONLY: 'projection_only',
} as const);

type SiteEmbodimentKind = typeof SITE_EMBODIMENT_KINDS[keyof typeof SITE_EMBODIMENT_KINDS];
type SiteMutationClass = typeof SITE_MUTATION_CLASSES[keyof typeof SITE_MUTATION_CLASSES];
type SiteAuthorityAction = typeof SITE_AUTHORITY_ACTIONS[keyof typeof SITE_AUTHORITY_ACTIONS];

export interface SiteAuthorityEntry {
  mutation_class: SiteMutationClass;
  authority_locus: string;
  authority_locus_kind: string;
  admitted_embodiments: SiteEmbodimentKind[];
  cloudflare_posture: SiteAuthorityAction;
  evidence_required: string[];
  confirmation_required: string[];
}

export interface SiteAuthorityMap {
  schema: typeof SITE_AUTHORITY_MAP_SCHEMA;
  site_id: string;
  classifier_version: typeof SITE_AUTHORITY_CLASSIFIER_VERSION;
  generated_at: string | null;
  embodiments: Array<{ embodiment_kind: SiteEmbodimentKind; relation: string }>;
  entries: SiteAuthorityEntry[];
}

export interface SiteAuthorityValidation {
  ok: boolean;
  errors: string[];
}

export interface SiteAuthorityRequest {
  mutation_class?: unknown;
  embodiment_kind?: unknown;
}

export interface SiteAuthorityDecision {
  schema: typeof SITE_AUTHORITY_DECISION_SCHEMA;
  classifier_version: typeof SITE_AUTHORITY_CLASSIFIER_VERSION;
  action: SiteAuthorityAction;
  reason: string;
  mutation_class: string;
  embodiment_kind: string;
  authority_locus: string | null;
  authority_locus_kind: string | null;
  evidence_required: string[];
  confirmation_required: string[];
  validation_errors: string[];
}

interface SiteAuthorityMapOptions {
  site_id?: unknown;
  cloudflare_carrier_authority_locus?: unknown;
  local_windows_authority_locus?: unknown;
  task_artifact_authority_locus?: unknown;
  generated_at?: string | null;
}

interface AuthorityEntryOptions {
  mutation_class: SiteMutationClass;
  authority_locus: string;
  authority_locus_kind: string;
  admitted_embodiments: SiteEmbodimentKind[];
  cloudflare_posture: SiteAuthorityAction;
  evidence_required: string[];
  confirmation_required: string[];
}

interface DecisionOptions {
  action: SiteAuthorityAction;
  reason: string;
  mutationClass: string;
  embodimentKind: string;
  authority_locus?: string | null;
  authority_locus_kind?: string | null;
  evidence_required?: string[];
  confirmation_required?: string[];
  validation_errors?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createCloudflareSiteAuthorityMap({
  site_id = 'unknown-site',
  cloudflare_carrier_authority_locus = 'cloudflare-carrier',
  local_windows_authority_locus = 'local-windows-site-authority',
  task_artifact_authority_locus = 'cloudflare-carrier-task-store',
  generated_at = null,
}: SiteAuthorityMapOptions = {}): SiteAuthorityMap {
  const siteId = String(site_id ?? 'unknown-site');
  const entries = [
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.HOSTED_CARRIER_SESSION_EVENTS,
      authority_locus: String(cloudflare_carrier_authority_locus),
      authority_locus_kind: 'cloudflare_carrier_session_event_store',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.ADMIT,
      evidence_required: ['carrier_session_event_append'],
      confirmation_required: ['monotonic_session_event_sequence'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP,
      authority_locus: String(cloudflare_carrier_authority_locus),
      authority_locus_kind: 'cloudflare_site_registry',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.ADMIT,
      evidence_required: ['site_membership_updated_authority_event'],
      confirmation_required: ['site_read_membership_projection'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.TASK_ARTIFACT_MUTATION,
      authority_locus: String(task_artifact_authority_locus),
      authority_locus_kind: 'declared_task_artifact_authority',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.ADMIT,
      evidence_required: ['tool_result_received', 'task_store_write_result'],
      confirmation_required: ['task_readback_projection'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.LOCAL_REPOSITORY_FILESYSTEM_MUTATION,
      authority_locus: String(local_windows_authority_locus),
      authority_locus_kind: 'local_site_filesystem_authority',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.LOCAL_WINDOWS],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.REFUSE,
      evidence_required: ['authority_route_refusal'],
      confirmation_required: ['local_site_readback'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.READ_MODEL_PROJECTION,
      authority_locus: `${String(cloudflare_carrier_authority_locus)}:projection`,
      authority_locus_kind: 'derived_projection_store',
      admitted_embodiments: [
        SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
        SITE_EMBODIMENT_KINDS.LOCAL_WINDOWS,
        SITE_EMBODIMENT_KINDS.AGENT_CLI,
        SITE_EMBODIMENT_KINDS.AGENT_TUI,
        SITE_EMBODIMENT_KINDS.OPERATOR_DASHBOARD,
      ],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.PROJECTION_ONLY,
      evidence_required: ['projection_source_disclosure'],
      confirmation_required: ['freshness_or_cursor_disclosure'],
    }),
  ];
  return {
    schema: SITE_AUTHORITY_MAP_SCHEMA,
    site_id: siteId,
    classifier_version: SITE_AUTHORITY_CLASSIFIER_VERSION,
    generated_at,
    embodiments: [
      { embodiment_kind: SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER, relation: 'hosted_site_embodiment' },
      { embodiment_kind: SITE_EMBODIMENT_KINDS.LOCAL_WINDOWS, relation: 'local_site_embodiment' },
    ],
    entries,
  };
}

function authorityEntry({
  mutation_class,
  authority_locus,
  authority_locus_kind,
  admitted_embodiments,
  cloudflare_posture,
  evidence_required,
  confirmation_required,
}: AuthorityEntryOptions): SiteAuthorityEntry {
  return {
    mutation_class,
    authority_locus,
    authority_locus_kind,
    admitted_embodiments: [...admitted_embodiments],
    cloudflare_posture,
    evidence_required: [...evidence_required],
    confirmation_required: [...confirmation_required],
  };
}

export function validateSiteAuthorityMap(map: unknown): SiteAuthorityValidation {
  const errors: string[] = [];
  if (!isRecord(map)) errors.push('site_authority_map_not_object');
  const mapRecord = isRecord(map) ? map : {};
  if (mapRecord.schema !== SITE_AUTHORITY_MAP_SCHEMA) errors.push('site_authority_map_schema_mismatch');
  if (!mapRecord.site_id) errors.push('site_authority_map_site_id_missing');
  if (!Array.isArray(mapRecord.entries)) errors.push('site_authority_map_entries_missing');
  const seen = new Set<unknown>();
  for (const rawEntry of Array.isArray(mapRecord.entries) ? mapRecord.entries : []) {
    const entry = isRecord(rawEntry) ? rawEntry : {};
    const mutationClass = entry.mutation_class;
    if (!mutationClass) errors.push('site_authority_entry_mutation_class_missing');
    if (seen.has(mutationClass)) errors.push(`site_authority_entry_duplicate:${String(mutationClass)}`);
    seen.add(mutationClass);
    if (!entry.authority_locus) errors.push(`site_authority_entry_locus_missing:${String(mutationClass ?? 'unknown')}`);
    if (!entry.authority_locus_kind) errors.push(`site_authority_entry_locus_kind_missing:${String(mutationClass ?? 'unknown')}`);
    if (!Array.isArray(entry.admitted_embodiments)) errors.push(`site_authority_entry_embodiments_missing:${String(mutationClass ?? 'unknown')}`);
    if (!Object.values(SITE_AUTHORITY_ACTIONS).includes(entry.cloudflare_posture as SiteAuthorityAction)) {
      errors.push(`site_authority_entry_cloudflare_posture_invalid:${String(mutationClass ?? 'unknown')}`);
    }
    if (!Array.isArray(entry.evidence_required)) errors.push(`site_authority_entry_evidence_missing:${String(mutationClass ?? 'unknown')}`);
    if (!Array.isArray(entry.confirmation_required)) errors.push(`site_authority_entry_confirmation_missing:${String(mutationClass ?? 'unknown')}`);
  }
  return { ok: errors.length === 0, errors };
}

export function classifySiteAuthorityRequest(
  map: unknown,
  request: SiteAuthorityRequest = {},
): SiteAuthorityDecision {
  const validation = validateSiteAuthorityMap(map);
  const mutationClass = String(request.mutation_class ?? 'unknown_mutation_class');
  const embodimentKind = String(request.embodiment_kind ?? SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
  if (!validation.ok) {
    return decision({
      action: SITE_AUTHORITY_ACTIONS.REFUSE,
      reason: 'site_authority_map_invalid',
      mutationClass,
      embodimentKind,
      validation_errors: validation.errors,
    });
  }
  const authorityMap = map as SiteAuthorityMap;
  const entry = authorityMap.entries.find((candidate) => candidate.mutation_class === mutationClass);
  if (!entry) {
    return decision({
      action: SITE_AUTHORITY_ACTIONS.REFUSE,
      reason: 'site_authority_locus_unresolved',
      mutationClass,
      embodimentKind,
    });
  }
  if (entry.cloudflare_posture === SITE_AUTHORITY_ACTIONS.PROJECTION_ONLY) {
    return decisionFromEntry(entry, {
      action: SITE_AUTHORITY_ACTIONS.PROJECTION_ONLY,
      reason: 'site_authority_projection_only',
      embodimentKind,
    });
  }
  if (!entry.admitted_embodiments.includes(embodimentKind as SiteEmbodimentKind)) {
    return decisionFromEntry(entry, {
      action: SITE_AUTHORITY_ACTIONS.REFUSE,
      reason: 'site_authority_embodiment_not_authoritative',
      embodimentKind,
    });
  }
  if (embodimentKind !== SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER) {
    return decisionFromEntry(entry, {
      action: SITE_AUTHORITY_ACTIONS.ADMIT,
      reason: 'site_authority_locus_admitted',
      embodimentKind,
    });
  }
  return decisionFromEntry(entry, {
    action: entry.cloudflare_posture,
    reason: entry.cloudflare_posture === SITE_AUTHORITY_ACTIONS.ADMIT
      ? 'site_authority_locus_admitted'
      : `site_authority_${entry.cloudflare_posture}`,
    embodimentKind,
  });
}

function decisionFromEntry(
  entry: SiteAuthorityEntry,
  options: Omit<DecisionOptions, 'mutationClass'>,
): SiteAuthorityDecision {
  return decision({
    ...options,
    mutationClass: entry.mutation_class,
    authority_locus: entry.authority_locus,
    authority_locus_kind: entry.authority_locus_kind,
    evidence_required: entry.evidence_required,
    confirmation_required: entry.confirmation_required,
  });
}

function decision({
  action,
  reason,
  mutationClass,
  embodimentKind,
  authority_locus = null,
  authority_locus_kind = null,
  evidence_required = [],
  confirmation_required = [],
  validation_errors = [],
}: DecisionOptions): SiteAuthorityDecision {
  return {
    schema: SITE_AUTHORITY_DECISION_SCHEMA,
    classifier_version: SITE_AUTHORITY_CLASSIFIER_VERSION,
    action,
    reason,
    mutation_class: mutationClass,
    embodiment_kind: embodimentKind,
    authority_locus,
    authority_locus_kind,
    evidence_required: [...evidence_required],
    confirmation_required: [...confirmation_required],
    validation_errors: [...validation_errors],
  };
}
