const SITE_AUTHORITY_MAP_SCHEMA = 'narada.site_authority_map.v1';
const SITE_AUTHORITY_DECISION_SCHEMA = 'narada.site_authority_decision.v1';
const SITE_AUTHORITY_CLASSIFIER_VERSION = 'site_authority_map.v1';

const SITE_EMBODIMENT_KINDS = Object.freeze({
  CLOUDFLARE_CARRIER: 'cloudflare_carrier',
  LOCAL_WINDOWS: 'local_windows',
  AGENT_CLI: 'agent_cli',
  AGENT_TUI: 'agent_tui',
  OPERATOR_DASHBOARD: 'operator_dashboard',
});

const SITE_MUTATION_CLASSES = Object.freeze({
  HOSTED_CARRIER_SESSION_EVENTS: 'hosted_carrier_session_events',
  HOSTED_SITE_MEMBERSHIP: 'hosted_site_membership',
  TASK_ARTIFACT_MUTATION: 'task_artifact_mutation',
  LOCAL_REPOSITORY_FILESYSTEM_MUTATION: 'local_repository_filesystem_mutation',
  READ_MODEL_PROJECTION: 'read_model_projection',
});

const SITE_AUTHORITY_ACTIONS = Object.freeze({
  ADMIT: 'admit',
  REFUSE: 'refuse',
  PROJECTION_ONLY: 'projection_only',
});

function createCloudflareSiteAuthorityMap({
  site_id = 'unknown-site',
  cloudflare_carrier_authority_locus = 'cloudflare-carrier',
  local_windows_authority_locus = 'local-windows-site-authority',
  task_artifact_authority_locus = 'cloudflare-carrier-task-store',
  generated_at = null,
} = {}) {
  const siteId = String(site_id ?? 'unknown-site');
  const entries = [
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.HOSTED_CARRIER_SESSION_EVENTS,
      authority_locus: cloudflare_carrier_authority_locus,
      authority_locus_kind: 'cloudflare_carrier_session_event_store',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.ADMIT,
      evidence_required: ['carrier_session_event_append'],
      confirmation_required: ['monotonic_session_event_sequence'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP,
      authority_locus: cloudflare_carrier_authority_locus,
      authority_locus_kind: 'cloudflare_site_registry',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.ADMIT,
      evidence_required: ['site_membership_updated_authority_event'],
      confirmation_required: ['site_read_membership_projection'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.TASK_ARTIFACT_MUTATION,
      authority_locus: task_artifact_authority_locus,
      authority_locus_kind: 'declared_task_artifact_authority',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.ADMIT,
      evidence_required: ['tool_result_received', 'task_store_write_result'],
      confirmation_required: ['task_readback_projection'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.LOCAL_REPOSITORY_FILESYSTEM_MUTATION,
      authority_locus: local_windows_authority_locus,
      authority_locus_kind: 'local_site_filesystem_authority',
      admitted_embodiments: [SITE_EMBODIMENT_KINDS.LOCAL_WINDOWS],
      cloudflare_posture: SITE_AUTHORITY_ACTIONS.REFUSE,
      evidence_required: ['authority_route_refusal'],
      confirmation_required: ['local_site_readback'],
    }),
    authorityEntry({
      mutation_class: SITE_MUTATION_CLASSES.READ_MODEL_PROJECTION,
      authority_locus: `${cloudflare_carrier_authority_locus}:projection`,
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
}) {
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

function validateSiteAuthorityMap(map) {
  const errors = [];
  if (!map || typeof map !== 'object') errors.push('site_authority_map_not_object');
  if (map?.schema !== SITE_AUTHORITY_MAP_SCHEMA) errors.push('site_authority_map_schema_mismatch');
  if (!map?.site_id) errors.push('site_authority_map_site_id_missing');
  if (!Array.isArray(map?.entries)) errors.push('site_authority_map_entries_missing');
  const seen = new Set();
  for (const entry of map?.entries ?? []) {
    if (!entry?.mutation_class) errors.push('site_authority_entry_mutation_class_missing');
    if (seen.has(entry?.mutation_class)) errors.push(`site_authority_entry_duplicate:${entry.mutation_class}`);
    seen.add(entry?.mutation_class);
    if (!entry?.authority_locus) errors.push(`site_authority_entry_locus_missing:${entry?.mutation_class ?? 'unknown'}`);
    if (!entry?.authority_locus_kind) errors.push(`site_authority_entry_locus_kind_missing:${entry?.mutation_class ?? 'unknown'}`);
    if (!Array.isArray(entry?.admitted_embodiments)) errors.push(`site_authority_entry_embodiments_missing:${entry?.mutation_class ?? 'unknown'}`);
    if (!Object.values(SITE_AUTHORITY_ACTIONS).includes(entry?.cloudflare_posture)) errors.push(`site_authority_entry_cloudflare_posture_invalid:${entry?.mutation_class ?? 'unknown'}`);
    if (!Array.isArray(entry?.evidence_required)) errors.push(`site_authority_entry_evidence_missing:${entry?.mutation_class ?? 'unknown'}`);
    if (!Array.isArray(entry?.confirmation_required)) errors.push(`site_authority_entry_confirmation_missing:${entry?.mutation_class ?? 'unknown'}`);
  }
  return { ok: errors.length === 0, errors };
}

function classifySiteAuthorityRequest(map, request = {}) {
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
  const entry = map.entries.find((candidate) => candidate.mutation_class === mutationClass);
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
  if (!entry.admitted_embodiments.includes(embodimentKind)) {
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

function decisionFromEntry(entry, { action, reason, embodimentKind }) {
  return decision({
    action,
    reason,
    mutationClass: entry.mutation_class,
    embodimentKind,
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
}) {
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

export {
  SITE_AUTHORITY_ACTIONS,
  SITE_AUTHORITY_CLASSIFIER_VERSION,
  SITE_AUTHORITY_DECISION_SCHEMA,
  SITE_AUTHORITY_MAP_SCHEMA,
  SITE_EMBODIMENT_KINDS,
  SITE_MUTATION_CLASSES,
  classifySiteAuthorityRequest,
  createCloudflareSiteAuthorityMap,
  validateSiteAuthorityMap,
};
