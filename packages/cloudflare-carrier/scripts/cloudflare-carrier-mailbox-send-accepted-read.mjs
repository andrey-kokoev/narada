#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { parseProductReadArgs, readProductSurface } from './cloudflare-carrier-product-read.mjs';

export function parseMailboxSendAcceptedReadArgs(argv = [], env = process.env) {
  return parseProductReadArgs(['--operation', 'mailbox.send_accepted.list', ...argv], env);
}

export async function readMailboxSendAccepted(config, fetchImpl = fetch) {
  const product = await readProductSurface(config, fetchImpl);
  return {
    schema: 'narada.cloudflare_carrier.mailbox_send_accepted_read.v1',
    status: 'ok',
    worker_url: product.worker_url,
    auth_source: product.auth_source,
    operation: product.operation,
    params: product.params,
    summary: summarizeMailboxSendAccepted(product.response),
    response: product.response,
  };
}

export function summarizeMailboxSendAccepted(body = {}) {
  const sends = Array.isArray(body?.sends) ? body.sends : [];
  const latest = sends[0] ?? null;
  const latestRecord = latest?.record ?? null;
  const latestRequest = latestRecord?.send_request ?? null;
  return {
    site_id: body?.site_id ?? null,
    send_count: sends.length,
    mailbox_send_authority: body?.mailbox_send_authority ?? null,
    mailbox_send_admission: body?.mailbox_send_admission ?? null,
    mailbox_mutation_admission: body?.mailbox_mutation_admission ?? null,
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
  if (summary.latest_send_accepted_id || summary.latest_message_id || summary.latest_subject) {
    lines.push(`Latest Accepted: id=${summary.latest_send_accepted_id ?? 'none'} message=${summary.latest_message_id ?? 'none'} subject=${summary.latest_subject ?? 'none'}`);
  }
  if (summary.latest_recorded_at) {
    lines.push(`Latest Recorded: ${summary.latest_recorded_at}`);
  }
  return `${lines.join('\n')}\n`;
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
