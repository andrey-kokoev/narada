#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

export function parsePostureCoherenceLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteIds = options(args, '--site');
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_POSTURE_COHERENCE_FORMAT ?? 'json';
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  const operatorSessionFile = option(args, '--operator-session-file') ?? env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;
  const auth = resolveAuth(args, env)
    ?? authFromExplicitFiles({ tokenFile, operatorSessionFile });

  if (!workerUrl) throw new Error('posture_coherence_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!auth) throw new Error('posture_coherence_live_requires_bearer_token_or_operator_session');
  if (!['json', 'text'].includes(format)) throw new Error(`posture_coherence_live_unknown_format:${format}`);

  return { workerUrl, siteIds, format, auth, tokenFile, operatorSessionFile };
}

function authFromExplicitFiles({ tokenFile = null, operatorSessionFile = null } = {}) {
  if (tokenFile) {
    return {
      kind: 'bearer',
      value: readFileSync(tokenFile, 'utf8').trim(),
      source: 'token-file',
    };
  }
  if (operatorSessionFile) {
    const session = JSON.parse(readFileSync(operatorSessionFile, 'utf8'));
    if (!session?.cookie) throw new Error('posture_coherence_live_operator_session_file_missing_cookie');
    return {
      kind: 'operator_session',
      value: normalizeOperatorSessionCookie(session.cookie),
      source: 'operator-session-file',
    };
  }
  return null;
}

function normalizeOperatorSessionCookie(cookie) {
  return String(cookie).replace(/^narada_operator_session=/, '').trim();
}

export async function runPostureCoherenceLive(config, { runNodeScript = defaultRunNodeScript } = {}) {
  const siteList = parseJsonStdout(
    await runNodeScriptWithRetry(runNodeScript, buildSiteListArgs(config), { cwd: packageRoot }),
    'site_list',
  );
  assert.equal(siteList.schema, 'narada.cloudflare_carrier.product_read.v1');

  const issues = [];
  validateSiteListSummary(siteList.summary, issues);

  const availableSiteIds = Array.isArray(siteList.response?.site_product_statuses)
    ? siteList.response.site_product_statuses.map((site) => site?.site_id).filter(Boolean)
    : [];
  const siteIds = config.siteIds.length > 0 ? config.siteIds : availableSiteIds;
  const sites = [];

  for (const siteId of siteIds) {
    const siteRead = parseJsonStdout(
      await runNodeScriptWithRetry(runNodeScript, buildSiteReadArgs(config, siteId), { cwd: packageRoot }),
      `site_read:${siteId}`,
    );
    assert.equal(siteRead.schema, 'narada.cloudflare_carrier.product_read.v1');

    const operationList = parseJsonStdout(
      await runNodeScriptWithRetry(runNodeScript, buildOperationListArgs(config, siteId), { cwd: packageRoot }),
      `operation_list:${siteId}`,
    );
    assert.equal(operationList.schema, 'narada.cloudflare_carrier.product_read.v1');

    validateSiteReadSummary(siteRead.summary, issues);
    validateOperationListSummary(siteId, operationList.summary, operationList.response, issues);

    sites.push({
      site_id: siteId,
      site_read: siteRead.summary,
      operation_list: operationList.summary,
    });
  }

  return {
    schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
    status: issues.length === 0 ? 'ok' : 'failed',
    worker_url: config.workerUrl,
    site_list: siteList.summary,
    checked_site_ids: siteIds,
    sites,
    issues,
  };
}

function validateSiteListSummary(summary = {}, issues) {
  const routeAction = summary.route_next_action ?? null;
  if (routeAction === 'monitor_sites') {
    if (summary.next_action !== 'monitor_sites') {
      issues.push(issue('site.list', 'site_list_next_action_mismatch', {
        expected: 'monitor_sites',
        actual: summary.next_action ?? null,
      }));
    }
    if (summary.next_site_id != null) {
      issues.push(issue('site.list', 'site_list_next_site_id_should_be_null', {
        actual: summary.next_site_id,
      }));
    }
    if ((summary.health_counts?.attention ?? 0) !== 0 || (summary.health_counts?.incomplete ?? 0) !== 0) {
      issues.push(issue('site.list', 'site_list_health_counts_attention_nonzero', {
        attention: summary.health_counts?.attention ?? 0,
        incomplete: summary.health_counts?.incomplete ?? 0,
      }));
    }
  } else if (routeAction === 'focus_next_site') {
    if (summary.next_action === 'monitor_sites') {
      issues.push(issue('site.list', 'site_list_focus_route_hidden_by_monitor_summary', {
        route_target: summary.route_target ?? null,
      }));
    }
    if ((summary.route_target ?? null) !== (summary.next_site_id ?? null)) {
      issues.push(issue('site.list', 'site_list_focus_target_mismatch', {
        route_target: summary.route_target ?? null,
        next_site_id: summary.next_site_id ?? null,
      }));
    }
  }
}

function validateSiteReadSummary(summary = {}, issues) {
  if ((summary.health ?? null) === 'ready' && (summary.next_action ?? null) !== 'monitor_site') {
    issues.push(issue(`site.read:${summary.site_id ?? 'unknown'}`, 'site_read_ready_next_action_mismatch', {
      expected: 'monitor_site',
      actual: summary.next_action ?? null,
    }));
  }
}

function validateOperationListSummary(siteId, summary = {}, response = {}, issues) {
  const routeAction = summary.route_next_action ?? null;
  const focusedOperationId = response.focused_operation_lifecycle?.operation_id ?? null;
  const focusedWorkflowAction = response.focused_operation_lifecycle?.workflow_route?.next_action ?? null;
  if (focusedOperationId && focusedOperationId !== (summary.next_operation_id ?? null)) {
    issues.push(issue(`operation.list:${siteId}`, 'operation_list_focused_operation_mismatch', {
      next_operation_id: summary.next_operation_id ?? null,
      focused_operation_id: focusedOperationId,
    }));
  }
  if (routeAction === 'monitor_operations') {
    const focusedWorkflowWithoutRefocus = focusedWorkflowAction && focusedWorkflowAction !== 'monitor_operation';
    const expectedNextAction = focusedWorkflowWithoutRefocus ? focusedWorkflowAction : 'monitor_operations';
    if (summary.next_action !== expectedNextAction) {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_next_action_mismatch', {
        expected: expectedNextAction,
        actual: summary.next_action ?? null,
      }));
    }
    if (!focusedWorkflowWithoutRefocus && (summary.health_counts?.needs_attention ?? 0) !== 0) {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_needs_attention_count_nonzero', {
        actual: summary.health_counts?.needs_attention ?? 0,
      }));
    }
    if (focusedWorkflowWithoutRefocus && (summary.health_counts?.needs_attention ?? 0) === 0) {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_focused_attention_hidden_in_health_counts', {
        actual: summary.health_counts?.needs_attention ?? 0,
      }));
    }
    if (focusedWorkflowWithoutRefocus && summary.next_status === 'ready') {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_focused_attention_hidden_in_next_status', {
        actual: summary.next_status ?? null,
      }));
    }
    if (!focusedWorkflowWithoutRefocus && focusedWorkflowAction !== 'monitor_operation') {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_focused_workflow_not_monitoring', {
        actual: focusedWorkflowAction,
      }));
    }
  } else if (routeAction === 'focus_next_operation') {
    if (summary.next_action !== 'use_focused_operation') {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_focus_route_hidden_by_summary', {
        actual: summary.next_action ?? null,
      }));
    }
    if ((summary.route_target ?? null) !== (summary.next_operation_id ?? null)) {
      issues.push(issue(`operation.list:${siteId}`, 'operation_list_focus_target_mismatch', {
        route_target: summary.route_target ?? null,
        next_operation_id: summary.next_operation_id ?? null,
      }));
    }
  }
}

function issue(scope, code, details = {}) {
  return { scope, code, details };
}

function buildSiteListArgs(config) {
  return [
    productReadScript,
    '--operation', 'site.list',
    '--url', config.workerUrl,
    ...buildAuthArgs(config),
  ];
}

function buildSiteReadArgs(config, siteId) {
  return [
    productReadScript,
    '--operation', 'site.read',
    '--url', config.workerUrl,
    '--site', siteId,
    ...buildAuthArgs(config),
  ];
}

function buildOperationListArgs(config, siteId) {
  return [
    productReadScript,
    '--operation', 'operation.list',
    '--url', config.workerUrl,
    '--site', siteId,
    ...buildAuthArgs(config),
  ];
}

function buildAuthArgs(config) {
  const auth = config?.auth;
  if (!auth) return [];
  if (auth.kind === 'bearer') {
    if ((auth.source === 'token-file' || auth.source === 'env:CLOUDFLARE_CARRIER_TOKEN_FILE') && config?.tokenFile) {
      return ['--token-file', config.tokenFile];
    }
    return ['--token', auth.value];
  }
  if (auth.kind === 'operator_session') {
    if ((auth.source === 'operator-session-file' || auth.source === 'env:CLOUDFLARE_OPERATOR_SESSION_FILE') && config?.operatorSessionFile) {
      return ['--operator-session-file', config.operatorSessionFile];
    }
    return ['--operator-session-cookie', `narada_operator_session=${auth.value}`];
  }
  return [];
}

async function defaultRunNodeScript(args, options = {}) {
  const { stdout } = await execFile(process.execPath, args, {
    cwd: options.cwd ?? packageRoot,
    windowsHide: true,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
  });
  return stdout;
}

async function runNodeScriptWithRetry(runNodeScript, args, options = {}) {
  try {
    return await runNodeScript(args, options);
  } catch (error) {
    if (!isTransientChildReadError(error)) throw error;
    return await runNodeScript(args, options);
  }
}

function isTransientChildReadError(error) {
  const message = String(error?.message ?? error ?? '');
  const stderr = String(error?.stderr ?? '');
  return message.includes('fetch failed') || stderr.includes('"code": "fetch failed"');
}

function parseJsonStdout(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label}_invalid_json:${error.message}`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (value == null || value.startsWith('--')) throw new Error(`missing_value_for_${name}`);
  args.splice(index, 2);
  return value;
}

function options(args, name) {
  const values = [];
  while (true) {
    const value = option(args, name);
    if (value == null) break;
    values.push(value);
  }
  return values;
}

export function formatPostureCoherenceLiveText(result) {
  const workerUrl = result?.worker_url ?? null;
  const routeSiteId = result.site_list?.route_target ?? result.site_list?.next_site_id ?? null;
  const lines = [
    'Posture Coherence',
    `Worker: ${workerUrl ?? 'unknown'}`,
    `Status: ${result.status}`,
    `Sites Checked: ${result.checked_site_ids.length}`,
    `Site Route: ${result.site_list.route_next_action ?? 'unknown'}`,
    `Operation Count Summary: ${result.sites.map((site) => `${site.site_id}:${site.operation_list.operation_count ?? 0}`).join(', ') || 'none'}`,
  ];
  if (workerUrl && isActionableSiteRoute(result.site_list?.route_next_action) && routeSiteId) {
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${routeSiteId} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  for (const site of result.sites ?? []) {
    lines.push(`- ${site.site_id}: health=${site.site_read?.health ?? 'unknown'} next=${site.site_read?.next_action ?? 'none'} operations=${site.operation_list?.operation_count ?? 0}`);
    if (workerUrl && typeof site.site_id === 'string' && site.site_id.length > 0) {
      lines.push(`  Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${site.site_id} --operator-session-file <operator-session-file>`);
    }
    if (workerUrl && typeof site.site_id === 'string' && site.site_id.length > 0 && isActionableSiteNextAction(site.site_read?.next_action)) {
      lines.push(`  Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${site.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    }
    if (workerUrl && typeof site.site_id === 'string' && site.site_id.length > 0 && typeof site.operation_list?.next_operation_id === 'string' && site.operation_list.next_operation_id.length > 0) {
      lines.push(`  Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${site.site_id} --operation-id ${site.operation_list.next_operation_id} --operator-session-file <operator-session-file>`);
      if (isActionableOperationListSummary(site.operation_list)) {
        lines.push(`  Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${site.site_id} --operation-id ${site.operation_list.next_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
      }
    }
  }
  if (result.issues.length > 0) {
    lines.push('Issues:');
    for (const entry of result.issues) {
      lines.push(`- ${entry.scope} ${entry.code} ${JSON.stringify(entry.details)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function isActionableSiteRoute(routeAction) {
  return routeAction != null && routeAction !== 'monitor_sites';
}

function isActionableSiteNextAction(nextAction) {
  return nextAction != null && nextAction !== 'monitor_site';
}

function isActionableOperationListSummary(summary = {}) {
  const routeAction = summary?.route_next_action ?? null;
  const nextAction = summary?.next_action ?? null;
  return routeAction === 'focus_next_operation'
    || (nextAction != null && nextAction !== 'monitor_operations');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const config = parsePostureCoherenceLiveArgs(process.argv.slice(2), process.env);
  const result = await runPostureCoherenceLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatPostureCoherenceLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  if (result.status !== 'ok') process.exitCode = 1;
}
