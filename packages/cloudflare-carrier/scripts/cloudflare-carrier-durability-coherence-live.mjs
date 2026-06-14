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
const operationRecoveryScript = resolve(scriptDir, 'cloudflare-carrier-operation-recovery-read.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

export function parseDurabilityCoherenceLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteIds = options(args, '--site');
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_DURABILITY_COHERENCE_FORMAT ?? 'json';
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  const operatorSessionFile = option(args, '--operator-session-file') ?? env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;
  const auth = resolveAuth(args, env)
    ?? authFromExplicitFiles({ tokenFile, operatorSessionFile });

  if (!workerUrl) throw new Error('durability_coherence_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!auth) throw new Error('durability_coherence_live_requires_bearer_token_or_operator_session');
  if (!['json', 'text'].includes(format)) throw new Error(`durability_coherence_live_unknown_format:${format}`);

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
    if (!session?.cookie) throw new Error('durability_coherence_live_operator_session_file_missing_cookie');
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

export async function runDurabilityCoherenceLive(config, { runNodeScript = defaultRunNodeScript } = {}) {
  const siteList = parseJsonStdout(
    await runNodeScriptWithRetry(runNodeScript, buildProductReadArgs(config, 'site.list'), { cwd: packageRoot }),
    'site_list',
  );
  assert.equal(siteList.schema, 'narada.cloudflare_carrier.product_read.v1');

  const availableSiteIds = Array.isArray(siteList.response?.site_product_statuses)
    ? siteList.response.site_product_statuses.map((site) => site?.site_id).filter(Boolean)
    : [];
  const siteIds = config.siteIds.length > 0 ? config.siteIds : availableSiteIds;
  const issues = [];
  const sites = [];

  for (const siteId of siteIds) {
    const siteRead = parseJsonStdout(
      await runNodeScriptWithRetry(runNodeScript, buildProductReadArgs(config, 'site.read', { siteId }), { cwd: packageRoot }),
      `site_read:${siteId}`,
    );
    assert.equal(siteRead.schema, 'narada.cloudflare_carrier.product_read.v1');

    const operationList = parseJsonStdout(
      await runNodeScriptWithRetry(runNodeScript, buildProductReadArgs(config, 'operation.list', { siteId }), { cwd: packageRoot }),
      `operation_list:${siteId}`,
    );
    assert.equal(operationList.schema, 'narada.cloudflare_carrier.product_read.v1');

    const operationId = selectOperationId(operationList.summary);
    validateSiteDurability(siteId, siteRead.summary, issues);

    let operationReadSummary = null;
    let operationRecoverySummary = null;
    if (operationId) {
      const operationRead = parseJsonStdout(
        await runNodeScriptWithRetry(runNodeScript, buildProductReadArgs(config, 'operation.read', { siteId, operationId }), { cwd: packageRoot }),
        `operation_read:${siteId}:${operationId}`,
      );
      assert.equal(operationRead.schema, 'narada.cloudflare_carrier.product_read.v1');
      operationReadSummary = operationRead.summary;

      const operationRecovery = parseJsonStdout(
        await runNodeScriptWithRetry(runNodeScript, buildOperationRecoveryArgs(config, siteId, operationId), { cwd: packageRoot }),
        `operation_recovery:${siteId}:${operationId}`,
      );
      assert.equal(operationRecovery.schema, 'narada.cloudflare_carrier.operation_recovery_read.v1');
      operationRecoverySummary = operationRecovery.summary;

      validateOperationDurability(siteId, operationId, operationReadSummary, operationRecoverySummary, issues);
    } else if ((operationList.summary?.operation_count ?? 0) > 0) {
      issues.push(issue(siteId, 'operation_selection_missing', {
        operation_count: operationList.summary?.operation_count ?? 0,
      }));
    }

    sites.push({
      site_id: siteId,
      site_read: siteRead.summary,
      operation_list: operationList.summary,
      selected_operation_id: operationId,
      operation_read: operationReadSummary,
      operation_recovery: operationRecoverySummary,
    });
  }

  return {
    schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
    status: issues.length === 0 ? 'ok' : 'failed',
    worker_url: config.workerUrl,
    site_list: siteList.summary,
    checked_site_ids: siteIds,
    sites,
    issues,
  };
}

function validateSiteDurability(siteId, summary = {}, issues) {
  if (summary.persistence_state !== 'durable') {
    issues.push(issue(siteId, 'site_persistence_not_durable', {
      actual: summary.persistence_state ?? null,
      expected: 'durable',
    }));
  }
  if (summary.recovery_state !== 'reconstructable') {
    issues.push(issue(siteId, 'site_recovery_not_reconstructable', {
      actual: summary.recovery_state ?? null,
      expected: 'reconstructable',
    }));
  }
}

function validateOperationDurability(siteId, operationId, operationReadSummary = {}, operationRecoverySummary = {}, issues) {
  if (operationReadSummary.recovery_state !== 'reconstructable') {
    issues.push(issue(siteId, 'operation_read_recovery_not_reconstructable', {
      operation_id: operationId,
      actual: operationReadSummary.recovery_state ?? null,
      expected: 'reconstructable',
    }));
  }
  if ((operationReadSummary.recovery_gap_count ?? 0) !== 0) {
    issues.push(issue(siteId, 'operation_read_recovery_gaps_present', {
      operation_id: operationId,
      actual: operationReadSummary.recovery_gap_count ?? null,
      gap_keys: operationReadSummary.recovery_gap_keys ?? [],
    }));
  }
  if (operationRecoverySummary.recovery_state !== 'reconstructable') {
    issues.push(issue(siteId, 'operation_recovery_not_reconstructable', {
      operation_id: operationId,
      actual: operationRecoverySummary.recovery_state ?? null,
      expected: 'reconstructable',
    }));
  }
  if ((operationRecoverySummary.recovery_gap_count ?? 0) !== 0) {
    issues.push(issue(siteId, 'operation_recovery_gaps_present', {
      operation_id: operationId,
      actual: operationRecoverySummary.recovery_gap_count ?? null,
      gap_keys: operationRecoverySummary.recovery_gap_keys ?? [],
    }));
  }
  if ((operationReadSummary.recovery_state ?? null) !== (operationRecoverySummary.recovery_state ?? null)) {
    issues.push(issue(siteId, 'operation_recovery_state_mismatch', {
      operation_id: operationId,
      operation_read: operationReadSummary.recovery_state ?? null,
      operation_recovery: operationRecoverySummary.recovery_state ?? null,
    }));
  }
  if ((operationReadSummary.recovery_gap_count ?? 0) !== (operationRecoverySummary.recovery_gap_count ?? 0)) {
    issues.push(issue(siteId, 'operation_recovery_gap_count_mismatch', {
      operation_id: operationId,
      operation_read: operationReadSummary.recovery_gap_count ?? null,
      operation_recovery: operationRecoverySummary.recovery_gap_count ?? null,
    }));
  }
}

function issue(siteId, code, details = {}) {
  return { site_id: siteId, code, ...details };
}

function selectOperationId(summary = {}) {
  const routeTarget = summary.route_target ?? null;
  if (routeTarget && routeTarget !== 'none') return routeTarget;
  return summary.next_operation_id ?? null;
}

function buildProductReadArgs(config, operation, { siteId = null, operationId = null } = {}) {
  const args = [productReadScript, '--operation', operation, '--url', config.workerUrl, '--format', 'json'];
  if (siteId) args.push('--site', siteId);
  if (operationId) args.push('--operation-id', operationId);
  appendAuthArgs(args, config);
  return args;
}

function buildOperationRecoveryArgs(config, siteId, operationId) {
  const args = [operationRecoveryScript, '--url', config.workerUrl, '--site', siteId, '--operation-id', operationId, '--format', 'json'];
  appendAuthArgs(args, config);
  return args;
}

function appendAuthArgs(args, config) {
  if (config.tokenFile) args.push('--token-file', config.tokenFile);
  else if (config.operatorSessionFile) args.push('--operator-session-file', config.operatorSessionFile);
  else if (config.auth?.kind === 'bearer') args.push('--token', config.auth.value);
  else if (config.auth?.kind === 'operator_session') args.push('--operator-session-cookie', config.auth.value);
}

async function defaultRunNodeScript(args, options = {}) {
  const { stdout } = await execFile(process.execPath, args, {
    cwd: options.cwd ?? packageRoot,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
    windowsHide: true,
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
    throw new Error(`${label}_json_parse_failed:${error.message}`);
  }
}

export function formatDurabilityCoherenceLiveText(result) {
  const workerUrl = result?.worker_url ?? null;
  const routeSiteId = result?.site_list?.route_target ?? result?.site_list?.next_site_id ?? null;
  const lines = [
    `Durability Coherence: ${result?.status ?? 'unknown'}`,
    `Worker: ${workerUrl ?? 'unknown'}`,
    `Sites Checked: ${result?.checked_site_ids?.length ?? 0}`,
    `Site Route: ${result?.site_list?.route_next_action ?? 'unknown'}`,
  ];
  if (workerUrl && isActionableSiteRoute(result?.site_list?.route_next_action) && routeSiteId) {
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${routeSiteId} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  for (const site of result?.sites ?? []) {
    lines.push(
      `- ${site.site_id}: persistence=${site.site_read?.persistence_state ?? 'unknown'} recovery=${site.site_read?.recovery_state ?? 'unknown'} op=${site.selected_operation_id ?? 'none'} op_recovery=${site.operation_recovery?.recovery_state ?? 'none'} gaps=${site.operation_recovery?.recovery_gap_count ?? 0}`,
    );
    if (workerUrl && typeof site.site_id === 'string' && site.site_id.length > 0) {
      lines.push(`  Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${site.site_id} --operator-session-file <operator-session-file>`);
    }
    if (workerUrl && typeof site.site_id === 'string' && site.site_id.length > 0 && isActionableSiteNextAction(site.site_read?.next_action)) {
      lines.push(`  Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${site.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    }
    if (workerUrl && typeof site.site_id === 'string' && site.site_id.length > 0 && typeof site.selected_operation_id === 'string' && site.selected_operation_id.length > 0) {
      lines.push(`  Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${site.site_id} --operation-id ${site.selected_operation_id} --operator-session-file <operator-session-file>`);
      if (isActionableOperationNextAction(site.operation_read?.workflow_next_action)) {
        lines.push(`  Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${site.site_id} --operation-id ${site.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
      }
      lines.push(`  Recovery Review: pnpm --filter @narada2/cloudflare-carrier product:operation:recovery:text -- --url ${workerUrl} --site ${site.site_id} --operation-id ${site.selected_operation_id} --operator-session-file <operator-session-file>`);
      lines.push(`  Persistence Review: pnpm --filter @narada2/cloudflare-carrier product:operation:persistence:text -- --url ${workerUrl} --site ${site.site_id} --operation-id ${site.selected_operation_id} --operator-session-file <operator-session-file>`);
    }
  }
  if ((result?.issues?.length ?? 0) > 0) {
    lines.push('Issues:');
    for (const current of result.issues) {
      lines.push(`- ${current.site_id}:${current.code}`);
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

function isActionableOperationNextAction(nextAction) {
  return nextAction != null && nextAction !== 'monitor_operation';
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  if (index === args.length - 1) throw new Error(`missing_value_for_${name}`);
  return args[index + 1];
}

function options(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      if (index === args.length - 1) throw new Error(`missing_value_for_${name}`);
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseDurabilityCoherenceLiveArgs(process.argv.slice(2));
    const result = await runDurabilityCoherenceLive(config);
    const output = config.format === 'text'
      ? formatDurabilityCoherenceLiveText(result)
      : `${JSON.stringify(result, null, 2)}\n`;
    process.stdout.write(output);
    if (result.status !== 'ok') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error) }, null, 2) + '\n');
    process.exit(1);
  }
}
