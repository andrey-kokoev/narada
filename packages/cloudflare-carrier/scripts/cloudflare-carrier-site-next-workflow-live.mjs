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
const siteFocusWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-site-focus-workflow-live.mjs');
const siteActionWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-site-action-workflow-live.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;
const SITE_LIST_STALE_RECHECK_DELAY_MS = 20_000;

export function parseSiteNextWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_SITE_NEXT_FORMAT ?? 'json';
  const expectedRouteAction = option(args, '--expected-route-action') ?? env.CLOUDFLARE_CARRIER_SITE_NEXT_EXPECTED_ROUTE_ACTION ?? null;
  const expectedSiteId = option(args, '--focused-site-id') ?? option(args, '--site-id') ?? env.CLOUDFLARE_CARRIER_FOCUSED_SITE_ID ?? null;
  const expectedSiteAction = option(args, '--expected-action') ?? env.CLOUDFLARE_CARRIER_SITE_NEXT_EXPECTED_ACTION ?? null;
  const localSiteRef = option(args, '--local-site-ref') ?? env.CLOUDFLARE_CARRIER_LOCAL_SITE_REF ?? null;
  const cloudflareSiteRef = option(args, '--cloudflare-site-ref') ?? env.CLOUDFLARE_CARRIER_CLOUDFLARE_SITE_REF ?? null;
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-site-next')
    || env.CLOUDFLARE_CARRIER_SITE_NEXT_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('site_next_workflow_live_requires_--execute-site-next_or_CLOUDFLARE_CARRIER_SITE_NEXT_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('site_next_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`site_next_workflow_live_unknown_format:${format}`);
  if (!auth) throw new Error('site_next_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    expectedRouteAction,
    expectedSiteId,
    expectedSiteAction,
    localSiteRef,
    cloudflareSiteRef,
    auth,
    executeAcknowledged,
  };
}

export function formatSiteNextWorkflowLiveText(result) {
  const lines = [
    `Site Next Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Delegated Route: ${result.delegated_route_action ?? 'unknown'}`,
    `Selected Site: ${result.selected_site_id ?? 'none'}`,
    `Delegated Workflow: ${result.delegated_workflow ?? 'unknown'}`,
    `Site Action: ${result.delegated_site_action ?? 'unknown'}`,
    `Operation: ${result.delegated_operation_id ?? 'none'} action=${result.delegated_operation_action ?? 'unknown'} reason=${result.delegated_operation_reason ?? 'unknown'}`,
  ];
  if (result.delegated_operation_focus_ref) {
    lines.push(`Operation Focus: kind=${result.delegated_operation_focus_kind ?? 'unknown'} ref=${result.delegated_operation_focus_ref}`);
  }
  lines.push(`Site List: pnpm --filter @narada2/cloudflare-carrier product:site:list:text -- --url ${result.worker_url} --operator-session-file <operator-session-file>`);
  if (result.selected_site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operator-session-file <operator-session-file>`);
  }
  if (result.delegated_operation_id && result.selected_site_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.selected_site_id} --operation-id ${result.delegated_operation_id} --operator-session-file <operator-session-file>`);
  }
  const postRoute = result.list_after_next?.route_next_action ?? null;
  if (postRoute) {
    lines.push(`Post Route: ${postRoute} next=${result.list_after_next?.next_action ?? 'unknown'}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runSiteNextWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript, wait = defaultWait } = {},
) {
  const listBefore = parseJsonStdout(
    await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
    'site_list_before_next_workflow',
  );
  assert.equal(listBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const routeAction = listBefore.summary.route_next_action ?? 'monitor_sites';
  if (config.expectedRouteAction) {
    assert.equal(
      routeAction,
      config.expectedRouteAction,
      `site_next_workflow_live_expected_route_action_mismatch:${config.expectedRouteAction}:${routeAction}`,
    );
  }

  const overviewSiteId = listBefore.summary.next_site_id ?? listBefore.summary.route_target ?? null;
  const overviewAction = listBefore.summary.next_action ?? 'monitor_sites';
  const overviewOperationId = listBefore.summary.next_operation_id ?? null;
  const overviewOperationAction = listBefore.summary.next_operation_next_action ?? null;
  const overviewOperationReason = listBefore.summary.next_operation_reason ?? null;
  const overviewOperationFocusKind = listBefore.summary.next_operation_focus_kind ?? null;
  const overviewOperationFocusRef = listBefore.summary.next_operation_focus_ref ?? null;

  if (routeAction === 'monitor_sites') {
    if (overviewSiteId && overviewAction !== 'monitor_sites') {
      if (config.expectedSiteId) {
        assert.equal(
          overviewSiteId,
          config.expectedSiteId,
          `site_next_workflow_live_expected_site_mismatch:${config.expectedSiteId}:${overviewSiteId}`,
        );
      }
      const delegatedResult = parseJsonStdout(
        await runNodeScript(buildSiteActionArgs(config, overviewSiteId), { cwd: packageRoot }),
        'site_next_workflow_current_site_action',
      );
      return {
        schema: 'narada.cloudflare_carrier.site_next_workflow_live.v1',
        status: 'ok',
        worker_url: config.workerUrl,
        delegated_workflow: delegatedResult.delegated_workflow ?? 'current_site_action',
        delegated_route_action: routeAction,
        delegated_site_action: overviewAction,
        delegated_operation_id: overviewOperationId,
        delegated_operation_action: overviewOperationAction,
        delegated_operation_reason: overviewOperationReason,
        delegated_operation_focus_kind: overviewOperationFocusKind,
        delegated_operation_focus_ref: overviewOperationFocusRef,
        selected_site_id: overviewSiteId,
        list_before_next: listBefore.summary,
        focus_result: null,
        delegated_result: delegatedResult,
        list_after_next: null,
        list_after_next_followup: null,
      };
    }
    return {
      schema: 'narada.cloudflare_carrier.site_next_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      delegated_workflow: 'monitor_sites',
      delegated_route_action: routeAction,
      delegated_site_action: overviewAction,
      delegated_operation_id: overviewOperationId,
      delegated_operation_action: overviewOperationAction,
      delegated_operation_reason: overviewOperationReason,
      delegated_operation_focus_kind: overviewOperationFocusKind,
      delegated_operation_focus_ref: overviewOperationFocusRef,
      selected_site_id: null,
      list_before_next: listBefore.summary,
      delegated_result: null,
      list_after_next: null,
      list_after_next_followup: null,
    };
  }

  if (routeAction === 'focus_next_site') {
    const selectedSiteId = overviewSiteId;
    assert.ok(selectedSiteId, 'site_next_workflow_live_requires_next_site');
    if (config.expectedSiteId) {
      assert.equal(
        selectedSiteId,
        config.expectedSiteId,
        `site_next_workflow_live_expected_site_mismatch:${config.expectedSiteId}:${selectedSiteId}`,
      );
    }
    const focusResult = parseJsonStdout(
      await runNodeScript(buildSiteFocusArgs(config, selectedSiteId), { cwd: packageRoot }),
      'site_next_workflow_focus',
    );
    const delegatedResult = parseJsonStdout(
      await runNodeScript(buildSiteActionArgs(config, selectedSiteId), { cwd: packageRoot }),
      'site_next_workflow_action',
    );
    let listAfter = parseJsonStdout(
      await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
      'site_list_after_next_workflow',
    );
    assert.equal(listAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
    let listAfterFollowup = null;
    let listAfterDelayedFollowup = null;
    if (
      shouldRetryListAfterNext({
        selectedSiteId,
        delegatedResult,
        listAfterSummary: listAfter.summary,
      })
    ) {
      listAfterFollowup = parseJsonStdout(
        await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
        'site_list_after_next_workflow_followup',
      );
      assert.equal(listAfterFollowup.schema, 'narada.cloudflare_carrier.product_read.v1');
      listAfter = listAfterFollowup;
      if (
        shouldRetryListAfterNext({
          selectedSiteId,
          delegatedResult,
          listAfterSummary: listAfter.summary,
        })
      ) {
        await wait(SITE_LIST_STALE_RECHECK_DELAY_MS);
        listAfterDelayedFollowup = parseJsonStdout(
          await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
          'site_list_after_next_workflow_delayed_followup',
        );
        assert.equal(listAfterDelayedFollowup.schema, 'narada.cloudflare_carrier.product_read.v1');
        listAfter = listAfterDelayedFollowup;
      }
    }
    return {
      schema: 'narada.cloudflare_carrier.site_next_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      delegated_workflow: delegatedResult.delegated_workflow ?? 'focus_site',
      delegated_route_action: routeAction,
      delegated_site_action: overviewAction,
      delegated_operation_id: overviewOperationId,
      delegated_operation_action: overviewOperationAction,
      delegated_operation_reason: overviewOperationReason,
      delegated_operation_focus_kind: overviewOperationFocusKind,
      delegated_operation_focus_ref: overviewOperationFocusRef,
      selected_site_id: selectedSiteId,
      list_before_next: listBefore.summary,
      focus_result: focusResult,
      delegated_result: delegatedResult,
      list_after_next: listAfter.summary,
      list_after_next_followup: listAfterFollowup?.summary ?? null,
      list_after_next_delayed_followup: listAfterDelayedFollowup?.summary ?? null,
    };
  }

  throw new Error(`site_next_workflow_live_route_unsupported:${routeAction}`);
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 240000,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
    windowsHide: true,
  });
  return result.stdout;
}

async function defaultWait(ms) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
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

function buildSiteActionArgs(config, siteId) {
  const args = [
    siteActionWorkflowScript,
    '--url', config.workerUrl,
    '--site', siteId,
    '--execute-site-action',
  ];
  if (config.expectedSiteAction) args.push('--expected-action', config.expectedSiteAction);
  if (config.localSiteRef) args.push('--local-site-ref', config.localSiteRef);
  if (config.cloudflareSiteRef) args.push('--cloudflare-site-ref', config.cloudflareSiteRef);
  appendAuthOptions(args, config);
  return args;
}

function buildSiteFocusArgs(config, siteId) {
  const args = [
    siteFocusWorkflowScript,
    '--url', config.workerUrl,
    '--focused-site-id', siteId,
    '--execute-site-focus',
  ];
  appendAuthOptions(args, config);
  return args;
}

function shouldRetryListAfterNext({ selectedSiteId, delegatedResult, listAfterSummary }) {
  const siteActionNext = delegatedResult?.read_after_action?.next_action ?? null;
  const listNextSiteId = listAfterSummary?.next_site_id ?? null;
  const listNextAction = listAfterSummary?.next_action ?? null;
  return siteActionNext === 'monitor_site'
    && listNextSiteId === selectedSiteId
    && listNextAction !== 'monitor_sites';
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
  const config = parseSiteNextWorkflowLiveArgs(process.argv.slice(2));
  const result = await runSiteNextWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatSiteNextWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
