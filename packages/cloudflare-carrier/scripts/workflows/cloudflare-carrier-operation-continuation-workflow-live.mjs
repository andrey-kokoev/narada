#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada2/process-launch-posture';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '../..');
const productReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-product-read.mjs');
const continuationResumeScript = resolve(scriptDir, '../commands/cloudflare-carrier-continuation-resume.mjs');
const DEFAULT_OPERATION_CONTINUATION_AGENT_ID = 'narada.cloudflare.operation.continuation.live';

export function parseOperationContinuationWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_CONTINUATION_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
  const expectedOperationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? DEFAULT_OPERATION_CONTINUATION_AGENT_ID;
  const siteRoot = option(args, '--site-root') ?? env.CLOUDFLARE_CARRIER_SITE_ROOT ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? null;
  const continuationReason = option(args, '--continuation-reason') ?? env.CLOUDFLARE_CARRIER_CONTINUATION_REASON ?? 'operation_continuation_resumed_by_operator';
  const expectedPreAction = option(args, '--expected-pre-action') ?? env.CLOUDFLARE_CARRIER_OPERATION_CONTINUATION_EXPECTED_PRE_ACTION ?? 'resume_operation_continuation';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-continuation-resume')
    || env.CLOUDFLARE_CARRIER_OPERATION_CONTINUATION_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('operation_continuation_workflow_live_requires_--execute-operation-continuation-resume_or_CLOUDFLARE_CARRIER_OPERATION_CONTINUATION_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_continuation_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`operation_continuation_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('operation_continuation_workflow_live_requires_site_id');
  if (!auth) throw new Error('operation_continuation_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    siteId,
    expectedOperationId,
    agentId,
    siteRoot,
    continuationReason,
    expectedPreAction,
    auth,
    executeAcknowledged,
  };
}

export async function runOperationContinuationWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const listBefore = parseJsonStdout(
    await runNodeScript(buildOperationListArgs(config), { cwd: packageRoot }),
    'operation_list_before_resume',
  );
  assert.equal(listBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const selectedOperationId = listBefore.summary.next_continuation_operation_id ?? null;
  assert.ok(selectedOperationId, 'operation_continuation_workflow_live_requires_next_continuation_operation');
  if (config.expectedOperationId) {
    assert.equal(
      selectedOperationId,
      config.expectedOperationId,
      `operation_continuation_workflow_live_expected_operation_mismatch:${config.expectedOperationId}:${selectedOperationId}`,
    );
  }

  const readBefore = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
    'operation_read_before_resume',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readBefore.summary.operation_id, selectedOperationId);
  assert.equal(
    readBefore.summary.workflow_next_action,
    config.expectedPreAction,
    `operation_continuation_workflow_live_expected_pre_action_mismatch:${config.expectedPreAction}:${readBefore.summary.workflow_next_action ?? 'null'}`,
  );

  const continuationResume = parseJsonStdout(
    await runNodeScript(buildContinuationResumeArgs(config, selectedOperationId), { cwd: packageRoot }),
    'continuation_resume',
  );
  assert.equal(continuationResume.schema, 'narada.cloudflare_carrier.continuation_resume.v1');
  assert.equal(continuationResume.status, 'ok');

  const readAfter = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
    'operation_read_after_resume',
  );
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfter.summary.operation_id, selectedOperationId);
  assert.notEqual(
    readAfter.summary.workflow_next_action,
    config.expectedPreAction,
    `operation_continuation_workflow_live_post_action_still_${config.expectedPreAction}`,
  );

  const listAfter = parseJsonStdout(
    await runNodeScript(buildOperationListArgs(config), { cwd: packageRoot }),
    'operation_list_after_resume',
  );
  assert.equal(listAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.notEqual(
    listAfter.summary.next_continuation_operation_id,
    selectedOperationId,
    `operation_continuation_workflow_live_selected_operation_still_queued:${selectedOperationId}`,
  );

  return {
    schema: 'narada.cloudflare_carrier.operation_continuation_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    selected_operation_id: selectedOperationId,
    expected_operation_id: config.expectedOperationId,
    pre_workflow_next_action: readBefore.summary.workflow_next_action ?? null,
    list_before_resume: listBefore.summary,
    read_before_resume: readBefore.summary,
    continuation_resume_summary: continuationResume.summary ?? null,
    read_after_resume: readAfter.summary,
    list_after_resume: listAfter.summary,
  };
}

export function formatOperationContinuationWorkflowLiveText(result) {
  const hasWorkerUrl = typeof result.worker_url === 'string' && result.worker_url.length > 0;
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const hasSelectedOperationId = typeof result.selected_operation_id === 'string' && result.selected_operation_id.length > 0;
  const lines = [
    `Operation Continuation Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Selected Operation: ${result.selected_operation_id}`,
    `Pre Action: ${result.pre_workflow_next_action ?? 'unknown'}`,
    `Queue Before: needs_continuation=${result.list_before_resume?.needs_continuation_count ?? 'unknown'} next=${result.list_before_resume?.next_continuation_operation_id ?? 'none'}`,
    `Resume: session=${result.continuation_resume_summary?.carrier_session_id ?? 'none'} next=${result.read_after_resume?.workflow_next_action ?? 'unknown'}`,
    `Queue After: needs_continuation=${result.list_after_resume?.needs_continuation_count ?? 'unknown'} next=${result.list_after_resume?.next_continuation_operation_id ?? 'none'}`,
  ];
  if (hasWorkerUrl && hasSiteId && hasSelectedOperationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (hasWorkerUrl && hasSiteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  const resumeWorkflow = buildPostResumeWorkflowCommand(result);
  if (resumeWorkflow) {
    lines.push(`Resume Workflow: ${resumeWorkflow}`);
  }
  const carrierSessionId = result.continuation_resume_summary?.carrier_session_id ?? null;
  if (hasWorkerUrl && hasSiteId && hasSelectedOperationId && carrierSessionId) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${carrierSessionId} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  return `${lines.join('\n')}\n`;
}

function buildPostResumeWorkflowCommand(result) {
  if (!(typeof result.worker_url === 'string' && result.worker_url.length > 0)) {
    return null;
  }
  const nextAction = result.read_after_resume?.workflow_next_action ?? null;
  if (nextAction === 'start_or_select_session') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:session:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-session`;
  }
  if (nextAction === 'refresh_site_continuity_loop') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`;
  }
  return null;
}

async function defaultRunNodeScript(args, options) {
  const result = await execFileGoverned(process.execPath, args, { ...options, timeout: 120000, windowsHide: true });
  return result.stdout;
}

function buildOperationListArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'operation.list',
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--continuation',
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildOperationReadArgs(config, operationId) {
  const args = [
    productReadScript,
    '--operation', 'operation.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildContinuationResumeArgs(config, operationId) {
  const args = [
    continuationResumeScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
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
  const config = parseOperationContinuationWorkflowLiveArgs(process.argv.slice(2));
  const result = await runOperationContinuationWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatOperationContinuationWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
