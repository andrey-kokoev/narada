#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export async function parseRepositoryPublicationLiveSmokeArgs(
  argv = [],
  env = process.env,
  { loadEnv = true, gitHeadShaImpl = gitHeadSha } = {},
) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const repositoryPath = resolve(option(args, '--repo') ?? repoRoot);
  const repositoryRef = option(args, '--repository-ref') ?? 'github:andrey-kokoev/narada';
  const branchRef = option(args, '--branch') ?? 'cloudflare-publication';
  const sourceChangeRef = option(args, '--source-change-ref') ?? `git:commit:${await gitHeadShaImpl(repositoryPath)}`;
  const allowMissingGithubToken = flag(args, '--allow-missing-github-token');
  const confirmMainPublication = flag(args, '--confirm-main-publication');
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('repository_publication_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('repository_publication_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('repository_publication_live_smoke_requires_site_id');
  if (normalizeBranch(branchRef) === 'main' && !confirmMainPublication) {
    throw new Error('repository_publication_live_smoke_main_branch_requires_--confirm-main-publication');
  }
  if (!/^git:commit:[0-9a-f]{40}$/i.test(sourceChangeRef)) {
    throw new Error(`repository_publication_live_smoke_requires_git_commit_source_change_ref:${sourceChangeRef}`);
  }

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    repositoryRef,
    branchRef,
    sourceChangeRef,
    allowMissingGithubToken,
    taskId: option(args, '--task-id') ?? 'cloudflare-repository-publication-live-smoke',
    contractRef: option(args, '--contract-ref') ?? 'contract:cloudflare-github-repository-publication-request:v1',
    evidenceContractRef: option(args, '--evidence-contract-ref') ?? 'contract:cloudflare-github-repository-publication-execution-evidence:v1',
    rollbackRef: option(args, '--rollback-ref') ?? null,
  };
}

export function formatRepositoryPublicationLiveSmokeText(result) {
  const lines = [
    `Repository Publication Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Request: ${result.repository_publication_request_id}`,
    `Execution: ${result.repository_publication_execution_id ?? 'none'}`,
    `Target: repository=${result.repository_ref} branch=${result.branch_ref}`,
    `Publication Status: ${result.publication_status ?? 'unknown'}`,
    `Authorities: request=${result.repository_publication_request_authority ?? 'unknown'} admission=${result.repository_publication_admission_authority ?? 'unknown'} executor=${result.repository_publication_executor_authority ?? 'unknown'}`,
  ];
  if (result.missing_secret) {
    lines.push(`Missing Secret: ${result.missing_secret}`);
  }
  if (result.next_required_action) {
    lines.push(`Next Required Action: ${result.next_required_action}`);
  }
  lines.push(`Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-request-id ${result.repository_publication_request_id} --operator-session-file <operator-session-file>`);
  if (result.repository_publication_execution_id) {
    lines.push(`Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-execution-id ${result.repository_publication_execution_id} --operator-session-file <operator-session-file>`);
  }
  lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
  return `${lines.join('\n')}\n`;
}

export async function runRepositoryPublicationLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const requestId = `repository_publication_request_live_${suffix}`;
  const executionId = `cloudflare_github_repository_publication_execution_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const sourcePayload = {
    generated_at: generatedAt,
    operation_id: config.operationId,
    task_id: config.taskId,
    publication_ref: `repository-publication:live-smoke:${suffix}`,
    requested_action_ref: `repository-publication-action:live-smoke:${suffix}`,
    requested_action_summary: 'request governed Cloudflare GitHub repository publication execution',
    repository_ref: config.repositoryRef,
    branch_ref: config.branchRef,
    source_change_ref: config.sourceChangeRef,
    governed_request_contract_ref: config.contractRef,
    evidence_return_contract_ref: config.evidenceContractRef,
    rollback_plan_ref: config.rollbackRef ?? `rollback:repository-publication-live-smoke:${suffix}`,
    repository_publication_admission: 'pending_windows_publication_admission',
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'not_admitted',
  };

  const refusedDirectPush = await postCarrier(config, {
    operation: 'repository_publication.request.create',
    request_id: `repository_publication_refused_direct_push_${suffix}`,
    params: {
      site_id: config.siteId,
      repository_publication_request_id: `${requestId}_refused_direct_push`,
      source_payload: { ...sourcePayload, cloudflare_git_push_admission: 'admitted' },
    },
  }, fetchImpl);
  assert.equal(refusedDirectPush.http_status, 400, JSON.stringify(refusedDirectPush.body));
  assert.equal(refusedDirectPush.body.code, 'repository_publication_cloudflare_git_push_admission_invalid');

  const queued = await postCarrier(config, {
    operation: 'repository_publication.request.create',
    request_id: `repository_publication_request_create_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_id: requestId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(queued.http_status, 200, JSON.stringify(queued.body));
  assert.equal(queued.body.status, 'queued');
  assert.equal(queued.body.repository_publication_request_authority, 'cloudflare_repository_publication_request_queue');
  assert.equal(queued.body.repository_publication_admission, 'pending_windows_publication_admission');
  assert.equal(queued.body.cloudflare_git_push_admission, 'not_admitted');
  assert.equal(queued.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

  const selectedBeforeAdmission = await postCarrier(config, {
    operation: 'repository_publication.request.next',
    request_id: `repository_publication_request_next_before_admission_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_limit: 25 },
  }, fetchImpl);
  assert.equal(selectedBeforeAdmission.http_status, 200, JSON.stringify(selectedBeforeAdmission.body));
  if (selectedBeforeAdmission.body.request?.repository_publication_request_id === requestId) {
    throw new Error('repository_publication_live_smoke_selected_unadmitted_request');
  }

  const executionBeforeAdmission = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.execute',
    request_id: `repository_publication_cloudflare_execute_before_admission_${suffix}`,
    params: {
      site_id: config.siteId,
      repository_publication_request_id: requestId,
      repository_publication_execution_id: `${executionId}_before_admission`,
    },
  }, fetchImpl);
  assert.equal(executionBeforeAdmission.http_status, 400, JSON.stringify(executionBeforeAdmission.body));
  assert.equal(executionBeforeAdmission.body.code, 'cloudflare_repository_publication_execution_admission_required');

  const admitted = await postCarrier(config, {
    operation: 'repository_publication.admission.classify',
    request_id: `repository_publication_admission_classify_${suffix}`,
    params: {
      site_id: config.siteId,
      repository_publication_admission_id: `repository_publication_admission_live_${suffix}`,
      repository_publication_request_id: requestId,
      admission_action: 'admit',
      admission_reason: 'cloudflare_repository_publication_live_smoke_admitted',
    },
  }, fetchImpl);
  assert.equal(admitted.http_status, 200, JSON.stringify(admitted.body));
  assert.equal(admitted.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
  assert.equal(admitted.body.repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
  assert.equal(admitted.body.cloudflare_git_push_admission, 'not_admitted');
  assert.equal(admitted.body.direct_cloudflare_repository_mutation_admission, 'not_admitted');

  const executed = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.execute',
    request_id: `repository_publication_cloudflare_execute_${suffix}`,
    params: {
      site_id: config.siteId,
      repository_publication_request_id: requestId,
      repository_publication_execution_id: executionId,
    },
  }, fetchImpl);

  if (executed.http_status === 400 && executed.body.code === 'cloudflare_repository_publication_github_token_missing' && config.allowMissingGithubToken) {
    return {
      schema: 'narada.cloudflare_carrier.repository_publication_live_smoke.v1',
      status: 'blocked_missing_cloudflare_github_token',
      worker_url: config.workerUrl,
      auth_source: config.auth.source,
      site_id: config.siteId,
      operation_id: config.operationId,
      repository_publication_request_id: requestId,
      repository_ref: config.repositoryRef,
      branch_ref: config.branchRef,
      source_change_ref: config.sourceChangeRef,
      repository_publication_request_authority: queued.body.repository_publication_request_authority,
      repository_publication_admission_authority: admitted.body.repository_publication_admission_authority,
      repository_publication_admission: admitted.body.repository_publication_admission,
      cloudflare_git_push_admission: admitted.body.cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission: admitted.body.direct_cloudflare_repository_mutation_admission,
      missing_secret: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN',
      next_required_action: 'set Wrangler secret and rerun without --allow-missing-github-token',
    };
  }

  assert.equal(executed.http_status, 200, JSON.stringify(executed.body));
  assert.equal(executed.body.status, 'execution_recorded');
  assert.equal(executed.body.schema, 'narada.sonar.cloudflare_github_repository_publication_execution.v1');
  assert.equal(executed.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
  assert.equal(executed.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
  assert.equal(executed.body.repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
  assert.equal(executed.body.cloudflare_git_push_admission, 'not_admitted');
  assert.equal(executed.body.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
  assert.equal(executed.body.authority_partition, 'cloudflare_admits_and_executes_github_repository_publication');
  assert.equal(executed.body.execution.repository_publication_execution_id, executionId);
  assert.equal(executed.body.execution.repository_publication_request_id, requestId);
  assert.equal(executed.body.execution.repository_ref, config.repositoryRef);
  assert.equal(normalizeBranch(executed.body.execution.branch_ref), normalizeBranch(config.branchRef));
  assert.equal(executed.body.execution.source_change_ref, config.sourceChangeRef);
  assert.equal(executed.body.execution.publication_status, 'completed', JSON.stringify(executed.body.execution.github_response_summary));
  assert.equal(executed.body.execution.published_commit_ref, config.sourceChangeRef);

  const executionList = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.list',
    request_id: `repository_publication_cloudflare_execution_list_${suffix}`,
    params: { site_id: config.siteId, repository_publication_execution_limit: 20 },
  }, fetchImpl);
  assert.equal(executionList.http_status, 200, JSON.stringify(executionList.body));
  assert.equal(executionList.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
  assert.equal(executionList.body.authority_partition, 'cloudflare_admits_and_executes_github_repository_publication');
  const listedExecution = executionList.body.executions.find((entry) => entry.repository_publication_execution_id === executionId);
  assert.ok(listedExecution, JSON.stringify(executionList.body));
  assert.equal(listedExecution.publication_status, 'completed');
  assert.equal(listedExecution.direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');

  const selectedAfterExecution = await postCarrier(config, {
    operation: 'repository_publication.request.next',
    request_id: `repository_publication_request_next_after_execution_${suffix}`,
    params: { site_id: config.siteId, repository_publication_request_limit: 25 },
  }, fetchImpl);
  assert.equal(selectedAfterExecution.http_status, 200, JSON.stringify(selectedAfterExecution.body));
  if (selectedAfterExecution.body.request?.repository_publication_request_id === requestId) {
    throw new Error('repository_publication_live_smoke_selected_executed_request');
  }

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    repository_publication_request_id: requestId,
    repository_publication_execution_id: executionId,
    repository_ref: config.repositoryRef,
    branch_ref: config.branchRef,
    source_change_ref: config.sourceChangeRef,
    repository_publication_request_authority: queued.body.repository_publication_request_authority,
    repository_publication_admission_authority: admitted.body.repository_publication_admission_authority,
    repository_publication_executor_authority: executed.body.repository_publication_executor_authority,
    repository_publication_admission: admitted.body.repository_publication_admission,
    cloudflare_git_push_admission: executed.body.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: executed.body.direct_cloudflare_repository_mutation_admission,
    publication_status: executed.body.execution.publication_status,
    github_http_status: executed.body.execution.github_http_status,
    published_commit_ref: executed.body.execution.published_commit_ref,
    authority_partition: executed.body.authority_partition,
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

async function gitHeadSha(cwd) {
  const result = await execFile('git', ['rev-parse', 'HEAD'], { cwd, timeout: 30000, windowsHide: true });
  return result.stdout.trim();
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
  const bearerToken = option(args, '--token') ?? (tokenFile ? readTokenFile(tokenFile) : env.CLOUDFLARE_CARRIER_TOKEN ?? '');
  const trimmed = String(bearerToken ?? '').trim();
  return trimmed ? { kind: 'bearer', value: trimmed, source: option(args, '--token') ? 'flag:--token' : (tokenFile ? 'flag:--token-file_or_env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'env:CLOUDFLARE_CARRIER_TOKEN') } : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, targetEnv = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!targetEnv[key]) targetEnv[key] = value;
  }
}

function normalizeBranch(value) {
  return String(value ?? '').trim().replace(/^refs\/heads\//, '');
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = await parseRepositoryPublicationLiveSmokeArgs(process.argv.slice(2));
  const result = await runRepositoryPublicationLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatRepositoryPublicationLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
