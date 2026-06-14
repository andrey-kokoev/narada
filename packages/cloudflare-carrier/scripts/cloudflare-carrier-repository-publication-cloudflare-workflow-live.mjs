#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolveAuth } from './cloudflare-carrier-product-read.mjs';

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const cloudflareExecutionScript = resolve(scriptDir, 'cloudflare-carrier-repository-publication-cloudflare-github-live-smoke.mjs');
const readbackScript = resolve(scriptDir, 'cloudflare-carrier-repository-publication-readback-live-smoke.mjs');

export function parseRepositoryPublicationCloudflareWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_CLOUDFLARE_WORKFLOW_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const repositoryRef = option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? '';
  const branchRef = option(args, '--branch') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? '';
  const commitSha = option(args, '--commit') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_COMMIT_SHA ?? '';
  const taskId = option(args, '--task-id') ?? null;
  const contractRef = option(args, '--contract-ref') ?? null;
  const evidenceContractRef = option(args, '--evidence-contract-ref') ?? null;
  const rollbackRef = option(args, '--rollback-ref') ?? null;
  const auth = resolveAuth(args, env);
  const readbackLimit = parsePositiveInteger(
    option(args, '--readback-limit') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READBACK_LIMIT ?? '50',
    'readback-limit',
  );
  const allowMissingGithubToken = flag(args, '--allow-missing-github-token');
  const executeAcknowledged = flag(args, '--execute-cloudflare-github')
    || env.CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('repository_publication_cloudflare_workflow_live_requires_--execute-cloudflare-github_or_CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('repository_publication_cloudflare_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_cloudflare_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('repository_publication_cloudflare_workflow_live_requires_site_id');
  if (!repositoryRef) {
    throw new Error('repository_publication_cloudflare_workflow_live_requires_--repository-ref_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF');
  }
  if (!branchRef) {
    throw new Error('repository_publication_cloudflare_workflow_live_requires_--branch_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH');
  }
  if (!commitSha) {
    throw new Error('repository_publication_cloudflare_workflow_live_requires_40_hex_--commit_or_CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_COMMIT_SHA');
  }
  if (!auth) {
    throw new Error('repository_publication_cloudflare_workflow_live_requires_bearer_token_or_operator_session');
  }

  return {
    workerUrl,
    format,
    siteId,
    operationId,
    repositoryRef,
    branchRef,
    commitSha,
    taskId,
    contractRef,
    evidenceContractRef,
    rollbackRef,
    auth,
    readbackLimit,
    allowMissingGithubToken,
    executeAcknowledged,
  };
}

export function formatRepositoryPublicationCloudflareWorkflowLiveText(result) {
  const lines = [
    `Repository Publication Cloudflare Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Request: ${result.repository_publication_request_id ?? 'none'}`,
    `Admission: ${result.repository_publication_admission_id ?? 'none'}`,
    `Execution: ${result.repository_publication_execution_id ?? 'none'}`,
    `Publication Status: ${result.publication_status ?? 'unknown'}`,
  ];
  if (result.repository_ref || result.branch_ref) {
    lines.push(`Target: repository=${result.repository_ref ?? 'unknown'} branch=${result.branch_ref ?? 'unknown'}`);
  }
  if (result.next_required_action) {
    lines.push(`Next Required Action: ${result.next_required_action}`);
  }
  if (result.repository_publication_request_id) {
    lines.push(`Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-request-id ${result.repository_publication_request_id} --operator-session-file <operator-session-file>`);
  }
  if (result.repository_publication_execution_id) {
    lines.push(`Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-execution-id ${result.repository_publication_execution_id} --operator-session-file <operator-session-file>`);
  }
  if (result.repository_publication_admission_id) {
    lines.push(`Admission Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:admission:list:text -- --url ${result.worker_url} --site ${result.site_id} --repository-publication-admission-id ${result.repository_publication_admission_id} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runRepositoryPublicationCloudflareWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const executionArgs = [
    cloudflareExecutionScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation', config.operationId,
    '--repository-ref', config.repositoryRef,
    '--branch', config.branchRef,
    '--commit', config.commitSha,
    '--execute-cloudflare-github',
  ];
  appendOption(executionArgs, '--task-id', config.taskId);
  appendOption(executionArgs, '--contract-ref', config.contractRef);
  appendOption(executionArgs, '--evidence-contract-ref', config.evidenceContractRef);
  appendOption(executionArgs, '--rollback-ref', config.rollbackRef);
  appendAuthOptions(executionArgs, config);
  if (config.allowMissingGithubToken) executionArgs.push('--allow-missing-github-token');

  const execution = parseJsonStdout(
    await runNodeScript(executionArgs, { cwd: packageRoot }),
    'repository_publication_cloudflare_github_live_smoke',
  );
  assert.equal(execution.schema, 'narada.cloudflare_carrier.repository_publication_cloudflare_github_live_smoke.v1');
  if (execution.status !== 'ok') {
    return {
      schema: 'narada.cloudflare_carrier.repository_publication_cloudflare_workflow_live.v1',
      status: execution.status,
      worker_url: execution.worker_url ?? config.workerUrl,
      site_id: execution.site_id ?? config.siteId,
      operation_id: execution.operation_id ?? config.operationId,
      repository_publication_request_id: execution.repository_publication_request_id ?? null,
      repository_publication_admission_id: execution.repository_publication_admission_id ?? null,
      repository_publication_execution_id: execution.repository_publication_execution_id ?? null,
      publication_status: execution.publication_status ?? null,
      next_required_action: execution.next_required_action ?? null,
      execution_summary: execution,
      readback_summary: null,
    };
  }

  const readbackArgs = [
    readbackScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--lane', 'cloudflare',
    '--repository-publication-request-id', execution.repository_publication_request_id,
    '--repository-publication-admission-id', execution.repository_publication_admission_id,
    '--repository-publication-execution-id', execution.repository_publication_execution_id,
    '--operation-id', execution.operation_id ?? config.operationId,
    '--limit', String(config.readbackLimit),
  ];
  appendAuthOptions(readbackArgs, config);

  const readback = parseJsonStdout(
    await runNodeScript(readbackArgs, { cwd: packageRoot }),
    'repository_publication_readback_live_smoke',
  );
  assert.equal(readback.schema, 'narada.cloudflare_carrier.repository_publication_readback_live_smoke.v1');
  assert.equal(readback.status, 'ok');

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_cloudflare_workflow_live.v1',
    status: 'ok',
    worker_url: execution.worker_url ?? config.workerUrl,
    site_id: execution.site_id ?? config.siteId,
    operation_id: execution.operation_id ?? config.operationId,
    repository_publication_request_id: execution.repository_publication_request_id,
    repository_publication_admission_id: execution.repository_publication_admission_id,
    repository_publication_execution_id: execution.repository_publication_execution_id,
    repository_ref: execution.repository_ref ?? config.repositoryRef,
    branch_ref: execution.branch_ref ?? config.branchRef,
    source_change_ref: execution.source_change_ref ?? `git:commit:${config.commitSha}`,
    publication_status: execution.publication_status ?? null,
    repository_publication_request_authority: execution.repository_publication_request_authority ?? null,
    repository_publication_admission_authority: execution.repository_publication_admission_authority ?? null,
    repository_publication_executor_authority: execution.repository_publication_executor_authority ?? null,
    direct_cloudflare_repository_mutation_admission: execution.direct_cloudflare_repository_mutation_admission ?? null,
    readback_verified: true,
    execution_summary: execution,
    readback_summary: readback,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, { ...options, timeout: 120000, windowsHide: true });
  return result.stdout;
}

function parseJsonStdout(stdout, label) {
  const text = String(stdout ?? '').trim();
  if (!text) throw new Error(`${label}_stdout_empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}_stdout_invalid_json:${error.message}`);
  }
}

function appendAuthOptions(args, config) {
  if (config.auth?.kind === 'bearer') {
    args.push('--token', config.auth.value);
    return;
  }
  if (config.auth?.kind === 'operator_session') {
    args.push('--operator-session-cookie', config.auth.value);
  }
}

function appendOption(args, name, value) {
  if (value) args.push(name, value);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

function parsePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`repository_publication_cloudflare_workflow_live_${fieldName}_invalid:${value}`);
  }
  return parsed;
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseRepositoryPublicationCloudflareWorkflowLiveArgs(process.argv.slice(2));
  const result = await runRepositoryPublicationCloudflareWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatRepositoryPublicationCloudflareWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
