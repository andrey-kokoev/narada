#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseRepositoryPublicationCloudflareGithubLiveSmokeArgs(argv = [], env = process.env, options = {}) {
  const args = [...argv];
  if (options.loadLocalEnv !== false) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_CLOUDFLARE_GITHUB_LIVE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const repositoryRef = option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? '';
  const branchRef = option(args, '--branch') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? '';
  const commitSha = normalizeCommitSha(option(args, '--commit') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_COMMIT_SHA ?? '');
  const executeAcknowledged = flag(args, '--execute-cloudflare-github')
    || env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_LIVE === '1';
  const auth = resolveAuth(args, env);

  if (!executeAcknowledged) {
    throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--execute-cloudflare-github_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`cloudflare_github_repository_publication_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('cloudflare_github_repository_publication_live_smoke_requires_site_id');
  if (!repositoryRef) {
    throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--repository-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF');
  }
  if (!branchRef) {
    throw new Error('cloudflare_github_repository_publication_live_smoke_requires_--branch_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH');
  }
  if (!commitSha) {
    throw new Error('cloudflare_github_repository_publication_live_smoke_requires_40_hex_--commit_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_COMMIT_SHA');
  }

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    repositoryRef,
    branchRef,
    commitSha,
    taskId: option(args, '--task-id') ?? 'cloudflare-repository-publication-cloudflare-github-live-smoke',
    contractRef: option(args, '--contract-ref') ?? 'contract:cloudflare-github-repository-publication-request:v1',
    evidenceContractRef: option(args, '--evidence-contract-ref') ?? 'contract:cloudflare-github-repository-publication-execution-record:v1',
    rollbackRef: option(args, '--rollback-ref') ?? null,
  };
}

export function formatRepositoryPublicationCloudflareGithubLiveSmokeText(result) {
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const lines = [
    `Repository Publication Cloudflare GitHub Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Request: ${result.repository_publication_request_id}`,
    `Admission: ${result.repository_publication_admission_id}`,
    `Execution: ${result.repository_publication_execution_id}`,
    `Target: repository=${result.repository_ref} branch=${result.branch_ref}`,
    `Publication Status: ${result.publication_status ?? 'unknown'}`,
    `Authorities: request=${result.repository_publication_request_authority ?? 'unknown'} admission=${result.repository_publication_admission_authority ?? 'unknown'} executor=${result.repository_publication_executor_authority ?? 'unknown'}`,
    `Cloudflare Admission: ${result.direct_cloudflare_repository_mutation_admission ?? 'unknown'}`,
  ];
  if (hasSiteId && result.repository_publication_request_id) {
    lines.push(`Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-request-id ${result.repository_publication_request_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && result.repository_publication_admission_id) {
    lines.push(`Admission Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:admission:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-admission-id ${result.repository_publication_admission_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && result.repository_publication_execution_id) {
    lines.push(`Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-execution-id ${result.repository_publication_execution_id} --operator-session-file <operator-session-file>`);
  }
  if (hasSiteId && result.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runRepositoryPublicationCloudflareGithubLiveSmoke(config, fetchImpl = fetch) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const requestId = `repository_publication_cloudflare_github_live_${suffix}`;
  const admissionId = `repository_publication_cloudflare_github_admission_live_${suffix}`;
  const executionId = `repository_publication_cloudflare_github_execution_live_${suffix}`;
  const generatedAt = new Date().toISOString();

  const sourcePayload = {
    generated_at: generatedAt,
    operation_id: config.operationId,
    task_id: config.taskId,
    publication_ref: `repository-publication:cloudflare-github-live-smoke:${suffix}`,
    requested_action_ref: `repository-publication-action:cloudflare-github-live-smoke:${suffix}`,
    requested_action_summary: 'execute governed repository publication through Cloudflare GitHub executor',
    repository_ref: config.repositoryRef,
    branch_ref: config.branchRef,
    source_change_ref: `git:commit:${config.commitSha}`,
    governed_request_contract_ref: config.contractRef,
    evidence_return_contract_ref: config.evidenceContractRef,
    rollback_plan_ref: config.rollbackRef ?? `rollback:cloudflare-github-repository-publication-live-smoke:${suffix}`,
    repository_publication_admission: 'pending_windows_publication_admission',
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'not_admitted',
  };

  const queued = await postCarrier(config, {
    operation: 'repository_publication.request.create',
    request_id: `repository_publication_cloudflare_github_request_create_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_id: requestId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(queued.http_status, 200, JSON.stringify(queued.body));
  assert.equal(queued.body.status, 'queued');
  assert.equal(queued.body.repository_publication_request_authority, 'cloudflare_repository_publication_request_queue');
  assert.equal(queued.body.repository_publication_executor_authority, 'windows_repository_publication_executor');
  assert.equal(queued.body.repository_publication_admission, 'pending_windows_publication_admission');
  assert.equal(queued.body.cloudflare_git_push_admission, 'not_admitted');
  assert.equal(queued.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

  const executionBeforeAdmission = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.execute',
    request_id: `repository_publication_cloudflare_github_execution_before_admission_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_id: requestId, repository_publication_execution_id: `${executionId}_before_admission` },
  }, fetchImpl);
  assert.equal(executionBeforeAdmission.http_status, 400, JSON.stringify(executionBeforeAdmission.body));
  assert.equal(executionBeforeAdmission.body.code, 'cloudflare_repository_publication_execution_admission_required');

  const admitted = await postCarrier(config, {
    operation: 'repository_publication.admission.classify',
    request_id: `repository_publication_cloudflare_github_admission_classify_${suffix}`,
    params: {
      site_id: config.siteId,
      repository_publication_admission_id: admissionId,
      repository_publication_request_id: requestId,
      admission_action: 'admit',
      admission_reason: 'cloudflare_github_repository_publication_live_smoke_admitted',
    },
  }, fetchImpl);
  assert.equal(admitted.http_status, 200, JSON.stringify(admitted.body));
  assert.equal(admitted.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
  assert.equal(admitted.body.repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
  assert.equal(admitted.body.cloudflare_git_push_admission, 'not_admitted');
  assert.equal(admitted.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

  const execution = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.execute',
    request_id: `repository_publication_cloudflare_github_execution_execute_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_id: requestId, repository_publication_execution_id: executionId },
  }, fetchImpl);
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
  assert.equal(execution.body.execution.repository_ref, config.repositoryRef);
  assert.equal(execution.body.execution.branch_ref, config.branchRef.replace(/^refs\/heads\//, ''));
  assert.equal(execution.body.execution.source_change_ref, `git:commit:${config.commitSha}`);
  assert.equal(execution.body.execution.cloudflare_repository_publication_admission_id, admissionId);
  assert.equal(execution.body.execution.cloudflare_repository_publication_admission_action, 'admit');
  assert.equal(execution.body.execution.published_commit_ref, execution.body.publication_status === 'completed' ? `git:commit:${config.commitSha}` : '');
  assert.ok(['completed', 'failed'].includes(execution.body.publication_status), JSON.stringify(execution.body));

  const executionList = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.list',
    request_id: `repository_publication_cloudflare_github_execution_list_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_id: requestId, repository_publication_execution_limit: 20 },
  }, fetchImpl);
  assert.equal(executionList.http_status, 200, JSON.stringify(executionList.body));
  const storedExecution = executionList.body.executions.find((entry) => entry.repository_publication_execution_id === executionId);
  assert.ok(storedExecution, JSON.stringify(executionList.body));
  assert.equal(executionList.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
  assert.equal(executionList.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
  assert.equal(executionList.body.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
  assert.equal(storedExecution.repository_publication_request_id, requestId);
  assert.equal(storedExecution.repository_ref, config.repositoryRef);
  assert.equal(storedExecution.branch_ref, config.branchRef.replace(/^refs\/heads\//, ''));
  assert.equal(storedExecution.source_change_ref, `git:commit:${config.commitSha}`);

  const nextAfterExecution = await postCarrier(config, {
    operation: 'repository_publication.request.next',
    request_id: `repository_publication_cloudflare_github_request_next_after_execution_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_limit: 25 },
  }, fetchImpl);
  assert.equal(nextAfterExecution.http_status, 200, JSON.stringify(nextAfterExecution.body));
  if (nextAfterExecution.body.request?.repository_publication_request_id === requestId) {
    throw new Error('cloudflare_github_repository_publication_live_smoke_selected_executed_request');
  }

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `repository_publication_cloudflare_github_operation_read_${suffix}`,
    params: { operation_id: config.operationId, repository_publication_request_limit: 25, repository_publication_execution_limit: 25, limit: 25 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  const operationExecution = operationRead.body.repository_publication_executions.find((entry) => entry.repository_publication_execution_id === executionId);
  assert.ok(operationExecution, JSON.stringify(operationRead.body.repository_publication_executions));
  assert.equal(operationRead.body.repository_publication_operation_posture.executor_authority, 'cloudflare_github_repository_publication_executor');
  assert.equal(operationRead.body.repository_publication_operation_posture.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
  assert.equal(operationRead.body.repository_publication_operation_posture.authority_partition, 'cloudflare_admits_and_executes_github_repository_publication');

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_cloudflare_github_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    repository_publication_request_id: requestId,
    repository_publication_admission_id: admissionId,
    repository_publication_execution_id: executionId,
    repository_ref: config.repositoryRef,
    branch_ref: config.branchRef.replace(/^refs\/heads\//, ''),
    source_change_ref: `git:commit:${config.commitSha}`,
    repository_publication_request_authority: queued.body.repository_publication_request_authority,
    repository_publication_admission_authority: admitted.body.repository_publication_admission_authority,
    repository_publication_executor_authority: execution.body.repository_publication_executor_authority,
    repository_publication_admission: execution.body.repository_publication_admission,
    direct_cloudflare_repository_mutation_admission: execution.body.direct_cloudflare_repository_mutation_admission,
    publication_status: execution.body.publication_status,
    github_http_status: execution.body.execution.github_http_status,
    authority_partition: execution.body.authority_partition,
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

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
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

function normalizeCommitSha(value) {
  return String(value ?? '').trim();
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseRepositoryPublicationCloudflareGithubLiveSmokeArgs(process.argv.slice(2));
  const result = await runRepositoryPublicationCloudflareGithubLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatRepositoryPublicationCloudflareGithubLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
