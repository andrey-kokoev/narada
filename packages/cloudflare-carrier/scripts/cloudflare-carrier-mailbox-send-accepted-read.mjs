#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

const DIRECT_FOCUSED_SEND_ACCEPTED_WINDOW = 5000;

export function parseMailboxSendAcceptedReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const parsed = parseProductReadArgs(['--operation', 'mailbox.send_accepted.list', ...argv], env);
  const focusRef = normalizeOptionalString(
    option(args, '--focus-ref') ?? env.CLOUDFLARE_CARRIER_MAILBOX_SEND_ACCEPTED_FOCUS_REF ?? null,
  );
  return {
    ...parsed,
    focusRef,
    params: {
      ...parsed.params,
      mailbox_send_accepted_limit: focusRef ? DIRECT_FOCUSED_SEND_ACCEPTED_WINDOW : parsed.params.mailbox_send_accepted_limit,
    },
  };
}

export async function readMailboxSendAccepted(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  const sends = listMailboxSendAccepted(product.response);
  if (config.focusRef && !sends.some((entry) => entry?.send_accepted_id === config.focusRef)) {
    throw new Error(`mailbox_send_accepted_read_focus_not_found:${config.focusRef}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.mailbox_send_accepted_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeMailboxSendAccepted(product.response, { focusRef: config.focusRef }),
    response: product.response,
  };
}

export function summarizeMailboxSendAccepted(body = {}, options = {}) {
  const sends = listMailboxSendAccepted(body);
  const focusRef = options.focusRef ?? null;
  const focused = focusRef
    ? sends.find((entry) => entry?.send_accepted_id === focusRef) ?? null
    : null;
  const summarizedSends = focused ? [focused] : sends;
  const latest = focused ?? sends[0] ?? null;
  const latestRecord = latest?.record ?? null;
  const latestRequest = latestRecord?.send_request ?? null;
  return {
    site_id: body?.site_id ?? null,
    send_count: summarizedSends.length,
    focused_send_accepted_id: focusRef ? (latest?.send_accepted_id ?? focusRef) : null,
    mailbox_send_authority: body?.mailbox_send_authority ?? null,
    mailbox_send_admission: body?.mailbox_send_admission ?? null,
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
    latest_draft_create_id:
      latest?.draft_create_id
      ?? latestRecord?.draft_create_id
      ?? latestRequest?.draft_create_id
      ?? null,
    latest_outlook_draft_id:
      latest?.outlook_draft_id
      ?? latestRecord?.outlook_draft_id
      ?? latestRequest?.outlook_draft_id
      ?? null,
    latest_send_posture:
      latest?.send_posture
      ?? latestRecord?.send_posture
      ?? latestRequest?.send_posture
      ?? null,
    latest_send_accepted_id: latest?.send_accepted_id ?? null,
    latest_message_id:
      latest?.message_id ??
      latest?.source_message_ref ??
      latestRecord?.source_message_ref ??
      latestRequest?.source_message_ref ??
      null,
    latest_subject:
      latest?.subject ??
      latestRecord?.subject ??
      latestRequest?.subject ??
      null,
    latest_recorded_at: latest?.recorded_at ?? latest?.generated_at ?? null,
  };
}

export function formatMailboxSendAcceptedReadText(result) {
  const summary = result?.summary ?? {};
  const latestLabel = summary.focused_send_accepted_id ? 'Focused Accepted' : 'Latest Accepted';
  const latestRecordedLabel = summary.focused_send_accepted_id ? 'Focused Recorded' : 'Latest Recorded';
  const lines = [
    'Mailbox Send Accepted: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Send Acceptance: count=${summary.send_count ?? 0} authority=${summary.mailbox_send_authority ?? 'unknown'} admission=${summary.mailbox_send_admission ?? 'unknown'}`,
  ];
  if (summary.mailbox_mutation_admission) {
    lines.push(`Mutation Admission: ${summary.mailbox_mutation_admission}`);
  }
  if (summary.latest_send_posture) {
    lines.push(`Current Posture: ${summary.latest_send_posture}`);
  }
  if (summary.latest_send_accepted_id || summary.latest_message_id || summary.latest_subject) {
    lines.push(`${latestLabel}: id=${summary.latest_send_accepted_id ?? 'none'} proposal=${summary.latest_proposal_id ?? 'none'} account=${summary.latest_account_ref ?? 'none'} message=${summary.latest_message_id ?? 'none'} subject=${summary.latest_subject ?? 'none'}`);
  }
  if (summary.latest_draft_create_id) {
    lines.push(`Draft Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${result?.worker_url ?? '<worker-url>'} --site ${summary.site_id ?? '<site-id>'} --focus-ref ${summary.latest_draft_create_id} --operator-session-file <operator-session-file>`);
  }
  if (summary.latest_recorded_at) {
    lines.push(`${latestRecordedLabel}: ${summary.latest_recorded_at}`);
  }
  return `${lines.join('\n')}\n`;
}

function listMailboxSendAccepted(body = {}) {
  if (Array.isArray(body?.sends)) return body.sends;
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
    const config = parseMailboxSendAcceptedReadArgs(process.argv.slice(2));
    const result = await readMailboxSendAccepted(config);
    if (config.format === 'text') {
      process.stdout.write(formatMailboxSendAcceptedReadText(result));
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
