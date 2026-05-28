import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EFFECT_TARGETS = {
  task: 'task_governance_service',
  inbox: 'canonical_inbox_service',
  outbox: 'canonical_outbox_service',
  command: 'command_execution_intent_service',
  publication: 'repository_publication_intent_service',
};

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

function requestId(request) {
  return request.request_id ?? `claude_effect_${request.carrier_session_id ?? 'unknown'}_${request.effect_kind ?? 'unknown'}`;
}

function evidencePath(siteRoot, id) {
  return join(siteRoot, '.narada', 'crew', 'claude-code-effect-requests', `${id}.json`);
}

function inspectPayloadForSecrets(value, path = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...inspectPayloadForSecrets(item, [...path, String(index)])));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (SECRET_KEY_PATTERN.test(key)) {
        findings.push(childPath.join('.'));
      }
      findings.push(...inspectPayloadForSecrets(child, childPath));
    }
    return findings;
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
    findings.push(path.join('.') || '<payload>');
  }
  return findings;
}

function payloadSummary(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return {
      shape: Array.isArray(payload) ? 'array' : typeof payload,
      keys: [],
      values_omitted: true,
    };
  }
  return {
    shape: Array.isArray(payload) ? 'array' : 'object',
    keys: Object.keys(payload).sort(),
    values_omitted: true,
  };
}

function effectRequestEnvelope(request) {
  const secretFindings = [...new Set(inspectPayloadForSecrets(request.payload ?? {}))];
  return {
    schema: 'narada.agent_start.claude_code_effect_request.v0',
    request_id: requestId(request),
    carrier_session_id: request.carrier_session_id,
    agent_id: request.agent_id,
    effect_kind: request.effect_kind,
    target_locus: request.target_locus,
    requested_capability: request.requested_capability ?? null,
    payload_summary: payloadSummary(request.payload ?? {}),
    payload_secret_findings: secretFindings,
    raw_payload_recorded: false,
    raw_secret_values_recorded: false,
    submitted_at: request.submitted_at ?? new Date().toISOString(),
  };
}

function mediateEffectRequest(request, grants = {}) {
  const envelope = effectRequestEnvelope(request);
  const owner = EFFECT_TARGETS[envelope.effect_kind];
  if (!owner) {
    return {
      schema: 'narada.agent_start.claude_code_effect_decision.v0',
      status: 'refused',
      reason: 'unsupported_effect_kind',
      diagnostic: `Unsupported Claude Code effect kind '${envelope.effect_kind}'. Route through task, inbox, outbox, command, or publication.`,
      envelope,
      authority_owner: null,
      carrier_mutation_admitted: false,
    };
  }
  if (envelope.payload_secret_findings.length > 0) {
    return {
      schema: 'narada.agent_start.claude_code_effect_decision.v0',
      status: 'refused',
      reason: 'secret_bearing_payload',
      diagnostic: `Effect request payload contains secret-like fields at ${envelope.payload_secret_findings.join(', ')}. Submit credential references or capability grants instead of raw secrets.`,
      envelope,
      authority_owner: owner,
      carrier_mutation_admitted: false,
    };
  }
  if (!envelope.target_locus) {
    return {
      schema: 'narada.agent_start.claude_code_effect_decision.v0',
      status: 'refused',
      reason: 'target_locus_ambiguous',
      diagnostic: 'Effect request must name the target locus before admission.',
      envelope,
      authority_owner: owner,
      carrier_mutation_admitted: false,
    };
  }
  if (envelope.requested_capability && grants[envelope.requested_capability] !== true) {
    return {
      schema: 'narada.agent_start.claude_code_effect_decision.v0',
      status: 'refused',
      reason: 'missing_capability_grant',
      diagnostic: `Capability '${envelope.requested_capability}' is not granted. Use canonical capability consent before admission.`,
      envelope,
      authority_owner: owner,
      carrier_mutation_admitted: false,
    };
  }

  return {
    schema: 'narada.agent_start.claude_code_effect_decision.v0',
    status: 'inert_candidate',
    reason: 'routed_to_canonical_authority',
    envelope,
    authority_owner: owner,
    carrier_mutation_admitted: false,
    governed_handoff: {
      kind: `${envelope.effect_kind}_candidate`,
      status: 'awaiting_canonical_admission',
      owner,
    },
  };
}

function writeEffectMediationEvidence(siteRoot, decision) {
  const path = evidencePath(siteRoot, decision.envelope.request_id);
  mkdirSync(join(siteRoot, '.narada', 'crew', 'claude-code-effect-requests'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
  return path;
}

export {
  EFFECT_TARGETS,
  effectRequestEnvelope,
  inspectPayloadForSecrets,
  mediateEffectRequest,
  writeEffectMediationEvidence,
};
