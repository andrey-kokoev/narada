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
const taskCreateScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-create.mjs');
const taskClaimScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-claim.mjs');
const taskReportScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-report.mjs');
const taskFinishScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-finish.mjs');
const taskReadScript = resolve(scriptDir, 'cloudflare-carrier-task-lifecycle-read.mjs');

export function parseTaskLifecycleWorkflowLiveArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? 'agent.operator.task-lifecycle-workflow-live';
  const title = option(args, '--title') ?? env.CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_TITLE ?? `Cloudflare governed task workflow ${new Date(now()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const description = option(args, '--description') ?? env.CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_DESCRIPTION ?? 'Bounded live workflow proof for Cloudflare task lifecycle progression.';
  const reportSummary = option(args, '--report-summary') ?? env.CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_REPORT_SUMMARY ?? 'Live workflow report from the governed task lifecycle wrapper.';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-task-lifecycle-workflow')
    || env.CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('task_lifecycle_workflow_live_requires_--execute-task-lifecycle-workflow_or_CLOUDFLARE_TASK_LIFECYCLE_WORKFLOW_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('task_lifecycle_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_workflow_live_requires_site_id');
  if (!agentId) throw new Error('task_lifecycle_workflow_live_requires_agent_id');
  if (!title) throw new Error('task_lifecycle_workflow_live_requires_title');
  if (!reportSummary) throw new Error('task_lifecycle_workflow_live_requires_report_summary');
  if (!auth) throw new Error('task_lifecycle_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    agentId,
    title,
    description,
    reportSummary,
    auth,
    executeAcknowledged,
  };
}

export async function runTaskLifecycleWorkflowLive(config, { runNodeScript = defaultRunNodeScript } = {}) {
  const create = parseJsonStdout(await runNodeScript(buildTaskCreateArgs(config), { cwd: packageRoot }), 'task_lifecycle_create');
  assert.equal(create.schema, 'narada.cloudflare_carrier.task_lifecycle_create.v1');
  assert.equal(create.status, 'ok');
  const taskId = create.summary?.task_id ?? null;
  assert.ok(taskId, 'task_lifecycle_workflow_live_requires_created_task_id');

  const claim = parseJsonStdout(await runNodeScript(buildTaskClaimArgs(config, taskId), { cwd: packageRoot }), 'task_lifecycle_claim');
  assert.equal(claim.schema, 'narada.cloudflare_carrier.task_lifecycle_claim.v1');
  assert.equal(claim.status, 'ok');

  const report = parseJsonStdout(await runNodeScript(buildTaskReportArgs(config, taskId), { cwd: packageRoot }), 'task_lifecycle_report');
  assert.equal(report.schema, 'narada.cloudflare_carrier.task_lifecycle_report.v1');
  assert.equal(report.status, 'ok');

  const finish = parseJsonStdout(await runNodeScript(buildTaskFinishArgs(config, taskId), { cwd: packageRoot }), 'task_lifecycle_finish');
  assert.equal(finish.schema, 'narada.cloudflare_carrier.task_lifecycle_finish.v1');
  assert.equal(finish.status, 'ok');

  const readAfterFinish = parseJsonStdout(await runNodeScript(buildTaskReadArgs(config, taskId), { cwd: packageRoot }), 'task_lifecycle_read_after_finish');
  assert.equal(readAfterFinish.schema, 'narada.cloudflare_carrier.task_lifecycle_read.v1');

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    agent_id: config.agentId,
    task_id: taskId,
    create_summary: create.summary,
    claim_summary: claim.summary,
    report_summary: report.summary,
    finish_summary: finish.summary,
    read_after_finish: readAfterFinish.summary,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, { ...options, timeout: 120000, windowsHide: true });
  return result.stdout;
}

function buildTaskCreateArgs(config) {
  const args = [
    taskCreateScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--title', config.title,
    '--description', config.description,
    '--admit-cloudflare-task-create',
    '--cutover-point-ref', 'cutover:task-lifecycle-create:v1',
    '--governed-write-contract-ref', 'contract:task-lifecycle-create:v1',
    '--confirmation-evidence-ref', 'evidence:workflow:task-lifecycle-create',
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildTaskClaimArgs(config, taskId) {
  const args = [
    taskClaimScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--task-id', taskId,
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

function buildTaskReportArgs(config, taskId) {
  const args = [
    taskReportScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--task-id', taskId,
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

function buildTaskFinishArgs(config, taskId) {
  const args = [
    taskFinishScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--task-id', taskId,
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

function buildTaskReadArgs(config, taskId) {
  const args = [
    taskReadScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--task-id', taskId,
  ];
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
  const config = parseTaskLifecycleWorkflowLiveArgs(process.argv.slice(2));
  const result = await runTaskLifecycleWorkflowLive(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
