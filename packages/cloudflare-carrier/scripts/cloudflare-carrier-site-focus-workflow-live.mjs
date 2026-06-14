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
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

export function parseSiteFocusWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_SITE_FOCUS_FORMAT ?? 'json';
  const expectedSiteId = option(args, '--focused-site-id') ?? option(args, '--site-id') ?? env.CLOUDFLARE_CARRIER_FOCUSED_SITE_ID ?? null;
  const expectedRouteAction = option(args, '--expected-route-action') ?? env.CLOUDFLARE_CARRIER_SITE_FOCUS_EXPECTED_ROUTE_ACTION ?? 'focus_next_site';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-site-focus')
    || env.CLOUDFLARE_CARRIER_SITE_FOCUS_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('site_focus_workflow_live_requires_--execute-site-focus_or_CLOUDFLARE_CARRIER_SITE_FOCUS_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('site_focus_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`site_focus_workflow_live_unknown_format:${format}`);
  if (!auth) throw new Error('site_focus_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    expectedSiteId,
    expectedRouteAction,
    auth,
    executeAcknowledged,
  };
}

export function formatSiteFocusWorkflowLiveText(result) {
  const lines = [
    `Site Focus Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Selected Site: ${result.selected_site_id}`,
    `Expected Route: ${result.expected_route_action ?? 'unknown'}`,
    `Site Action: ${result.selected_site_action ?? 'unknown'}`,
    `Selected Operation: ${result.selected_operation_id ?? 'none'} action=${result.selected_operation_action ?? 'unknown'} reason=${result.selected_operation_reason ?? 'unknown'}`,
  ];
  if (result.selected_operation_focus_ref) {
    lines.push(`Operation Focus: kind=${result.selected_operation_focus_kind ?? 'unknown'} ref=${result.selected_operation_focus_ref}`);
  }
  lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operator-session-file <operator-session-file>`);
  lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  lines.push(`Site Action Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:action:workflow:live:text -- --url ${result.worker_url} --site ${result.selected_site_id}${result.selected_operation_id ? ` --operation-id ${result.selected_operation_id}` : ''} --operator-session-file <operator-session-file> --execute-site-action`);
  if (result.selected_operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
    if (result.selected_operation_action === 'refresh_site_continuity_loop') {
      lines.push(`Continuity Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operation-id ${result.selected_operation_id} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`);
    }
    if (result.selected_operation_action === 'review_site_continuity_reconciliation_execution' && result.selected_operation_focus_ref) {
      lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operation-id ${result.selected_operation_id} --focus-kind ${result.selected_operation_focus_kind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${result.selected_operation_focus_ref} --operator-session-file <operator-session-file>`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runSiteFocusWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const listBefore = parseJsonStdout(
    await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
    'site_list_before_focus',
  );
  assert.equal(listBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const selectedSiteId = listBefore.summary.next_site_id ?? listBefore.summary.route_target ?? null;
  const selectedSiteAction = listBefore.summary.next_action ?? null;
  const selectedOperationId = listBefore.summary.next_operation_id ?? null;
  const selectedOperationAction = listBefore.summary.next_operation_next_action ?? null;
  const selectedOperationReason = listBefore.summary.next_operation_reason ?? null;
  const selectedOperationFocusKind = listBefore.summary.next_operation_focus_kind ?? null;
  const selectedOperationFocusRef = listBefore.summary.next_operation_focus_ref ?? null;
  assert.ok(selectedSiteId, 'site_focus_workflow_live_requires_next_site');
  if (config.expectedSiteId) {
    assert.equal(
      selectedSiteId,
      config.expectedSiteId,
      `site_focus_workflow_live_expected_site_mismatch:${config.expectedSiteId}:${selectedSiteId}`,
    );
  }
  assert.equal(
    listBefore.summary.route_next_action,
    config.expectedRouteAction,
    `site_focus_workflow_live_expected_route_action_mismatch:${config.expectedRouteAction}:${listBefore.summary.route_next_action ?? 'null'}`,
  );

  const readFocused = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config, selectedSiteId), { cwd: packageRoot }),
    'site_read_focused',
  );
  assert.equal(readFocused.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readFocused.summary.site_id, selectedSiteId);

  return {
    schema: 'narada.cloudflare_carrier.site_focus_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    selected_site_id: selectedSiteId,
    selected_site_action: selectedSiteAction,
    selected_operation_id: selectedOperationId,
    selected_operation_action: selectedOperationAction,
    selected_operation_reason: selectedOperationReason,
    selected_operation_focus_kind: selectedOperationFocusKind,
    selected_operation_focus_ref: selectedOperationFocusRef,
    expected_site_id: config.expectedSiteId,
    expected_route_action: config.expectedRouteAction,
    list_before_focus: listBefore.summary,
    read_focused: readFocused.summary,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 120000,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
    windowsHide: true,
  });
  return result.stdout;
}

function buildSiteListArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'site.list',
    '--url', config.workerUrl,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildSiteReadArgs(config, siteId) {
  const args = [
    productReadScript,
    '--operation', 'site.read',
    '--url', config.workerUrl,
    '--site', siteId,
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
  const config = parseSiteFocusWorkflowLiveArgs(process.argv.slice(2));
  const result = await runSiteFocusWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatSiteFocusWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
