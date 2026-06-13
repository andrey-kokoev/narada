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
const taskReadScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-read.mjs');
const taskClaimScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-claim.mjs');
const taskReportScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-report.mjs');
const taskFinishScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-finish.mjs');

export function parseTaskLifecycleNextWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const taskId = option(args, '--task-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_TASK_ID ?? null;
  const carrierSessionId = option(args, '--carrier-session-id') ?? option(args, '--session-id') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null;
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? 'agent.operator.task-lifecycle-next-live';
  const reportSummary = option(args, '--report-summary') ?? env.CLOUDFLARE_TASK_LIFECYCLE_REPORT_SUMMARY ?? 'Live next-step report from the governed task lifecycle workflow.';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-task-lifecycle-next')
    || env.CLOUDFLARE_TASK_LIFECYCLE_NEXT_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('task_lifecycle_next_workflow_live_requires_--execute-task-lifecycle-next_or_CLOUDFLARE_TASK_LIFECYCLE_NEXT_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('task_lifecycle_next_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_next_workflow_live_requires_site_id');
  if (!taskId && !carrierSessionId && !operationId) throw new Error('task_lifecycle_next_workflow_live_requires_task_id_or_carrier_session_id_or_operation_id');
  if (!agentId) throw new Error('task_lifecycle_next_workflow_live_requires_agent_id');
  if (!auth) throw new Error('task_lifecycle_next_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    operationId,
    taskId,
    carrierSessionId,
    agentId,
    reportSummary,
    auth,
    executeAcknowledged,
  };
}

export async function runTaskLifecycleNextWorkflowLive(config, { runNodeScript = defaultRunNodeScript } = {}) {
  const readBefore = parseJsonStdout(await runNodeScript(buildTaskReadArgs(config), { cwd: packageRoot }), 'task_lifecycle_read_before_next');
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.task_lifecycle_read.v1');
  const summary = readBefore.summary ?? {};
  const resolvedTaskId = summary.task_id ?? config.taskId ?? null;
  if (!resolvedTaskId) throw new Error('task_lifecycle_next_workflow_live_requires_resolved_task_id');
  const step = selectTaskLifecycleStep(summary);

  if (!step) {
    return {
      schema: 'narada.cloudflare_carrier.task_lifecycle_next_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      site_id: config.siteId,
      task_id: resolvedTaskId,
      selected_step: 'monitor_task_lifecycle',
      read_before_next: summary,
      delegated_result: null,
      read_after_next: summary,
    };
  }

  const delegatedResult = parseJsonStdout(await runNodeScript(buildStepArgs({ ...config, taskId: resolvedTaskId }, step), { cwd: packageRoot }), `task_lifecycle_${step}_result`);
  const readAfter = parseJsonStdout(await runNodeScript(buildTaskReadArgs(config), { cwd: packageRoot }), 'task_lifecycle_read_after_next');
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.task_lifecycle_read.v1');

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_next_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    task_id: resolvedTaskId,
    selected_step: step,
    read_before_next: summary,
    delegated_result: delegatedResult,
    read_after_next: readAfter.summary,
  };
}

function selectTaskLifecycleStep(summary = {}) {
  if (summary.finish_id) return null;
  if (summary.report_id) return 'finish';
  const status = normalizeTaskStatus(summary.task_status);
  if (status === 'claimed') return 'report';
  if (status === 'open') return 'claim';
  return null;
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
}

function buildTaskReadArgs(config) {
  const args = [
    taskReadScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
  ];
  if (config.operationId) args.push('--operation-id', config.operationId);
  if (config.taskId) args.push('--task-id', config.taskId);
  if (config.carrierSessionId) args.push('--carrier-session-id', config.carrierSessionId);
  appendAuthOptions(args, config);
  return args;
}

function buildStepArgs(config, step) {
  if (step === 'claim') {
    const args = [
      taskClaimScript,
      '--url', config.workerUrl,
      '--site', config.siteId,
      '--task-id', config.taskId,
      '--claimant-agent', config.agentId,
      '--admit-cloudflare-task-claim',
      '--assignment-authority-ref', 'assignment-authority:task-lifecycle-claim:v1',
      '--cutover-point-ref', 'cutover:task-lifecycle-claim:v1',
      '--governed-write-contract-ref', 'contract:task-lifecycle-claim:v1',
      '--confirmation-evidence-ref', 'evidence:workflow:task-lifecycle-claim',
    ];
    appendAuthOptions(args, config);
    return args;
  }
  if (step === 'report') {
    const args = [
      taskReportScript,
      '--url', config.workerUrl,
      '--site', config.siteId,
      '--task-id', config.taskId,
      '--reporter-agent', config.agentId,
      '--summary', config.reportSummary,
      '--admit-cloudflare-task-report',
      '--report-authority-ref', 'report-authority:task-lifecycle-report:v1',
      '--report-schema-ref', 'schema:work-result-report:v1',
      '--changed-file-evidence-boundary-ref', 'boundary:changed-file-evidence:separate-cutover',
      '--cutover-point-ref', 'cutover:task-lifecycle-report:v1',
      '--governed-write-contract-ref', 'contract:task-lifecycle-report:v1',
      '--confirmation-evidence-ref', 'evidence:workflow:task-lifecycle-report',
    ];
    appendAuthOptions(args, config);
    return args;
  }
  if (step === 'finish') {
    const args = [
      taskFinishScript,
      '--url', config.workerUrl,
      '--site', config.siteId,
      '--task-id', config.taskId,
      '--finalizer-agent', config.agentId,
      '--finish-verdict', 'accepted',
      '--admit-cloudflare-task-finish',
      '--finish-authority-ref', 'finish-authority:task-lifecycle-finish:v1',
      '--finish-schema-ref', 'schema:task-finish-acceptance:v1',
      '--cutover-point-ref', 'cutover:task-lifecycle-finish:v1',
      '--governed-write-contract-ref', 'contract:task-lifecycle-finish:v1',
      '--confirmation-evidence-ref', 'evidence:workflow:task-lifecycle-finish',
    ];
    appendAuthOptions(args, config);
    return args;
  }
  throw new Error(`task_lifecycle_next_workflow_live_step_unsupported:${step}`);
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

function normalizeTaskStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'open' || status === 'opened' || status === 'todo' || status === 'pending') return 'open';
  if (status === 'claimed' || status === 'active' || status === 'needs_continuation') return 'claimed';
  if (status === 'done' || status === 'resolved' || status === 'closed' || status === 'finished') return 'closed';
  return status;
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
  const config = parseTaskLifecycleNextWorkflowLiveArgs(process.argv.slice(2));
  const result = await runTaskLifecycleNextWorkflowLive(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
