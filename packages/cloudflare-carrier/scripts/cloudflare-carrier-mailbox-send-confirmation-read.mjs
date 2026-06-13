#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseMailboxSendConfirmationReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'mailbox.send_confirmation.list', ...argv], env);
}

export async function readMailboxSendConfirmation(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.mailbox_send_confirmation_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeMailboxSendConfirmation(product.response),
    response: product.response,
  };
}

export function summarizeMailboxSendConfirmation(body = {}) {
  const confirmations = Array.isArray(body?.confirmations) ? body.confirmations : [];
  const latest = confirmations[0] ?? null;
  const latestRecord = latest?.record ?? null;
  const latestRequest = latestRecord?.confirmation_request ?? null;
  const latestGraphResponse = latest?.graph_response ?? latestRecord?.graph_response ?? null;
  return {
    site_id: body?.site_id ?? null,
    confirmation_count: confirmations.length,
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
    latest_confirmation_posture:
      latest?.confirmation_posture
      ?? latestRecord?.confirmation_posture
      ?? latestRequest?.confirmation_posture
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
    lines.push(`Latest Confirmation: id=${summary.latest_send_confirmation_id ?? 'none'} account=${summary.latest_account_ref ?? 'none'} message=${summary.latest_message_id ?? 'none'} subject=${summary.latest_subject ?? 'none'}`);
  }
  if (summary.latest_body_preview) {
    lines.push(`Body Preview: ${summary.latest_body_preview}`);
  }
  if (summary.latest_recorded_at) {
    lines.push(`Latest Recorded: ${summary.latest_recorded_at}`);
  }
  return `${lines.join('\n')}\n`;
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
