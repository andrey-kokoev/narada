import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FALLBACK_MUTATING_TOOLS, FALLBACK_READ_ONLY_TOOLS } from './tool-metadata.mjs';
import {
  actionAdmissionDir,
  listCarrierActionDecisions,
  readCarrierActionDecisionFile,
  showCarrierActionDecision,
  siteEvidenceRoot,
} from './evidence-reader.mjs';

const REQUEST_SCHEMA = 'narada.carrier_action_request.v0';
const DECISION_SCHEMA = 'narada.carrier_action_admission_decision.v0';
const TASK_CANDIDATE_SCHEMA = 'narada.carrier_action_candidate.task.v1';
const INBOX_CANDIDATE_SCHEMA = 'narada.carrier_action_candidate.inbox.v1';
const COMMAND_CANDIDATE_SCHEMA = 'narada.carrier_action_candidate.command.v1';
const CLASSIFIER_VERSION = 'carrier_action_admission.metadata_aware_policy.v1';
const POLICY_VERSION = 'carrier_action_admission.nars_operational_candidates.v1';

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

function candidateDir(siteRoot) {
  return join(actionAdmissionDir(siteRoot), 'candidates');
}

function handoffDir(siteRoot) {
  return join(actionAdmissionDir(siteRoot), 'handoffs');
}

function stableRequestId({ carrierSessionId, turnId, toolCallId }) {
  const full = `${carrierSessionId ?? 'unknown'}\n${turnId ?? 'unknown'}\n${toolCallId ?? 'unknown'}`;
  const digest = createHash('sha256').update(full).digest('hex').slice(0, 16);
  return `car_act_${safeIdPart(carrierSessionId)}_${safeIdPart(turnId)}_${safeIdPart(toolCallId)}_${digest}`;
}

function safeIdPart(value) {
  return String(value ?? 'unknown')
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'unknown';
}

function inspectPayloadForSecrets(value, path = []) {
  return [...new Set(inspectPayloadForSecretsRaw(value, path))];
}

function inspectPayloadForSecretsRaw(value, path = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...inspectPayloadForSecretsRaw(item, [...path, String(index)])));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (SECRET_KEY_PATTERN.test(key)) findings.push(childPath.join('.'));
      findings.push(...inspectPayloadForSecretsRaw(child, childPath));
    }
    return findings;
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
    findings.push(path.join('.') || '<payload>');
  }
  return findings;
}

function argumentSummary(args = {}) {
  if (!args || typeof args !== 'object') {
    return {
      shape: Array.isArray(args) ? 'array' : typeof args,
      keys: [],
      values_omitted: true,
    };
  }
  return {
    shape: Array.isArray(args) ? 'array' : 'object',
    keys: Object.keys(args).sort(),
    values_omitted: true,
  };
}

function classifyCarrierActionRequest(toolName, args = {}, options = {}) {
  const secretFindings = [...new Set(inspectPayloadForSecrets(args))];
  if (secretFindings.length > 0 || credentialLikeTool(toolName)) {
    return {
      family: 'credential_access',
      authority_owner: 'capability_secret_authority',
      decision: 'refused',
      reason: 'secret_or_credential_bearing_request',
      secret_findings: secretFindings,
      classifier_source: 'payload_secret_scan',
    };
  }

  const metadata = normalizeToolMetadata(options.toolMetadata);
  if (options.toolAvailable === false) {
    return {
      family: 'missing_mcp_tool',
      authority_owner: 'target_site_mcp_surface',
      decision: 'refused',
      reason: 'mcp_tool_not_available',
      secret_findings: [],
      classifier_source: 'live_tool_catalog',
    };
  }

  if (metadata?.read_only === true) {
    return {
      ...readOnlyClassification(metadata.reason ?? 'tool_catalog_metadata_read_only'),
      classifier_source: metadata.source ?? 'tool_metadata',
    };
  }
  if (metadata?.read_only === false) {
    if (metadata.refused === true) {
      return {
        ...refusedClassification(metadata.reason ?? 'tool_metadata_refused_tool', metadata.authority_owner ?? null, metadata.family ?? 'unknown_action_family'),
        classifier_source: metadata.source ?? 'tool_metadata',
      };
    }
    const metadataFamily = normalizeActionFamily(metadata.family ?? metadata.authority_class ?? toolName);
    if (metadataFamily) {
      return {
        ...familyClassification(metadataFamily, metadata.reason ?? 'tool_catalog_metadata_non_read_only'),
        authority_owner: metadata.authority_owner ?? familyClassification(metadataFamily, metadata.reason).authority_owner,
        classifier_source: metadata.source ?? 'tool_metadata',
      };
    }
  }
  if (metadata?.registry_metadata_authoritative === true) {
    return {
      ...refusedClassification(metadata.reason ?? 'surface_registry_tool_not_declared', metadata.authority_owner ?? null, metadata.family ?? 'unknown_action_family'),
      classifier_source: metadata.source ?? 'surface_registry',
    };
  }

  if (FALLBACK_READ_ONLY_TOOLS.has(toolName)) {
    return {
      ...readOnlyClassification('closed_name_fallback_read_only_tool'),
      classifier_source: 'closed_name_fallback',
    };
  }
  if (FALLBACK_MUTATING_TOOLS.has(toolName)) {
    const family = normalizeActionFamily(toolName);
    if (family) return { ...familyClassification(family, 'closed_name_fallback_mutating_tool'), classifier_source: 'closed_name_fallback' };
    return { ...refusedClassification('unsupported_mutating_tool_family', 'narada_proper_authority'), classifier_source: 'closed_name_fallback' };
  }

  if (isCommandIntentTool(toolName)) {
    return { ...familyClassification('command', 'command_intent_request_requires_admission'), classifier_source: 'closed_name_fallback' };
  }
  if (isRawCommandTool(toolName)) {
    return { ...refusedClassification('raw_command_execution_refused', 'command_execution_intent_service', 'command'), classifier_source: 'closed_name_fallback' };
  }
  if (/^task_lifecycle_/i.test(toolName)) {
    return { ...familyClassification('task_lifecycle_mutation', 'task_lifecycle_mutation_requires_canonical_task_authority'), classifier_source: 'closed_name_fallback' };
  }
  if (/^(inbox_|narada_inbox_)/i.test(toolName)) {
    return { ...familyClassification('inbox_admission', 'inbox_mutation_requires_canonical_inbox_authority'), classifier_source: 'closed_name_fallback' };
  }
  if (isOutboxOrPublicationTool(toolName)) {
    return {
      family: 'outbox_publication',
      authority_owner: 'canonical_outbox_service',
      decision: 'refused',
      reason: 'family_not_supported_in_v1_slice',
      secret_findings: [],
      classifier_source: 'closed_name_fallback',
    };
  }
  return { ...refusedClassification('unknown_non_read_only_tool_family', null, 'unknown_action_family'), classifier_source: metadata?.source ?? 'closed_name_fallback' };
}

function normalizeToolMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata;
}

function readOnlyClassification(reason) {
  return {
    family: 'read_only_context',
    authority_owner: 'target_site_read_policy',
    decision: 'read_only_admitted',
    reason,
    secret_findings: [],
  };
}

function familyClassification(family, reason) {
  if (family === 'task_lifecycle_mutation') {
    return {
      family,
      authority_owner: 'task_governance_service',
      decision: 'routed',
      reason,
      secret_findings: [],
    };
  }
  if (family === 'inbox_admission') {
    return {
      family,
      authority_owner: 'canonical_inbox_service',
      decision: 'routed',
      reason,
      secret_findings: [],
    };
  }
  if (family === 'command') {
    return {
      family,
      authority_owner: 'command_execution_intent_service',
      decision: 'routed',
      reason,
      secret_findings: [],
    };
  }
  if (family === 'outbox_publication') {
    return {
      family,
      authority_owner: 'canonical_outbox_service',
      decision: 'refused',
      reason: 'family_not_supported_in_v1_slice',
      secret_findings: [],
    };
  }
  return refusedClassification('unsupported_mutating_tool_family', 'narada_proper_authority');
}

function normalizeActionFamily(value) {
  const text = String(value ?? '');
  if (/task_lifecycle|task_work|narada_task|admit_task|materialize_task/i.test(text)) return 'task_lifecycle_mutation';
  if (/inbox|envelope/i.test(text)) return 'inbox_admission';
  if (/command_request|command_intent/i.test(text)) return 'command';
  if (/outbox|publication|mail_|email_|draft|send|reply/i.test(text)) return 'outbox_publication';
  return null;
}

function refusedClassification(reason, authorityOwner = null, family = 'unknown_action_family') {
  return {
    family,
    authority_owner: authorityOwner,
    decision: 'refused',
    reason,
    secret_findings: [],
  };
}

function credentialLikeTool(toolName) {
  return /(credential|secret|token|password|api[_-]?key|auth)/i.test(toolName);
}

function isCommandIntentTool(toolName) {
  return /^(command_request|command_intent)(_|$)/i.test(toolName);
}

function isRawCommandTool(toolName) {
  return /^(shell|native|exec|process)(_|$)/i.test(toolName) || /(^|_)(shell|command|exec|process)(_run|_start|$)/i.test(toolName);
}

function isOutboxOrPublicationTool(toolName) {
  return /^(outbox_|mail_|email_|publication_)/i.test(toolName) || /(^|_)(draft|send|reply|publish|publication)(_send|$)/i.test(toolName);
}

function createCarrierActionRequest({
  agentId,
  carrierSessionId,
  turnId,
  toolCallId,
  toolName,
  args = {},
  siteRoot,
  sourceKind = 'nars_turn',
  toolMetadata = null,
  toolAvailable = true,
}) {
  const classification = classifyCarrierActionRequest(toolName, args, { toolMetadata, toolAvailable });
  const requestId = stableRequestId({ carrierSessionId, turnId, toolCallId });
  return {
    schema: REQUEST_SCHEMA,
    request_id: requestId,
    classifier_version: CLASSIFIER_VERSION,
    agent_id: agentId,
    carrier_session_id: carrierSessionId,
    source: {
      kind: sourceKind,
      turn_id: turnId ?? null,
      tool_call_id: toolCallId ?? null,
    },
    target_locus: {
      site_root: siteRoot,
      authority_hint: classification.authority_owner,
    },
    requested_action: {
      tool: toolName,
      declared_family: classification.family,
      classification_reason: classification.reason,
      argument_summary: argumentSummary(args),
      payload_secret_findings: classification.secret_findings,
      raw_arguments_recorded: false,
      raw_secret_values_recorded: false,
      classifier_source: classification.classifier_source ?? 'closed_name_fallback',
      classifier_metadata: classifierMetadataSummary(toolMetadata),
    },
  };
}

function classifierMetadataSummary(toolMetadata) {
  const metadata = normalizeToolMetadata(toolMetadata);
  if (!metadata) return null;
  return {
    source: typeof metadata.source === 'string' ? metadata.source : null,
    surface_id: typeof metadata.surface_id === 'string' ? metadata.surface_id : null,
    server_name: typeof metadata.server_name === 'string' ? metadata.server_name : null,
    registry_source: typeof metadata.registry_source === 'string' ? metadata.registry_source : null,
    registry_metadata_authoritative: metadata.registry_metadata_authoritative === true,
    live_tool_catalog_seen: metadata.live_tool_catalog_seen === true,
    available: metadata.available === true,
  };
}

function decideCarrierActionRequest(request) {
  const action = request.requested_action ?? {};
  const classification = {
    family: action.declared_family ?? 'unknown_action_family',
    authority_owner: request.target_locus?.authority_hint ?? null,
    reason: action.classification_reason ?? null,
    secret_findings: action.payload_secret_findings ?? [],
  };
  const decisionShape = decisionForClassification(classification);
  return {
    schema: DECISION_SCHEMA,
    request_id: request.request_id,
    created_at: new Date().toISOString(),
    classifier_version: request.classifier_version ?? CLASSIFIER_VERSION,
    policy_version: POLICY_VERSION,
    decision: decisionShape.decision,
    reason: decisionShape.reason,
    authority_owner: decisionShape.authority_owner,
    carrier_mutation_admitted: false,
    candidate_ref: null,
    execution_attempt_ref: null,
    confirmation_ref: null,
    evidence_path: null,
    request,
  };
}

function decisionForClassification(classification) {
  if (classification.family === 'read_only_context') {
    return {
      decision: 'read_only_admitted',
      reason: classification.reason ?? 'read_only_request_admitted',
      authority_owner: classification.authority_owner ?? 'target_site_read_policy',
    };
  }
  if (classification.family === 'credential_access') {
    return {
      decision: 'refused',
      reason: classification.reason ?? 'secret_or_credential_bearing_request',
      authority_owner: 'capability_secret_authority',
    };
  }
  if (['task_lifecycle_mutation', 'inbox_admission', 'command'].includes(classification.family)) {
    return {
      decision: 'routed',
      reason: classification.reason ?? `${classification.family}_routed_to_candidate`,
      authority_owner: classification.authority_owner,
    };
  }
  if (classification.family === 'outbox_publication') {
    return {
      decision: 'refused',
      reason: 'family_not_supported_in_v1_slice',
      authority_owner: classification.authority_owner ?? 'canonical_outbox_service',
    };
  }
  return {
    decision: 'refused',
    reason: classification.reason ?? 'unknown_non_read_only_tool_family',
    authority_owner: classification.authority_owner ?? null,
  };
}

function writeCarrierActionAdmissionEvidence(siteRoot, decision) {
  const dir = actionAdmissionDir(siteRoot);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${decision.request_id}.json`);
  const persisted = {
    ...decision,
    evidence_path: path,
  };
  writeFileSync(path, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  return {
    path,
    decision: persisted,
  };
}

function createAndWriteCarrierActionAdmission(context) {
  const request = createCarrierActionRequest(context);
  const decision = decideCarrierActionRequest(request);
  const evidencePath = join(actionAdmissionDir(context.siteRoot), `${decision.request_id}.json`);
  let candidatePath = null;
  if (decision.decision === 'routed') {
    const candidate = createCarrierActionCandidate(decision, evidencePath);
    candidatePath = carrierActionCandidatePath(context.siteRoot, candidate);
    decision.candidate_ref = candidatePath;
  }
  const written = writeCarrierActionAdmissionEvidence(context.siteRoot, decision);
  if (decision.decision === 'routed') {
    writeCarrierActionCandidate(context.siteRoot, createCarrierActionCandidate(written.decision, written.path));
  }
  return {
    ...written,
    candidate_path: candidatePath,
  };
}

function createCarrierActionCandidate(decision, evidencePath) {
  const family = decision.request?.requested_action?.declared_family ?? 'unknown_action_family';
  const common = {
    schema: candidateSchemaForFamily(family),
    request_id: decision.request_id,
    created_at: decision.created_at,
    status: 'awaiting_canonical_admission',
    family,
    authority_owner: decision.authority_owner,
    source_admission_evidence_path: evidencePath,
    agent_id: decision.request?.agent_id ?? null,
    carrier_session_id: decision.request?.carrier_session_id ?? null,
    source: decision.request?.source ?? null,
    target_locus: decision.request?.target_locus ?? null,
    requested_action: decision.request?.requested_action ?? null,
    raw_arguments_recorded: false,
    raw_secret_values_recorded: false,
  };
  if (family === 'task_lifecycle_mutation') return { ...common, candidate_kind: 'task_candidate' };
  if (family === 'inbox_admission') return { ...common, candidate_kind: 'inbox_proposal' };
  if (family === 'command') return { ...common, candidate_kind: 'command_request' };
  throw new Error(`Unsupported routed candidate family: ${family}`);
}

function candidateSchemaForFamily(family) {
  if (family === 'task_lifecycle_mutation') return TASK_CANDIDATE_SCHEMA;
  if (family === 'inbox_admission') return INBOX_CANDIDATE_SCHEMA;
  if (family === 'command') return COMMAND_CANDIDATE_SCHEMA;
  return 'narada.carrier_action_candidate.unknown.v1';
}

function candidateExtensionForFamily(family) {
  if (family === 'task_lifecycle_mutation') return 'task';
  if (family === 'inbox_admission') return 'inbox';
  if (family === 'command') return 'command';
  return 'unknown';
}

function writeCarrierActionCandidate(siteRoot, candidate) {
  const dir = candidateDir(siteRoot);
  mkdirSync(dir, { recursive: true });
  const path = carrierActionCandidatePath(siteRoot, candidate);
  writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  return { path, candidate };
}

function carrierActionCandidatePath(siteRoot, candidate) {
  return join(candidateDir(siteRoot), `${candidate.request_id}.${candidateExtensionForFamily(candidate.family)}.json`);
}

export {
  DECISION_SCHEMA,
  CLASSIFIER_VERSION,
  COMMAND_CANDIDATE_SCHEMA,
  INBOX_CANDIDATE_SCHEMA,
  POLICY_VERSION,
  REQUEST_SCHEMA,
  TASK_CANDIDATE_SCHEMA,
  actionAdmissionDir,
  argumentSummary,
  candidateDir,
  classifyCarrierActionRequest,
  createAndWriteCarrierActionAdmission,
  createCarrierActionCandidate,
  createCarrierActionRequest,
  decideCarrierActionRequest,
  handoffDir,
  inspectPayloadForSecrets,
  listCarrierActionDecisions,
  readCarrierActionDecisionFile,
  showCarrierActionDecision,
  siteEvidenceRoot,
  stableRequestId,
  writeCarrierActionAdmissionEvidence,
};
