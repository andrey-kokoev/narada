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

export function parseSiteNextWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
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
  if (!auth) throw new Error('site_next_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    expectedRouteAction,
    expectedSiteId,
    expectedSiteAction,
    localSiteRef,
    cloudflareSiteRef,
    auth,
    executeAcknowledged,
  };
}

export async function runSiteNextWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
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
    }
    return {
      schema: 'narada.cloudflare_carrier.site_next_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      delegated_workflow: delegatedResult.delegated_workflow ?? 'focus_site',
      delegated_route_action: routeAction,
      selected_site_id: selectedSiteId,
      list_before_next: listBefore.summary,
      focus_result: focusResult,
      delegated_result: delegatedResult,
      list_after_next: listAfter.summary,
      list_after_next_followup: listAfterFollowup?.summary ?? null,
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
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
