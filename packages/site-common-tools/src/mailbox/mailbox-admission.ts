const DEFAULT_PARTICIPANT_FIELDS: any = ['from', 'sender', 'to', 'cc', 'bcc', 'reply_to'];
const DEFAULT_PREDICATE_VERSION: any = 'mailbox-admission-predicate.v0';
const MAILBOX_ADMISSION_SCHEMA: any = 'narada.user_site.mailbox_admission.v0';

export function evaluateMailboxAdmission({ message, scope, policy = null, now = null }: any = {}) : any{
  const effectivePolicy: any = normalizePolicy(policy ?? scope?.admission ?? {});
  const participantEvidence: any = evaluateParticipants(message?.participants ?? {}, effectivePolicy);
  const folderEvidence: any = evaluateFolder(message, scope, effectivePolicy);
  const signalEvidence: any = evaluateSignals(message, effectivePolicy);
  const blockers: any = [];

  if (!folderEvidence.accepted) blockers.push(folderEvidence.reason);
  if (!participantEvidence.accepted) blockers.push(participantEvidence.reason);
  if (!signalEvidence.accepted) blockers.push(signalEvidence.reason);

  const admitted: any = blockers.length === 0;
  const admission: any = {
    schema: MAILBOX_ADMISSION_SCHEMA,
    scope_id: requiredString(message?.scope_id ?? scope?.scope_id, 'scope_id'),
    message_id: requiredString(message?.message_id, 'message_id'),
    verdict: admitted ? 'admitted' : 'rejected',
    predicate_version: effectivePolicy.predicate_version,
    matched_predicates: [
      ...folderEvidence.matched_predicates,
      ...participantEvidence.matched_predicates,
      ...signalEvidence.matched_predicates,
    ],
    destination: admitted ? {
      kind: 'dry_run_inbox_envelope_payload',
      auto_promote_to_task: false,
    } : null,
    evidence_refs: [
      `mailbox_message:${requiredString(message?.message_id, 'message_id')}`,
      `mailbox_scope:${requiredString(message?.scope_id ?? scope?.scope_id, 'scope_id')}`,
      `predicate_version:${effectivePolicy.predicate_version}`,
    ],
    reason: admitted ? 'predicate_matched' : blockers.filter(Boolean).join('; '),
    rejected_reasons: blockers.filter(Boolean),
    predicate_evidence: {
      folder: folderEvidence,
      participants: participantEvidence,
      signals: signalEvidence,
    },
    privacy_boundary: effectivePolicy.privacy_boundary,
    unknown_participants: participantEvidence.unknown_participants,
    evaluated_at: now ?? new Date().toISOString(),
  };

  return admission;
}

export function buildDryRunInboxEnvelopePayload({ message, scope, admission }: any = {}) : any{
  if (admission?.verdict !== 'admitted') {
    return {
      status: 'not_promoted',
      reason: 'mailbox_admission_not_admitted',
      admission_verdict: admission?.verdict ?? null,
    };
  }

  const scopeId: any = requiredString(message?.scope_id ?? scope?.scope_id, 'scope_id');
  const messageId: any = requiredString(message?.message_id, 'message_id');
  return {
    schema: 'narada.inbox.typed_envelope_payload.v0',
    kind: 'observation',
    source_ref: `mailbox:${scopeId}:${messageId}`,
    source_kind: 'mailbox_admission_dry_run',
    authority_level: 'agent_reported',
    principal: 'narada-mailbox-admission-bridge',
    target_locus: 'local_site',
    dry_run: true,
    payload: {
      title: `Mailbox admission candidate: ${message.subject ?? '(no subject)'}`,
      summary: message.snippet ?? 'Admitted mailbox message metadata; body content is not embedded.',
      mailbox: {
        scope_id: scopeId,
        mailbox_id: scope?.mailbox_id ?? message.mailbox_id ?? null,
        provider: message.provider ?? scope?.provider ?? null,
        message_id: messageId,
        thread_id: message.thread_id ?? null,
        folder: message.folder ?? firstLabel(message),
      },
      admission: {
        schema: admission.schema,
        verdict: admission.verdict,
        predicate_version: admission.predicate_version,
        matched_predicates: admission.matched_predicates,
        privacy_boundary: admission.privacy_boundary,
        evidence_refs: admission.evidence_refs,
      },
      routing: {
        auto_promote_to_task: false,
        requires_normal_site_inbox_authority: true,
      },
    },
  };
}

export function normalizePolicy(rawPolicy: any = {}) : any{
  const participantPolicy: any = rawPolicy.participants ?? rawPolicy.participant_predicate ?? {};
  const signalPolicy: any = rawPolicy.signals ?? rawPolicy.signal_predicate ?? {};
  return {
    predicate_version: stringOrDefault(rawPolicy.predicate_version, DEFAULT_PREDICATE_VERSION),
    participant_fields: nonEmptyArray(participantPolicy.fields) ?? DEFAULT_PARTICIPANT_FIELDS,
    participant_domains: normalizeStringArray(participantPolicy.domains),
    participant_emails: normalizeStringArray(participantPolicy.emails),
    unknown_participant_behavior: stringOrDefault(
      rawPolicy.unknown_participant_behavior,
      'ignore_or_record_metadata_only_pending_policy'
    ),
    allowed_folders: normalizeStringArray(rawPolicy.allowed_folders ?? rawPolicy.folders),
    require_signal_match: Boolean(signalPolicy.require_match),
    signal_terms: normalizeStringArray(signalPolicy.terms),
    signal_fields: nonEmptyArray(signalPolicy.fields) ?? ['subject', 'snippet', 'labels'],
    privacy_boundary: stringOrDefault(rawPolicy.privacy_boundary, 'metadata_and_preview_only'),
  };
}

function evaluateFolder(message: any, scope: any, policy: any) : any{
  const allowed: any = policy.allowed_folders.length > 0
    ? policy.allowed_folders
    : normalizeStringArray(scope?.folders);
  const folder: any = normalizeComparable(message?.folder ?? firstLabel(message));
  if (allowed.length === 0 || allowed.includes(folder)) {
    return { accepted: true, folder, allowed_folders: allowed, matched_predicates: [`folder:${folder}`] };
  }
  return {
    accepted: false,
    folder,
    allowed_folders: allowed,
    matched_predicates: [],
    reason: `folder_not_allowed:${folder}`,
  };
}

function evaluateParticipants(participants: any, policy: any) : any{
  const inspected: any = [];
  const matches: any = [];
  const unknown: any = [];
  for (const field of policy.participant_fields) {
    for (const address of participantValues(participants?.[field])) {
      const normalized: any = normalizeEmail(address);
      if (!normalized) {
        unknown.push({ field, value: address });
        continue;
      }
      inspected.push({ field, address: normalized });
      const domain: any = normalized.split('@')[1] ?? '';
      if (policy.participant_emails.includes(normalized) || policy.participant_domains.includes(domain)) {
        matches.push({ field, address: normalized, domain });
      }
    }
  }

  if (matches.length > 0) {
    return {
      accepted: true,
      inspected,
      matches,
      unknown_participants: unknown,
      matched_predicates: matches.map((match: any) => `participant:${match.field}:${match.domain || match.address}`),
    };
  }

  return {
    accepted: false,
    inspected,
    matches,
    unknown_participants: unknown,
    matched_predicates: [],
    reason: unknown.length > 0 && inspected.length === 0
      ? 'unknown_participants_no_match'
      : 'participant_predicate_no_match',
  };
}

function evaluateSignals(message: any, policy: any) : any{
  if (!policy.require_signal_match) {
    return { accepted: true, matched_predicates: [], required: false };
  }

  const haystack: any = policy.signal_fields
    .flatMap((field: any) => signalValues(message?.[field]))
    .join(' ')
    .toLowerCase();
  const matchedTerms: any = policy.signal_terms.filter((term: any) => haystack.includes(term));
  if (matchedTerms.length > 0) {
    return {
      accepted: true,
      required: true,
      matched_terms: matchedTerms,
      matched_predicates: matchedTerms.map((term: any) => `signal:${term}`),
    };
  }
  return {
    accepted: false,
    required: true,
    matched_terms: [],
    matched_predicates: [],
    reason: 'signal_predicate_no_match',
  };
}

function participantValues(value: any) : any{
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function signalValues(value: any) : any{
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((item: any) => String(item ?? ''));
  return [String(value)];
}

function normalizeStringArray(value: any) : any{
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => normalizeComparable(item))
    .filter(Boolean);
}

function nonEmptyArray(value: any) : any{
  if (!Array.isArray(value)) return null;
  const normalized: any = value.map((item: any) => String(item ?? '').trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : null;
}

function normalizeComparable(value: any) : any{
  return String(value ?? '').trim().toLowerCase();
}

function normalizeEmail(value: any) : any{
  const raw: any = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const match: any = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function stringOrDefault(value: any, fallback: any) : any{
  const normalized: any = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : fallback;
}

function requiredString(value: any, field: any) : any{
  const normalized: any = String(value ?? '').trim();
  if (!normalized) throw new Error(`mailbox_admission_missing_required:${field}`);
  return normalized;
}

function firstLabel(message: any) : any{
  return Array.isArray(message?.labels) && message.labels.length > 0 ? message.labels[0] : null;
}
