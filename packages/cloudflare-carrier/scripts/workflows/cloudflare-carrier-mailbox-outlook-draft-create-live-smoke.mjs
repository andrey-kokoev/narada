#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../../..');

export function parseMailboxOutlookDraftCreateLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const accountRef = option(args, '--account') ?? env.CLOUDFLARE_MAILBOX_ACCOUNT_REF ?? 'help@global-maxima.com';
  const toRecipient = option(args, '--to') ?? env.CLOUDFLARE_MAILBOX_DRAFT_SMOKE_TO ?? accountRef;
  const sourceMessageRef = option(args, '--source-message') ?? null;
  const proposalId = option(args, '--proposal-id') ?? null;
  const proposalRef = option(args, '--proposal-ref') ?? null;
  const subject = option(args, '--subject') ?? null;
  const bodyText = option(args, '--body-text') ?? null;
  const bodySha256 = option(args, '--body-sha256') ?? 'd'.repeat(64);
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`mailbox_outlook_draft_create_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_site_id');
  if (!accountRef) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_account_ref');
  if (!toRecipient) throw new Error('mailbox_outlook_draft_create_live_smoke_requires_to_recipient');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    accountRef,
    toRecipient,
    sourceMessageRef,
    proposalId,
    proposalRef,
    subject,
    bodyText,
    bodySha256,
  };
}

export function formatMailboxOutlookDraftCreateLiveSmokeText(result) {
  const workerUrl = typeof result.worker_url === 'string' && result.worker_url.length > 0 ? result.worker_url : null;
  const siteId = typeof result.site_id === 'string' && result.site_id.length > 0 ? result.site_id : null;
  const operationId = typeof result.operation_id === 'string' && result.operation_id.length > 0 ? result.operation_id : null;
  const lines = [
    `Mailbox Outlook Draft Create Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Account: ${result.account_ref}`,
    `Proposal: ${result.proposal_id}`,
    `Draft Create: ${result.draft_create_id}`,
    `Outlook Draft: ${result.outlook_draft_id}`,
    `Authority: draft_create=${result.mailbox_outlook_draft_create_authority ?? 'unknown'} draft_admission=${result.mailbox_outlook_draft_create_admission ?? 'unknown'} send=${result.mailbox_send_admission ?? 'unknown'} mutation=${result.mailbox_mutation_admission ?? 'unknown'}`,
    `Counts: drafts=${result.mailbox_outlook_draft_create_count ?? 0} partition=${result.mailbox_outlook_draft_create_authority_partition ?? 'unknown'}`,
  ];
  if (workerUrl && siteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
    lines.push(`Proposal Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url ${workerUrl} --site ${siteId} --focus-ref ${result.proposal_id} --operator-session-file <operator-session-file>`);
    lines.push(`Draft Read: pnpm --filter @narada2/cloudflare-carrier product:mailbox:outlook-draft:text -- --url ${workerUrl} --site ${siteId} --focus-ref ${result.draft_create_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && siteId && operationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runMailboxOutlookDraftCreateLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const draftCreateId = `mailbox_outlook_draft_create_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const sourcePayload = {
    schema: 'narada.sonar.mailbox_outlook_draft_create_request.v1',
    generated_at: generatedAt,
    operation_id: config.operationId,
    account_ref: config.accountRef,
    source_message_ref: config.sourceMessageRef ?? `graph-message-draft-create-live-smoke-${suffix}`,
    proposal_id: config.proposalId ?? `mailbox_draft_reply_proposal_live_${suffix}`,
    proposal_ref: config.proposalRef ?? `proposal:mailbox-draft-create-live:${suffix}`,
    subject: config.subject ?? `Narada Cloudflare draft-create smoke ${suffix}`,
    to_recipients: [config.toRecipient],
    body_text: config.bodyText ?? `Cloudflare draft-create live smoke ${suffix}. This draft is intentionally not sent.`,
    body_sha256: config.bodySha256,
    mailbox_outlook_draft_create_admission: 'admitted',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
  };

  const refusedSend = await postCarrier(config, {
    operation: 'mailbox.outlook_draft.create',
    request_id: `mailbox_outlook_draft_create_refused_send_${suffix}`,
    params: {
      site_id: config.siteId,
      draft_create_id: `${draftCreateId}_refused_send`,
      source_payload: { ...sourcePayload, mailbox_send_admission: 'admitted' },
    },
  }, fetchImpl);
  assert.equal(refusedSend.http_status, 400, JSON.stringify(refusedSend.body));
  assert.equal(refusedSend.body.code, 'mailbox_outlook_draft_create_send_admission_invalid');

  const created = await postCarrier(config, {
    operation: 'mailbox.outlook_draft.create',
    request_id: `mailbox_outlook_draft_create_record_${suffix}`,
    params: { site_id: config.siteId, draft_create_id: draftCreateId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(created.http_status, 200, JSON.stringify(created.body));
  assert.equal(created.body.status, 'created');
  assert.equal(created.body.mailbox_outlook_draft_create_authority, 'cloudflare_graph_outlook_draft_create');
  assert.equal(created.body.mailbox_outlook_draft_create_admission, 'admitted');
  assert.equal(created.body.mailbox_send_admission, 'not_admitted');
  assert.equal(created.body.mailbox_mutation_admission, 'not_admitted');
  assert.ok(created.body.record?.outlook_draft_id, JSON.stringify(created.body));

  const listed = await postCarrier(config, {
    operation: 'mailbox.outlook_draft.list',
    request_id: `mailbox_outlook_draft_create_list_${suffix}`,
    params: { site_id: config.siteId, mailbox_outlook_draft_create_limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.ok(listed.body.drafts.some((entry) => entry.draft_create_id === draftCreateId));
  assert.equal(listed.body.mailbox_outlook_draft_create_admission, 'admitted');
  assert.equal(listed.body.mailbox_send_admission, 'not_admitted');
  assert.equal(listed.body.mailbox_mutation_admission, 'not_admitted');
  assert.equal(listed.body.authority_partition, 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `mailbox_outlook_draft_create_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, mailbox_outlook_draft_create_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  const operationDraft = operationRead.body.mailbox_outlook_draft_creates.find((entry) => entry.draft_create_id === draftCreateId);
  assert.ok(operationDraft, JSON.stringify(operationRead.body.mailbox_outlook_draft_creates));
  assert.equal(operationDraft.mailbox_outlook_draft_create_admission, 'admitted');
  assert.equal(operationDraft.mailbox_send_admission, 'not_admitted');
  assert.equal(operationDraft.mailbox_mutation_admission, 'not_admitted');
  assert.ok(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_count >= 1);
  assert.equal(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_admission, 'admitted');
  assert.ok(['not_admitted', 'admitted'].includes(operationRead.body.operation_product_surface.mailbox_send_admission));
  assert.equal(operationRead.body.operation_product_surface.mailbox_mutation_admission, 'not_admitted');
  assert.ok([
    'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
    'mailbox_outlook_draft_create_and_send_cloudflare_owned_confirmation_and_other_mutation_not_admitted',
    'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted',
  ].includes(operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition));

  return {
    schema: 'narada.cloudflare_carrier.mailbox_outlook_draft_create_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    account_ref: config.accountRef,
    proposal_id: sourcePayload.proposal_id,
    draft_create_id: draftCreateId,
    outlook_draft_id: created.body.record.outlook_draft_id,
    mailbox_outlook_draft_create_authority: created.body.mailbox_outlook_draft_create_authority,
    mailbox_outlook_draft_create_admission: created.body.mailbox_outlook_draft_create_admission,
    mailbox_send_admission: created.body.mailbox_send_admission,
    mailbox_mutation_admission: created.body.mailbox_mutation_admission,
    operation_product_surface_mailbox_send_admission: operationRead.body.operation_product_surface.mailbox_send_admission,
    mailbox_outlook_draft_create_count: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_count,
    mailbox_outlook_draft_create_authority_partition: operationRead.body.operation_product_surface.mailbox_outlook_draft_create_authority_partition,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { ...authHeaders(config.auth), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { kind: 'bearer', value: readTokenFile(tokenFile), source: tokenFile === env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'token-file' };
  const token = option(args, '--token') ?? env.CLOUDFLARE_CARRIER_TOKEN ?? null;
  if (token) return { kind: 'bearer', value: token, source: option(args, '--token') ? 'flag:--token' : 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`mailbox_outlook_draft_create_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!env[key]) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseMailboxOutlookDraftCreateLiveSmokeArgs(process.argv.slice(2));
  const result = await runMailboxOutlookDraftCreateLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatMailboxOutlookDraftCreateLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
