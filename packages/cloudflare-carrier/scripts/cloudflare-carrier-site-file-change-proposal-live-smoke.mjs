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

if (!workerUrl) throw new Error('site_file_change_proposal_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('site_file_change_proposal_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('site_file_change_proposal_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const proposalId = `site_file_change_proposal_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  schema: 'narada.sonar.site_file_change_proposal.v1',
  generated_at: generatedAt,
  operation_id: operationId,
  task_id: option('--task-id') ?? 'cloudflare-site-file-change-proposal-live-smoke',
  proposal_ref: `proposal:site-file-change-live:${suffix}`,
  proposal_summary: option('--summary') ?? 'live Cloudflare site file change proposal',
  authority_locus: 'cloudflare_carrier_site',
  filesystem_executor_authority: 'windows_filesystem_executor',
  filesystem_mutation_admission: 'not_admitted',
  repository_publication_admission: 'not_admitted',
  proposal_posture: 'proposal_only_no_filesystem_write',
  files: [{
    file_path: option('--file') ?? 'docs/architecture/cloudflare-carrier/target.md',
    change_kind: option('--change-kind') ?? 'update',
    material_source_ref: `material-source:site-file-change-proposal-live:${suffix}`,
  }],
};

const refusedMutation = await postCarrier({
  operation: 'site_file_change_proposal.record',
  request_id: `site_file_change_proposal_refused_mutation_${suffix}`,
  params: {
    site_id: siteId,
    proposal_id: `${proposalId}_refused_mutation`,
    source_payload: { ...sourcePayload, filesystem_mutation_admission: 'admitted' },
  },
});
assert.equal(refusedMutation.http_status, 400, JSON.stringify(refusedMutation.body));
assert.equal(refusedMutation.body.code, 'site_file_change_proposal_filesystem_mutation_admission_invalid');

const recorded = await postCarrier({
  operation: 'site_file_change_proposal.record',
  request_id: `site_file_change_proposal_record_${suffix}`,
  params: { site_id: siteId, proposal_id: proposalId, source_payload: sourcePayload },
});
assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
assert.equal(recorded.body.status, 'recorded');
assert.equal(recorded.body.proposal_authority, 'cloudflare_carrier_site');
assert.equal(recorded.body.filesystem_executor_authority, 'windows_filesystem_executor');
assert.equal(recorded.body.filesystem_mutation_admission, 'not_admitted');
assert.equal(recorded.body.repository_publication_admission, 'not_admitted');

const listed = await postCarrier({
  operation: 'site_file_change_proposal.list',
  request_id: `site_file_change_proposal_list_${suffix}`,
  params: { site_id: siteId, site_file_change_proposal_limit: 20 },
});
assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
assert.ok(listed.body.proposals.some((entry) => entry.proposal_id === proposalId));
assert.equal(listed.body.filesystem_executor_authority, 'windows_filesystem_executor');
assert.equal(listed.body.filesystem_mutation_admission, 'not_admitted');
assert.equal(listed.body.repository_publication_admission, 'not_admitted');
assert.equal(listed.body.authority_partition, 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned');

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `site_file_change_proposal_operation_read_${suffix}`,
  params: { site_id: siteId, operation_id: operationId, site_file_change_proposal_limit: 20 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
assert.ok(operationRead.body.site_file_change_proposals.some((entry) => entry.proposal_id === proposalId));
assert.ok(operationRead.body.operation_product_surface.site_file_change_proposal_count >= 1);
assert.equal(operationRead.body.operation_product_surface.site_file_change_proposal_authority, 'cloudflare_carrier_site');
assert.equal(operationRead.body.operation_product_surface.filesystem_executor_authority, 'windows_filesystem_executor');
assert.equal(operationRead.body.operation_product_surface.filesystem_mutation_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.repository_publication_admission, 'not_admitted');
assert.equal(operationRead.body.operation_product_surface.site_file_change_authority_partition, 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.site_file_change_proposal_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  proposal_id: proposalId,
  proposal_authority: recorded.body.proposal_authority,
  filesystem_executor_authority: recorded.body.filesystem_executor_authority,
  filesystem_mutation_admission: recorded.body.filesystem_mutation_admission,
  repository_publication_admission: recorded.body.repository_publication_admission,
  site_file_change_proposal_count: operationRead.body.operation_product_surface.site_file_change_proposal_count,
  site_file_change_authority_partition: operationRead.body.operation_product_surface.site_file_change_authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`site_file_change_proposal_live_smoke_token_file_missing:${resolved}`);
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
