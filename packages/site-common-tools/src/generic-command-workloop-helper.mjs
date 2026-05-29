import { genericCommandSchemaMetadata } from './generic-command-registry.mjs';

const LOCAL_SITE = 'local_site';

const INTENTS = Object.freeze({
  'task.claim': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.claim.v1',
    expected_kind: 'task_lifecycle_claim',
    required_domain_args: ['task_number', 'agent_id'],
  },
  'task.create': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.create.v1',
    expected_kind: 'task_lifecycle_create',
    required_payload: true,
    payload_schema: 'narada.task.lifecycle.create_payload.v1',
  },
  'task.chapter_upsert': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.chapter_upsert.v1',
    expected_kind: 'task_lifecycle_chapter_upsert',
    required_domain_args: ['chapter_id'],
  },
  'task.finish': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.finish.v1',
    expected_kind: 'task_lifecycle_finish',
    required_domain_args: ['task_number', 'agent_id'],
    payload_schema: 'narada.task.lifecycle.finish_payload.v1',
  },
  'task.report': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.finish.v1',
    expected_kind: 'task_lifecycle_report',
    required_domain_args: ['task_number', 'agent_id'],
    payload_schema: 'narada.task.lifecycle.finish_payload.v1',
  },
  'task.review': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.review.v1',
    expected_kind: 'task_lifecycle_review',
    required_domain_args: ['task_number', 'agent_id', 'verdict'],
    payload_schema: 'narada.task.lifecycle.review_payload.v1',
  },
  'task.close': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.close.v1',
    expected_kind: 'task_lifecycle_close',
    required_domain_args: ['task_number', 'agent_id'],
  },
  'task.admit_evidence': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.admit_evidence.v1',
    expected_kind: 'task_lifecycle_admit_evidence',
    required_domain_args: ['task_number', 'agent_id'],
  },
  'task.disposition_closeout': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.disposition_closeout.v1',
    expected_kind: 'task_lifecycle_disposition_closeout',
    required_domain_args: ['task_number', 'agent_id'],
    payload_schema: 'narada.task.lifecycle.disposition_closeout_payload.v1',
  },
  'task.inbox_target': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.inbox_target.v1',
    expected_kind: 'task_lifecycle_inbox_target',
    required_domain_args: ['task_number', 'agent_id'],
  },
  'task.test_replay': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.test_replay.v1',
    expected_kind: 'task_lifecycle_test_replay',
    required_domain_args: ['agent_id'],
    required_any_domain_args: ['task_number', 'evidence_ref'],
    required_payload: true,
    payload_schema: 'narada.task.lifecycle.test_replay_payload.v1',
  },
  'task.prove_criteria': {
    domain: 'task_lifecycle',
    command_schema: 'narada.command.task.prove_criteria.v1',
    expected_kind: 'task_lifecycle_prove_criteria',
    required_domain_args: ['task_number', 'agent_id'],
    generic_command_unavailable: {
      reason_code: 'generic_command_unavailable',
      planned_schema: 'narada.command.task.prove_criteria.v1',
      narrow_fallback_tool: 'task_lifecycle_prove_criteria',
      reason: 'The migration registry documents prove_criteria as planned/design-only; the live task lifecycle command registry has no admitter yet.',
    },
  },
  'inbox.acknowledge': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.acknowledge.v1',
    expected_kind: 'inbox_envelope_disposition',
    disposition_status: 'acknowledged',
    required_domain_args: ['envelope_id', 'principal'],
  },
  'inbox.submit': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.submit.v1',
    expected_kind: 'inbox_envelope_admission',
    required_payload: true,
    payload_schema: 'narada.inbox.envelope.payload.v0',
  },
  'inbox.submit_typed_envelope': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.submit_typed_envelope.v1',
    expected_kind: 'inbox_envelope_admission',
    required_payload: true,
    payload_schema: 'narada.inbox.envelope.v0',
  },
  'inbox.dismiss': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.dismiss.v1',
    expected_kind: 'inbox_envelope_disposition',
    disposition_status: 'dismissed',
    required_domain_args: ['envelope_id', 'principal', 'reason'],
  },
  'inbox.promote_capa': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.promote_capa.v1',
    expected_kind: 'inbox_capa_promotion',
    required_domain_args: ['envelope_id', 'principal'],
    payload_schema: 'narada.payload.inbox.promote_capa.v1',
  },
  'inbox.capa_related': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.capa_related.v1',
    expected_kind: 'inbox_capa_related_query',
    required_any_domain_args: ['concept_name', 'evidence_terms', 'recurrence_evidence'],
  },
  'inbox.capability_review_complete': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.capability_review_complete.v1',
    expected_kind: 'capability_review_complete',
    required_domain_args: ['capability_id', 'reviewer_agent_id', 'verdict', 'review_status'],
  },
  'inbox.export_disposition_ledger': {
    domain: 'inbox',
    command_schema: 'narada.command.inbox.export_disposition_ledger.v1',
    expected_kind: 'disposition_ledger_export',
    required_domain_args: ['output_path'],
  },
});

export function genericWorkloopMutationIntents() {
  return Object.entries(INTENTS).map(([intent, spec]) => ({
    intent,
    ...clone(spec),
    registry_entry: genericCommandSchemaMetadata(spec.command_schema),
  }));
}

export function buildGenericWorkloopMutation(intent, options = {}) {
  const spec = INTENTS[intent];
  if (!spec) {
    return refusal('unsupported_workloop_mutation_intent', {
      intent,
      supported_intents: Object.keys(INTENTS),
    });
  }

  if (spec.generic_command_unavailable) {
    return {
      schema: 'narada.generic_command.workloop_helper.v1',
      status: 'generic_command_unavailable',
      intent,
      command_schema: spec.command_schema,
      expected_consequence: {
        kind: spec.expected_kind,
        ...expectedSelectors(spec, asObject(options.domain_args ?? options.domainArgs) ?? {}),
      },
      ...spec.generic_command_unavailable,
      narrow_fallback: narrowFallback(spec),
    };
  }

  const targetSiteRoot = stringOrNull(options.target_site_root ?? options.targetSiteRoot);
  if (!targetSiteRoot) {
    return refusal('target_site_root_required', {
      intent,
      required_field: 'target_site_root',
    });
  }

  const authorityBasis = asObject(options.authority_basis ?? options.authorityBasis);
  if (!authorityBasis || !stringOrNull(authorityBasis.summary)) {
    return refusal('authority_basis_required', {
      intent,
      required_field: 'authority_basis.summary',
    });
  }

  const domainArgs = {
    ...asObject(options.domain_args ?? options.domainArgs),
  };
  const payload = maybeSchemaPayload(spec, options.payload);
  const payloadRef = stringOrNull(options.payload_ref ?? options.payloadRef);
  if (payload && payloadRef) {
    return refusal('provide_payload_or_payload_ref_not_both', { intent });
  }

  for (const field of spec.required_domain_args ?? []) {
    if (domainArgs[field] === undefined || domainArgs[field] === null || domainArgs[field] === '') {
      return refusal('domain_arg_required', {
        intent,
        field,
      });
    }
  }

  if (Array.isArray(spec.required_any_domain_args) && !spec.required_any_domain_args.some((field) => domainArgs[field] !== undefined && domainArgs[field] !== null && domainArgs[field] !== '')) {
    return refusal('one_of_domain_args_required', {
      intent,
      fields: [...spec.required_any_domain_args],
    });
  }

  if (spec.required_payload && !payload && !payloadRef) {
    return refusal('payload_or_payload_ref_required', {
      intent,
      payload_schema: spec.payload_schema ?? null,
    });
  }

  const expectedConsequence = {
    kind: spec.expected_kind,
    ...expectedSelectors(spec, domainArgs),
    ...asObject(options.expected_consequence_overlay ?? options.expectedConsequenceOverlay),
  };

  const registryEntry = genericCommandSchemaMetadata(spec.command_schema);
  const args = {
    command_schema: spec.command_schema,
    target_locus: stringOrNull(options.target_locus ?? options.targetLocus) ?? LOCAL_SITE,
    target_site_root: targetSiteRoot,
    authority_basis: authorityBasis,
    domain_args: domainArgs,
    expected_consequence: expectedConsequence,
    dry_run: options.dry_run === true || options.dryRun === true,
  };

  const createdBy = stringOrNull(options.created_by ?? options.createdBy);
  const payloadId = stringOrNull(options.payload_id ?? options.payloadId);
  const commandId = stringOrNull(options.command_id ?? options.commandId);
  if (createdBy) args.created_by = createdBy;
  if (payloadId) args.payload_id = payloadId;
  if (commandId) args.command_id = commandId;
  if (payload) args.payload = payload;
  if (payloadRef) args.payload_ref = payloadRef;

  return {
    schema: 'narada.generic_command.workloop_helper.v1',
    status: 'ready',
    intent,
    mcp_tool_name: 'mcp_command_author_and_submit',
    mcp_server_hint: spec.domain === 'inbox' ? 'narada-andrey-inbox' : 'narada-andrey-task-lifecycle',
    command_schema: spec.command_schema,
    registry_entry: registryEntry,
    arguments: args,
    output_contract: {
      payload_ref: 'mcp_command_author_and_submit.payload_ref',
      command_ref: 'mcp_command_author_and_submit.command_ref',
      result_ref: 'mcp_command_author_and_submit.result_ref',
      refusal_reason: 'mcp_command_author_and_submit.reason_code',
    },
    narrow_fallback: narrowFallback(spec),
  };
}

export function summarizeGenericCommandSubmission(result = {}) {
  const status = stringOrNull(result.status) ?? 'unknown';
  return {
    schema: 'narada.generic_command.workloop_submission_summary.v1',
    status,
    admitted: status === 'admitted' || status === 'success',
    payload_ref: stringOrNull(result.payload_ref),
    command_ref: stringOrNull(result.command_ref),
    result_ref: stringOrNull(result.result_ref),
    refusal_reason: stringOrNull(result.reason_code) ?? stringOrNull(result.error) ?? null,
    remediation: stringOrNull(result.remediation),
  };
}

export function buildGenericCommandAdoptionEvidence(input = {}) {
  const commandSchema = stringOrNull(input.command_schema ?? input.commandSchema);
  const equivalentCommandSchema = stringOrNull(input.equivalent_command_schema ?? input.equivalentCommandSchema);
  const registeredSchema = commandSchema ?? equivalentCommandSchema;
  const registryEntry = registeredSchema ? genericCommandSchemaMetadata(registeredSchema) : null;
  const surfaceKind = stringOrNull(input.surface_kind ?? input.surfaceKind);
  const fallbackReason = stringOrNull(input.fallback_reason ?? input.fallbackReason);
  const payloadRef = stringOrNull(input.payload_ref ?? input.payloadRef);
  const commandRef = stringOrNull(input.command_ref ?? input.commandRef);
  const resultRef = stringOrNull(input.result_ref ?? input.resultRef);

  if (surfaceKind === 'specialized_read' || surfaceKind === 'excluded_surface') {
    return adoptionEvidence(input, {
      mutation_path: surfaceKind,
      review_warning: null,
      review_status: 'not_applicable',
      registry_entry: registryEntry,
      payload_ref: payloadRef,
      command_ref: commandRef,
      result_ref: resultRef,
      equivalent_command_schema: equivalentCommandSchema,
      fallback_reason: fallbackReason,
    });
  }

  if (commandRef && resultRef) {
    return adoptionEvidence(input, {
      mutation_path: 'generic_command',
      review_warning: null,
      review_status: 'ok',
      registry_entry: registryEntry,
      payload_ref: payloadRef,
      command_ref: commandRef,
      result_ref: resultRef,
      equivalent_command_schema: equivalentCommandSchema,
      fallback_reason: fallbackReason,
    });
  }

  if (registryEntry && fallbackReason) {
    return adoptionEvidence(input, {
      mutation_path: 'narrow_facade_fallback',
      review_warning: null,
      review_status: 'ok',
      registry_entry: registryEntry,
      payload_ref: payloadRef,
      command_ref: commandRef,
      result_ref: resultRef,
      equivalent_command_schema: equivalentCommandSchema ?? registeredSchema,
      fallback_reason: fallbackReason,
    });
  }

  if (registryEntry) {
    return adoptionEvidence(input, {
      mutation_path: 'narrow_facade_missing_fallback_reason',
      review_warning: 'registered_mutation_family_missing_command_result_refs_or_fallback_reason',
      review_status: 'finding_required',
      registry_entry: registryEntry,
      payload_ref: payloadRef,
      command_ref: commandRef,
      result_ref: resultRef,
      equivalent_command_schema: equivalentCommandSchema ?? registeredSchema,
      fallback_reason: fallbackReason,
    });
  }

  return adoptionEvidence(input, {
    mutation_path: 'unregistered_or_unknown',
    review_warning: null,
    review_status: 'unknown',
    registry_entry: null,
    payload_ref: payloadRef,
    command_ref: commandRef,
    result_ref: resultRef,
    equivalent_command_schema: equivalentCommandSchema,
    fallback_reason: fallbackReason,
  });
}

function expectedSelectors(spec, domainArgs) {
  if (spec.domain === 'task_lifecycle') {
    const selectors = {
      task_number: domainArgs.task_number,
      agent_id: domainArgs.agent_id,
    };
    if (domainArgs.chapter_id) selectors.chapter_id = domainArgs.chapter_id;
    if (domainArgs.evidence_ref) selectors.evidence_ref = domainArgs.evidence_ref;
    if (domainArgs.verdict) selectors.verdict = domainArgs.verdict;
    for (const key of Object.keys(selectors)) {
      if (selectors[key] === undefined || selectors[key] === null) delete selectors[key];
    }
    return selectors;
  }

  if (spec.expected_kind === 'inbox_envelope_disposition') {
    return {
      envelope_id: domainArgs.envelope_id,
      status: spec.disposition_status,
    };
  }

  if (spec.expected_kind === 'inbox_capa_promotion') {
    return {
      envelope_id: domainArgs.envelope_id,
    };
  }

  if (spec.expected_kind === 'inbox_envelope_admission') {
    const selectors = {
      envelope_status: domainArgs.envelope_status ?? 'received',
    };
    if (domainArgs.envelope_id) selectors.envelope_id = domainArgs.envelope_id;
    return selectors;
  }

  if (spec.expected_kind === 'capability_review_complete') {
    return {
      capability_id: domainArgs.capability_id,
      review_status: domainArgs.review_status,
    };
  }

  if (spec.expected_kind === 'disposition_ledger_export') {
    return {
      output_path: domainArgs.output_path,
    };
  }

  return {};
}

function adoptionEvidence(input, fields) {
  return {
    schema: 'narada.generic_command.adoption_evidence.v1',
    operation_name: stringOrNull(input.operation_name ?? input.operationName) ?? null,
    command_schema: stringOrNull(input.command_schema ?? input.commandSchema) ?? null,
    ...fields,
  };
}

function maybeSchemaPayload(spec, payload) {
  if (payload === undefined || payload === null) return null;
  const object = asObject(payload);
  if (!object) return null;
  if (!spec.payload_schema || object.schema) return object;
  return {
    schema: spec.payload_schema,
    ...object,
  };
}

function narrowFallback(spec) {
  const registryEntry = genericCommandSchemaMetadata(spec.command_schema);
  const facade = registryEntry?.compatibility_facades?.[0] ?? spec.generic_command_unavailable?.narrow_fallback_tool ?? null;
  return facade
    ? {
        status: 'available',
        mcp_tool_name: facade,
        use_when: 'Generic command helper is unavailable or the domain command is not yet registered; preserve the same authority basis and selectors.',
      }
    : {
        status: 'unavailable',
      };
}

function refusal(reasonCode, fields = {}) {
  return {
    schema: 'narada.generic_command.workloop_helper.v1',
    status: 'refused',
    reason_code: reasonCode,
    ...fields,
  };
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
