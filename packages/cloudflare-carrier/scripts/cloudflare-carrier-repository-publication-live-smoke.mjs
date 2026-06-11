#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const args = process.argv.slice(2);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');
const syncScript = join(scriptDir, 'cloudflare-site-continuity-sync.mjs');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const repositoryPath = resolve(option('--repo') ?? repoRoot);

if (!workerUrl) throw new Error('repository_publication_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('repository_publication_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('repository_publication_live_smoke_requires_site_id');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const requestId = `repository_publication_request_live_${suffix}`;
const generatedAt = new Date().toISOString();
const sourcePayload = {
  generated_at: generatedAt,
  operation_id: operationId,
  task_id: option('--task-id') ?? 'cloudflare-repository-publication-live-smoke',
  publication_ref: `repository-publication:live-smoke:${suffix}`,
  requested_action_ref: `repository-publication-action:live-smoke:${suffix}`,
  requested_action_summary: 'request governed repository publication and record Windows refusal evidence without implicit push',
  repository_ref: option('--repository-ref') ?? 'github:andrey-kokoev/narada',
  branch_ref: option('--branch') ?? 'main',
  source_change_ref: option('--source-change-ref') ?? `cloudflare-local-change:repository-publication-live-smoke:${suffix}`,
  governed_request_contract_ref: option('--contract-ref') ?? 'contract:cloudflare-to-windows-repository-publication-request:v1',
  evidence_return_contract_ref: option('--evidence-contract-ref') ?? 'contract:windows-repository-publication-evidence-return:v1',
  rollback_plan_ref: option('--rollback-ref') ?? `rollback:repository-publication-live-smoke:${suffix}`,
  repository_publication_admission: 'pending_windows_publication_admission',
  cloudflare_git_push_admission: 'not_admitted',
  direct_cloudflare_repository_mutation_admission: 'not_admitted',
};

const refusedDirectPush = await postCarrier({
  operation: 'repository_publication.request.create',
  request_id: `repository_publication_refused_direct_push_${suffix}`,
  params: {
    site_id: siteId,
    repository_publication_request_id: `${requestId}_refused_direct_push`,
    source_payload: { ...sourcePayload, cloudflare_git_push_admission: 'admitted' },
  },
});
assert.equal(refusedDirectPush.http_status, 400, JSON.stringify(refusedDirectPush.body));
assert.equal(refusedDirectPush.body.code, 'repository_publication_cloudflare_git_push_admission_invalid');

const queued = await postCarrier({
  operation: 'repository_publication.request.create',
  request_id: `repository_publication_request_create_${suffix}`,
  params: { site_id: siteId, repository_publication_request_id: requestId, source_payload: sourcePayload },
});
assert.equal(queued.http_status, 200, JSON.stringify(queued.body));
assert.equal(queued.body.status, 'queued');
assert.equal(queued.body.repository_publication_request_authority, 'cloudflare_repository_publication_request_queue');
assert.equal(queued.body.repository_publication_executor_authority, 'windows_repository_publication_executor');
assert.equal(queued.body.repository_publication_admission, 'pending_windows_publication_admission');
assert.equal(queued.body.cloudflare_git_push_admission, 'not_admitted');
assert.equal(queued.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

const selectedBeforeAdmission = await postCarrier({
  operation: 'repository_publication.request.next',
  request_id: `repository_publication_request_next_before_admission_${suffix}`,
  params: { site_id: siteId, repository_publication_request_limit: 25 },
});
assert.equal(selectedBeforeAdmission.http_status, 200, JSON.stringify(selectedBeforeAdmission.body));
if (selectedBeforeAdmission.body.request?.repository_publication_request_id === requestId) {
  throw new Error('repository_publication_live_smoke_selected_unadmitted_request');
}

const admitted = await postCarrier({
  operation: 'repository_publication.admission.classify',
  request_id: `repository_publication_admission_classify_${suffix}`,
  params: {
    site_id: siteId,
    repository_publication_admission_id: `repository_publication_admission_live_${suffix}`,
    repository_publication_request_id: requestId,
    admission_action: 'admit',
    admission_reason: 'cloudflare_repository_publication_live_smoke_admitted',
  },
});
assert.equal(admitted.http_status, 200, JSON.stringify(admitted.body));
assert.equal(admitted.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
assert.equal(admitted.body.repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
assert.equal(admitted.body.cloudflare_git_push_admission, 'not_admitted');
assert.equal(admitted.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

const execution = await execFile(process.execPath, [
  syncScript,
  'repository-publication-execute-pending',
  '--site', siteId,
  '--repo', repositoryPath,
  '--url', workerUrl,
  '--token', bearerToken,
  '--limit', '25',
], { cwd: repoRoot, timeout: 120000, windowsHide: true });
const executionBody = JSON.parse(execution.stdout);
assert.equal(executionBody.schema, 'narada.repository_publication_cloudflare_pending_execution.v1');
assert.ok(executionBody.request_count >= 1);
assert.equal(executionBody.provider_heartbeat_recorded, true, JSON.stringify(executionBody.provider_heartbeat_response));
const executionResult = executionBody.results.find((entry) => entry.request_id === requestId);
assert.ok(executionResult, JSON.stringify(executionBody));
assert.equal(executionResult.status, 'evidence_recorded');
assert.equal(executionResult.evidence.windows_admission_action, 'refuse');
assert.equal(executionResult.evidence.windows_admission_reason, 'repository_publication_push_not_enabled');
assert.equal(executionResult.evidence.publication_status, 'refused');
assert.equal(executionResult.evidence.cloudflare_repository_publication_admission_id, `repository_publication_admission_live_${suffix}`);
assert.equal(executionResult.evidence.cloudflare_repository_publication_admission_action, 'admit');
assert.equal(executionResult.evidence.cloudflare_git_push_admission, 'not_admitted');
assert.equal(executionResult.evidence.direct_cloudflare_repository_mutation_admission, 'not_admitted');

const evidenceList = await postCarrier({
  operation: 'repository_publication.evidence.list',
  request_id: `repository_publication_evidence_list_${suffix}`,
  params: { site_id: siteId, repository_publication_request_id: requestId, repository_publication_evidence_limit: 20 },
});
assert.equal(evidenceList.http_status, 200, JSON.stringify(evidenceList.body));
const evidence = evidenceList.body.evidence.find((entry) => entry.repository_publication_request_id === requestId);
assert.ok(evidence, JSON.stringify(evidenceList.body));
assert.equal(evidence.windows_admission_action, 'refuse');
assert.equal(evidence.windows_admission_reason, 'repository_publication_push_not_enabled');
assert.equal(evidence.publication_status, 'refused');
assert.equal(evidence.cloudflare_repository_publication_admission_id, `repository_publication_admission_live_${suffix}`);
assert.equal(evidence.cloudflare_repository_publication_admission_action, 'admit');
assert.equal(evidence.cloudflare_git_push_admission, 'not_admitted');
assert.equal(evidence.direct_cloudflare_repository_mutation_admission, 'not_admitted');
assert.equal(evidenceList.body.repository_publication_evidence_authority, 'windows_repository_publication_executor');
assert.equal(evidenceList.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
assert.equal(evidenceList.body.cloudflare_evidence_store_authority, 'cloudflare_repository_publication_evidence_store');
assert.equal(evidenceList.body.authority_partition, 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence');

const heartbeatList = await postCarrier({
  operation: 'repository_publication.provider_heartbeat.list',
  request_id: `repository_publication_provider_heartbeat_list_${suffix}`,
  params: { site_id: siteId, repository_publication_provider_heartbeat_limit: 20 },
});
assert.equal(heartbeatList.http_status, 200, JSON.stringify(heartbeatList.body));
const heartbeat = heartbeatList.body.repository_publication_provider_heartbeats.find((entry) => entry.repository_publication_provider_heartbeat_id === executionBody.repository_publication_provider_heartbeat_id);
assert.ok(heartbeat, JSON.stringify(heartbeatList.body));
assert.equal(heartbeat.provider_authority, 'windows_repository_publication_executor');
assert.equal(heartbeat.provider_liveness_authority, 'cloudflare_repository_publication_provider_liveness_store');
assert.equal(heartbeat.cloudflare_git_push_admission, 'not_admitted');
assert.equal(heartbeat.direct_cloudflare_repository_mutation_admission, 'not_admitted');
assert.equal(heartbeatList.body.provider_liveness_authority, 'cloudflare_repository_publication_provider_liveness_store');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.repository_publication_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  repository_publication_request_id: requestId,
  repository_publication_request_authority: queued.body.repository_publication_request_authority,
  repository_publication_admission_authority: admitted.body.repository_publication_admission_authority,
  repository_publication_executor_authority: queued.body.repository_publication_executor_authority,
  repository_publication_admission: admitted.body.repository_publication_admission,
  cloudflare_git_push_admission: queued.body.cloudflare_git_push_admission,
  direct_cloudflare_repository_mutation_admission: queued.body.direct_cloudflare_repository_mutation_admission,
  execution_status: executionResult.status,
  windows_admission_action: evidence.windows_admission_action,
  windows_admission_reason: evidence.windows_admission_reason,
  publication_status: evidence.publication_status,
  cloudflare_evidence_store_authority: evidenceList.body.cloudflare_evidence_store_authority,
  repository_publication_provider_heartbeat_id: executionBody.repository_publication_provider_heartbeat_id,
  provider_liveness_authority: heartbeat.provider_liveness_authority,
  provider_heartbeat_status: heartbeat.status,
  authority_partition: evidenceList.body.authority_partition,
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
  if (!existsSync(resolved)) throw new Error(`repository_publication_live_smoke_token_file_missing:${resolved}`);
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
