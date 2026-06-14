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
const operationNextWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-next-workflow-live.mjs');
const postureCoherenceScript = resolve(scriptDir, 'cloudflare-carrier-posture-coherence-live.mjs');
const durabilityCoherenceScript = resolve(scriptDir, 'cloudflare-carrier-durability-coherence-live.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

export function parseOperationConvergenceLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteIds = options(args, '--site');
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_CONVERGENCE_FORMAT ?? 'json';
  const maxOperationPasses = parsePositiveInteger(
    option(args, '--max-operation-passes') ?? env.CLOUDFLARE_CARRIER_OPERATION_CONVERGENCE_MAX_PASSES ?? '6',
    'max_operation_passes',
  );
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-convergence')
    || env.CLOUDFLARE_CARRIER_OPERATION_CONVERGENCE_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('operation_convergence_live_requires_--execute-operation-convergence_or_CLOUDFLARE_CARRIER_OPERATION_CONVERGENCE_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_convergence_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!auth) throw new Error('operation_convergence_live_requires_bearer_token_or_operator_session');
  if (!['json', 'text'].includes(format)) throw new Error(`operation_convergence_live_unknown_format:${format}`);

  return { workerUrl, siteIds, format, maxOperationPasses, auth, executeAcknowledged };
}

export async function runOperationConvergenceLive(
  config,
  { runNodeScript = defaultRunNodeScript, sleep = defaultSleep } = {},
) {
  const siteList = parseJsonStdout(
    await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
    'operation_convergence_site_list',
  );
  assert.equal(siteList.schema, 'narada.cloudflare_carrier.product_read.v1');

  const availableSiteIds = Array.isArray(siteList.response?.site_product_statuses)
    ? siteList.response.site_product_statuses.map((site) => site?.site_id).filter(Boolean)
    : [];
  const siteIds = config.siteIds.length > 0 ? config.siteIds : availableSiteIds;
  const siteResults = [];

  for (const siteId of siteIds) {
    const result = await convergeSiteOperations(siteId, config, runNodeScript, sleep);
    siteResults.push(result);
  }

  const postureCoherence = parseJsonStdout(
    await runNodeScript(buildPostureCoherenceArgs(config, siteIds), { cwd: packageRoot }),
    'operation_convergence_posture_coherence',
  );
  const durabilityCoherence = parseJsonStdout(
    await runNodeScript(buildDurabilityCoherenceArgs(config, siteIds), { cwd: packageRoot }),
    'operation_convergence_durability_coherence',
  );
  assert.equal(postureCoherence.status, 'ok', 'operation_convergence_live_posture_coherence_failed');
  assert.equal(durabilityCoherence.status, 'ok', 'operation_convergence_live_durability_coherence_failed');

  return {
    schema: 'narada.cloudflare_carrier.operation_convergence_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    checked_site_ids: siteIds,
    site_results: siteResults,
    posture_coherence: {
      status: postureCoherence.status,
      checked_site_ids: postureCoherence.checked_site_ids ?? [],
      issue_count: postureCoherence.issues?.length ?? 0,
    },
    durability_coherence: {
      status: durabilityCoherence.status,
      checked_site_ids: durabilityCoherence.checked_site_ids ?? [],
      issue_count: durabilityCoherence.issues?.length ?? 0,
    },
  };
}

async function convergeSiteOperations(siteId, config, runNodeScript, sleep) {
  const passes = [];
  let delayedMonitorFollowupUsed = false;
  let operationList = parseJsonStdout(
    await runNodeScript(buildOperationListArgs(config, siteId), { cwd: packageRoot }),
    `operation_convergence_operation_list_initial:${siteId}`,
  );
  assert.equal(operationList.schema, 'narada.cloudflare_carrier.product_read.v1');

  for (let attempt = 0; attempt < config.maxOperationPasses;) {
    const routeAction = operationList.summary?.route_next_action ?? 'monitor_operations';
    if (routeAction === 'monitor_operations') {
      const focusedOperationId = operationList.summary?.next_operation_id ?? operationList.summary?.route_target ?? null;
      if (!focusedOperationId) break;
      const focusedRead = parseJsonStdout(
        await runNodeScript(buildOperationReadArgs(config, siteId, focusedOperationId), { cwd: packageRoot }),
        `operation_convergence_operation_read_monitor_followup:${siteId}:${focusedOperationId}`,
      );
      assert.equal(focusedRead.schema, 'narada.cloudflare_carrier.product_read.v1');
      if ((focusedRead.summary?.workflow_next_action ?? 'monitor_operation') === 'monitor_operation') break;
      if (delayedMonitorFollowupUsed) {
        operationList = {
          ...operationList,
          summary: {
            ...(operationList.summary ?? {}),
            route_next_action: 'focus_next_operation',
            next_operation_id: focusedOperationId,
            route_target: focusedOperationId,
          },
        };
        delayedMonitorFollowupUsed = false;
        continue;
      }
      delayedMonitorFollowupUsed = true;
      await sleep(20_000);
      operationList = parseJsonStdout(
        await runNodeScript(buildOperationListArgs(config, siteId), { cwd: packageRoot }),
        `operation_convergence_operation_list_delayed_followup:${siteId}:${attempt + 1}`,
      );
      assert.equal(operationList.schema, 'narada.cloudflare_carrier.product_read.v1');
      continue;
    }
    if (routeAction !== 'focus_next_operation') {
      throw new Error(`operation_convergence_live_route_unsupported:${siteId}:${routeAction}`);
    }
    delayedMonitorFollowupUsed = false;
    const nextResult = parseJsonStdout(
      await runNodeScript(buildOperationNextArgs(config, siteId), { cwd: packageRoot }),
      `operation_convergence_next:${siteId}:${attempt + 1}`,
    );
    passes.push({
      pass: attempt + 1,
      route_action: routeAction,
      operation_id: operationList.summary?.route_target ?? operationList.summary?.next_operation_id ?? null,
      delegated_workflow: nextResult.delegated_workflow ?? null,
      delegated_route_action: nextResult.delegated_route_action ?? null,
      read_after_next: nextResult.read_after_next ?? null,
    });
    attempt += 1;
    operationList = parseJsonStdout(
      await runNodeScript(buildOperationListArgs(config, siteId), { cwd: packageRoot }),
      `operation_convergence_operation_list_after:${siteId}:${attempt}`,
    );
    assert.equal(operationList.schema, 'narada.cloudflare_carrier.product_read.v1');
  }

  const finalRoute = operationList.summary?.route_next_action ?? 'unknown';
  if (finalRoute !== 'monitor_operations') {
    throw new Error(`operation_convergence_live_not_converged:${siteId}:${finalRoute}`);
  }

  const focusedOperationId = operationList.summary?.next_operation_id ?? operationList.summary?.route_target ?? null;
  let focusedRead = null;
  if (focusedOperationId) {
    focusedRead = parseJsonStdout(
      await runNodeScript(buildOperationReadArgs(config, siteId, focusedOperationId), { cwd: packageRoot }),
      `operation_convergence_operation_read_final:${siteId}:${focusedOperationId}`,
    );
    assert.equal(focusedRead.schema, 'narada.cloudflare_carrier.product_read.v1');
    assert.equal(
      focusedRead.summary?.workflow_next_action ?? 'monitor_operation',
      'monitor_operation',
      `operation_convergence_live_focused_operation_not_monitoring:${siteId}:${focusedOperationId}:${focusedRead.summary?.workflow_next_action ?? 'missing'}`,
    );
  }

  return {
    site_id: siteId,
    initial_route: passes[0]?.route_action ?? (operationList.summary?.route_next_action ?? 'monitor_operations'),
    final_route: finalRoute,
    pass_count: passes.length,
    passes,
    final_operation_list: operationList.summary,
    focused_operation_id: focusedOperationId,
    focused_operation_read: focusedRead?.summary ?? null,
  };
}

export function formatOperationConvergenceLiveText(result) {
  const lines = [
    `Operation Convergence: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Sites Checked: ${result.checked_site_ids.length}`,
    `Posture Coherence: ${result.posture_coherence?.status ?? 'unknown'} issues=${result.posture_coherence?.issue_count ?? 0}`,
    `Durability Coherence: ${result.durability_coherence?.status ?? 'unknown'} issues=${result.durability_coherence?.issue_count ?? 0}`,
    `Site List: pnpm --filter @narada2/cloudflare-carrier product:site:list:text -- --url ${result.worker_url} --operator-session-file <operator-session-file>`,
  ];
  for (const site of result.site_results ?? []) {
    lines.push(
      `- site=${site.site_id} initial=${site.initial_route} final=${site.final_route} passes=${site.pass_count} focused=${site.focused_operation_id ?? 'none'}`,
    );
    lines.push(`  Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${site.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`  Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${site.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`  Operation List: pnpm --filter @narada2/cloudflare-carrier product:operation:list:text -- --url ${result.worker_url} --site ${site.site_id} --operator-session-file <operator-session-file>`);
    if ((site.pass_count ?? 0) > 0 || isActionableOperationRoute(site.initial_route)) {
      lines.push(`  Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${site.site_id}${site.focused_operation_id ? ` --operation-id ${site.focused_operation_id}` : ''} --operator-session-file <operator-session-file> --execute-operation-next`);
    }
    if (site.focused_operation_id) {
      lines.push(`  Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${site.site_id} --operation-id ${site.focused_operation_id} --operator-session-file <operator-session-file>`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function isActionableOperationRoute(routeAction) {
  return routeAction != null && routeAction !== 'monitor_operations';
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

function buildOperationListArgs(config, siteId) {
  const args = [
    productReadScript,
    '--operation', 'operation.list',
    '--url', config.workerUrl,
    '--site', siteId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildOperationReadArgs(config, siteId, operationId) {
  const args = [
    productReadScript,
    '--operation', 'operation.read',
    '--url', config.workerUrl,
    '--site', siteId,
    '--operation-id', operationId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildOperationNextArgs(config, siteId) {
  const args = [
    operationNextWorkflowScript,
    '--url', config.workerUrl,
    '--site', siteId,
    '--execute-operation-next',
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildPostureCoherenceArgs(config, siteIds) {
  const args = [
    postureCoherenceScript,
    '--url', config.workerUrl,
  ];
  for (const siteId of siteIds) args.push('--site', siteId);
  appendAuthOptions(args, config);
  return args;
}

function buildDurabilityCoherenceArgs(config, siteIds) {
  const args = [
    durabilityCoherenceScript,
    '--url', config.workerUrl,
  ];
  for (const siteId of siteIds) args.push('--site', siteId);
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

async function defaultRunNodeScript(args, options = {}) {
  const { stdout } = await execFile(process.execPath, args, {
    cwd: options.cwd ?? packageRoot,
    windowsHide: true,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
  });
  return stdout;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`operation_convergence_live_invalid_${label}:${value}`);
  }
  return parsed;
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

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseOperationConvergenceLiveArgs(process.argv.slice(2), process.env);
  const result = await runOperationConvergenceLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatOperationConvergenceLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
