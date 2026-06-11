#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const repositoryRef = option('--repository-ref') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? 'github:andrey-kokoev/narada';
const branchRef = option('--branch') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? 'cloudflare-publication';

if (!workerUrl) throw new Error('authority_transfer_readiness_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('authority_transfer_readiness_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('authority_transfer_readiness_live_smoke_requires_site_id');
if (!operationId) throw new Error('authority_transfer_readiness_live_smoke_requires_operation_id');
if (!repositoryRef) throw new Error('authority_transfer_readiness_live_smoke_requires_repository_ref');
if (!branchRef) throw new Error('authority_transfer_readiness_live_smoke_requires_branch_ref');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `authority_transfer_readiness_operation_read_${suffix}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
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
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.operation_product_surface, 'operation_product_surface missing');
assert.ok(operationRead.body.authority_transfer_posture, 'authority_transfer_posture missing');

const repositoryReadiness = await postCarrier({
  operation: 'repository_publication.cloudflare_execution.readiness',
  request_id: `authority_transfer_readiness_repository_${suffix}`,
  params: { site_id: siteId, repository_ref: repositoryRef, branch_ref: branchRef },
});
assert.equal(repositoryReadiness.http_status, 200, JSON.stringify(repositoryReadiness.body));
assert.equal(repositoryReadiness.body.schema, 'narada.sonar.cloudflare_github_repository_publication_readiness.v1');
assert.equal(repositoryReadiness.body.status, 'ok');
assert.equal(repositoryReadiness.body.site_id, siteId);
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
const incompleteReasons = [];
if (remainingWindowsDomains.length > 0) incompleteReasons.push('remaining_windows_domains_present');
if (repositoryReadiness.body.readiness_status !== 'ready') incompleteReasons.push('repository_publication_cloudflare_github_not_ready');
if (repositoryReadiness.body.requested_repository_allowed !== true) incompleteReasons.push('repository_ref_not_allowed');
if (repositoryReadiness.body.requested_branch_allowed !== true) incompleteReasons.push('branch_ref_not_allowed');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.authority_transfer_readiness_live_smoke.v1',
  status: incompleteReasons.length === 0 ? 'ready_for_completion_audit' : 'incomplete',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  authority_transfer_posture: {
    status: authorityTransferPosture.status ?? null,
    remaining_windows_domains: remainingWindowsDomains,
    attention: authorityTransferPosture.attention ?? [],
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
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`authority_transfer_readiness_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}
