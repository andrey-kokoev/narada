#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { formatProductSurfaceText, parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

const REVIEWABLE_FOCUS_KINDS = new Set([
  'mailbox_draft_reply_proposal',
  'mailbox_outlook_draft_create',
  'mailbox_send_accepted',
  'mailbox_send_confirmation',
  'site_file_change_proposal',
  'local_ingress_request',
  'repository_publication_request',
  'site_continuity_reconciliation_execution',
  'resident_dispatch_windows_fallback_evidence',
]);

export function parseOperationEvidenceReadArgs(argv = [], env = process.env) {
  const parsed = parseProductReadArgs(['--operation', 'operation.read', ...argv], env);
  const args = [...argv];
  return {
    ...parsed,
    eventLimit: parseOptionalInteger(option(args, '--event-limit') ?? env.CLOUDFLARE_CARRIER_OPERATION_EVIDENCE_EVENT_LIMIT ?? null, 'event-limit') ?? 5,
    activityLimit: parseOptionalInteger(option(args, '--activity-limit') ?? env.CLOUDFLARE_CARRIER_OPERATION_EVIDENCE_ACTIVITY_LIMIT ?? null, 'activity-limit') ?? 5,
  };
}

export async function readOperationEvidence(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeOperationEvidence(product.response, {
      operationSummary: product.summary,
      eventLimit: config.eventLimit,
      activityLimit: config.activityLimit,
    }),
    response: product.response,
  };
}

export function summarizeOperationEvidence(body = {}, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
  const carrierEvidence = Array.isArray(body?.carrier_evidence) ? body.carrier_evidence : [];
  const residentDispatchWindowsFallbackEvidence = Array.isArray(body?.resident_dispatch_windows_fallback_evidence)
    ? body.resident_dispatch_windows_fallback_evidence
    : [];
  const activityItems = Array.isArray(body?.operation_activity_timeline?.items) ? body.operation_activity_timeline.items : [];
  const focusReviews = Array.isArray(body?.operation_focus_reviews) ? body.operation_focus_reviews : [];
  const eventLimit = clampInteger(options.eventLimit, 1, 20, 5);
  const activityLimit = clampInteger(options.activityLimit, 1, 20, 5);
  const recentCarrierEvents = [];
  for (const entry of carrierEvidence) {
    const events = Array.isArray(entry?.events) ? entry.events : [];
    for (const event of events.slice(-eventLimit)) {
      recentCarrierEvents.push({
        carrier_session_id: entry?.carrier_session_id ?? entry?.session_id ?? null,
        sequence: event?.sequence ?? null,
        event_kind: event?.event_kind ?? null,
      });
    }
  }
  const recentActivities = activityItems.slice(0, activityLimit).map((item) => ({
    activity_kind: item?.activity_kind ?? null,
    focus_kind: item?.focus_kind ?? item?.activity_kind ?? null,
    focus_ref: item?.focus_ref ?? item?.source_ref ?? item?.activity_id ?? null,
    summary: item?.summary ?? item?.title ?? null,
    occurred_at: item?.occurred_at ?? null,
  }));
  const latestFocusReview = focusReviews[0] ?? null;
  const reviewableFocus = activityItems.find((item) => {
    const focusKind = item?.focus_kind ?? item?.activity_kind ?? null;
    const focusRef = item?.focus_ref ?? item?.source_ref ?? item?.activity_id ?? null;
    return REVIEWABLE_FOCUS_KINDS.has(focusKind) && !!focusRef;
  }) ?? null;
  const operationId = body?.operation?.operation_id ?? body?.operation_id ?? operationSummary.operation_id ?? null;
  const localResidentSessionRefs = [...new Set(
    residentDispatchWindowsFallbackEvidence
      .filter((entry) =>
        (!operationId || entry?.operation_id === operationId)
        && String(entry?.local_session_start_admission ?? '') === 'admitted_by_windows_resident_loop'
        && String(entry?.local_resident_session_ref ?? '').trim())
      .map((entry) => String(entry.local_resident_session_ref).trim()),
  )];
  const localResidentCarrierBridgeState = localResidentSessionRefs.length === 0
    ? 'not_observed'
    : sessions.length > 0
      ? 'cloudflare_carrier_session_bound'
      : 'not_admitted_to_cloudflare_carrier_session';
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? operationSummary.site_id ?? null,
    operation_id: operationId,
    current_status: operationSummary.current_status ?? body?.operation?.status ?? null,
    phase: operationSummary.phase ?? body?.operation_lifecycle_status?.phase ?? null,
    health: operationSummary.health ?? body?.operation_lifecycle_status?.health ?? null,
    next_action: operationSummary.next_action ?? body?.operation_lifecycle_status?.next_action ?? null,
    posture_next_action: operationSummary.posture_next_action ?? body?.operation_posture_route?.next_action ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_kind: operationSummary.workflow_focus_kind ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? null,
    carrier_evidence_read_state: body?.carrier_evidence_read_status?.state ?? body?.carrier_evidence_read_status?.status ?? null,
    carrier_session_ids: sessions.map((session) => session?.carrier_session_id ?? session?.session_id).filter(Boolean),
    local_resident_session_refs: localResidentSessionRefs,
    local_resident_session_count: localResidentSessionRefs.length,
    local_resident_carrier_bridge_state: localResidentCarrierBridgeState,
    carrier_event_count: carrierEvidence.reduce((count, entry) => count + (Array.isArray(entry?.events) ? entry.events.length : 0), 0),
    carrier_event_session_count: carrierEvidence.length,
    recent_carrier_events: recentCarrierEvents.slice(-eventLimit),
    activity_count: activityItems.length,
    recent_activities: recentActivities,
    operation_focus_review_count: focusReviews.length,
    reviewable_focus_kind: reviewableFocus?.focus_kind ?? reviewableFocus?.activity_kind ?? null,
    reviewable_focus_ref: reviewableFocus?.focus_ref ?? reviewableFocus?.source_ref ?? reviewableFocus?.activity_id ?? null,
    reviewable_focus_summary: reviewableFocus?.summary ?? reviewableFocus?.title ?? null,
    latest_focus_review: latestFocusReview ? {
      review_id: latestFocusReview.review_id ?? null,
      focus_kind: latestFocusReview.focus_kind ?? null,
      focus_ref: latestFocusReview.focus_ref ?? null,
      review_status: latestFocusReview.review_status ?? null,
      recorded_at: latestFocusReview.recorded_at ?? null,
    } : null,
  };
}

export function formatOperationEvidenceReadText(result) {
  const summary = result?.summary ?? {};
  const emittedLabels = new Set();
  const reviewableMatchesLatestReview = summary.reviewable_focus_kind
    && summary.reviewable_focus_ref
    && summary.latest_focus_review
    && summary.latest_focus_review.focus_kind === summary.reviewable_focus_kind
    && summary.latest_focus_review.focus_ref === summary.reviewable_focus_ref;
  const lines = [
    'Operation Evidence Read: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Lifecycle: phase=${summary.phase ?? 'unknown'} health=${summary.health ?? 'unknown'} status=${summary.current_status ?? 'unknown'}`,
    `Next Action: ${summary.next_action ?? 'none'}`,
    `Posture Next: ${summary.posture_next_action ?? 'none'}`,
    `Carrier Evidence: state=${summary.carrier_evidence_read_state ?? 'unknown'} sessions=${summary.carrier_session_ids?.length ?? 0} events=${summary.carrier_event_count ?? 0}`,
  ];
  if ((summary.local_resident_session_count ?? 0) > 0) {
    lines.push(`Local Resident Evidence: sessions=${summary.local_resident_session_count} bridge=${summary.local_resident_carrier_bridge_state ?? 'unknown'}`);
  }
  if (summary.carrier_session_ids?.length > 0) lines.push(`Carrier Sessions: ${summary.carrier_session_ids.join(', ')}`);
  if (summary.site_id && summary.carrier_session_ids?.length > 0) {
    for (const carrierSessionId of summary.carrier_session_ids) {
      lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
      lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
      lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --carrier-session-id ${carrierSessionId} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
    }
  }
  if (summary.local_resident_session_refs?.length > 0) lines.push(`Local Resident Sessions: ${summary.local_resident_session_refs.join(', ')}`);
  if (summary.recent_carrier_events?.length > 0) {
    lines.push('Recent Carrier Events:');
    for (const event of summary.recent_carrier_events) {
      lines.push(`- ${event.carrier_session_id ?? 'unknown-session'} #${event.sequence ?? '?'} ${event.event_kind ?? 'unknown_event'}`);
    }
  }
  if (summary.recent_activities?.length > 0) {
    lines.push('Recent Activities:');
    for (const item of summary.recent_activities) {
      lines.push(`- ${item.activity_kind ?? 'unknown_activity'} focus=${item.focus_kind ?? 'unknown'}:${item.focus_ref ?? 'unknown'}${item.summary ? ` summary=${item.summary}` : ''}`);
    }
  }
  if (summary.reviewable_focus_kind && summary.reviewable_focus_ref && !reviewableMatchesLatestReview) {
    lines.push(`Reviewable Focus: ${summary.reviewable_focus_kind}:${summary.reviewable_focus_ref}`);
  }
  if (summary.latest_focus_review) {
    const reviewLabel = reviewableMatchesLatestReview ? 'Focused Review' : 'Latest Review';
    lines.push(`${reviewLabel}: ${summary.latest_focus_review.focus_kind ?? 'unknown'}:${summary.latest_focus_review.focus_ref ?? 'unknown'} status=${summary.latest_focus_review.review_status ?? 'unknown'}`);
  }
  if (summary.site_id && summary.reviewable_focus_kind && summary.reviewable_focus_ref) {
    emittedLabels.add('Review Ack');
    lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'}${summary.operation_id ? ` --operation-id ${summary.operation_id}` : ''} --focus-kind ${summary.reviewable_focus_kind} --focus-ref ${summary.reviewable_focus_ref} --operator-session-file <operator-session-file>`);
  }
  for (const { label, command } of buildOperationEvidenceWorkflowLinks(result, summary)) {
    if (emittedLabels.has(label)) continue;
    emittedLabels.add(label);
    lines.push(`${label}: ${command}`);
  }
  if (summary.site_id && summary.operation_id) {
    if (!emittedLabels.has('Recovery Read')) {
      lines.push(`Recovery Read: pnpm --filter @narada2/cloudflare-carrier product:operation:recovery:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    }
    if (!emittedLabels.has('Persistence Read')) {
      lines.push(`Persistence Read: pnpm --filter @narada2/cloudflare-carrier product:operation:persistence:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildOperationEvidenceWorkflowLinks(result, summary) {
  const workerUrl = result?.worker_url ?? '<worker-url>';
  const siteId = summary.site_id;
  const operationId = summary.operation_id;
  if (!siteId || !operationId) return [];
  const links = [];
  if (summary.workflow_next_action === 'review_recovery_posture') {
    links.push({
      label: 'Recovery Read',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:recovery:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>`,
    });
  }
  if (summary.workflow_next_action === 'review_persistence_posture') {
    links.push({
      label: 'Persistence Read',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:persistence:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>`,
    });
  }
  if (summary.workflow_next_action === 'start_or_select_session') {
    links.push({
      label: 'Session Workflow',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:session:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-session`,
    });
  }
  if (summary.workflow_next_action === 'resume_operation_continuation') {
    links.push({
      label: 'Continuation Workflow',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-continuation-resume`,
    });
  }
  if (summary.workflow_next_action === 'refresh_site_continuity_loop') {
    links.push({
      label: 'Continuity Workflow',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`,
    });
  }
  if (summary.workflow_next_action === 'review_site_continuity_reconciliation_execution' && summary.workflow_focus_ref) {
    links.push({
      label: 'Review Ack',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --focus-kind ${summary.workflow_focus_kind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${summary.workflow_focus_ref} --operator-session-file <operator-session-file>`,
    });
  }
  return links;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`operation_evidence_read_invalid_${label}:${value}`);
  return parsed;
}

function clampInteger(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationEvidenceReadArgs(process.argv.slice(2));
    const result = await readOperationEvidence(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationEvidenceReadText(result));
    } else if (config.format === 'summary') {
      process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    if (error?.response && error?.config?.format === 'text') {
      process.stderr.write(formatProductSurfaceText({
        operation: error.config.operation,
        worker_url: error.config.workerUrl,
        auth_source: error.config.auth?.source,
        params: error.config.params,
        summary: error.summary,
      }));
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
