#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada2/process-launch-posture';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const siteNextWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-site-next-workflow-live.mjs');
const postureCoherenceScript = resolve(scriptDir, 'cloudflare-carrier-posture-coherence-live.mjs');
const durabilityCoherenceScript = resolve(scriptDir, 'cloudflare-carrier-durability-coherence-live.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

export function parseControlPlaneConvergenceLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_CONTROL_PLANE_CONVERGENCE_FORMAT ?? 'json';
  const maxSitePasses = parsePositiveInteger(
    option(args, '--max-site-passes') ?? env.CLOUDFLARE_CARRIER_CONTROL_PLANE_MAX_SITE_PASSES ?? '4',
    'max_site_passes',
  );
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-control-plane')
    || env.CLOUDFLARE_CARRIER_CONTROL_PLANE_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('control_plane_convergence_live_requires_--execute-control-plane_or_CLOUDFLARE_CARRIER_CONTROL_PLANE_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('control_plane_convergence_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!auth) throw new Error('control_plane_convergence_live_requires_bearer_token_or_operator_session');
  if (!['json', 'text'].includes(format)) throw new Error(`control_plane_convergence_live_unknown_format:${format}`);

  return { workerUrl, format, maxSitePasses, auth, executeAcknowledged };
}

export async function runControlPlaneConvergenceLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const sitePasses = [];
  let siteList = parseJsonStdout(
    await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
    'control_plane_site_list_initial',
  );
  assert.equal(siteList.schema, 'narada.cloudflare_carrier.product_read.v1');

  for (let attempt = 0; attempt < config.maxSitePasses; attempt += 1) {
    const routeAction = siteList.summary?.route_next_action ?? 'monitor_sites';
    if (routeAction === 'monitor_sites') break;
    if (routeAction !== 'focus_next_site') {
      throw new Error(`control_plane_convergence_live_site_route_unsupported:${routeAction}`);
    }

    const delegatedResult = parseJsonStdout(
      await runNodeScript(buildSiteNextArgs(config), { cwd: packageRoot }),
      `control_plane_site_next:${attempt + 1}`,
    );
    sitePasses.push({
      pass: attempt + 1,
      route_action: routeAction,
      site_id: siteList.summary?.route_target ?? siteList.summary?.next_site_id ?? null,
      delegated_result: delegatedResult,
    });
    siteList = parseJsonStdout(
      await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
      `control_plane_site_list_after:${attempt + 1}`,
    );
    assert.equal(siteList.schema, 'narada.cloudflare_carrier.product_read.v1');
  }

  const finalSiteRoute = siteList.summary?.route_next_action ?? 'unknown';
  if (finalSiteRoute !== 'monitor_sites') {
    throw new Error(`control_plane_convergence_live_site_route_not_converged:${finalSiteRoute}`);
  }

  const postureCoherence = parseJsonStdout(
    await runNodeScript(buildPostureCoherenceArgs(config), { cwd: packageRoot }),
    'control_plane_posture_coherence',
  );
  const durabilityCoherence = parseJsonStdout(
    await runNodeScript(buildDurabilityCoherenceArgs(config), { cwd: packageRoot }),
    'control_plane_durability_coherence',
  );
  assert.equal(postureCoherence.status, 'ok', 'control_plane_convergence_live_posture_coherence_failed');
  assert.equal(durabilityCoherence.status, 'ok', 'control_plane_convergence_live_durability_coherence_failed');

  return {
    schema: 'narada.cloudflare_carrier.control_plane_convergence_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_pass_count: sitePasses.length,
    initial_site_route: sitePasses[0]?.route_action ?? (siteList.summary?.route_next_action ?? 'monitor_sites'),
    final_site_route: finalSiteRoute,
    site_passes: sitePasses,
    final_site_list: siteList.summary,
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

export function formatControlPlaneConvergenceLiveText(result) {
  const workerUrl = result?.worker_url ?? null;
  const initialSiteId = result.site_passes?.[0]?.site_id ?? null;
  const lines = [
    `Control Plane Convergence: ${result.status}`,
    `Worker: ${workerUrl ?? 'unknown'}`,
    `Initial Site Route: ${result.initial_site_route}`,
    `Final Site Route: ${result.final_site_route}`,
    `Site Passes: ${result.site_pass_count}`,
    `Posture Coherence: ${result.posture_coherence?.status ?? 'unknown'} issues=${result.posture_coherence?.issue_count ?? 0}`,
    `Durability Coherence: ${result.durability_coherence?.status ?? 'unknown'} issues=${result.durability_coherence?.issue_count ?? 0}`,
  ];
  if (workerUrl) {
    lines.push(`Site List: pnpm --filter @narada2/cloudflare-carrier product:site:list:text -- --url ${workerUrl} --operator-session-file <operator-session-file>`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl}${formatSiteArgs(result.posture_coherence?.checked_site_ids)} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl}${formatSiteArgs(result.durability_coherence?.checked_site_ids)} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && ((result.site_pass_count ?? 0) > 0 || isActionableSiteRoute(result.initial_site_route)) && initialSiteId) {
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${initialSiteId} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  for (const pass of result.site_passes ?? []) {
    lines.push(
      `- pass=${pass.pass} site=${pass.site_id ?? 'none'} route=${pass.route_action} delegated=${pass.delegated_result?.delegated_workflow ?? 'unknown'}`,
    );
    if (workerUrl && typeof pass.site_id === 'string' && pass.site_id.length > 0) {
      lines.push(`  Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${pass.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
      lines.push(`  Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${pass.site_id} --operator-session-file <operator-session-file>`);
      const operationId = pass.delegated_result?.delegated_operation_id
        ?? pass.delegated_result?.delegated_result?.selected_operation_id
        ?? null;
      if (typeof operationId === 'string' && operationId.length > 0) {
        lines.push(`  Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${pass.site_id} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-next`);
        lines.push(`  Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${pass.site_id} --operation-id ${operationId} --operator-session-file <operator-session-file>`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

function isActionableSiteRoute(routeAction) {
  return routeAction != null && routeAction !== 'monitor_sites';
}

function formatSiteArgs(siteIds = []) {
  if (!Array.isArray(siteIds)) return '';
  return siteIds
    .filter((siteId) => typeof siteId === 'string' && siteId.length > 0)
    .map((siteId) => ` --site ${siteId}`)
    .join('');
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

function buildSiteNextArgs(config) {
  const args = [
    siteNextWorkflowScript,
    '--url', config.workerUrl,
    '--execute-site-next',
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildPostureCoherenceArgs(config) {
  const args = [
    postureCoherenceScript,
    '--url', config.workerUrl,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildDurabilityCoherenceArgs(config) {
  const args = [
    durabilityCoherenceScript,
    '--url', config.workerUrl,
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

async function defaultRunNodeScript(args, options = {}) {
  const { stdout } = await execFileGoverned(process.execPath, args, {
    cwd: options.cwd ?? packageRoot,
    windowsHide: true,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
  });
  return stdout;
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
    throw new Error(`control_plane_convergence_live_invalid_${label}:${value}`);
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

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseControlPlaneConvergenceLiveArgs(process.argv.slice(2), process.env);
  const result = await runControlPlaneConvergenceLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatControlPlaneConvergenceLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
