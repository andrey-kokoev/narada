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
const operationCreateScript = resolve(scriptDir, 'cloudflare-carrier-operation-create.mjs');
const operationStatusPutScript = resolve(scriptDir, 'cloudflare-carrier-operation-status-put.mjs');
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const continuationResumeScript = resolve(scriptDir, 'cloudflare-carrier-continuation-resume.mjs');

export function parseOperationLifecycleWorkflowLiveArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? `operation_live_${now()}`;
  const displayName = option(args, '--display-name') ?? env.CLOUDFLARE_CARRIER_OPERATION_DISPLAY_NAME ?? 'Operation lifecycle live workflow';
  const operationKind = option(args, '--operation-kind') ?? env.CLOUDFLARE_CARRIER_OPERATION_KIND ?? 'operator';
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? 'agent.operator.lifecycle-live';
  const siteRoot = option(args, '--site-root') ?? env.CLOUDFLARE_CARRIER_SITE_ROOT ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? null;
  const continuationReason = option(args, '--continuation-reason') ?? env.CLOUDFLARE_CARRIER_CONTINUATION_REASON ?? 'operation_needs_operator_continuation';
  const closeReason = option(args, '--close-reason') ?? env.CLOUDFLARE_CARRIER_CLOSE_REASON ?? 'operation_closed_after_live_workflow';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-lifecycle')
    || env.CLOUDFLARE_CARRIER_OPERATION_LIFECYCLE_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('operation_lifecycle_workflow_live_requires_--execute-operation-lifecycle_or_CLOUDFLARE_CARRIER_OPERATION_LIFECYCLE_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_lifecycle_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_lifecycle_workflow_live_requires_site_id');
  if (!operationId) throw new Error('operation_lifecycle_workflow_live_requires_operation_id');
  if (!agentId) throw new Error('operation_lifecycle_workflow_live_requires_agent_id');
  if (!auth) throw new Error('operation_lifecycle_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    operationId,
    displayName,
    operationKind,
    agentId,
    siteRoot,
    continuationReason,
    closeReason,
    auth,
    executeAcknowledged,
  };
}

export async function runOperationLifecycleWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const create = parseJsonStdout(await runNodeScript(buildOperationCreateArgs(config), { cwd: packageRoot }), 'operation_create');
  assert.equal(create.schema, 'narada.cloudflare_carrier.operation_create.v1');
  assert.equal(create.status, 'ok');

  const readAfterCreate = parseJsonStdout(await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }), 'operation_read_after_create');
  assert.equal(readAfterCreate.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfterCreate.summary.operation_id, config.operationId);

  const needsContinuation = parseJsonStdout(
    await runNodeScript(buildOperationStatusArgs(config, 'needs_continuation', config.continuationReason), { cwd: packageRoot }),
    'operation_status_put_needs_continuation',
  );
  assert.equal(needsContinuation.schema, 'narada.cloudflare_carrier.operation_status_put.v1');
  assert.equal(needsContinuation.status, 'ok');

  const readAfterNeedsContinuation = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }),
    'operation_read_after_needs_continuation',
  );
  assert.equal(readAfterNeedsContinuation.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfterNeedsContinuation.summary.workflow_next_action, 'resume_operation_continuation');

  const continuationResume = parseJsonStdout(
    await runNodeScript(buildContinuationResumeArgs(config), { cwd: packageRoot }),
    'continuation_resume',
  );
  assert.equal(continuationResume.schema, 'narada.cloudflare_carrier.continuation_resume.v1');
  assert.equal(continuationResume.status, 'ok');

  const readAfterResume = parseJsonStdout(await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }), 'operation_read_after_resume');
  assert.equal(readAfterResume.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfterResume.summary.operation_id, config.operationId);

  const close = parseJsonStdout(
    await runNodeScript(buildOperationStatusArgs(config, 'closed', config.closeReason), { cwd: packageRoot }),
    'operation_status_put_closed',
  );
  assert.equal(close.schema, 'narada.cloudflare_carrier.operation_status_put.v1');
  assert.equal(close.status, 'ok');

  const readAfterClose = parseJsonStdout(await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }), 'operation_read_after_close');
  assert.equal(readAfterClose.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfterClose.summary.operation_id, config.operationId);

  return {
    schema: 'narada.cloudflare_carrier.operation_lifecycle_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    operation_id: config.operationId,
    agent_id: config.agentId,
    carrier_session_id: continuationResume.summary?.carrier_session_id ?? null,
    create_summary: create.summary,
    read_after_create: readAfterCreate.summary,
    needs_continuation_summary: needsContinuation.summary,
    read_after_needs_continuation: readAfterNeedsContinuation.summary,
    continuation_resume_summary: continuationResume.summary,
    read_after_resume: readAfterResume.summary,
    close_summary: close.summary,
    read_after_close: readAfterClose.summary,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, { ...options, timeout: 120000, windowsHide: true });
  return result.stdout;
}

function buildOperationCreateArgs(config) {
  const args = [
    operationCreateScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', config.operationId,
    '--display-name', config.displayName,
    '--operation-kind', config.operationKind,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildOperationReadArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'operation.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', config.operationId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildOperationStatusArgs(config, status, reason) {
  const args = [
    operationStatusPutScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', config.operationId,
    '--status', status,
  ];
  if (reason) args.push('--reason', reason);
  appendAuthOptions(args, config);
  return args;
}

function buildContinuationResumeArgs(config) {
  const args = [
    continuationResumeScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', config.operationId,
    '--agent-id', config.agentId,
    '--reason', config.continuationReason,
  ];
  if (config.siteRoot) args.push('--site-root', config.siteRoot);
  appendAuthOptions(args, config);
  return args;
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

function parseJsonStdout(stdout, label) {
  const text = String(stdout ?? '').trim();
  if (!text) throw new Error(`${label}_stdout_empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}_stdout_invalid_json:${error.message}`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseOperationLifecycleWorkflowLiveArgs(process.argv.slice(2));
  const result = await runOperationLifecycleWorkflowLive(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
