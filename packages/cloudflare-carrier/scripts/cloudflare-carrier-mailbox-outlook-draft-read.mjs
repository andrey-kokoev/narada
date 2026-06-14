#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

const DIRECT_FOCUSED_DRAFT_WINDOW = 5000;

export function parseMailboxOutlookDraftReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'mailbox.outlook_draft.list', ...argv], env);
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_MAILBOX_OUTLOOK_DRAFT_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      mailbox_outlook_draft_create_limit: focusRef
        ? parseOptionalInteger(
          option(args, '--mailbox-outlook-draft-limit')
          ?? env.CLOUDFLARE_CARRIER_MAILBOX_OUTLOOK_DRAFT_LIMIT
          ?? null,
          'mailbox-outlook-draft-limit',
        ) ?? DIRECT_FOCUSED_DRAFT_WINDOW
        : parsed.params.mailbox_outlook_draft_create_limit,
    },
  };
}

export async function readMailboxOutlookDraft(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  const drafts = listMailboxOutlookDrafts(product.response);
  if (config.focusRef && !drafts.some((entry) => entry?.draft_create_id === config.focusRef)) {
    throw new Error(`mailbox_outlook_draft_read_focus_not_found:${config.focusRef}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.mailbox_outlook_draft_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeMailboxOutlookDraft(product.response, { focusRef: config.focusRef }),
    response: product.response,
  };
}

export function summarizeMailboxOutlookDraft(body = {}, options = {}) {
  const drafts = listMailboxOutlookDrafts(body);
  const focusRef = options.focusRef ?? null;
  const focused = focusRef
    ? drafts.find((entry) => entry?.draft_create_id === focusRef) ?? null
    : null;
  const summarizedDrafts = focused ? [focused] : drafts;
  const latest = focused ?? drafts[0] ?? null;
  const latestRecord = latest?.record ?? null;
  const latestProposal = latestRecord?.proposal ?? null;
  const latestSendRequest = latestRecord?.send_request ?? null;
  const latestConfirmationRequest = latestRecord?.confirmation_request ?? null;
  return {
    site_id: body?.site_id ?? null,
    draft_count: summarizedDrafts.length,
    focused_draft_create_id: focusRef ? (latest?.draft_create_id ?? focusRef) : null,
    mailbox_outlook_draft_create_authority: body?.mailbox_outlook_draft_create_authority ?? null,
    mailbox_outlook_draft_create_admission: body?.mailbox_outlook_draft_create_admission ?? null,
    mailbox_send_admission: body?.mailbox_send_admission ?? null,
    mailbox_mutation_admission: body?.mailbox_mutation_admission ?? null,
    authority_partition: body?.authority_partition ?? null,
    latest_draft_create_id: latest?.draft_create_id ?? null,
    latest_account_ref: latest?.account_ref ?? latestRecord?.account_ref ?? null,
    latest_operation_id:
      latest?.operation_id
      ?? latestRecord?.operation_id
      ?? latestProposal?.operation_id
      ?? null,
    latest_proposal_id: latest?.proposal_id ?? latestRecord?.proposal_id ?? latestProposal?.proposal_id ?? null,
    latest_send_accepted_id:
      latest?.send_accepted_id
      ?? latestRecord?.send_accepted_id
      ?? latestSendRequest?.send_accepted_id
      ?? null,
    latest_send_confirmation_id:
      latest?.send_confirmation_id
      ?? latestRecord?.send_confirmation_id
      ?? latestConfirmationRequest?.send_confirmation_id
      ?? null,
    latest_message_id:
      latest?.message_id ??
      latest?.source_message_ref ??
      latestRecord?.source_message_ref ??
      latestProposal?.source_message_ref ??
      null,
    latest_subject:
      latest?.subject ??
      latestRecord?.subject ??
      latestProposal?.subject ??
      null,
    latest_body_preview:
      latest?.body_preview ??
      latestRecord?.body_preview ??
      latestRecord?.draft?.body_preview ??
      null,
    latest_draft_create_posture:
      latest?.draft_create_posture ??
      latestRecord?.draft_create_posture ??
      latestRecord?.draft?.draft_create_posture ??
      null,
    latest_recorded_at: latest?.recorded_at ?? latest?.created_at ?? null,
  };
}

export function formatMailboxOutlookDraftReadText(result) {
  const summary = result?.summary ?? {};
  const workerUrl = result?.worker_url ?? null;
  const latestLabel = summary.focused_draft_create_id ? 'Focused Draft' : 'Latest Draft';
  const latestRecordedLabel = summary.focused_draft_create_id ? 'Focused Recorded' : 'Latest Recorded';
  const lines = [
    'Mailbox Outlook Draft Review: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Outlook Drafts: count=${summary.draft_count ?? 0} authority=${summary.mailbox_outlook_draft_create_authority ?? 'unknown'} admission=${summary.mailbox_outlook_draft_create_admission ?? 'unknown'}`,
  ];
  if (summary.mailbox_send_admission || summary.mailbox_mutation_admission) {
    lines.push(`Admissions: send=${summary.mailbox_send_admission ?? 'unknown'} mutation=${summary.mailbox_mutation_admission ?? 'unknown'}`);
  }
  if (summary.authority_partition) {
    lines.push(`Authority Partition: ${summary.authority_partition}`);
  }
  if (summary.latest_draft_create_posture) {
    lines.push(`Current Posture: ${summary.latest_draft_create_posture}`);
  }
  if (summary.latest_draft_create_id || summary.latest_message_id || summary.latest_subject) {
    lines.push(
      `${latestLabel}: id=${summary.latest_draft_create_id ?? 'none'}`
      + ` proposal=${summary.latest_proposal_id ?? 'none'}`
      + ` account=${summary.latest_account_ref ?? 'none'}`
      + ` message=${summary.latest_message_id ?? 'none'}`
      + ` subject=${summary.latest_subject ?? 'none'}`,
    );
  }
  if (summary.latest_body_preview) {
    lines.push(`Body Preview: ${summary.latest_body_preview}`);
  }
  if (workerUrl && summary.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.latest_proposal_id) {
    lines.push(`Proposal Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.latest_proposal_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.latest_send_accepted_id) {
    lines.push(`Accepted Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.latest_send_accepted_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.latest_send_confirmation_id) {
    lines.push(`Confirmation Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-confirmation:text -- --url ${workerUrl} --site ${summary.site_id} --focus-ref ${summary.latest_send_confirmation_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && summary.site_id && summary.latest_operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.latest_operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.latest_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (summary.latest_recorded_at) {
    lines.push(`${latestRecordedLabel}: ${summary.latest_recorded_at}`);
  }
  return `${lines.join('\n')}\n`;
}

function listMailboxOutlookDrafts(body = {}) {
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
  if (!Number.isFinite(parsed)) throw new Error(`mailbox_outlook_draft_read_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseMailboxOutlookDraftReadArgs(process.argv.slice(2));
    const result = await readMailboxOutlookDraft(config);
    if (config.format === 'text') {
      process.stdout.write(formatMailboxOutlookDraftReadText(result));
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
