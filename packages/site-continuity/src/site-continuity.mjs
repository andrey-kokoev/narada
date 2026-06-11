const SITE_CONTINUITY_BINDING_SCHEMA = 'narada.site_continuity_binding.v1';
const SITE_CONTINUITY_BINDING_REGISTRY_SCHEMA = 'narada.site_continuity_binding_registry.v1';
const SITE_CONTINUITY_DECISION_SCHEMA = 'narada.site_continuity_decision.v1';
const SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA = 'narada.site_continuity_exchange_packet.v1';
const SITE_CONTINUITY_CLASSIFIER_VERSION = 'site_continuity.v1';

const SITE_CONTINUITY_EMBODIMENT_KINDS = Object.freeze({
  CLOUDFLARE_CARRIER: 'cloudflare_carrier',
  LOCAL_WINDOWS: 'local_windows',
  AGENT_CLI: 'agent_cli',
  AGENT_TUI: 'agent_tui',
  OPERATOR_DASHBOARD: 'operator_dashboard',
});

const SITE_CONTINUITY_RELATION_KINDS = Object.freeze({
  SAME_SITE_EMBODIMENT: 'same_site_embodiment',
});

const SITE_CONTINUITY_EXCHANGE_CLASSES = Object.freeze({
  SITE_IDENTITY_BINDING: 'site_identity_binding',
  AUTHORITY_MAP_PROJECTION: 'authority_map_projection',
  READ_MODEL_PROJECTION: 'read_model_projection',
  MUTATION_EVIDENCE_REFERENCE: 'mutation_evidence_reference',
  CROSS_EMBODIMENT_MUTATION_EXECUTION: 'cross_embodiment_mutation_execution',
});

const SITE_CONTINUITY_ACTIONS = Object.freeze({
  ADMIT: 'admit',
  REFUSE: 'refuse',
  PROJECTION_ONLY: 'projection_only',
  EVIDENCE_ONLY: 'evidence_only',
});

function createSiteContinuityBinding({
  site_id = 'unknown-site',
  relation_id = null,
  local_windows_site_ref = 'local-windows-site',
  cloudflare_site_ref = 'cloudflare-site',
  local_windows_authority_locus = 'local-windows-site-authority',
  cloudflare_authority_locus = 'cloudflare-carrier',
  authority_map_ref = null,
  generated_at = null,
} = {}) {
  const siteId = String(site_id ?? 'unknown-site');
  return {
    schema: SITE_CONTINUITY_BINDING_SCHEMA,
    classifier_version: SITE_CONTINUITY_CLASSIFIER_VERSION,
    site_id: siteId,
    relation_kind: SITE_CONTINUITY_RELATION_KINDS.SAME_SITE_EMBODIMENT,
    relation_id: relation_id ?? `site-continuity:${siteId}:local-windows:cloudflare`,
    authority_map_ref,
    generated_at,
    embodiments: [
      {
        embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
        site_ref: local_windows_site_ref,
        authority_locus: local_windows_authority_locus,
      },
      {
        embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
        site_ref: cloudflare_site_ref,
        authority_locus: cloudflare_authority_locus,
      },
    ],
  };
}

function createSiteContinuityBindingRegistry({ bindings = [], registry_ref = null, generated_at = null } = {}) {
  return {
    schema: SITE_CONTINUITY_BINDING_REGISTRY_SCHEMA,
    classifier_version: SITE_CONTINUITY_CLASSIFIER_VERSION,
    registry_ref,
    generated_at,
    bindings: bindings.map((binding) => ({ ...binding, embodiments: [...(binding.embodiments ?? [])] })),
  };
}

function validateSiteContinuityBindingRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object') errors.push('site_continuity_binding_registry_not_object');
  if (registry?.schema !== SITE_CONTINUITY_BINDING_REGISTRY_SCHEMA) errors.push('site_continuity_binding_registry_schema_mismatch');
  if (registry?.classifier_version !== SITE_CONTINUITY_CLASSIFIER_VERSION) errors.push('site_continuity_binding_registry_classifier_version_mismatch');
  if (!Array.isArray(registry?.bindings)) errors.push('site_continuity_binding_registry_bindings_missing');

  const seenRelationIds = new Set();
  const seenSiteIds = new Set();
  for (const binding of registry?.bindings ?? []) {
    const validation = validateSiteContinuityBinding(binding);
    for (const error of validation.errors) errors.push(`binding:${binding?.relation_id ?? binding?.site_id ?? 'unknown'}:${error}`);
    if (binding?.site_id) {
      if (seenSiteIds.has(binding.site_id)) errors.push(`site_continuity_binding_registry_site_duplicate:${binding.site_id}`);
      seenSiteIds.add(binding.site_id);
    }
    if (binding?.relation_id) {
      if (seenRelationIds.has(binding.relation_id)) errors.push(`site_continuity_binding_registry_relation_duplicate:${binding.relation_id}`);
      seenRelationIds.add(binding.relation_id);
    }
  }
  return { ok: errors.length === 0, errors };
}

function listSiteContinuityBindingSites(registry, {
  required_embodiment_kinds = [
    SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
  ],
} = {}) {
  const validation = validateSiteContinuityBindingRegistry(registry);
  if (!validation.ok) return [];
  return [...new Set(registry.bindings
    .filter((binding) => required_embodiment_kinds.every((kind) => Boolean(findEmbodiment(binding, kind))))
    .map((binding) => binding.site_id))].sort((left, right) => left.localeCompare(right));
}

function packetDecision({
  action,
  reason,
  packet = null,
  evidence_required = [],
  confirmation_required = [],
  validation_errors = [],
}) {
  return {
    schema: SITE_CONTINUITY_DECISION_SCHEMA,
    classifier_version: SITE_CONTINUITY_CLASSIFIER_VERSION,
    action,
    reason,
    exchange_class: 'site_continuity_exchange_packet',
    source_embodiment_kind: packet?.source_embodiment_kind ?? null,
    target_embodiment_kind: packet?.target_embodiment_kind ?? null,
    site_id: packet?.site_id ?? null,
    relation_id: packet?.relation_id ?? null,
    relation_kind: packet?.relation_kind ?? null,
    source_authority_locus: findEmbodiment(packet?.binding ?? { embodiments: [] }, packet?.source_embodiment_kind)?.authority_locus ?? null,
    target_authority_locus: findEmbodiment(packet?.binding ?? { embodiments: [] }, packet?.target_embodiment_kind)?.authority_locus ?? null,
    evidence_required: [...evidence_required],
    confirmation_required: [...confirmation_required],
    validation_errors: [...validation_errors],
  };
}

function createSiteContinuityExchangePacket({
  binding,
  source_embodiment_kind,
  target_embodiment_kind,
  decisions = [],
  projections = [],
  evidence_refs = [],
  executable_mutation_requests = [],
  generated_at = null,
} = {}) {
  const sourceEmbodiment = String(source_embodiment_kind ?? 'unknown_source_embodiment');
  const targetEmbodiment = String(target_embodiment_kind ?? 'unknown_target_embodiment');
  const packet = {
    schema: SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA,
    classifier_version: SITE_CONTINUITY_CLASSIFIER_VERSION,
    site_id: binding?.site_id ?? null,
    relation_id: binding?.relation_id ?? null,
    relation_kind: binding?.relation_kind ?? null,
    source_embodiment_kind: sourceEmbodiment,
    target_embodiment_kind: targetEmbodiment,
    binding,
    decisions: [...decisions],
    projections: projections.map((projection) => ({ ...projection })),
    evidence_refs: evidence_refs.map((evidenceRef) => ({ ...evidenceRef })),
    executable_mutation_requests: executable_mutation_requests.map((request) => ({ ...request })),
    generated_at,
  };
  return { packet_id: createSiteContinuityPacketId(packet), ...packet };
}

function createSiteContinuityPacketId(packet) {
  const parts = [
    'site-continuity-packet:v1',
    packet?.site_id ?? 'unknown-site',
    packet?.relation_id ?? 'unknown-relation',
    packet?.source_embodiment_kind ?? 'unknown-source',
    packet?.target_embodiment_kind ?? 'unknown-target',
  ];
  return parts.map(stableIdPart).join(':');
}

function stableIdPart(value) {
  return String(value).trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function validateSiteContinuityExchangePacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object') errors.push('site_continuity_exchange_packet_not_object');
  if (packet?.schema !== SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA) errors.push('site_continuity_exchange_packet_schema_mismatch');
  if (packet?.classifier_version !== SITE_CONTINUITY_CLASSIFIER_VERSION) errors.push('site_continuity_exchange_packet_classifier_version_mismatch');
  if (!packet?.site_id) errors.push('site_continuity_exchange_packet_site_id_missing');
  if (!packet?.relation_id) errors.push('site_continuity_exchange_packet_relation_id_missing');
  if (!packet?.source_embodiment_kind) errors.push('site_continuity_exchange_packet_source_missing');
  if (!packet?.target_embodiment_kind) errors.push('site_continuity_exchange_packet_target_missing');
  if (!Array.isArray(packet?.decisions)) errors.push('site_continuity_exchange_packet_decisions_missing');
  if (!Array.isArray(packet?.projections)) errors.push('site_continuity_exchange_packet_projections_missing');
  if (!Array.isArray(packet?.evidence_refs)) errors.push('site_continuity_exchange_packet_evidence_refs_missing');
  if (!Array.isArray(packet?.executable_mutation_requests)) errors.push('site_continuity_exchange_packet_mutation_requests_missing');
  const bindingValidation = validateSiteContinuityBinding(packet?.binding);
  if (!bindingValidation.ok) {
    for (const error of bindingValidation.errors) errors.push(`binding:${error}`);
  }
  if (packet?.binding?.site_id && packet?.site_id && packet.binding.site_id !== packet.site_id) {
    errors.push('site_continuity_exchange_packet_site_id_mismatch');
  }
  for (const projection of packet?.projections ?? []) {
    if (!projection?.projection_class) errors.push('site_continuity_exchange_packet_projection_class_missing');
    if (!projection?.source_cursor) errors.push(`site_continuity_exchange_packet_projection_cursor_missing:${projection?.projection_class ?? 'unknown'}`);
  }
  for (const evidenceRef of packet?.evidence_refs ?? []) {
    if (!evidenceRef?.evidence_ref) errors.push('site_continuity_exchange_packet_evidence_ref_missing');
    if (!evidenceRef?.authority_locus) errors.push(`site_continuity_exchange_packet_evidence_authority_missing:${evidenceRef?.evidence_ref ?? 'unknown'}`);
  }
  return { ok: errors.length === 0, errors };
}

function classifySiteContinuityExchangePacket(packet) {
  const validation = validateSiteContinuityExchangePacket(packet);
  if (!validation.ok) {
    return packetDecision({
      action: SITE_CONTINUITY_ACTIONS.REFUSE,
      reason: 'site_continuity_exchange_packet_invalid',
      packet,
      validation_errors: validation.errors,
    });
  }
  if ((packet.executable_mutation_requests ?? []).length > 0) {
    return packetDecision({
      action: SITE_CONTINUITY_ACTIONS.REFUSE,
      reason: 'site_continuity_exchange_packet_executable_mutation_refused',
      packet,
      evidence_required: ['authority_route_refusal'],
      confirmation_required: ['mutation_requests_not_imported'],
    });
  }
  const hasEvidenceRefs = (packet.evidence_refs ?? []).length > 0;
  const hasProjections = (packet.projections ?? []).length > 0;
  return packetDecision({
    action: hasEvidenceRefs ? SITE_CONTINUITY_ACTIONS.EVIDENCE_ONLY : SITE_CONTINUITY_ACTIONS.PROJECTION_ONLY,
    reason: hasEvidenceRefs
      ? 'site_continuity_exchange_packet_evidence_projection_admitted'
      : 'site_continuity_exchange_packet_projection_admitted',
    packet,
    evidence_required: hasEvidenceRefs ? ['canonical_mutation_evidence_ref'] : ['projection_source_cursor'],
    confirmation_required: hasProjections ? ['freshness_or_cursor_disclosure'] : ['binding_relation_disclosure'],
  });
}

function validateSiteContinuityBinding(binding) {
  const errors = [];
  if (!binding || typeof binding !== 'object') errors.push('site_continuity_binding_not_object');
  if (binding?.schema !== SITE_CONTINUITY_BINDING_SCHEMA) errors.push('site_continuity_binding_schema_mismatch');
  if (binding?.classifier_version !== SITE_CONTINUITY_CLASSIFIER_VERSION) errors.push('site_continuity_binding_classifier_version_mismatch');
  if (!binding?.site_id) errors.push('site_continuity_binding_site_id_missing');
  if (binding?.relation_kind !== SITE_CONTINUITY_RELATION_KINDS.SAME_SITE_EMBODIMENT) errors.push('site_continuity_binding_relation_kind_invalid');
  if (!binding?.relation_id) errors.push('site_continuity_binding_relation_id_missing');
  if (!Array.isArray(binding?.embodiments)) errors.push('site_continuity_binding_embodiments_missing');

  const seen = new Set();
  for (const embodiment of binding?.embodiments ?? []) {
    const kind = embodiment?.embodiment_kind;
    if (!Object.values(SITE_CONTINUITY_EMBODIMENT_KINDS).includes(kind)) errors.push(`site_continuity_embodiment_kind_invalid:${kind ?? 'missing'}`);
    if (seen.has(kind)) errors.push(`site_continuity_embodiment_duplicate:${kind}`);
    seen.add(kind);
    if (!embodiment?.site_ref) errors.push(`site_continuity_embodiment_site_ref_missing:${kind ?? 'missing'}`);
    if (!embodiment?.authority_locus) errors.push(`site_continuity_embodiment_authority_locus_missing:${kind ?? 'missing'}`);
  }

  if (!seen.has(SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS)) errors.push('site_continuity_local_windows_embodiment_missing');
  if (!seen.has(SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER)) errors.push('site_continuity_cloudflare_embodiment_missing');
  return { ok: errors.length === 0, errors };
}

function classifySiteContinuityExchange(binding, request = {}) {
  const validation = validateSiteContinuityBinding(binding);
  const exchangeClass = String(request.exchange_class ?? 'unknown_exchange_class');
  const sourceEmbodiment = String(request.source_embodiment_kind ?? 'unknown_source_embodiment');
  const targetEmbodiment = String(request.target_embodiment_kind ?? 'unknown_target_embodiment');

  if (!validation.ok) {
    return decision({
      action: SITE_CONTINUITY_ACTIONS.REFUSE,
      reason: 'site_continuity_binding_invalid',
      exchangeClass,
      sourceEmbodiment,
      targetEmbodiment,
      validation_errors: validation.errors,
    });
  }

  if (request.site_id && String(request.site_id) !== binding.site_id) {
    return decision({
      action: SITE_CONTINUITY_ACTIONS.REFUSE,
      reason: 'site_continuity_site_id_mismatch',
      exchangeClass,
      sourceEmbodiment,
      targetEmbodiment,
      binding,
    });
  }

  const source = findEmbodiment(binding, sourceEmbodiment);
  const target = findEmbodiment(binding, targetEmbodiment);
  if (!source || !target) {
    return decision({
      action: SITE_CONTINUITY_ACTIONS.REFUSE,
      reason: 'site_continuity_unknown_embodiment',
      exchangeClass,
      sourceEmbodiment,
      targetEmbodiment,
      binding,
    });
  }

  switch (exchangeClass) {
    case SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING:
      return decision({
        action: SITE_CONTINUITY_ACTIONS.ADMIT,
        reason: 'site_continuity_same_site_binding_admitted',
        exchangeClass,
        sourceEmbodiment,
        targetEmbodiment,
        binding,
        evidence_required: ['site_id_match', 'same_site_relation_record'],
        confirmation_required: ['both_embodiments_present'],
      });
    case SITE_CONTINUITY_EXCHANGE_CLASSES.AUTHORITY_MAP_PROJECTION:
      return decision({
        action: SITE_CONTINUITY_ACTIONS.PROJECTION_ONLY,
        reason: 'site_continuity_authority_map_projection_only',
        exchangeClass,
        sourceEmbodiment,
        targetEmbodiment,
        binding,
        evidence_required: ['site_authority_map_ref'],
        confirmation_required: ['classifier_version_disclosed'],
      });
    case SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION:
      return decision({
        action: SITE_CONTINUITY_ACTIONS.PROJECTION_ONLY,
        reason: 'site_continuity_read_model_projection_only',
        exchangeClass,
        sourceEmbodiment,
        targetEmbodiment,
        binding,
        evidence_required: ['projection_source_cursor'],
        confirmation_required: ['freshness_or_cursor_disclosure'],
      });
    case SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE:
      return decision({
        action: SITE_CONTINUITY_ACTIONS.EVIDENCE_ONLY,
        reason: 'site_continuity_mutation_evidence_reference_only',
        exchangeClass,
        sourceEmbodiment,
        targetEmbodiment,
        binding,
        evidence_required: ['canonical_mutation_evidence_ref'],
        confirmation_required: ['authority_locus_disclosed'],
      });
    case SITE_CONTINUITY_EXCHANGE_CLASSES.CROSS_EMBODIMENT_MUTATION_EXECUTION:
      return decision({
        action: SITE_CONTINUITY_ACTIONS.REFUSE,
        reason: 'site_continuity_cross_embodiment_mutation_execution_refused',
        exchangeClass,
        sourceEmbodiment,
        targetEmbodiment,
        binding,
        evidence_required: ['authority_route_refusal'],
        confirmation_required: ['source_authority_locus_disclosed', 'target_authority_locus_disclosed'],
      });
    default:
      return decision({
        action: SITE_CONTINUITY_ACTIONS.REFUSE,
        reason: 'site_continuity_exchange_class_unresolved',
        exchangeClass,
        sourceEmbodiment,
        targetEmbodiment,
        binding,
      });
  }
}

function findEmbodiment(binding, embodimentKind) {
  return binding.embodiments.find((embodiment) => embodiment.embodiment_kind === embodimentKind) ?? null;
}

function decision({
  action,
  reason,
  exchangeClass,
  sourceEmbodiment,
  targetEmbodiment,
  binding = null,
  evidence_required = [],
  confirmation_required = [],
  validation_errors = [],
}) {
  return {
    schema: SITE_CONTINUITY_DECISION_SCHEMA,
    classifier_version: SITE_CONTINUITY_CLASSIFIER_VERSION,
    action,
    reason,
    exchange_class: exchangeClass,
    source_embodiment_kind: sourceEmbodiment,
    target_embodiment_kind: targetEmbodiment,
    site_id: binding?.site_id ?? null,
    relation_id: binding?.relation_id ?? null,
    relation_kind: binding?.relation_kind ?? null,
    source_authority_locus: findEmbodiment(binding ?? { embodiments: [] }, sourceEmbodiment)?.authority_locus ?? null,
    target_authority_locus: findEmbodiment(binding ?? { embodiments: [] }, targetEmbodiment)?.authority_locus ?? null,
    evidence_required: [...evidence_required],
    confirmation_required: [...confirmation_required],
    validation_errors: [...validation_errors],
  };
}

export {
  SITE_CONTINUITY_ACTIONS,
  SITE_CONTINUITY_BINDING_SCHEMA,
  SITE_CONTINUITY_BINDING_REGISTRY_SCHEMA,
  SITE_CONTINUITY_CLASSIFIER_VERSION,
  SITE_CONTINUITY_DECISION_SCHEMA,
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_PACKET_SCHEMA,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  SITE_CONTINUITY_RELATION_KINDS,
  classifySiteContinuityExchangePacket,
  classifySiteContinuityExchange,
  createSiteContinuityExchangePacket,
  createSiteContinuityPacketId,
  createSiteContinuityBinding,
  createSiteContinuityBindingRegistry,
  listSiteContinuityBindingSites,
  validateSiteContinuityExchangePacket,
  validateSiteContinuityBinding,
  validateSiteContinuityBindingRegistry,
};
