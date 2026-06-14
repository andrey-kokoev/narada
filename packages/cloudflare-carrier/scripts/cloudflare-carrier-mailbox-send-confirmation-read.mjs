#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

const DIRECT_FOCUSED_SEND_CONFIRMATION_WINDOW = 5000;

export function parseMailboxSendConfirmationReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'mailbox.send_confirmation.list', ...argv], env);
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_MAILBOX_SEND_CONFIRMATION_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      mailbox_send_confirmation_limit: focusRef ? DIRECT_FOCUSED_SEND_CONFIRMATION_WINDOW : parsed.params.mailbox_send_confirmation_limit,
    },
  };
}

export async function readMailboxSendConfirmation(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  const confirmations = listMailboxSendConfirmations(product.response);
  if (config.focusRef && !confirmations.some((entry) => entry?.send_confirmation_id === config.focusRef)) {
    throw new Error(`mailbox_send_confirmation_read_focus_not_found:${config.focusRef}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.mailbox_send_confirmation_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeMailboxSendConfirmation(product.response, { focusRef: config.focusRef }),
    response: product.response,
  };
}

export function summarizeMailboxSendConfirmation(body = {}, options = {}) {
  const confirmations = listMailboxSendConfirmations(body);
  const focusRef = options.focusRef ?? null;
  const focused = focusRef
    ? confirmations.find((entry) => entry?.send_confirmation_id === focusRef) ?? null
    : null;
  const summarizedConfirmations = focused ? [focused] : confirmations;
  const latest = focused ?? confirmations[0] ?? null;
  const latestRecord = latest?.record ?? null;
  const latestRequest = latestRecord?.confirmation_request ?? null;
  const latestGraphResponse = latest?.graph_response ?? latestRecord?.graph_response ?? null;
  return {
    site_id: body?.site_id ?? null,
    confirmation_count: summarizedConfirmations.length,
    focused_send_confirmation_id: focusRef ? (latest?.send_confirmation_id ?? focusRef) : null,
    mailbox_send_confirmation_authority: body?.mailbox_send_confirmation_authority ?? null,
    mailbox_send_delivery_confirmation_admission:
      body?.mailbox_send_delivery_confirmation_admission
      ?? body?.delivery_confirmation_admission
      ?? latest?.delivery_confirmation_admission
      ?? latest?.record?.delivery_confirmation_admission
      ?? null,
    mailbox_mutation_admission: body?.mailbox_mutation_admission ?? null,
    latest_account_ref:
      latest?.account_ref
      ?? latestRecord?.account_ref
      ?? latestRequest?.account_ref
      ?? null,
    latest_proposal_id:
      latest?.proposal_id
      ?? latestRecord?.proposal_id
      ?? latestRequest?.proposal_id
      ?? null,
    latest_confirmation_posture:
      latest?.confirmation_posture
      ?? latestRecord?.confirmation_posture
      ?? latestRequest?.confirmation_posture
      ?? null,
    latest_send_accepted_id:
      latest?.send_accepted_id
      ?? latestRecord?.send_accepted_id
      ?? latestRequest?.send_accepted_id
      ?? null,
    latest_draft_create_id:
      latest?.draft_create_id
      ?? latestRecord?.draft_create_id
      ?? latestRequest?.draft_create_id
      ?? null,
    latest_operation_id:
      latest?.operation_id
      ?? latestRecord?.operation_id
      ?? latestRequest?.operation_id
      ?? null,
    latest_outlook_draft_id:
      latest?.outlook_draft_id
      ?? latestRecord?.outlook_draft_id
      ?? latestRequest?.outlook_draft_id
      ?? null,
    latest_send_confirmation_id: latest?.send_confirmation_id ?? null,
    latest_message_id:
      latest?.message_id
      ?? latest?.sent_message_ref
      ?? latestRecord?.sent_message_ref
      ?? null,
    latest_subject:
      latest?.subject
      ?? latest?.sent_subject
      ?? latestRequest?.sent_subject
      ?? latestGraphResponse?.subject
      ?? null,
    latest_body_preview:
      latest?.body_preview
      ?? latestGraphResponse?.bodyPreview
      ?? latestGraphResponse?.body?.content
      ?? null,
    latest_recorded_at: latest?.recorded_at ?? latest?.generated_at ?? null,
  };
}

export function formatMailboxSendConfirmationReadText(result) {
  const summary = result?.summary ?? {};
  const hasSiteId = Boolean(summary.site_id);
  const latestLabel = summary.focused_send_confirmation_id ? 'Focused Confirmation' : 'Latest Confirmation';
  const latestRecordedLabel = summary.focused_send_confirmation_id ? 'Focused Recorded' : 'Latest Recorded';
  const lines = [
    'Mailbox Send Confirmation: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Send Confirmation: count=${summary.confirmation_count ?? 0} authority=${summary.mailbox_send_confirmation_authority ?? 'unknown'} admission=${summary.mailbox_send_delivery_confirmation_admission ?? 'unknown'}`,
  ];
  if (summary.mailbox_mutation_admission) {
    lines.push(`Mutation Admission: ${summary.mailbox_mutation_admission}`);
  }
  if (summary.latest_confirmation_posture) {
    lines.push(`Current Posture: ${summary.latest_confirmation_posture}`);
  }
  if (summary.latest_send_confirmation_id || summary.latest_message_id || summary.latest_subject) {
    lines.push(`${latestLabel}: id=${summary.latest_send_confirmation_id ?? 'none'} account=${summary.latest_account_ref ?? 'none'} message=${summary.latest_message_id ?? 'none'} subject=${summary.latest_subject ?? 'none'}`);
  }
  if (hasSiteId && summary.latest_proposal_id) {
    lines.push(`Proposal Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --focus-ref ${summary.latest_proposal_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && summary.latest_send_accepted_id) {
    lines.push(`Accepted Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:send-accepted:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --focus-ref ${summary.latest_send_accepted_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && summary.latest_draft_create_id) {
    lines.push(`Draft Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --focus-ref ${summary.latest_draft_create_id} --operator-session-file <operator-session-file>`);
  }
  if (summary.site_id && summary.latest_operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.latest_operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id} --operation-id ${summary.latest_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (summary.latest_body_preview) {
    lines.push(`Body Preview: ${summary.latest_body_preview}`);
  }
  if (summary.latest_recorded_at) {
    lines.push(`${latestRecordedLabel}: ${summary.latest_recorded_at}`);
  }
  return `${lines.join('\n')}\n`;
}

function listMailboxSendConfirmations(body = {}) {
  if (Array.isArray(body?.confirmations)) return body.confirmations;
  return [];
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseMailboxSendConfirmationReadArgs(process.argv.slice(2));
    const result = await readMailboxSendConfirmation(config);
    if (config.format === 'text') {
      process.stdout.write(formatMailboxSendConfirmationReadText(result));
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
