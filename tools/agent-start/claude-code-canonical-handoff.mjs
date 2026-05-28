import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const CANONICAL_SURFACES = {
  task: {
    surface: 'task_candidate',
    authority_owner: 'task_governance_service',
    request_schema: 'narada.task_candidate.request.v0',
    admission_kind: 'inbox_submit_task_candidate',
  },
  inbox: {
    surface: 'inbox_envelope',
    authority_owner: 'canonical_inbox_service',
    request_schema: 'narada.inbox_envelope.request.v0',
    admission_kind: 'inbox_submit_proposal',
  },
  command: {
    surface: 'command_execution_intent',
    authority_owner: 'command_execution_intent_service',
    request_schema: 'narada.command_execution_intent.request.v0',
    admission_kind: 'inbox_submit_command_request',
  },
  outbox: {
    surface: 'outbox_intent',
    authority_owner: 'canonical_outbox_service',
    request_schema: 'narada.outbox_intent.request.v0',
    admission_kind: 'outbox_compose_payload_ref',
  },
  publication: {
    surface: 'publication_intent',
    authority_owner: 'repository_publication_intent_service',
    request_schema: 'narada.repository_publication_intent.request.v0',
    admission_kind: 'publication_prepare_include_request',
  },
};

function handoffId(decision) {
  return `canonical_handoff_${decision.envelope.request_id}`;
}

function handoffPath(siteRoot, id) {
  return join(siteRoot, '.narada', 'crew', 'claude-code-canonical-handoffs', `${id}.json`);
}

function canonicalRequestPath(siteRoot, id) {
  return join(siteRoot, '.narada', 'crew', 'claude-code-canonical-requests', `${id}.request.json`);
}

function canonicalAdmissionCommand(handoff, requestPath) {
  const request = handoff.canonical_request;
  const sourceRef = request.source_mediation_evidence_path ?? request.source_effect_request_id;
  const principal = request.agent_id;
  const targetLocus = request.target_locus;
  if (handoff.admission_kind === 'inbox_submit_task_candidate') {
    return {
      executable: 'narada',
      args: [
        'inbox', 'submit',
        '--source-kind', 'agent_report',
        '--source-ref', sourceRef,
        '--kind', 'task_candidate',
        '--authority-level', 'agent_reported',
        '--principal', principal,
        '--payload-file', requestPath,
        '--target-locus', targetLocus,
        '--format', 'json',
      ],
      mutates_canonical_surface_only: true,
    };
  }
  if (handoff.admission_kind === 'inbox_submit_proposal' || handoff.admission_kind === 'inbox_submit_command_request') {
    return {
      executable: 'narada',
      args: [
        'inbox', 'submit',
        '--source-kind', 'agent_report',
        '--source-ref', sourceRef,
        '--kind', handoff.admission_kind === 'inbox_submit_command_request' ? 'command_request' : 'proposal',
        '--authority-level', 'agent_reported',
        '--principal', principal,
        '--payload-file', requestPath,
        '--target-locus', targetLocus,
        '--format', 'json',
      ],
      mutates_canonical_surface_only: true,
    };
  }
  if (handoff.admission_kind === 'outbox_compose_payload_ref') {
    return {
      executable: 'narada',
      args: [
        'outbox', 'compose',
        '--target-kind', 'claude_code_effect_request',
        '--target-ref', request.source_effect_request_id,
        '--transport', 'canonical_handoff',
        '--payload-ref', requestPath,
        '--authority-level', 'agent_reported',
        '--principal', principal,
        '--by', principal,
        '--format', 'json',
      ],
      mutates_canonical_surface_only: true,
    };
  }
  return {
    executable: 'narada',
    args: [
      'publication', 'prepare',
      '--message', `Claude Code publication intent ${request.source_effect_request_id}`,
      '--by', principal,
      '--include', requestPath,
      '--format', 'json',
    ],
    mutates_canonical_surface_only: true,
  };
}

function runNaradaCommand(command, { cwd }) {
  const result = spawnSync(command.executable, command.args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return {
    status: result.status === 0 ? 'success' : 'error',
    exit_code: result.status,
    signal: result.signal,
    stdout_excerpt: (result.stdout ?? '').slice(0, 4000),
    stderr_excerpt: (result.stderr ?? '').slice(0, 4000),
  };
}

function canonicalRequestFromDecision(decision, { sourceEvidencePath = null } = {}) {
  const envelope = decision.envelope;
  const mapping = CANONICAL_SURFACES[envelope.effect_kind];
  if (!mapping) {
    return {
      schema: 'narada.agent_start.claude_code_canonical_handoff.v0',
      status: 'refused',
      reason: 'unsupported_effect_kind',
      diagnostic: `No canonical surface mapping exists for '${envelope.effect_kind}'.`,
      request_id: handoffId(decision),
      canonical_request: null,
      direct_mutation_performed: false,
    };
  }
  if (decision.status !== 'inert_candidate') {
    return {
      schema: 'narada.agent_start.claude_code_canonical_handoff.v0',
      status: 'refused',
      reason: decision.reason ?? 'mediation_not_admitted',
      diagnostic: decision.diagnostic ?? 'Mediated request is not an inert admitted candidate.',
      request_id: handoffId(decision),
      carrier_session_id: envelope.carrier_session_id,
      canonical_surface: mapping.surface,
      canonical_request: null,
      source_evidence_path: sourceEvidencePath,
      direct_mutation_performed: false,
    };
  }
  if (!envelope.target_locus) {
    return {
      schema: 'narada.agent_start.claude_code_canonical_handoff.v0',
      status: 'refused',
      reason: 'target_locus_ambiguous',
      diagnostic: 'Canonical handoff requires an explicit target locus.',
      request_id: handoffId(decision),
      carrier_session_id: envelope.carrier_session_id,
      canonical_surface: mapping.surface,
      canonical_request: null,
      source_evidence_path: sourceEvidencePath,
      direct_mutation_performed: false,
    };
  }

  return {
    schema: 'narada.agent_start.claude_code_canonical_handoff.v0',
    status: 'canonical_request_created',
    reason: 'bounded_request_artifact_only',
    request_id: handoffId(decision),
    carrier_session_id: envelope.carrier_session_id,
    agent_id: envelope.agent_id,
    canonical_surface: mapping.surface,
    authority_owner: mapping.authority_owner,
    admission_kind: mapping.admission_kind,
    source_evidence_path: sourceEvidencePath,
    canonical_request: {
      schema: mapping.request_schema,
      status: 'awaiting_canonical_admission',
      target_locus: envelope.target_locus,
      carrier_session_id: envelope.carrier_session_id,
      agent_id: envelope.agent_id,
      source_effect_request_id: envelope.request_id,
      source_mediation_evidence_path: sourceEvidencePath,
      payload_summary: envelope.payload_summary,
      requested_capability: envelope.requested_capability,
      raw_payload_recorded: false,
      raw_secret_values_recorded: false,
      carrier_mutation_admitted: false,
    },
    direct_mutation_performed: false,
    canonical_authority_executed: false,
  };
}

function writeCanonicalHandoff(siteRoot, handoff, requestPath = null) {
  const serializable = requestPath && handoff.canonical_request
    ? {
        ...handoff,
        canonical_request_path: requestPath,
        canonical_admission_command: canonicalAdmissionCommand(handoff, requestPath),
      }
    : handoff;
  const path = handoffPath(siteRoot, handoff.request_id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(serializable, null, 2)}\n`, 'utf8');
  return { path, handoff: serializable };
}

function writeCanonicalRequest(siteRoot, handoff) {
  if (!handoff.canonical_request) return null;
  const path = canonicalRequestPath(siteRoot, handoff.request_id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(handoff.canonical_request, null, 2)}\n`, 'utf8');
  return path;
}

function createCanonicalHandoff(siteRoot, decision, options = {}) {
  const handoff = canonicalRequestFromDecision(decision, options);
  const requestPath = writeCanonicalRequest(siteRoot, handoff);
  const written = writeCanonicalHandoff(siteRoot, handoff, requestPath);
  let admitted = null;
  if (options.admit === true && written.handoff.canonical_admission_command) {
    const runner = options.runCanonicalCommand ?? runNaradaCommand;
    admitted = runner(written.handoff.canonical_admission_command, { cwd: siteRoot, handoff: written.handoff });
    written.handoff = {
      ...written.handoff,
      canonical_authority_executed: true,
      canonical_admission_result: admitted,
      direct_mutation_performed: false,
    };
    writeCanonicalHandoff(siteRoot, written.handoff, requestPath);
  }
  return {
    handoff: written.handoff,
    handoff_path: written.path,
    canonical_request_path: requestPath,
    canonical_admission_result: admitted,
  };
}

export {
  CANONICAL_SURFACES,
  canonicalAdmissionCommand,
  canonicalRequestFromDecision,
  createCanonicalHandoff,
  writeCanonicalRequest,
  writeCanonicalHandoff,
};
