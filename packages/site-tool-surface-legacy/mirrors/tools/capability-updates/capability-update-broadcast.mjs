const UPDATE_KINDS = new Set(['semantics_change', 'tooling_change', 'policy_change', 'capability_retirement']);
const AUTHORITY_LEVELS = new Set(['operator_direct', 'architect_admitted', 'agent_reported']);

export function compileCapabilityUpdateBroadcast(input = {}) {
  const event = normalizeCapabilityUpdateEvent(input.event ?? {});
  const publisher = normalizePublisher(input.publisher ?? {});
  const subscriptions = normalizeSubscriptions(input.subscriptions ?? []);
  const validation_errors = [
    ...validateEvent(event),
    ...validatePublisher(publisher),
    ...validateSubscriptions(subscriptions),
  ];
  if (validation_errors.length > 0) {
    return {
      schema: 'narada.capability_update.broadcast_plan.v0',
      status: 'blocked',
      validation_errors,
      envelopes: [],
    };
  }

  const envelopes = subscriptions.map((subscription) => buildUpdateEnvelope({ event, publisher, subscription }));
  return {
    schema: 'narada.capability_update.broadcast_plan.v0',
    status: input.dry_run === false ? 'compiled' : 'dry_run',
    delivery_performed: false,
    rule: 'This compiler creates target inbox envelope payloads only; target Sites must admit them under their own authority before treating them as local truth.',
    event,
    publisher,
    subscription_count: subscriptions.length,
    envelopes,
    commit_or_delivery_boundary: {
      source_site_truth: 'published_update_claim',
      target_site_truth: 'not_admitted_until_target_inbox_accepts_envelope',
      broadcast_is_not_implementation_completion: true,
    },
  };
}

export function normalizeCapabilityUpdateEvent(event) {
  return {
    capability_id: text(event.capability_id),
    update_id: text(event.update_id),
    kind: text(event.kind),
    title: text(event.title),
    summary: text(event.summary),
    changed_semantics: stringArray(event.changed_semantics),
    evidence_refs: stringArray(event.evidence_refs),
    recommended_action: text(event.recommended_action),
    published_at: text(event.published_at),
  };
}

export function normalizePublisher(publisher) {
  return {
    source_site_id: text(publisher.source_site_id),
    source_site_root: text(publisher.source_site_root),
    principal: text(publisher.principal),
    authority_level: text(publisher.authority_level),
    authority_ref: text(publisher.authority_ref),
  };
}

export function normalizeSubscriptions(subscriptions) {
  return subscriptions.map((subscription) => ({
    subscription_id: text(subscription.subscription_id),
    target_site_id: text(subscription.target_site_id),
    target_site_root: text(subscription.target_site_root),
    target_locus: text(subscription.target_locus),
    inbox_kind: text(subscription.inbox_kind) || 'capability_update',
    status: text(subscription.status) || 'active',
    subscribed_capabilities: stringArray(subscription.subscribed_capabilities),
  }));
}

function validateEvent(event) {
  const errors = [];
  requireText(errors, 'event.capability_id', event.capability_id);
  requireText(errors, 'event.update_id', event.update_id);
  requireText(errors, 'event.title', event.title);
  requireText(errors, 'event.summary', event.summary);
  if (!UPDATE_KINDS.has(event.kind)) errors.push({ field: 'event.kind', message: 'unsupported_update_kind', allowed: [...UPDATE_KINDS] });
  if (event.evidence_refs.length === 0) errors.push({ field: 'event.evidence_refs', message: 'at_least_one_evidence_ref_required' });
  return errors;
}

function validatePublisher(publisher) {
  const errors = [];
  requireText(errors, 'publisher.source_site_id', publisher.source_site_id);
  requireText(errors, 'publisher.principal', publisher.principal);
  if (!AUTHORITY_LEVELS.has(publisher.authority_level)) errors.push({ field: 'publisher.authority_level', message: 'unsupported_authority_level', allowed: [...AUTHORITY_LEVELS] });
  requireText(errors, 'publisher.authority_ref', publisher.authority_ref);
  return errors;
}

function validateSubscriptions(subscriptions) {
  const errors = [];
  if (subscriptions.length === 0) errors.push({ field: 'subscriptions', message: 'at_least_one_subscription_required' });
  for (const [index, subscription] of subscriptions.entries()) {
    if (subscription.status !== 'active') continue;
    requireText(errors, `subscriptions.${index}.subscription_id`, subscription.subscription_id);
    requireText(errors, `subscriptions.${index}.target_site_id`, subscription.target_site_id);
    requireText(errors, `subscriptions.${index}.target_site_root`, subscription.target_site_root);
    if (subscription.subscribed_capabilities.length === 0) errors.push({ field: `subscriptions.${index}.subscribed_capabilities`, message: 'at_least_one_capability_required' });
  }
  return errors;
}

function buildUpdateEnvelope({ event, publisher, subscription }) {
  const subscribed = subscription.subscribed_capabilities.includes(event.capability_id) || subscription.subscribed_capabilities.includes('*');
  return {
    schema: 'narada.inbox.envelope.capability_update.v0',
    status: subscribed && subscription.status === 'active' ? 'ready_for_target_inbox' : 'skipped_not_subscribed',
    kind: subscription.inbox_kind,
    source: {
      site_id: publisher.source_site_id,
      site_root: publisher.source_site_root,
      principal: publisher.principal,
      authority_level: publisher.authority_level,
      authority_ref: publisher.authority_ref,
    },
    target: {
      site_id: subscription.target_site_id,
      site_root: subscription.target_site_root,
      locus: subscription.target_locus,
      subscription_id: subscription.subscription_id,
    },
    payload: {
      capability_update: event,
      target_admission_boundary: 'receipt_is_not_admission_or_implementation',
      recommended_action: event.recommended_action || 'Review and admit locally if applicable.',
    },
    admission: {
      source_publication_state: 'published_by_source_authority',
      target_admission_state: 'not_submitted_or_not_admitted_by_compiler',
      implementation_state: 'not_claimed',
    },
  };
}

function requireText(errors, field, value) {
  if (!value) errors.push({ field, message: 'required_non_empty_string' });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}
