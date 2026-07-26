export const INBOX_ENVELOPE_KINDS: any = Object.freeze([
  'proposal',
  'observation',
  'command_request',
  'question',
  'knowledge_candidate',
  'task_candidate',
  'incident',
  'upstream_task_candidate',
]);

export const INBOX_ENVELOPE_KIND_SET: any = new Set(INBOX_ENVELOPE_KINDS);

export function isKnownInboxEnvelopeKind(kind: any) : any{
  return INBOX_ENVELOPE_KIND_SET.has(kind);
}

export function assertKnownInboxEnvelopeKind(kind: any) : any{
  if (!isKnownInboxEnvelopeKind(kind)) {
    throw new Error(`invalid_envelope_kind: ${kind}; allowed=${INBOX_ENVELOPE_KINDS.join(',')}`);
  }
  return kind;
}
