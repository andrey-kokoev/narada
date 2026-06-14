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

export function parseOperationFocusWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_FOCUS_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
  const expectedOperationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const expectedRouteAction = option(args, '--expected-route-action') ?? env.CLOUDFLARE_CARRIER_OPERATION_FOCUS_EXPECTED_ROUTE_ACTION ?? 'focus_next_operation';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-focus')
    || env.CLOUDFLARE_CARRIER_OPERATION_FOCUS_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('operation_focus_workflow_live_requires_--execute-operation-focus_or_CLOUDFLARE_CARRIER_OPERATION_FOCUS_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_focus_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`operation_focus_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('operation_focus_workflow_live_requires_site_id');
  if (!auth) throw new Error('operation_focus_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    siteId,
    expectedOperationId,
    expectedRouteAction,
    auth,
    executeAcknowledged,
  };
}

export async function runOperationFocusWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const listBefore = parseJsonStdout(
    await runNodeScript(buildOperationListArgs(config), { cwd: packageRoot }),
    'operation_list_before_focus',
  );
  assert.equal(listBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const selectedOperationId = listBefore.summary.next_operation_id ?? null;
  assert.ok(selectedOperationId, 'operation_focus_workflow_live_requires_next_operation');
  if (config.expectedOperationId) {
    assert.equal(
      selectedOperationId,
      config.expectedOperationId,
      `operation_focus_workflow_live_expected_operation_mismatch:${config.expectedOperationId}:${selectedOperationId}`,
    );
  }
  assert.equal(
    listBefore.summary.route_next_action,
    config.expectedRouteAction,
    `operation_focus_workflow_live_expected_route_action_mismatch:${config.expectedRouteAction}:${listBefore.summary.route_next_action ?? 'null'}`,
  );

  const readFocused = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
    'operation_read_focused',
  );
  assert.equal(readFocused.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readFocused.summary.operation_id, selectedOperationId);
  assert.equal(
    readFocused.summary.current_status,
    listBefore.summary.next_operation_status,
    `operation_focus_workflow_live_status_mismatch:${listBefore.summary.next_operation_status ?? 'null'}:${readFocused.summary.current_status ?? 'null'}`,
  );

  return {
    schema: 'narada.cloudflare_carrier.operation_focus_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    selected_operation_id: selectedOperationId,
    expected_operation_id: config.expectedOperationId,
    expected_route_action: config.expectedRouteAction,
    list_before_focus: listBefore.summary,
    read_focused: readFocused.summary,
  };
}

export function formatOperationFocusWorkflowLiveText(result) {
  const hasWorkerUrl = typeof result.worker_url === 'string' && result.worker_url.length > 0;
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const hasSelectedOperationId = typeof result.selected_operation_id === 'string' && result.selected_operation_id.length > 0;
  const lines = [
    `Operation Focus Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Selected Operation: ${result.selected_operation_id}`,
    `Expected Route: ${result.expected_route_action ?? 'unknown'}`,
    `List Route: ${result.list_before_focus?.route_next_action ?? 'unknown'} target=${result.list_before_focus?.route_target ?? 'none'} reason=${result.list_before_focus?.route_reason ?? 'unknown'}`,
    `Focused Read: status=${result.read_focused?.current_status ?? 'unknown'} next=${result.read_focused?.workflow_next_action ?? 'unknown'}`,
  ];
  if (hasWorkerUrl && hasSiteId) {
    lines.push(`Operation List: pnpm --filter @narada2/cloudflare-carrier product:operation:list:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  if (hasWorkerUrl && hasSiteId && hasSelectedOperationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  const focusedWorkflow = buildFocusedWorkflowCommand(result);
  if (focusedWorkflow) {
    lines.push(`Focused Workflow: ${focusedWorkflow}`);
  }
  return `${lines.join('\n')}\n`;
}

function buildFocusedWorkflowCommand(result) {
  if (!hasConcreteSiteAndSelectedOperation(result)) {
    return null;
  }
  const nextAction = result.read_focused?.workflow_next_action ?? null;
  if (nextAction === 'start_or_select_session') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:session:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-session`;
  }
  if (nextAction === 'resume_operation_continuation') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-continuation-resume`;
  }
  if (nextAction === 'refresh_site_continuity_loop') {
    return `pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`;
  }
  return null;
}

function hasConcreteSiteAndSelectedOperation(result) {
  return typeof result.worker_url === 'string'
    && result.worker_url.length > 0
    && typeof result.site_id === 'string'
    && result.site_id.length > 0
    && typeof result.selected_operation_id === 'string'
    && result.selected_operation_id.length > 0;
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, { ...options, timeout: 120000, windowsHide: true });
  return result.stdout;
}

function buildOperationListArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'operation.list',
    '--url', config.workerUrl,
    '--site', config.siteId,
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
  const config = parseOperationFocusWorkflowLiveArgs(process.argv.slice(2));
  const result = await runOperationFocusWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatOperationFocusWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
