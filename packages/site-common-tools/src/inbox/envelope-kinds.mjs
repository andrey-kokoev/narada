export const INBOX_ENVELOPE_KINDS = Object.freeze([
  'proposal',
  'observation',
  'command_request',
  'question',
  'knowledge_candidate',
  'task_candidate',
  'incident',
  'upstream_task_candidate',
]);

export const INBOX_ENVELOPE_KIND_SET = new Set(INBOX_ENVELOPE_KINDS);

export function isKnownInboxEnvelopeKind(kind) {
  return INBOX_ENVELOPE_KIND_SET.has(kind);
}

export function assertKnownInboxEnvelopeKind(kind) {
  if (!isKnownInboxEnvelopeKind(kind)) {
    throw new Error(`invalid_envelope_kind: ${kind}; allowed=${INBOX_ENVELOPE_KINDS.join(',')}`);
  }
  return kind;
}
