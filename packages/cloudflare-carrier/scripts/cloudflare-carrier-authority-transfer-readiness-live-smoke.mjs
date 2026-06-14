#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseAuthorityTransferReadinessLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_AUTHORITY_TRANSFER_READINESS_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const repositoryRef = option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? 'github:andrey-kokoev/narada';
  const branchRef = option(args, '--branch') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? 'cloudflare-publication';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('authority_transfer_readiness_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`authority_transfer_readiness_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('authority_transfer_readiness_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('authority_transfer_readiness_live_smoke_requires_site_id');
  if (!operationId) throw new Error('authority_transfer_readiness_live_smoke_requires_operation_id');
  if (!repositoryRef) throw new Error('authority_transfer_readiness_live_smoke_requires_repository_ref');
  if (!branchRef) throw new Error('authority_transfer_readiness_live_smoke_requires_branch_ref');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    repositoryRef,
    branchRef,
  };
}

export function formatAuthorityTransferReadinessLiveSmokeText(result) {
  const posture = result.authority_transfer_posture ?? {};
  const repo = result.slices?.repository_publication ?? {};
  const lines = [
    `Authority Transfer Readiness Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Authority Transfer: complete=${posture.transfer_complete === true} cloudflare_owned=${posture.cloudflare_owned_count ?? 0} windows_retained=${posture.windows_retained_count ?? 0} next=${posture.next_action ?? 'none'}`,
    `Repository Publication: readiness=${repo.readiness_status ?? 'unknown'} repository_allowed=${repo.requested_repository_allowed ?? 'unknown'} branch_allowed=${repo.requested_branch_allowed ?? 'unknown'} git_push=${repo.cloudflare_git_push_admission ?? 'unknown'}`,
    `Mailbox Slice: status_source=${result.slices?.mailbox?.status_source_read_count ?? 0} draft_reply=${result.slices?.mailbox?.draft_reply_proposal_count ?? 0} send_confirmation=${result.slices?.mailbox?.send_confirmation_count ?? 0}`,
    `Task Lifecycle Slice: tasks=${result.slices?.task_lifecycle?.task_count ?? 0} partition=${result.slices?.task_lifecycle?.authority_partition ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
    `Authority Transfer Read: pnpm --filter @narada2/cloudflare-carrier product:authority-transfer:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Site Action Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:action:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-site-action`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runAuthorityTransferReadinessLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `authority_transfer_readiness_operation_read_${suffix}`,
    params: {
      site_id: config.siteId,
      operation_id: config.operationId,
      mailbox_status_source_limit: 20,
      mailbox_draft_reply_proposal_limit: 20,
      mailbox_outlook_draft_create_limit: 20,
      mailbox_send_accepted_limit: 20,
      mailbox_send_confirmation_limit: 20,
      site_file_change_proposal_limit: 20,
      site_file_materialization_limit: 20,
      local_ingress_request_limit: 20,
      repository_publication_request_limit: 20,
      repository_publication_execution_limit: 20,
      repository_publication_evidence_limit: 20,
      task_lifecycle_limit: 20,
    },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.ok(operationRead.body.operation_product_surface, 'operation_product_surface missing');
  assert.ok(operationRead.body.authority_transfer_posture, 'authority_transfer_posture missing');

  const repositoryReadiness = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.readiness',
    request_id: `authority_transfer_readiness_repository_${suffix}`,
    params: { site_id: config.siteId, repository_ref: config.repositoryRef, branch_ref: config.branchRef },
  }, fetchImpl);
  assert.equal(repositoryReadiness.http_status, 200, JSON.stringify(repositoryReadiness.body));
  assert.equal(repositoryReadiness.body.schema, 'narada.sonar.cloudflare_github_repository_publication_readiness.v1');
  assert.equal(repositoryReadiness.body.status, 'ok');
  assert.equal(repositoryReadiness.body.site_id, config.siteId);
  assert.ok(['ready', 'not_ready'].includes(repositoryReadiness.body.readiness_status), JSON.stringify(repositoryReadiness.body));
  assert.equal(repositoryReadiness.body.github_token_secret_ref, 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN');
  assert.equal(repositoryReadiness.body.cloudflare_git_push_admission, 'not_admitted');

  const rendered = JSON.stringify({ operation: operationRead.body, repository_readiness: repositoryReadiness.body });
  assert.doesNotMatch(rendered, /gh[pousr]_[A-Za-z0-9_]+/);

  const surface = operationRead.body.operation_product_surface;
  const authorityTransferPosture = operationRead.body.authority_transfer_posture;
  const remainingWindowsDomains = Array.isArray(authorityTransferPosture.remaining_windows_domains)
    ? authorityTransferPosture.remaining_windows_domains
    : [];
  const remainingWindowsAuthorities = Array.isArray(authorityTransferPosture.remaining_windows_authorities)
    ? authorityTransferPosture.remaining_windows_authorities
    : [];
  const incompleteReasons = [];
  if (remainingWindowsDomains.length > 0) incompleteReasons.push('remaining_windows_domains_present');
  if (repositoryReadiness.body.readiness_status !== 'ready') incompleteReasons.push('repository_publication_cloudflare_github_not_ready');
  if (repositoryReadiness.body.requested_repository_allowed !== true) incompleteReasons.push('repository_ref_not_allowed');
  if (repositoryReadiness.body.requested_branch_allowed !== true) incompleteReasons.push('branch_ref_not_allowed');

  return {
    schema: 'narada.cloudflare_carrier.authority_transfer_readiness_live_smoke.v1',
    status: incompleteReasons.length === 0 ? 'ready_for_completion_audit' : 'incomplete',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    authority_transfer_posture: {
      transfer_complete: authorityTransferPosture.transfer_complete === true,
      domain_count: authorityTransferPosture.domain_count ?? null,
      cloudflare_owned_count: authorityTransferPosture.cloudflare_owned_count ?? 0,
      cloudflare_governed_windows_executed_count: authorityTransferPosture.cloudflare_governed_windows_executed_count ?? 0,
      cloudflare_recorded_windows_owned_count: authorityTransferPosture.cloudflare_recorded_windows_owned_count ?? 0,
      windows_retained_count: authorityTransferPosture.windows_retained_count ?? 0,
      remaining_windows_domain_count: authorityTransferPosture.remaining_windows_domain_count ?? remainingWindowsDomains.length,
      remaining_windows_authority_count: authorityTransferPosture.remaining_windows_authority_count ?? remainingWindowsAuthorities.length,
      remaining_windows_domains: remainingWindowsDomains,
      remaining_windows_authorities: remainingWindowsAuthorities.slice(0, 20),
      next_action: authorityTransferPosture.next_action ?? null,
    },
    slices: {
      mailbox: {
        status_source_read_count: surface.mailbox_status_source_read_count ?? 0,
        draft_reply_proposal_count: surface.mailbox_draft_reply_proposal_count ?? 0,
        outlook_draft_create_count: surface.mailbox_outlook_draft_create_count ?? 0,
        send_accepted_count: surface.mailbox_send_accepted_count ?? 0,
        send_confirmation_count: surface.mailbox_send_confirmation_count ?? 0,
        send_admission: surface.mailbox_send_admission ?? null,
        mutation_admission: surface.mailbox_mutation_admission ?? null,
      },
      site_file: {
        change_proposal_count: surface.site_file_change_proposal_count ?? 0,
        materialization_count: surface.site_file_materialization_count ?? 0,
      },
      local_ingress: {
        request_count: surface.local_ingress_request_count ?? 0,
        authority_partition: surface.local_ingress_authority_partition ?? null,
      },
      task_lifecycle: {
        task_count: surface.task_lifecycle_count ?? surface.task_count ?? 0,
        authority_partition: surface.task_lifecycle_authority_partition ?? null,
      },
      repository_publication: {
        readiness_status: repositoryReadiness.body.readiness_status,
        github_token_configured: repositoryReadiness.body.github_token_configured,
        requested_repository_allowed: repositoryReadiness.body.requested_repository_allowed,
        requested_branch_allowed: repositoryReadiness.body.requested_branch_allowed,
        request_count: surface.repository_publication_request_count ?? 0,
        execution_count: surface.repository_publication_execution_count ?? 0,
        evidence_count: surface.repository_publication_evidence_count ?? 0,
        authority_partition: surface.repository_publication_authority_partition ?? null,
        cloudflare_git_push_admission: repositoryReadiness.body.cloudflare_git_push_admission,
      },
    },
    incomplete_reasons: incompleteReasons,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
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
  if (!existsSync(resolved)) throw new Error(`authority_transfer_readiness_live_smoke_token_file_missing:${resolved}`);
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
    const value = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseAuthorityTransferReadinessLiveSmokeArgs(process.argv.slice(2));
  const result = await runAuthorityTransferReadinessLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatAuthorityTransferReadinessLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
