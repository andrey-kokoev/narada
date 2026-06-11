#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
const repositoryRef = option('--repository-ref') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? '';
const branchRef = option('--branch') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? '';
const commitSha = normalizeCommitSha(option('--commit') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_COMMIT_SHA ?? '');
const executeAcknowledged = args.includes('--execute-cloudflare-github') || process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_LIVE === '1';

if (!executeAcknowledged) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--execute-cloudflare-github_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_LIVE=1');
if (!workerUrl) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_site_id');
if (!repositoryRef) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--repository-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF');
if (!branchRef) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--branch_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH');
if (!commitSha) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_40_hex_--commit_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_COMMIT_SHA');

const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const requestId = `repository_publication_cloudflare_github_live_${suffix}`;
const admissionId = `repository_publication_cloudflare_github_admission_live_${suffix}`;
const executionId = `repository_publication_cloudflare_github_execution_live_${suffix}`;
const generatedAt = new Date().toISOString();

const sourcePayload = {
  generated_at: generatedAt,
  operation_id: operationId,
  task_id: option('--task-id') ?? 'cloudflare-repository-publication-cloudflare-github-live-smoke',
  publication_ref: `repository-publication:cloudflare-github-live-smoke:${suffix}`,
  requested_action_ref: `repository-publication-action:cloudflare-github-live-smoke:${suffix}`,
  requested_action_summary: 'execute governed repository publication through Cloudflare GitHub executor',
  repository_ref: repositoryRef,
  branch_ref: branchRef,
  source_change_ref: `git:commit:${commitSha}`,
  governed_request_contract_ref: option('--contract-ref') ?? 'contract:cloudflare-github-repository-publication-request:v1',
  evidence_return_contract_ref: option('--evidence-contract-ref') ?? 'contract:cloudflare-github-repository-publication-execution-record:v1',
  rollback_plan_ref: option('--rollback-ref') ?? `rollback:cloudflare-github-repository-publication-live-smoke:${suffix}`,
  repository_publication_admission: 'pending_windows_publication_admission',
  cloudflare_git_push_admission: 'not_admitted',
  direct_cloudflare_repository_mutation_admission: 'not_admitted',
};

const queued = await postCarrier({
  operation: 'repository_publication.request.create',
  request_id: `repository_publication_cloudflare_github_request_create_${suffix}`,
  params: { site_id: siteId, repository_publication_request_id: requestId, source_payload: sourcePayload },
});
assert.equal(queued.http_status, 200, JSON.stringify(queued.body));
assert.equal(queued.body.status, 'queued');
assert.equal(queued.body.repository_publication_request_authority, 'cloudflare_repository_publication_request_queue');
assert.equal(queued.body.repository_publication_executor_authority, 'windows_repository_publication_executor');
assert.equal(queued.body.repository_publication_admission, 'pending_windows_publication_admission');
assert.equal(queued.body.cloudflare_git_push_admission, 'not_admitted');
assert.equal(queued.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

const executionBeforeAdmission = await postCarrier({
  operation: 'repository_publication.cloudflare_execution.execute',
  request_id: `repository_publication_cloudflare_github_execution_before_admission_${suffix}`,
  params: { site_id: siteId, repository_publication_request_id: requestId, repository_publication_execution_id: `${executionId}_before_admission` },
});
assert.equal(executionBeforeAdmission.http_status, 400, JSON.stringify(executionBeforeAdmission.body));
assert.equal(executionBeforeAdmission.body.code, 'cloudflare_repository_publication_execution_admission_required');

const admitted = await postCarrier({
  operation: 'repository_publication.admission.classify',
  request_id: `repository_publication_cloudflare_github_admission_classify_${suffix}`,
  params: {
    site_id: siteId,
    repository_publication_admission_id: admissionId,
    repository_publication_request_id: requestId,
    admission_action: 'admit',
    admission_reason: 'cloudflare_github_repository_publication_live_smoke_admitted',
  },
});
assert.equal(admitted.http_status, 200, JSON.stringify(admitted.body));
assert.equal(admitted.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
assert.equal(admitted.body.repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
assert.equal(admitted.body.cloudflare_git_push_admission, 'not_admitted');
assert.equal(admitted.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

const execution = await postCarrier({
  operation: 'repository_publication.cloudflare_execution.execute',
  request_id: `repository_publication_cloudflare_github_execution_execute_${suffix}`,
  params: { site_id: siteId, repository_publication_request_id: requestId, repository_publication_execution_id: executionId },
});
assert.equal(execution.http_status, 200, JSON.stringify(execution.body));
assert.equal(execution.body.schema, 'narada.sonar.cloudflare_github_repository_publication_execution.v1');
assert.equal(execution.body.status, 'execution_recorded');
assert.equal(execution.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
assert.equal(execution.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
assert.equal(execution.body.repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
assert.equal(execution.body.cloudflare_git_push_admission, 'not_admitted');
assert.equal(execution.body.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
assert.equal(execution.body.authority_partition, 'cloudflare_admits_and_executes_github_repository_publication');
assert.equal(execution.body.execution.repository_publication_execution_id, executionId);
assert.equal(execution.body.execution.repository_publication_request_id, requestId);
assert.equal(execution.body.execution.repository_ref, repositoryRef);
assert.equal(execution.body.execution.branch_ref, branchRef.replace(/^refs\/heads\//, ''));
assert.equal(execution.body.execution.source_change_ref, `git:commit:${commitSha}`);
assert.equal(execution.body.execution.cloudflare_repository_publication_admission_id, admissionId);
assert.equal(execution.body.execution.cloudflare_repository_publication_admission_action, 'admit');
assert.equal(execution.body.execution.published_commit_ref, execution.body.publication_status === 'completed' ? `git:commit:${commitSha}` : '');
assert.ok(['completed', 'failed'].includes(execution.body.publication_status), JSON.stringify(execution.body));

const executionList = await postCarrier({
  operation: 'repository_publication.cloudflare_execution.list',
  request_id: `repository_publication_cloudflare_github_execution_list_${suffix}`,
  params: { site_id: siteId, repository_publication_request_id: requestId, repository_publication_execution_limit: 20 },
});
assert.equal(executionList.http_status, 200, JSON.stringify(executionList.body));
const storedExecution = executionList.body.executions.find((entry) => entry.repository_publication_execution_id === executionId);
assert.ok(storedExecution, JSON.stringify(executionList.body));
assert.equal(executionList.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
assert.equal(executionList.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
assert.equal(executionList.body.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
assert.equal(storedExecution.repository_publication_request_id, requestId);
assert.equal(storedExecution.repository_ref, repositoryRef);
assert.equal(storedExecution.branch_ref, branchRef.replace(/^refs\/heads\//, ''));
assert.equal(storedExecution.source_change_ref, `git:commit:${commitSha}`);

const nextAfterExecution = await postCarrier({
  operation: 'repository_publication.request.next',
  request_id: `repository_publication_cloudflare_github_request_next_after_execution_${suffix}`,
  params: { site_id: siteId, repository_publication_request_limit: 25 },
});
assert.equal(nextAfterExecution.http_status, 200, JSON.stringify(nextAfterExecution.body));
if (nextAfterExecution.body.request?.repository_publication_request_id === requestId) {
  throw new Error('cloudflare_github_repository_publication_live_smoke_selected_executed_request');
}

const operationRead = await postCarrier({
  operation: 'operation.read',
  request_id: `repository_publication_cloudflare_github_operation_read_${suffix}`,
  params: { operation_id: operationId, repository_publication_request_limit: 25, repository_publication_execution_limit: 25, limit: 25 },
});
assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
const operationExecution = operationRead.body.repository_publication_executions.find((entry) => entry.repository_publication_execution_id === executionId);
assert.ok(operationExecution, JSON.stringify(operationRead.body.repository_publication_executions));
assert.equal(operationRead.body.repository_publication_operation_posture.executor_authority, 'cloudflare_github_repository_publication_executor');
assert.equal(operationRead.body.repository_publication_operation_posture.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
assert.equal(operationRead.body.repository_publication_operation_posture.authority_partition, 'cloudflare_admits_and_executes_github_repository_publication');

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.repository_publication_cloudflare_github_live_smoke.v1',
  status: 'ok',
  worker_url: workerUrl,
  site_id: siteId,
  operation_id: operationId,
  repository_publication_request_id: requestId,
  repository_publication_admission_id: admissionId,
  repository_publication_execution_id: executionId,
  repository_ref: repositoryRef,
  branch_ref: storedExecution.branch_ref,
  source_change_ref: `git:commit:${commitSha}`,
  publication_status: execution.body.publication_status,
  github_http_status: storedExecution.github_http_status,
  repository_publication_executor_authority: execution.body.repository_publication_executor_authority,
  repository_publication_admission_authority: execution.body.repository_publication_admission_authority,
  direct_cloudflare_repository_mutation_admission: execution.body.direct_cloudflare_repository_mutation_admission,
  authority_partition: execution.body.authority_partition,
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

function normalizeCommitSha(value) {
  const match = String(value ?? '').trim().match(/^(?:git:commit:)?([0-9a-f]{40})$/i);
  return match ? match[1].toLowerCase() : '';
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`cloudflare_github_repository_publication_live_smoke_token_file_missing:${resolved}`);
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
