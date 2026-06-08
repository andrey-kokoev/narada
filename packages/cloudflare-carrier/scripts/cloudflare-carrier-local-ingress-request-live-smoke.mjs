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

if (!workerUrl) throw new Error('local_ingress_request_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('local_ingress_request_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('local_ingress_request_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const localIngressRequestId = `local_ingress_request_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  generated_at: generatedAt,
  operation_id: operationId,
  task_id: option('--task-id') ?? 'cloudflare-local-ingress-request-live-smoke',
  requested_mutation_class: 'local_repository_filesystem_mutation',
  requested_action_ref: option('--action-ref') ?? `local-windows-action:site-file-write-live:${suffix}`,
  requested_action_summary: option('--summary') ?? 'request a governed local Windows site-file write and wait for Windows evidence',
  governed_request_contract_ref: option('--contract-ref') ?? 'contract:cloudflare-to-windows-local-ingress-request:v1',
  evidence_return_contract_ref: option('--evidence-contract-ref') ?? 'contract:windows-local-ingress-evidence-return:v1',
  rollback_plan_ref: option('--rollback-ref') ?? `rollback:local-ingress-request-live:${suffix}`,
  target_authority_locus: 'local-windows-site-authority',
  local_executor_authority: 'windows_local_ingress_executor',
  local_execution_admission: 'pending_windows_admission',
  direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
  repository_publication_admission: 'not_admitted',
};

const refusedDirectMutation = await postCarrier({
  operation: 'local_ingress.request.create',
  request_id: `local_ingress_refused_direct_mutation_${suffix}`,
  params: {
    site_id: siteId,
    local_ingress_request_id: `${localIngressRequestId}_refused_direct_mutation`,
    source_payload: { ...sourcePayload, direct_cloudflare_filesystem_mutation_admission: 'admitted' },
  },
});
assert.equal(refusedDirectMutation.http_status, 400, JSON.stringify(refusedDirectMutation.body));
assert.equal(refusedDirectMutation.body.code, 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid');

const queued = await postCarrier({
  operation: 'local_ingress.request.create',
  request_id: `local_ingress_request_create_${suffix}`,
  params: { site_id: siteId, local_ingress_request_id: localIngressRequestId, source_payload: sourcePayload },
});
assert.equal(queued.http_status, 200, JSON.stringify(queued.body));
assert.equal(queued.body.status, 'queued');
assert.equal(queued.body.local_ingress_request_authority, 'cloudflare_local_ingress_request_queue');
assert.equal(queued.body.target_authority_locus, 'local-windows-site-authority');
assert.equal(queued.body.local_executor_authority, 'windows_local_ingress_executor');
assert.equal(queued.body.local_execution_admission, 'pending_windows_admission');
assert.equal(queued.body.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
assert.equal(queued.body.repository_publication_admission, 'not_admitted');

const listed = await postCarrier({
  operation: 'local_ingress.request.list',
  request_id: `local_ingress_request_list_${suffix}`,
  params: { site_id: siteId, local_ingress_request_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.ok(listed.body.requests.some((entry) => entry.local_ingress_request_id === localIngressRequestId));
assert.equal(listed.body.local_ingress_request_authority, 'cloudflare_local_ingress_request_queue');
assert.equal(listed.body.local_executor_authority, 'windows_local_ingress_executor');
assert.equal(listed.body.local_execution_admission, 'pending_windows_admission');
assert.equal(listed.body.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
assert.equal(listed.body.repository_publication_admission, 'not_admitted');
assert.equal(listed.body.authority_partition, 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.local_ingress_request_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  local_ingress_request_id: localIngressRequestId,
  local_ingress_request_authority: queued.body.local_ingress_request_authority,
  target_authority_locus: queued.body.target_authority_locus,
  local_executor_authority: queued.body.local_executor_authority,
  local_execution_admission: queued.body.local_execution_admission,
  direct_cloudflare_filesystem_mutation_admission: queued.body.direct_cloudflare_filesystem_mutation_admission,
  repository_publication_admission: queued.body.repository_publication_admission,
  authority_partition: listed.body.authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`local_ingress_request_live_smoke_token_file_missing:${resolved}`);
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
