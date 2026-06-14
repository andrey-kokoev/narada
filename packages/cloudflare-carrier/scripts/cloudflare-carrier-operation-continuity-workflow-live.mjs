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
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const continuitySchedulerScript = resolve(scriptDir, 'cloudflare-site-continuity-scheduler.mjs');
const CHILD_STDIO_MAX_BUFFER = 16 * 1024 * 1024;

export function parseOperationContinuityWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_CONTINUITY_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? '';
  const expectedPreAction = option(args, '--expected-pre-action') ?? env.CLOUDFLARE_CARRIER_OPERATION_CONTINUITY_EXPECTED_PRE_ACTION ?? 'refresh_site_continuity_loop';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-continuity')
    || env.CLOUDFLARE_CARRIER_OPERATION_CONTINUITY_EXECUTE_LIVE === '1';
  const supportedPreActions = new Set([
    'refresh_site_continuity_loop',
    'review_continuity_packet',
    'review_continuity_loop_report',
  ]);

  if (!executeAcknowledged) {
    throw new Error('operation_continuity_workflow_live_requires_--execute-operation-continuity_or_CLOUDFLARE_CARRIER_OPERATION_CONTINUITY_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_continuity_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`operation_continuity_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('operation_continuity_workflow_live_requires_site_id');
  if (!operationId) throw new Error('operation_continuity_workflow_live_requires_operation_id');
  if (!auth) throw new Error('operation_continuity_workflow_live_requires_bearer_token_or_operator_session');
  if (!supportedPreActions.has(expectedPreAction)) {
    throw new Error(`operation_continuity_workflow_live_expected_pre_action_unsupported:${expectedPreAction}`);
  }

  return {
    workerUrl,
    format,
    siteId,
    operationId,
    expectedPreAction,
    auth,
    executeAcknowledged,
  };
}

export async function runOperationContinuityWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const readBefore = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }),
    'operation_read_before_continuity',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readBefore.summary.operation_id, config.operationId);
  assert.equal(
    readBefore.summary.workflow_next_action,
    config.expectedPreAction,
    `operation_continuity_workflow_live_expected_pre_action_mismatch:${config.expectedPreAction}:${readBefore.summary.workflow_next_action ?? 'null'}`,
  );

  const continuityExecution = parseJsonStdout(
    await runNodeScript(buildContinuityRunOnceArgs(config), { cwd: packageRoot }),
    'continuity_reconcile_execute',
  );
  assert.equal(continuityExecution.schema, 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1');
  assert.ok(['completed', 'dry_run'].includes(continuityExecution.status));

  const readAfter = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }),
    'operation_read_after_continuity',
  );
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfter.summary.operation_id, config.operationId);
  assert.notEqual(
    readAfter.summary.workflow_next_action,
    config.expectedPreAction,
    `operation_continuity_workflow_live_post_action_still_${config.expectedPreAction}`,
  );

  const siteReadAfter = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config), { cwd: packageRoot }),
    'site_read_after_continuity',
  );
  assert.equal(siteReadAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(siteReadAfter.summary.site_id, config.siteId);

  return {
    schema: 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    operation_id: config.operationId,
    pre_workflow_next_action: readBefore.summary.workflow_next_action ?? null,
    continuity_execution_status: continuityExecution.status,
    continuity_execution_summary: continuityExecution.summary ?? null,
    continuity_health: continuityExecution.continuity_health ?? continuityExecution.scheduled_health_snapshot?.continuity_health ?? null,
    cloudflare_product_posture: continuityExecution.scheduled_health_snapshot?.cloudflare_product_posture ?? null,
    cloudflare_operation_posture: continuityExecution.scheduled_health_snapshot?.cloudflare_operation_posture ?? null,
    read_before_continuity: readBefore.summary,
    read_after_continuity: readAfter.summary,
    site_read_after_continuity: siteReadAfter.summary,
  };
}

export function formatOperationContinuityWorkflowLiveText(result) {
  const hasWorkerUrl = typeof result.worker_url === 'string' && result.worker_url.length > 0;
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const hasOperationId = typeof result.operation_id === 'string' && result.operation_id.length > 0;
  const lines = [
    `Operation Continuity Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Pre Action: ${result.pre_workflow_next_action ?? 'unknown'}`,
    `Continuity Execution: status=${result.continuity_execution_status ?? 'unknown'} completed=${result.continuity_execution_summary?.completed_site_count ?? 'unknown'} refused=${result.continuity_execution_summary?.refused_site_count ?? 'unknown'}`,
    `Continuity Health: status=${result.continuity_health?.status ?? 'unknown'}`,
    `Post Operation Action: ${result.read_after_continuity?.workflow_next_action ?? 'unknown'}`,
    `Post Site Action: ${result.site_read_after_continuity?.next_action ?? 'unknown'}`,
  ];
  if (hasWorkerUrl && hasSiteId && hasOperationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (hasWorkerUrl && hasSiteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  const postActionWorkflow = buildPostContinuityWorkflowCommand(result);
  if (postActionWorkflow) {
    lines.push(`${postActionWorkflow.label}: ${postActionWorkflow.command}`);
  }
  return `${lines.join('\n')}\n`;
}

function buildPostContinuityWorkflowCommand(result) {
  if (!hasConcreteSiteAndOperation(result)) {
    return null;
  }
  const nextAction = result.read_after_continuity?.workflow_next_action ?? null;
  const focusKind = result.read_after_continuity?.workflow_focus_kind ?? null;
  const focusRef = result.read_after_continuity?.workflow_focus_ref ?? null;
  if (nextAction === 'review_site_continuity_reconciliation_execution' && focusRef) {
    return {
      label: 'Review Ack',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --focus-kind ${focusKind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${focusRef} --operator-session-file <operator-session-file>`,
    };
  }
  return null;
}

function hasConcreteSiteAndOperation(result) {
  return typeof result.worker_url === 'string'
    && result.worker_url.length > 0
    && typeof result.site_id === 'string'
    && result.site_id.length > 0
    && typeof result.operation_id === 'string'
    && result.operation_id.length > 0;
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 120000,
    windowsHide: true,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
  });
  return result.stdout;
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

function buildSiteReadArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'site.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildContinuityRunOnceArgs(config) {
  const args = [
    continuitySchedulerScript,
    '--action', 'reconcile-execute',
    '--live',
    '--refresh-site-registry-projection',
    '--site', config.siteId,
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
  const config = parseOperationContinuityWorkflowLiveArgs(process.argv.slice(2));
  const result = await runOperationContinuityWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatOperationContinuityWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
