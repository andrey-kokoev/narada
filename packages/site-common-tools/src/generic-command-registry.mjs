const COMMAND_REGISTRY_ENTRIES = Object.freeze([
  entry('narada.command.inbox.submit.v1', 'narada.command.inbox.submit.result.v1', 'inbox', 'mutation', ['inbox_submit'], {
    payload_schemas: ['narada.inbox.envelope.payload.v0'],
    read_surface_policy: 'preserve_specialized_inbox_read_filters',
    semantic_guards: ['target_locus_guard', 'principal_verification', 'envelope_payload_ref_admission'],
  }),
  entry('narada.command.inbox.submit_typed_envelope.v1', 'narada.command.inbox.submit_typed_envelope.result.v1', 'inbox', 'mutation', ['inbox_submit_typed_envelope'], {
    payload_schemas: ['narada.inbox.envelope.v0'],
    read_surface_policy: 'preserve_specialized_inbox_read_filters',
    semantic_guards: ['target_locus_guard', 'principal_verification', 'typed_envelope_payload_ref_admission'],
  }),
  entry('narada.command.inbox.acknowledge.v1', 'narada.command.inbox.acknowledge.result.v1', 'inbox', 'mutation', ['inbox_acknowledge'], {
    read_surface_policy: 'preserve_specialized_inbox_read_filters',
    semantic_guards: ['target_locus_guard', 'principal_verification', 'expected_envelope_status_match', 'terminal_state_refusal'],
  }),
  entry('narada.command.inbox.dismiss.v1', 'narada.command.inbox.dismiss.result.v1', 'inbox', 'mutation', ['inbox_dismiss'], {
    read_surface_policy: 'preserve_specialized_inbox_read_filters',
    semantic_guards: ['target_locus_guard', 'principal_verification', 'expected_envelope_status_match', 'terminal_state_refusal'],
  }),
  entry('narada.command.inbox.promote_capa.v1', 'narada.command.inbox.promote_capa.result.v1', 'inbox', 'mutation', ['capa_promote'], {
    payload_schemas: ['narada.payload.inbox.promote_capa.v1'],
    read_surface_policy: 'preserve_capa_queue_and_relatedness_surfaces',
    semantic_guards: [
      'target_locus_guard',
      'architect_or_operator_principal_required',
      'expected_envelope_match',
      'recurrence_evidence_preserved',
      'severity_preserved_or_derived_by_domain',
      'responsible_agent_preserved_as_promoted_by',
      'corrective_coverage_preserved_by_capa_queue',
    ],
  }),
  entry('narada.command.inbox.capa_related.v1', 'narada.command.inbox.capa_related.result.v1', 'inbox', 'mutation', ['capa_related'], {
    read_surface_policy: 'preserve_capa_related_filter_semantics',
    semantic_guards: ['target_locus_guard', 'relatedness_terms_preserved', 'durable_state_changed_false'],
  }),
  entry('narada.command.inbox.capability_review_complete.v1', 'narada.command.inbox.capability_review_complete.result.v1', 'inbox', 'mutation', ['capability_review_complete'], {
    read_surface_policy: 'preserve_capability_next_filter_semantics',
    semantic_guards: ['target_locus_guard', 'expected_capability_match', 'review_status_preserved', 'recovery_truthfulness_guard_delegated'],
  }),
  entry('narada.command.inbox.export_disposition_ledger.v1', 'narada.command.inbox.export_disposition_ledger.result.v1', 'inbox', 'mutation', ['inbox_export_disposition_ledger'], {
    read_surface_policy: 'preserve_disposition_ledger_export_shape',
    semantic_guards: ['target_locus_guard', 'expected_output_path_match'],
  }),
  entry('narada.command.site_target.reconcile.v1', 'narada.command.site_target.reconcile.result.v1', 'site_target', 'mutation', ['site_target_reconcile', 'setup_site'], {
    read_surface_policy: 'preserve_site_target_record_projection',
    result_statuses: ['fulfilled', 'target_record_not_fulfilled', 'ready_with_residuals', 'blocked_orientation'],
    semantic_guards: [
      'operational_readiness_distinct_from_authoritative_record_fulfillment',
      'target_site_root_explicit',
      'target_locus_guard',
      'residuals_preserved',
    ],
  }),
  entry('narada.command.agent_context.hydrate_current.v1', 'narada.command.agent_context.hydrate_current.result.v1', 'agent_context', 'mutation', ['agent_context_hydrate_current', 'startup_sequence'], {
    read_surface_policy: 'preserve_startup_orientation_projection',
    result_statuses: ['ready', 'ready_with_residuals', 'blocked_orientation', 'blocked_grounding', 'blocked_workboard', 'blocked_identity'],
    semantic_guards: [
      'startup_readiness_status_preserved',
      'checkpoint_status_preserved',
      'residuals_preserved',
      'action_authority_distinct_from_observation_readiness',
    ],
  }),
  entry('narada.command.agent_context.doctrinal_grounding.v1', 'narada.command.agent_context.doctrinal_grounding.result.v1', 'agent_context', 'mutation', ['agent_context_doctrinal_grounding'], {
    read_surface_policy: 'preserve_doctrine_grounding_projection',
    result_statuses: ['grounded', 'unavailable', 'missing_target_local_doctrine'],
    semantic_guards: [
      'target_local_source_status_preserved',
      'missing_target_local_doctrine_classified_as_capa_pressure',
      'doctrine_catalog_preserved',
    ],
  }),
  entry('narada.command.agent_context.site_evolution_orientation_create.v1', 'narada.command.agent_context.site_evolution_orientation_create.result.v1', 'agent_context', 'mutation', ['agent_context_site_evolution_orientation_create'], {
    read_surface_policy: 'preserve_site_evolution_orientation_projection',
    result_statuses: ['created', 'degraded', 'missing'],
    semantic_guards: [
      'orientation_snapshot_schema_preserved',
      'source_hashes_preserved',
      'target_local_doctrine_status_preserved',
      'degraded_reason_preserved',
    ],
  }),
  entry('narada.command.site_lift.create_package.v1', 'narada.command.site_lift.create_package.result.v1', 'site_lift', 'mutation', ['site_lift_create_package'], {
    read_surface_policy: 'preserve_site_lift_package_preview',
    result_statuses: ['package_created', 'ready_with_residuals', 'blocked_orientation'],
    semantic_guards: ['source_site_truth_distinct_from_target_admission', 'package_payload_ref_preserved', 'residuals_preserved'],
  }),
  entry('narada.command.site_lift.send_package.v1', 'narada.command.site_lift.send_package.result.v1', 'site_lift', 'mutation', ['site_lift_send_package'], {
    read_surface_policy: 'preserve_site_lift_delivery_evidence',
    result_statuses: ['sent', 'queued', 'target_record_not_fulfilled'],
    semantic_guards: ['target_admission_not_inferred_from_send', 'delivery_evidence_preserved', 'target_locus_guard'],
  }),
  entry('narada.command.task.create.v1', 'narada.command.task.create.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_create'], {
    payload_schemas: ['narada.task.lifecycle.create_payload.v1'],
    semantic_guards: ['payload_ref_first', 'target_locus_guard', 'task_creation_schema_preserved'],
  }),
  entry('narada.command.task.chapter_upsert.v1', 'narada.command.task.chapter_upsert.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_chapter_upsert'], {
    semantic_guards: ['target_locus_guard', 'chapter_identity_preserved'],
  }),
  entry('narada.command.task.claim.v1', 'narada.command.task.claim.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_claim'], {
    semantic_guards: ['narada_agent_id_enforced', 'preferred_agent_override_authority_preserved', 'target_locus_guard'],
  }),
  entry('narada.command.task.finish.v1', 'narada.command.task.finish.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_finish', 'task_lifecycle_submit_report'], {
    payload_schemas: ['narada.task.lifecycle.finish_payload.v1'],
    semantic_guards: ['payload_ref_first', 'narada_agent_id_enforced', 'evidence_admission_preserved', 'recovery_truthfulness_guard_preserved'],
  }),
  entry('narada.command.task.review.v1', 'narada.command.task.review.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_review'], {
    payload_schemas: ['narada.task.lifecycle.review_payload.v1'],
    semantic_guards: ['payload_ref_first', 'narada_agent_id_enforced', 'single_operator_review_guard_preserved', 'acceptance_provenance_preserved'],
  }),
  entry('narada.command.task.close.v1', 'narada.command.task.close.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_close'], {
    semantic_guards: ['narada_agent_id_enforced', 'closure_authority_preserved', 'target_locus_guard'],
  }),
  entry('narada.command.task.admit_evidence.v1', 'narada.command.task.admit_evidence.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_admit_evidence'], {
    semantic_guards: ['narada_agent_id_enforced', 'evidence_admission_preserved', 'target_locus_guard'],
  }),
  entry('narada.command.task.disposition_closeout.v1', 'narada.command.task.disposition_closeout.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_disposition_closeout', 'task_lifecycle_closeout'], {
    payload_schemas: ['narada.task.lifecycle.disposition_closeout_payload.v1'],
    semantic_guards: ['payload_ref_first', 'inbox_disposition_evidence_preserved', 'criteria_proof_preserved', 'target_locus_guard'],
  }),
  entry('narada.command.task.inbox_target.v1', 'narada.command.task.inbox_target.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_inbox_target'], {
    semantic_guards: ['inbox_disposition_evidence_preserved', 'target_locus_guard', 'bridge_preview_preserved'],
  }),
  entry('narada.command.task.test_replay.v1', 'narada.command.task.test_replay.result.v1', 'task_lifecycle', 'mutation', ['task_lifecycle_replay_test_evidence'], {
    payload_schemas: ['narada.task.lifecycle.test_replay_payload.v1'],
    semantic_guards: ['payload_ref_first', 'narada_agent_id_enforced', 'test_evidence_replay_preserved'],
  }),
]);

const COMMAND_REGISTRY = new Map(COMMAND_REGISTRY_ENTRIES.map((item) => [item.command_schema, item]));

export function genericCommandRegistryEntries() {
  return COMMAND_REGISTRY_ENTRIES.map(cloneEntry);
}

export function genericCommandSchemaMetadata(commandSchema) {
  const entry = COMMAND_REGISTRY.get(commandSchema);
  return entry ? cloneEntry(entry) : null;
}

export function supportedGenericCommandSchemas() {
  return new Set(COMMAND_REGISTRY.keys());
}

export function genericCommandRegistrySummary() {
  const entries = genericCommandRegistryEntries();
  return {
    schema: 'narada.generic_command.registry.v1',
    count: entries.length,
    supported_command_schemas: entries.map((item) => item.command_schema),
    domains: [...new Set(entries.map((item) => item.domain))].sort(),
    entries,
  };
}

function entry(commandSchema, resultSchema, domain, mutationClass, compatibilityFacades, options = {}) {
  return Object.freeze({
    command_schema: commandSchema,
    result_schema: resultSchema,
    domain,
    mutation_class: mutationClass,
    compatibility_facades: Object.freeze(compatibilityFacades),
    payload_schemas: Object.freeze(options.payload_schemas ?? []),
    read_surface_policy: options.read_surface_policy ?? 'preserve_specialized_read_surface',
    result_statuses: Object.freeze(options.result_statuses ?? []),
    semantic_guards: Object.freeze(options.semantic_guards ?? []),
    osm_send_path: false,
  });
}

function cloneEntry(item) {
  return {
    ...item,
    compatibility_facades: [...item.compatibility_facades],
    payload_schemas: [...item.payload_schemas],
    result_statuses: [...item.result_statuses],
    semantic_guards: [...item.semantic_guards],
  };
}
