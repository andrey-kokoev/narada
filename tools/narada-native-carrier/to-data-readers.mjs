import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { buildToDataPacketFixture } from './to-data-packet.mjs';
import { readRegistration, registrationReadiness } from './adapter-registration.mjs';
import { resolveDataReadCapabilityProjection } from './capability-projection.mjs';
import { operationalReadiness, reconstruct } from './readiness.mjs';
import { supervisorDoctor } from './supervisor.mjs';

const NO_MUTATION_FLAGS = Object.freeze({
  task_claim_mutation: false,
  task_report_mutation: false,
  task_review_mutation: false,
  task_close_mutation: false,
  inbox_mutation: false,
  outbox_mutation: false,
  command_mutation: false,
  publication_mutation: false,
  repository_mutation: false,
});

const MAX_EXCERPT_BYTES = 16 * 1024;
const MAX_EXCERPT_LINES = 200;

function runNaradaTaskRead(taskNumber, { siteRoot }) {
  const result = spawnSync('narada', ['task', 'read', String(taskNumber), '--format', 'json', '--cwd', siteRoot], {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`narada task read failed: ${(result.stderr ?? '').slice(0, 500)}`);
  }
  return result.stdout;
}

function runNaradaWorkNextPeek(agentId, { siteRoot }) {
  const result = spawnSync('narada', ['task', 'peek-next', '--agent', agentId, '--format', 'json', '--cwd', siteRoot], {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`narada task peek-next failed: ${(result.stderr ?? '').slice(0, 500)}`);
  }
  return result.stdout;
}

function runNaradaInboxList(_request, { siteRoot, limit }) {
  const result = spawnSync('narada', ['inbox', 'list', '--limit', String(limit), '--format', 'json', '--cwd', siteRoot], {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`narada inbox list failed: ${(result.stderr ?? '').slice(0, 500)}`);
  }
  return result.stdout;
}

async function readCapabilityGate(readFamily, readCapabilityLookup, now) {
  return resolveDataReadCapabilityProjection({
    readFamily,
    capabilityLookup: readCapabilityLookup,
    now,
  });
}

function buildCapabilityRefusalPacket(readFamily, {
  siteRoot,
  carrierSessionId,
  agentId,
  now,
  command,
  requested,
  capability,
}) {
  return buildReadPacket(readFamily, {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested,
    status: 'refused',
    refusal: {
      reason: capability.refusal_reason,
      diagnostic: `Missing or inadmissible data-read consent for ${capability.projection.capability_kind}.`,
    },
    boundedSummary: {
      summary_kind: readFamily,
      read_blocked_by_capability: true,
      raw_values_omitted: true,
    },
    capability,
  });
}

async function readTaskToDataPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  taskNumber,
  runCommand = runNaradaTaskRead,
  readCapabilityLookup,
  now = new Date().toISOString(),
}) {
  const command = ['narada', 'task', 'read', String(taskNumber), '--format', 'json', '--cwd', siteRoot];
  const capability = await readCapabilityGate('task_packet', readCapabilityLookup, now);
  if (capability.status === 'refused') {
    return buildCapabilityRefusalPacket('task_packet', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested: { task_number: taskNumber },
      capability,
    });
  }
  const stdout = await runCommand(taskNumber, { siteRoot, command });
  const parsed = parseJsonSurface(stdout);
  const task = parsed.task ?? parsed.primary ?? parsed.packet ?? parsed;
  return buildReadPacket('task_packet', {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested: { task_number: taskNumber },
    boundedSummary: {
      summary_kind: 'task_packet',
      requested_task_number: taskNumber,
      field_presence: fieldPresence(task, [
        'task_number',
        'task_id',
        'title',
        'status',
        'goal',
        'required_work',
        'acceptance_criteria',
        'assignment',
        'handoff_actionability',
      ]),
      raw_task_markdown_recorded: false,
      raw_values_omitted: true,
    },
    capability,
  });
}

async function readWorkNextToDataPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  runCommand = runNaradaWorkNextPeek,
  noClaimPeekAvailable = true,
  readCapabilityLookup,
  now = new Date().toISOString(),
}) {
  const command = ['narada', 'task', 'peek-next', '--agent', agentId, '--format', 'json', '--cwd', siteRoot];
  const capability = await readCapabilityGate('work_next_peek', readCapabilityLookup, now);
  if (capability.status === 'refused') {
    return buildCapabilityRefusalPacket('work_next_peek', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested: { agent_id: agentId },
      capability,
    });
  }
  if (noClaimPeekAvailable !== true) {
    return buildReadPacket('work_next_peek', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested: { agent_id: agentId },
      status: 'refused',
      refusal: {
        reason: 'no_no_claim_work_next_surface_available',
        diagnostic: 'Only claim-capable work-next surfaces are available; to-data readers must not claim task or inbox work.',
      },
      boundedSummary: {
        summary_kind: 'work_next_peek',
        requested_agent_id: agentId,
        selected_work_present: false,
        field_presence: {},
        raw_values_omitted: true,
      },
      capability,
    });
  }

  const stdout = await runCommand(agentId, { siteRoot, command });
  const parsed = parseJsonSurface(stdout);
  const selected = parsed.primary ?? parsed.packet ?? null;
  return buildReadPacket('work_next_peek', {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested: { agent_id: agentId },
    boundedSummary: {
      summary_kind: 'work_next_peek',
      requested_agent_id: agentId,
      status: parsed.status ?? null,
      action: parsed.action ?? null,
      selected_work_present: selected !== null,
      field_presence: fieldPresence(selected ?? parsed, [
        'task_number',
        'task_id',
        'title',
        'status',
        'goal',
        'handoff_actionability',
        'requested_agent',
        'resolved_agent',
      ]),
      raw_values_omitted: true,
    },
    capability,
  });
}

async function readInboxSummaryToDataPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  limit = 20,
  status = null,
  kind = null,
  runCommand = runNaradaInboxList,
  readCapabilityLookup,
  now = new Date().toISOString(),
}) {
  const command = [
    'narada',
    'inbox',
    'list',
    '--limit',
    String(limit),
    '--format',
    'json',
    '--cwd',
    siteRoot,
  ];
  if (status) command.splice(3, 0, '--status', status);
  if (kind) command.splice(status ? 5 : 3, 0, '--kind', kind);
  const request = { limit, status, kind };
  const capability = await readCapabilityGate('inbox_summary', readCapabilityLookup, now);
  if (capability.status === 'refused') {
    return buildCapabilityRefusalPacket('inbox_summary', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested: request,
      capability,
    });
  }
  const stdout = await runCommand(request, { siteRoot, command, limit, status, kind });
  const parsed = parseJsonSurface(stdout);
  const envelopes = extractEnvelopeArray(parsed).slice(0, limit);
  return buildReadPacket('inbox_summary', {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested: request,
    boundedSummary: {
      summary_kind: 'inbox_summary',
      requested_limit: limit,
      requested_status: status,
      requested_kind: kind,
      envelope_count: envelopes.length,
      envelopes: envelopes.map(summarizeInboxEnvelope),
      raw_payload_values_recorded: false,
      unbounded_payload_text_recorded: false,
      secret_like_values_recorded: false,
      raw_values_omitted: true,
    },
    extra: {
      inbox_status_transition_performed: false,
    },
    capability,
  });
}

async function readReadinessSnapshotToDataPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  readOperationalReadiness = operationalReadiness,
  readSupervisorDoctor = supervisorDoctor,
  readRegistrationReadiness = (root) => registrationReadiness(readRegistration(root)),
  readCapabilityLookup,
  now = new Date().toISOString(),
}) {
  const command = ['operationalReadiness', 'supervisorDoctor', 'registrationReadiness'];
  const capability = await readCapabilityGate('readiness_snapshot', readCapabilityLookup, now);
  if (capability.status === 'refused') {
    return buildCapabilityRefusalPacket('readiness_snapshot', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested: { carrier_session_id: carrierSessionId },
      capability,
    });
  }
  const readiness = await readOperationalReadiness(siteRoot, carrierSessionId);
  const doctor = await readSupervisorDoctor(siteRoot, carrierSessionId);
  const registration = await readRegistrationReadiness(siteRoot);
  return buildReadPacket('readiness_snapshot', {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested: { carrier_session_id: carrierSessionId },
    boundedSummary: {
      summary_kind: 'readiness_snapshot',
      carrier_session_id: carrierSessionId,
      runtime_state: doctor.runtime_state ?? null,
      adapter_posture: readiness.adapter_posture ?? null,
      provider_posture: doctor.provider_posture ?? null,
      capability_posture: registration.capability_posture ?? readiness.capability_posture ?? null,
      registration_status: registration.status ?? null,
      blocked: doctor.blocked === true,
      residual_blocker_count: Array.isArray(readiness.residual_blockers) ? readiness.residual_blockers.length : 0,
      residual_blockers: Array.isArray(readiness.residual_blockers) ? readiness.residual_blockers.slice(0, 20) : [],
      authority_non_claims: Array.isArray(readiness.authority_non_claims) ? readiness.authority_non_claims.slice(0, 20) : [],
      evidence_ref_count: readiness.latest_evidence_refs ? Object.keys(readiness.latest_evidence_refs).length : 0,
      supervisor_event_count: Array.isArray(doctor.supervisor_event_paths) ? doctor.supervisor_event_paths.length : 0,
      raw_provider_output_recorded: false,
      unbounded_transcript_recorded: false,
      raw_secret_values_recorded: false,
      raw_values_omitted: true,
    },
    capability,
  });
}

async function readEvidenceRefSummaryToDataPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  readReconstruction = reconstruct,
  readSupervisorDoctor = supervisorDoctor,
  readCapabilityLookup,
  now = new Date().toISOString(),
}) {
  const command = ['reconstruct', 'supervisorDoctor'];
  const capability = await readCapabilityGate('evidence_ref_summary', readCapabilityLookup, now);
  if (capability.status === 'refused') {
    return buildCapabilityRefusalPacket('evidence_ref_summary', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested: { carrier_session_id: carrierSessionId },
      capability,
    });
  }
  const reconstruction = await readReconstruction(siteRoot, carrierSessionId);
  const doctor = await readSupervisorDoctor(siteRoot, carrierSessionId);
  const refs = {
    ...(reconstruction.evidence_refs ?? {}),
    ...Object.fromEntries((doctor.supervisor_event_paths ?? []).map((path, index) => [`supervisor_${index}`, path])),
  };
  return buildReadPacket('evidence_ref_summary', {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested: { carrier_session_id: carrierSessionId },
    boundedSummary: {
      summary_kind: 'evidence_ref_summary',
      carrier_session_id: carrierSessionId,
      direct_sqlite_inspection_required: reconstruction.direct_sqlite_inspection_required === true,
      evidence_refs: Object.entries(refs).map(([name, path]) => summarizeEvidenceFile(name, path)),
      reconstruction_presence: {
        launch: Boolean(reconstruction.launch),
        adapter: Boolean(reconstruction.adapter),
        proposal: Boolean(reconstruction.proposal),
        interrupt: Boolean(reconstruction.interrupt),
        closeout: Boolean(reconstruction.closeout),
      },
      raw_provider_output_recorded: false,
      unbounded_transcript_recorded: false,
      raw_secret_values_recorded: false,
      raw_values_omitted: true,
    },
    capability,
  });
}

async function readBoundedFileExcerptToDataPacket({
  siteRoot,
  carrierSessionId,
  agentId,
  filePath,
  capabilityRef,
  maxBytes = 4096,
  maxLines = 80,
  readCapabilityLookup = capabilityRef ? async () => ({
    granted: true,
    consent_ref: capabilityRef.consent_ref ?? 'consent://fixture/site-file-excerpt-read',
    policy_ref: capabilityRef.ref ?? 'policy://fixture/site-file-excerpt-read',
    scopes: ['site_file_excerpt_read'],
  }) : null,
  now = new Date().toISOString(),
}) {
  const command = ['bounded_file_excerpt', String(filePath), '--max-bytes', String(maxBytes), '--max-lines', String(maxLines)];
  const requested = { file_path: filePath, max_bytes: maxBytes, max_lines: maxLines };
  const capability = await readCapabilityGate('bounded_file_excerpt', readCapabilityLookup, now);
  if (capability.status === 'refused') {
    return buildCapabilityRefusalPacket('bounded_file_excerpt', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested,
      capability,
    });
  }
  const refusal = fileExcerptRefusal({ siteRoot, filePath, capabilityRef, maxBytes, maxLines });
  if (refusal) {
    return buildReadPacket('bounded_file_excerpt', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested,
      status: 'refused',
      refusal,
      boundedSummary: {
        summary_kind: 'bounded_file_excerpt',
        path: pathAttribution(siteRoot, filePath),
        excerpt_present: false,
        byte_limit: maxBytes,
        line_limit: maxLines,
        redaction_posture: 'not_read_refused_before_content_access',
        raw_values_omitted: true,
      },
      capability,
    });
  }

  const absolutePath = resolve(siteRoot, filePath);
  const bytes = readFileSync(absolutePath);
  if (isBinaryBuffer(bytes)) {
    return buildReadPacket('bounded_file_excerpt', {
      siteRoot,
      carrierSessionId,
      agentId,
      now,
      command,
      requested,
      status: 'refused',
      refusal: { reason: 'binary_file_refused', diagnostic: 'Bounded file excerpt reader only admits text files.' },
      boundedSummary: {
        summary_kind: 'bounded_file_excerpt',
        path: pathAttribution(siteRoot, filePath),
        excerpt_present: false,
        byte_limit: maxBytes,
        line_limit: maxLines,
        redaction_posture: 'binary_file_not_decoded',
        raw_values_omitted: true,
      },
      capability,
    });
  }

  const text = bytes.toString('utf8');
  const lineBounded = text.split(/\r?\n/).slice(0, maxLines).join('\n');
  const excerpt = lineBounded.slice(0, maxBytes);
  return buildReadPacket('bounded_file_excerpt', {
    siteRoot,
    carrierSessionId,
    agentId,
    now,
    command,
    requested,
    boundedSummary: {
      summary_kind: 'bounded_file_excerpt',
      path: pathAttribution(siteRoot, filePath),
      excerpt_present: true,
      excerpt,
      byte_limit: maxBytes,
      line_limit: maxLines,
      bytes_returned: Buffer.byteLength(excerpt, 'utf8'),
      lines_returned: excerpt.length === 0 ? 0 : excerpt.split(/\r?\n/).length,
      truncated_by_bytes: Buffer.byteLength(lineBounded, 'utf8') > maxBytes,
      truncated_by_lines: text.split(/\r?\n/).length > maxLines,
      redaction_posture: 'bounded_excerpt_no_secret_path_no_binary_detection',
      raw_values_omitted: false,
    },
    capability,
  });
}

function buildReadPacket(readFamily, {
  siteRoot,
  carrierSessionId,
  agentId,
  now,
  command,
  requested,
  boundedSummary,
  capability = null,
  status = 'ok',
  refusal = null,
  extra = {},
}) {
  return buildToDataPacketFixture(readFamily, {
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    source_surface: command.join(' '),
    attribution: {
      observed_by: 'narada-native-carrier',
      observed_at: now,
      authority_locus: 'narada-proper',
      site_root: siteRoot,
      cwd: siteRoot,
      command,
      requested,
      evidence_ref: `command:${command.slice(0, 4).join(':')}`,
    },
    freshness: {
      posture: 'bounded_snapshot',
      captured_at: now,
      expires_at: null,
    },
    bounded_summary: boundedSummary,
    ...(capability ? {
      capability_ref: {
        kind: capability.projection.capability_kind,
        ref: capability.projection.capability_ref,
        posture: capability.status,
      },
      capability_projection: capability.projection,
      capability_lookup_status: capability.status,
      capability_lookup_refusal_reason: capability.refusal_reason,
    } : {}),
    read_status: status,
    refusal,
    mutation_flags: { ...NO_MUTATION_FLAGS },
    raw_values_recorded: false,
    authority_mutation_performed: false,
    ...extra,
  });
}

function parseJsonSurface(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function fieldPresence(value, fields) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(fields.map((field) => [field, record[field] !== undefined && record[field] !== null]));
}

function extractEnvelopeArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['envelopes', 'items', 'results', 'records']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  if (parsed.primary && typeof parsed.primary === 'object') return [parsed.primary];
  if (parsed.envelope && typeof parsed.envelope === 'object') return [parsed.envelope];
  return [];
}

function summarizeInboxEnvelope(envelope) {
  const record = envelope && typeof envelope === 'object' && !Array.isArray(envelope) ? envelope : {};
  const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload
    : null;
  const summary = record.summary && typeof record.summary === 'object' && !Array.isArray(record.summary)
    ? record.summary
    : null;
  return {
    envelope_id: scalarOrNull(record.envelope_id ?? record.id),
    status: scalarOrNull(record.status),
    source_ref: scalarOrNull(record.source_ref ?? record.source?.ref),
    kind: scalarOrNull(record.kind ?? record.envelope_kind),
    target_locus: scalarOrNull(record.target_locus ?? record.target?.locus ?? record.routing?.target_locus),
    bounded_summary_fields: {
      title: textShape(record.title ?? summary?.title),
      summary: textShape(record.short_summary ?? summary?.text ?? summary?.summary),
      payload_keys: payload ? safeKeys(payload) : [],
      omitted_secret_like_key_count: payload ? Object.keys(payload).filter(isSecretLikeKey).length : 0,
      payload_value_count: payload ? Object.keys(payload).length : 0,
      payload_values_omitted: true,
    },
  };
}

function scalarOrNull(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
}

function textShape(value) {
  return {
    present: typeof value === 'string' && value.length > 0,
    length: typeof value === 'string' ? value.length : 0,
    value_omitted: true,
  };
}

function safeKeys(record) {
  return Object.keys(record).filter((key) => !isSecretLikeKey(key)).sort();
}

function isSecretLikeKey(key) {
  return /secret|token|password|credential|authorization|api[_-]?key/i.test(key);
}

function fileExcerptRefusal({ siteRoot, filePath, capabilityRef, maxBytes, maxLines }) {
  if (!capabilityRef || capabilityRef.kind !== 'site_file_excerpt_read') {
    return {
      reason: 'missing_site_file_excerpt_read_capability',
      diagnostic: 'A site_file_excerpt_read capability reference is required before local file reads.',
    };
  }
  if (maxBytes > MAX_EXCERPT_BYTES || maxLines > MAX_EXCERPT_LINES || maxBytes < 0 || maxLines < 0) {
    return {
      reason: 'oversized_excerpt_refused',
      diagnostic: `Excerpt bounds must be within ${MAX_EXCERPT_BYTES} bytes and ${MAX_EXCERPT_LINES} lines.`,
    };
  }
  const attribution = pathAttribution(siteRoot, filePath);
  if (!attribution.contained) {
    return {
      reason: 'path_outside_site_root_refused',
      diagnostic: 'Requested path resolves outside the admitted Site root.',
    };
  }
  if (isSecretLikePath(attribution.relative_path)) {
    return {
      reason: 'secret_like_path_refused',
      diagnostic: 'Secret-like paths require a stronger secret-governed reader.',
    };
  }
  if (requiresStrongerCanonicalReader(attribution.relative_path)) {
    return {
      reason: 'stronger_canonical_reader_required',
      diagnostic: 'This path belongs to a governed state surface with a stronger canonical reader.',
    };
  }
  if (!existsSync(attribution.absolute_path)) {
    return {
      reason: 'file_missing',
      diagnostic: 'Requested file does not exist.',
    };
  }
  const stat = statSync(attribution.absolute_path);
  if (!stat.isFile()) {
    return {
      reason: 'not_a_regular_file',
      diagnostic: 'Requested path is not a regular file.',
    };
  }
  return null;
}

function pathAttribution(siteRoot, filePath) {
  const root = resolve(siteRoot);
  const absolutePath = resolve(root, filePath);
  const relativePath = relative(root, absolutePath);
  const contained = relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  return {
    site_root: root,
    requested_path: filePath,
    absolute_path: absolutePath,
    relative_path: relativePath,
    contained,
  };
}

function isSecretLikePath(path) {
  return /(^|[\\/])\.env($|[\\/])|secret|token|password|credential|authorization|api[_-]?key/i.test(path);
}

function requiresStrongerCanonicalReader(path) {
  return /(^|[\\/])\.git([\\/]|$)|(^|[\\/])node_modules([\\/]|$)|\.sqlite$|\.db$|(^|[\\/])\.ai[\\/]do-not-open[\\/]tasks[\\/]|(^|[\\/])\.narada[\\/]inbox[\\/]/i.test(path);
}

function isBinaryBuffer(buffer) {
  const length = Math.min(buffer.length, 1024);
  for (let index = 0; index < length; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function summarizeEvidenceFile(name, path) {
  const summary = {
    name,
    path,
    exists: typeof path === 'string' && existsSync(path),
    schema: null,
    status: null,
    state: null,
    phase: null,
    raw_provider_output_recorded: false,
    unbounded_transcript_recorded: false,
    raw_secret_values_recorded: false,
    values_omitted: true,
  };
  if (!summary.exists) return summary;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    summary.schema = scalarOrNull(parsed.schema);
    summary.status = scalarOrNull(parsed.status);
    summary.state = scalarOrNull(parsed.state);
    summary.phase = scalarOrNull(parsed.phase);
    summary.raw_provider_output_recorded = parsed.raw_output_recorded === true || parsed.output?.raw_output_recorded === true;
    summary.unbounded_transcript_recorded = parsed.unbounded_transcript_recorded === true
      || parsed.input_summary?.unbounded_transcript_recorded === true
      || parsed.output?.unbounded_transcript_recorded === true;
    summary.raw_secret_values_recorded = parsed.raw_secret_values_recorded === true
      || parsed.input_summary?.raw_secret_values_recorded === true
      || parsed.output?.raw_secret_values_recorded === true;
  } catch {
    summary.status = 'unreadable_json';
  }
  return summary;
}

export {
  MAX_EXCERPT_BYTES,
  MAX_EXCERPT_LINES,
  NO_MUTATION_FLAGS,
  readBoundedFileExcerptToDataPacket,
  readInboxSummaryToDataPacket,
  readEvidenceRefSummaryToDataPacket,
  readReadinessSnapshotToDataPacket,
  readTaskToDataPacket,
  readWorkNextToDataPacket,
};
