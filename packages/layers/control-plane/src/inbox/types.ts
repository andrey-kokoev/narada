export type InboxSourceKind =
  | 'user_chat'
  | 'email'
  | 'diagnostic'
  | 'agent_report'
  | 'file_drop'
  | 'cli'
  | 'webhook'
  | 'system_observation';

export type InboxEnvelopeKind =
  | 'proposal'
  | 'observation'
  | 'command_request'
  | 'question'
  | 'knowledge_candidate'
  | 'task_candidate'
  | 'incident'
  | 'upstream_task_candidate';

export type InboxAuthorityLevel =
  | 'none'
  | 'user_statement'
  | 'operator_confirmed'
  | 'system_observed'
  | 'agent_reported';

export type InboxEnvelopeStatus =
  | 'received'
  | 'handling'
  | 'classified'
  | 'accepted'
  | 'rejected'
  | 'promoted'
  | 'archived'
  | 'superseded';

export type InboxPromotionTargetKind =
  | 'task'
  | 'decision'
  | 'operator_action'
  | 'knowledge_entry'
  | 'site_config_change'
  | 'archive';

export type InboxPromotionEnactmentStatus =
  | 'enacted'
  | 'recorded'
  | 'pending'
  | 'unsupported';

export interface InboxSourceRef {
  kind: InboxSourceKind;
  ref: string;
  site_id?: string;
  operation_id?: string;
}

export interface InboxAuthority {
  level: InboxAuthorityLevel;
  principal?: string;
  evidence_ref?: string;
}

export interface InboxPromotion {
  target_kind: InboxPromotionTargetKind;
  target_ref: string;
  promoted_at: string;
  promoted_by: string;
  enactment_status?: InboxPromotionEnactmentStatus;
  target_command?: string;
  target_result?: unknown;
  note?: string;
}

export interface InboxHandlingLease {
  handled_by: string;
  claimed_at: string;
}

export interface InboxEnvelope<TPayload = unknown> {
  envelope_id: string;
  received_at: string;
  source: InboxSourceRef;
  kind: InboxEnvelopeKind;
  authority: InboxAuthority;
  payload: TPayload;
  status: InboxEnvelopeStatus;
  promotion?: InboxPromotion;
  handling?: InboxHandlingLease;
}

export interface CreateInboxEnvelopeOptions<TPayload = unknown> {
  envelope_id: string;
  received_at: string;
  source: InboxSourceRef;
  kind: InboxEnvelopeKind;
  authority?: InboxAuthority;
  payload: TPayload;
}

export function createInboxEnvelope<TPayload>(
  options: CreateInboxEnvelopeOptions<TPayload>,
): InboxEnvelope<TPayload> {
  return {
    envelope_id: options.envelope_id,
    received_at: options.received_at,
    source: options.source,
    kind: options.kind,
    authority: options.authority ?? { level: 'none' },
    payload: options.payload,
    status: 'received',
  };
}

export function promoteInboxEnvelope<TPayload>(
  envelope: InboxEnvelope<TPayload>,
  promotion: InboxPromotion,
): InboxEnvelope<TPayload> {
  return {
    ...envelope,
    status: 'promoted',
    promotion,
  };
}

export function isPromotedInboxEnvelope(envelope: InboxEnvelope): boolean {
  return envelope.status === 'promoted' && envelope.promotion !== undefined;
}

export function isActionableInboxCommandRequest(envelope: InboxEnvelope): boolean {
  return (
    envelope.kind === 'command_request' &&
    (envelope.authority.level === 'user_statement' || envelope.authority.level === 'operator_confirmed') &&
    envelope.status !== 'rejected' &&
    envelope.status !== 'archived' &&
    envelope.status !== 'superseded'
  );
}

export function isInertReceivedInboxEnvelope(envelope: InboxEnvelope): boolean {
  return envelope.status === 'received' && envelope.promotion === undefined;
}
