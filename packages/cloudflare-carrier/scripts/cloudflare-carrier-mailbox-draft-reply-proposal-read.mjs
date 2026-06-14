#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

const DIRECT_FOCUSED_PROPOSAL_WINDOW = 5000;

export function parseMailboxDraftReplyProposalReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const explicitOperationId = option(args, '--carrier-operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_MAILBOX_DRAFT_REPLY_PROPOSAL_FOCUS_REF ?? null,
  );
  const parsed = parseProductReadArgs(
    ['--operation', explicitOperationId ? 'operation.read' : 'mailbox.draft_reply_proposal.list', ...argv],
    env,
  );
  const proposalLimit = parseOptionalInteger(
    option(args, '--proposal-limit') ?? env.CLOUDFLARE_CARRIER_MAILBOX_DRAFT_REPLY_PROPOSAL_LIMIT ?? null,
    'proposal-limit',
  ) ?? (explicitOperationId ? 20 : (focusRef ? DIRECT_FOCUSED_PROPOSAL_WINDOW : 200));
  const draftCreateLimit = parseOptionalInteger(
    option(args, '--draft-create-limit') ?? env.CLOUDFLARE_CARRIER_MAILBOX_OUTLOOK_DRAFT_CREATE_LIMIT ?? null,
    'draft-create-limit',
  ) ?? (explicitOperationId ? 20 : (focusRef ? DIRECT_FOCUSED_PROPOSAL_WINDOW : 200));
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      mailbox_draft_reply_proposal_limit: proposalLimit,
      mailbox_outlook_draft_create_limit: draftCreateLimit,
    },
  };
}

export async function readMailboxDraftReplyProposal(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  const directDraftReads = config.operation === 'operation.read'
    ? null
    : await readProductSurface({
      ...config,
      operation: 'mailbox.outlook_draft.list',
      params: {
        site_id: config.params.site_id,
        mailbox_outlook_draft_create_limit: config.params.mailbox_outlook_draft_create_limit ?? 200,
      },
    }, fetchImpl);
  const proposals = listMailboxDraftReplyProposals(product.response);
  if (config.focusRef && !proposals.some((entry) => entry?.proposal_id === config.focusRef)) {
    throw new Error(`mailbox_draft_reply_proposal_read_focus_not_found:${config.focusRef}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.mailbox_draft_reply_proposal_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeMailboxDraftReplyProposal(product.response, directDraftReads?.response ?? null, {
      operationSummary: product.summary,
      focusRef: config.focusRef,
    }),
    response: directDraftReads
      ? { proposals: product.response, draft_creates: directDraftReads.response }
      : product.response,
  };
}

export function summarizeMailboxDraftReplyProposal(body = {}, draftCreateBody = null, options = {}) {
  const operationSummary = options.operationSummary ?? {};
  const proposals = listMailboxDraftReplyProposals(body);
  const draftCreates = listMailboxOutlookDraftCreates(draftCreateBody ?? body);
  const focusReviews = Array.isArray(body?.operation_focus_reviews) ? body.operation_focus_reviews : [];
  const focusRef = options.focusRef ?? operationSummary.workflow_focus_ref ?? null;
  const exactFocusedProposals = focusRef
    ? proposals.filter((entry) => entry?.proposal_id === focusRef)
    : [];
  const focusedProposals = exactFocusedProposals.length > 0 ? exactFocusedProposals : proposals;
  const focusedProposal = selectFocusedProposal(proposals, focusRef);
  const linkedDraftCreates = focusedProposal
    ? draftCreates.filter((entry) => entry?.proposal_id === focusedProposal.proposal_id)
    : [];
  const linkedSendAcceptedIds = linkedDraftCreates.map((entry) => entry?.send_accepted_id).filter(Boolean);
  const linkedSendConfirmationIds = linkedDraftCreates.map((entry) => entry?.send_confirmation_id).filter(Boolean);
  const latestFocusReview = focusedProposal
    ? focusReviews.find((entry) => entry?.focus_kind === 'mailbox_draft_reply_proposal'
      && entry?.focus_ref === focusedProposal.proposal_id)
    : null;
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? operationSummary.site_id ?? null,
    operation_id: body?.operation?.operation_id ?? body?.operation_id ?? focusedProposal?.operation_id ?? focusedProposal?.record?.operation_id ?? operationSummary.operation_id ?? null,
    workflow_next_action: operationSummary.workflow_next_action ?? null,
    workflow_reason: operationSummary.workflow_reason ?? null,
    workflow_focus_ref: operationSummary.workflow_focus_ref ?? focusRef ?? null,
    proposal_count: focusedProposals.length,
    focused_proposal_id: focusedProposal?.proposal_id ?? focusRef ?? null,
    focused_account_ref: focusedProposal?.account_ref ?? null,
    focused_source_message_ref: focusedProposal?.source_message_ref ?? null,
    focused_subject: focusedProposal?.subject ?? null,
    focused_body_preview: focusedProposal?.body_preview ?? null,
    focused_rationale: focusedProposal?.rationale ?? null,
    focused_proposal_posture: focusedProposal?.proposal_posture ?? null,
    proposal_authority: focusedProposal?.proposal_authority ?? null,
    mailbox_outlook_draft_create_admission: focusedProposal?.mailbox_outlook_draft_create_admission ?? null,
    mailbox_send_admission: focusedProposal?.mailbox_send_admission ?? null,
    mailbox_mutation_admission: focusedProposal?.mailbox_mutation_admission ?? null,
    windows_draft_executor_fallback: focusedProposal?.windows_draft_executor_fallback ?? null,
    focused_recorded_at: focusedProposal?.recorded_at ?? focusedProposal?.record?.recorded_at ?? null,
    focused_recorded_by_principal_id: focusedProposal?.recorded_by_principal_id ?? focusedProposal?.record?.recorded_by_principal_id ?? null,
    linked_draft_create_count: linkedDraftCreates.length,
    linked_draft_create_ids: linkedDraftCreates.map((entry) => entry?.draft_create_id).filter(Boolean),
    linked_send_accepted_ids: linkedSendAcceptedIds,
    linked_send_confirmation_ids: linkedSendConfirmationIds,
    latest_focus_review: latestFocusReview ? {
      review_id: latestFocusReview.review_id ?? null,
      focus_kind: latestFocusReview.focus_kind ?? null,
      focus_ref: latestFocusReview.focus_ref ?? null,
      review_status: latestFocusReview.review_status ?? null,
      recorded_at: latestFocusReview.recorded_at ?? null,
    } : null,
  };
}

export function formatMailboxDraftReplyProposalReadText(result) {
  const summary = result?.summary ?? {};
  const actionableWorkflow = summary.workflow_next_action && summary.workflow_next_action !== 'none' && summary.workflow_next_action !== 'monitor_operation';
  const workerUrl = result?.worker_url ?? null;
  const hasSiteId = Boolean(summary.site_id);
  const lines = [
    'Mailbox Draft Reply Proposal Read: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Workflow Route: action=${summary.workflow_next_action ?? 'none'} reason=${summary.workflow_reason ?? 'none'}`,
    `Proposals: count=${summary.proposal_count ?? 0} focused=${summary.focused_proposal_id ?? 'none'}`,
  ];
  if (summary.focused_account_ref || summary.focused_source_message_ref) {
    lines.push(`Message: account=${summary.focused_account_ref ?? 'unknown'} source=${summary.focused_source_message_ref ?? 'unknown'}`);
  }
  if (summary.focused_subject) lines.push(`Subject: ${summary.focused_subject}`);
  if (summary.focused_body_preview) lines.push(`Body Preview: ${summary.focused_body_preview}`);
  if (summary.focused_rationale) lines.push(`Rationale: ${summary.focused_rationale}`);
  if (summary.focused_proposal_posture) lines.push(`Posture: ${summary.focused_proposal_posture}`);
  if (summary.proposal_authority || summary.windows_draft_executor_fallback) {
    lines.push(`Authority: proposal=${summary.proposal_authority ?? 'unknown'} fallback=${summary.windows_draft_executor_fallback ?? 'unknown'}`);
  }
  if (summary.mailbox_outlook_draft_create_admission || summary.mailbox_send_admission || summary.mailbox_mutation_admission) {
    lines.push(
      `Admissions: draft_create=${summary.mailbox_outlook_draft_create_admission ?? 'unknown'} send=${summary.mailbox_send_admission ?? 'unknown'} mutation=${summary.mailbox_mutation_admission ?? 'unknown'}`,
    );
  }
  lines.push(`Linked Draft Creates: ${summary.linked_draft_create_count ?? 0}`);
  if (workerUrl && hasSiteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && hasSiteId && summary.linked_draft_create_ids?.[0]) {
    lines.push(`Draft Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.linked_draft_create_ids[0]} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && hasSiteId && summary.linked_send_accepted_ids?.[0]) {
    lines.push(`Accepted Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.linked_send_accepted_ids[0]} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && hasSiteId && summary.linked_send_confirmation_ids?.[0]) {
    lines.push(`Confirmation Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-confirmation:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.linked_send_confirmation_ids[0]} --operator-session-file <operator-session-file>`);
  }
  if (summary.focused_recorded_at || summary.focused_recorded_by_principal_id) {
    lines.push(`Recorded: ${summary.focused_recorded_at ?? 'unknown'} by ${summary.focused_recorded_by_principal_id ?? 'unknown'}`);
  }
  if (summary.latest_focus_review) {
    const focusReviewLabel = summary.focused_proposal_id
      && summary.latest_focus_review.focus_ref === summary.focused_proposal_id
      ? 'Focused Review'
      : 'Latest Focus Review';
    lines.push(`${focusReviewLabel}: ${summary.latest_focus_review.focus_kind ?? 'unknown'}:${summary.latest_focus_review.focus_ref ?? 'unknown'} status=${summary.latest_focus_review.review_status ?? 'unknown'}`);
  }
  if (workerUrl && summary.operation_id && summary.site_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && actionableWorkflow && summary.operation_id && summary.site_id) {
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (workerUrl && hasSiteId && summary.focused_proposal_id) {
    lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${workerUrl} --site ${summary.site_id}${summary.operation_id ? ` --operation-id ${summary.operation_id}` : ''} --focus-kind mailbox_draft_reply_proposal --focus-ref ${summary.focused_proposal_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

function selectFocusedProposal(proposals, focusRef) {
  if (!Array.isArray(proposals) || proposals.length === 0) return null;
  if (focusRef) {
    const exact = proposals.find((entry) => entry?.proposal_id === focusRef);
    if (exact) return exact;
  }
  return proposals[0] ?? null;
}

function listMailboxDraftReplyProposals(body = {}) {
  if (Array.isArray(body?.mailbox_draft_reply_proposals)) return body.mailbox_draft_reply_proposals;
  if (Array.isArray(body?.proposals)) return body.proposals;
  return [];
}

function listMailboxOutlookDraftCreates(body = {}) {
  if (Array.isArray(body?.mailbox_outlook_draft_creates)) return body.mailbox_outlook_draft_creates;
  if (Array.isArray(body?.drafts)) return body.drafts;
  return [];
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`mailbox_draft_reply_proposal_read_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseMailboxDraftReplyProposalReadArgs(process.argv.slice(2));
    const result = await readMailboxDraftReplyProposal(config);
    if (config.format === 'text') {
      process.stdout.write(formatMailboxDraftReplyProposalReadText(result));
    } else if (config.format === 'summary') {
      process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    process.exit(1);
  }
}
